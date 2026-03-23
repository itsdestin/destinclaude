# iCloud Backup Support — Design

**Date:** 2026-03-18
**Status:** Superseded by backup-system-refactor-design (03-22-2026).md
**Scope:** Add iCloud as a third personal-sync backend in the DestinClaude toolkit, alongside Google Drive and private GitHub. Clean up drive-archive.sh references from the published backup-system spec.

---

## Context

The DestinClaude toolkit's personal-sync system (`personal-sync.sh`) backs up personal data (memory files, CLAUDE.md, toolkit config) to a user-chosen private backend. Currently supports Google Drive (via rclone with `gdrive:` remote) and private GitHub repos. Users have requested iCloud as a third option.

iCloud Drive is mounted as a native local filesystem path on both macOS and Windows:
- **macOS:** `~/Library/Mobile Documents/com~apple~CloudDocs/`
- **Windows:** `~/iCloudDrive/` (most common), `~/Apple/CloudDocs/` (Microsoft Store version), or a user-configured location. Requires iCloud for Windows app installed and signed in.

Note: The macOS path contains a space ("Mobile Documents"). All rclone commands and bash variable references must be properly quoted.

rclone can treat these as plain local paths — no remote configuration, no cloud API, no auth tokens. The broken `iclouddrive:` rclone backend is never used.

Additionally, the published `backup-system-spec.md` contains references to `drive-archive.sh`, a private script that was ported from the maintainer's personal system and does not belong in the public toolkit. These references will be removed.

---

## Design Decisions

### 1. rclone local-to-local for iCloud sync

Use `rclone sync`/`rclone copyto` with local filesystem paths, identical to the Drive backend's code shape but targeting the iCloud sync folder instead of a `gdrive:` remote.

**Rationale:** Consistent code patterns, same `--update` semantics, same error handling. rclone is already in the toolkit's dependency chain. The only difference between `sync_drive()` and `sync_icloud()` is the destination prefix.

**Alternatives considered:** Plain `cp -r` (no `--update` semantics, risks overwriting newer files), `rsync` (not reliably available on Windows).

### 2. Comma-separated PERSONAL_SYNC_BACKEND for multi-backend support

`PERSONAL_SYNC_BACKEND` accepts comma-separated values (e.g., `"drive,icloud"`) so users can sync to multiple destinations simultaneously. Existing single values (`"drive"`, `"github"`, `"none"`) remain valid with no migration.

**Rationale:** Backward-compatible, trivial to parse in bash (`IFS=',' read -ra BACKENDS`). No config schema migration needed.

**Alternatives considered:** JSON array (cleaner semantically but breaks existing grep/node parsing in both hooks).

### 3. Detect iCloud path at setup, store in config

The setup wizard detects the iCloud sync folder path at setup time and stores it as `ICLOUD_PATH` in `config.json`. The sync hook verifies the path exists before each sync (guards against iCloud app being uninstalled or signed out).

**Rationale:** Same pattern as `DRIVE_ROOT`. Avoids re-detection overhead on every hook invocation. The wizard can confirm the path with the user interactively.

**Alternatives considered:** Auto-detect every time (adds overhead, fragile if paths change).

### 4. Shared debounce marker across backends

The 15-minute debounce timer is shared across all backends — one sync cycle syncs to all configured backends, then the marker resets.

**Rationale:** Keeps the sync cadence predictable. If backends had independent timers, the hook would fire more frequently with multiple backends configured, increasing overhead.

### 5. Remove drive-archive.sh from published spec

The backup-system-spec.md was ported from the maintainer's private system and includes references to `drive-archive.sh` — a private script not distributed with the toolkit. All references will be removed and the spec will focus on git-sync.sh (primary) and personal-sync.sh (personal data).

---

## Config Model

Two changes to `~/.claude/toolkit-state/config.json`:

```json
{
  "PERSONAL_SYNC_BACKEND": "drive,icloud",
  "ICLOUD_PATH": "/Users/me/Library/Mobile Documents/com~apple~CloudDocs"
}
```

- `PERSONAL_SYNC_BACKEND`: comma-separated list. Valid values: `drive`, `github`, `icloud`, `none`. Examples: `"drive"`, `"icloud"`, `"drive,icloud"`, `"github,icloud"`. Note: `"none"` must not appear alongside other backends — if present, it means opt-out. The setup wizard enforces this by treating option 4 (Skip) as exclusive.
- `ICLOUD_PATH`: absolute path to the local iCloud sync folder. Only set when iCloud is a chosen backend.

### iCloud path detection (setup wizard)

Check paths in order, use the first that exists:

1. macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/`
2. Windows (classic installer): `~/iCloudDrive/`
3. Windows (Microsoft Store): `~/Apple/CloudDocs/`
4. If any found, auto-populate `ICLOUD_PATH` and confirm with user ("I found your iCloud Drive at X — is that right?")
5. If none found, explain that iCloud for Windows / iCloud Drive must be installed and signed in; offer to skip or enter a custom path

### Directory structure on iCloud

Mirrors the Drive layout exactly:

```
{ICLOUD_PATH}/Claude/Backup/personal/
├── memory/
│   ├── {project-key-1}/
│   │   ├── MEMORY.md
│   │   └── ...
│   └── {project-key-2}/
│       └── ...
├── CLAUDE.md
└── toolkit-state/
    └── config.json
```

---

## Implementation: personal-sync.sh

### New sync_icloud() function

Structurally identical to `sync_drive()`, different destination prefix:

```bash
sync_icloud() {
    if [[ -z "$ICLOUD_PATH" || ! -d "$ICLOUD_PATH" ]]; then
        log_msg "ERROR: iCloud path not found: $ICLOUD_PATH — skipping iCloud sync"
        return 1
    fi

    local REMOTE_BASE="$ICLOUD_PATH/Claude/Backup/personal"
    mkdir -p "$REMOTE_BASE"
    local ERRORS=0

    # Three-part sync pattern (same as sync_drive):
    # 1. Memory files: rclone sync per project
    # 2. CLAUDE.md: rclone copyto
    # 3. config.json: rclone copyto
    # All with --update flag to preserve newer files
}
```

### Multi-backend dispatch

Replace the single `case` statement with a loop:

```bash
IFS=',' read -ra BACKENDS <<< "$BACKEND"
SYNC_OK=false
for B in "${BACKENDS[@]}"; do
    case "$B" in
        drive)   sync_drive   && SYNC_OK=true ;;
        github)  sync_github  && SYNC_OK=true ;;
        icloud)  sync_icloud  && SYNC_OK=true ;;
    esac
done
```

**Partial failure semantics:** If any backend succeeds, `SYNC_OK` is set and the debounce marker updates. A failed backend won't retry until the next 15-minute cycle. This is intentional — the same data is being pushed to all backends, so a single successful sync is sufficient to protect data. Failed backends will catch up on the next cycle. Individual failures are logged.

### Config parsing

Add `ICLOUD_PATH` to the node/grep parsing block alongside `BACKEND`, `DRIVE_ROOT`, and `SYNC_REPO`.

**Implementation note:** The existing `read -r BACKEND DRIVE_ROOT SYNC_REPO` pattern splits on whitespace, which breaks for `ICLOUD_PATH` values containing spaces (e.g., macOS `~/Library/Mobile Documents/com~apple~CloudDocs/`). The implementation must use a different delimiter (e.g., tab-separated output from node, or read `ICLOUD_PATH` separately via a second node invocation) to handle this safely.

---

## Implementation: session-start.sh

Replace the `if/elif` backend check with a multi-backend loop:

```bash
IFS=',' read -ra PS_BACKENDS <<< "$PS_BACKEND"
for B in "${PS_BACKENDS[@]}"; do
    case "$B" in
        drive)
            # existing Drive pull logic (unchanged)
            ;;
        github)
            # existing GitHub pull logic (unchanged)
            ;;
        icloud)
            if [[ -n "$PS_ICLOUD_PATH" && -d "$PS_ICLOUD_PATH" ]]; then
                REMOTE_BASE="$PS_ICLOUD_PATH/Claude/Backup/personal"
                # Pull memory, CLAUDE.md, config — same pattern as Drive
            fi
            ;;
    esac
done
```

**Pull ordering note:** rclone-based backends (Drive, iCloud) use `--update` so only newer files win. The GitHub backend uses `cp -r` which unconditionally overwrites. When mixing GitHub with rclone-based backends, GitHub should run first in the loop so rclone backends can overwrite with newer files if they exist. The loop order is: `github` → `drive` → `icloud`.

---

## Implementation: Setup Wizard (SKILL.md)

### Phase 0 Step 2: Replace iCloud placeholder

Current routing sends iCloud users to "coming soon, fresh install." Replace with routing to new Phase 0C.

### New Phase 0C: iCloud Restore

Inserted between current Phase 0B (Drive Restore) and current Phase 0C (Abbreviated Dependency Check):

1. Detect iCloud path (platform-specific checks — same detection order as setup)
2. If path doesn't exist: explain iCloud app must be installed/signed in, offer to skip to Phase 1
3. If path exists: verify `{ICLOUD_PATH}/Claude/Backup/personal/` has data
4. Pull personal data using `rclone sync` from local iCloud path (memory, CLAUDE.md, config only — iCloud restore does NOT pull encyclopedia files or transcripts, unlike Phase 0B Drive restore which has access to those via the `gdrive:` remote)
5. Store `ICLOUD_PATH` in config
6. Proceed to Phase 0D (abbreviated dependency check)

### Rename Phase 0C → Phase 0D

Existing "Abbreviated Dependency Check" phase becomes Phase 0D. All references updated.

### Personal sync backend question (Phase 3 area)

Update the backend selection to include iCloud and support multi-select:

```
Your memory, preferences, and personal config need a private home.
Where should Claude back those up? (You can choose more than one)

  1. Google Drive (recommended if you set up Drive earlier)
  2. iCloud (recommended on Mac, or Windows with iCloud app)
  3. Private GitHub repo
  4. Skip for now
```

Store comma-separated result in `PERSONAL_SYNC_BACKEND`. If iCloud selected, run path detection and store `ICLOUD_PATH`.

---

## Spec Updates

### backup-system-spec.md → v3.4

Remove all `drive-archive.sh` references:
- Feature location line: remove drive-archive.sh
- Purpose paragraph: remove "secondary write-only Drive archive" language
- Design decisions table: remove 4 drive-archive rows (scope, best-effort, mutex reference, checksum)
- Tracked files: remove `*drive-archive.sh` from hook scripts
- Git Sync Flow: remove step 8 (Drive archive trigger)
- Drive Archive Flow section: remove entirely
- Key state files: remove drive-archive from mutex "Written by"
- Dependencies: remove rclone dependency note (documented in personal-sync spec)
- Changelog: add v3.4 entry

### personal-sync-spec.md → v2.0

- Add iCloud as third backend in Purpose section
- Add design decisions: "iCloud uses rclone local-to-local sync", "Multi-backend support via comma-separated config"
- Add iCloud backend section with path details, platform paths, prerequisites
- Update config model with `ICLOUD_PATH` and comma-separated examples
- Update setup wizard integration with iCloud option and multi-select
- Update dependencies: iCloud requires local sync folder, not rclone remote
- Changelog: add v2.0 entry (architectural — new backend + multi-backend)

---

## Doc Updates

One-line additions to mention iCloud alongside existing GitHub/Drive references:

| File | Change |
|------|--------|
| `README.md` | Update restore option list to include iCloud |
| `docs/quickstart.md` | Update restore note to mention iCloud |
| `docs/for-beginners/03-installing-the-toolkit.md` | Update Step 0 to mention iCloud |
| `bootstrap/prerequisites.md` | Update "After the Script" to mention iCloud |

---

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `core/hooks/personal-sync.sh` | Modify | Add `sync_icloud()`, multi-backend loop, `ICLOUD_PATH` parsing |
| `core/hooks/session-start.sh` | Modify | Multi-backend loop with iCloud pull block (github→drive→icloud order) |
| `core/skills/setup-wizard/SKILL.md` | Modify | Phase 0C iCloud restore, rename 0C→0D, iCloud in backend question |
| `core/specs/backup-system-spec.md` | Modify | Strip drive-archive.sh references, v3.4 |
| `core/specs/personal-sync-spec.md` | Modify | iCloud backend, multi-backend support, v2.0 |
| `core/specs/destinclaude-spec.md` | Modify | Resolve iCloud "Planned Update" as implemented |
| `core/templates/template-variables.json` | Modify | Add `ICLOUD_PATH` variable, add `icloud` to `PERSONAL_SYNC_BACKEND` options |
| `docs/system-architecture.md` | Modify | Update iCloud from "not yet implemented" to implemented, update personal-sync backend list |
| `CHANGELOG.md` | Modify | Add entry for iCloud backup support |
| `README.md` | Modify | iCloud mention in restore options |
| `docs/quickstart.md` | Modify | iCloud mention in restore note |
| `docs/for-beginners/03-installing-the-toolkit.md` | Modify | iCloud mention in Step 0 |
| `bootstrap/prerequisites.md` | Modify | iCloud mention in "After the Script" |
