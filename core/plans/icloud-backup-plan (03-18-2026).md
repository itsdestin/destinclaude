# iCloud Backup Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Superseded by backup-system-refactor-design (03-22-2026).md

**Goal:** Add iCloud as a third personal-sync backend and clean up drive-archive.sh references from the published backup-system spec.

**Architecture:** Extend `personal-sync.sh` with a `sync_icloud()` function using rclone local-to-local sync, convert single-backend dispatch to a multi-backend loop over comma-separated `PERSONAL_SYNC_BACKEND` values, and add matching iCloud pull logic to `session-start.sh`. Update the setup wizard with a real iCloud restore flow and iCloud as a backup destination choice.

**Tech Stack:** Bash (hooks), Markdown (skill/spec files), JSON (config), rclone (local-to-local sync).

**Design doc:** `core/plans/icloud-backup-design (03-18-2026).md`

---

## File Map

| File | Change | Purpose |
|------|--------|---------|
| `core/hooks/personal-sync.sh` | Modify | Add `sync_icloud()`, multi-backend loop, `ICLOUD_PATH` config parsing |
| `core/hooks/session-start.sh` | Modify | Multi-backend pull loop with iCloud block |
| `core/skills/setup-wizard/SKILL.md` | Modify | Phase 0C iCloud restore, rename 0C→0D, iCloud in backend question |
| `core/specs/backup-system-spec.md` | Modify | Strip drive-archive.sh references, v3.4 |
| `core/specs/personal-sync-spec.md` | Modify | iCloud backend, multi-backend, v2.0 |
| `core/specs/destinclaude-spec.md` | Modify | Resolve iCloud planned update |
| `core/templates/template-variables.json` | Modify | Add `ICLOUD_PATH`, update `PERSONAL_SYNC_BACKEND` |
| `docs/system-architecture.md` | Modify | Update iCloud status and personal-sync description |
| `CHANGELOG.md` | Modify | Add iCloud entry |
| `README.md` | Modify | iCloud in restore options |
| `docs/quickstart.md` | Modify | iCloud in restore note |
| `docs/for-beginners/03-installing-the-toolkit.md` | Modify | iCloud in Step 0 |
| `bootstrap/prerequisites.md` | Modify | iCloud in "After the Script" |

---

## Task 1: Add iCloud backend to personal-sync.sh

**Files:**
- Modify: `core/hooks/personal-sync.sh`

- [ ] **Step 1: Read the current file**

Read `core/hooks/personal-sync.sh` in full. Note the config parsing block (node + grep fallback), `sync_drive()`, `sync_github()`, and the dispatch `case` statement.

- [ ] **Step 2: Update config parsing to read ICLOUD_PATH**

The existing node block reads `BACKEND DRIVE_ROOT SYNC_REPO` as space-separated values. Since `ICLOUD_PATH` can contain spaces (macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/`), read it separately.

After the existing `read -r BACKEND DRIVE_ROOT SYNC_REPO` block, add:

```bash
# Read ICLOUD_PATH separately (may contain spaces)
if command -v node &>/dev/null; then
    ICLOUD_PATH=$(node -e "
        const fs = require('fs');
        try {
            const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
            process.stdout.write(c.ICLOUD_PATH || '');
        } catch { process.stdout.write(''); }
    " "$CONFIG_FILE" 2>/dev/null) || ICLOUD_PATH=""
else
    ICLOUD_PATH=$(grep -o '"ICLOUD_PATH"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"ICLOUD_PATH"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "")
fi
```

- [ ] **Step 3: Add sync_icloud() function**

Insert after `sync_github()`, before the `# --- Execute sync ---` section:

```bash
# --- iCloud backend ---
sync_icloud() {
    if [[ -z "$ICLOUD_PATH" || ! -d "$ICLOUD_PATH" ]]; then
        log_msg "ERROR: iCloud path not found: $ICLOUD_PATH — skipping iCloud sync"
        return 1
    fi

    if ! command -v rclone &>/dev/null; then
        log_msg "ERROR: rclone not found in PATH — skipping iCloud sync"
        return 1
    fi

    local REMOTE_BASE="$ICLOUD_PATH/Claude/Backup/personal"
    mkdir -p "$REMOTE_BASE"
    local ERRORS=0

    # Sync memory files (each project as a subfolder)
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for PROJECT_DIR in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            local MEMORY_DIR="$PROJECT_DIR/memory"
            [[ ! -d "$MEMORY_DIR" ]] && continue
            local PROJECT_KEY
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            rclone sync "$MEMORY_DIR/" "$REMOTE_BASE/memory/$PROJECT_KEY/" --update 2>/dev/null || {
                log_msg "WARN: Failed to sync memory for project $PROJECT_KEY to iCloud"
                ERRORS=$((ERRORS + 1))
            }
        done
    fi

    # Sync CLAUDE.md
    if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
        rclone copyto "$CLAUDE_DIR/CLAUDE.md" "$REMOTE_BASE/CLAUDE.md" --update 2>/dev/null || {
            log_msg "WARN: Failed to sync CLAUDE.md to iCloud"
            ERRORS=$((ERRORS + 1))
        }
    fi

    # Sync toolkit config
    if [[ -f "$CONFIG_FILE" ]]; then
        mkdir -p "$REMOTE_BASE/toolkit-state"
        rclone copyto "$CONFIG_FILE" "$REMOTE_BASE/toolkit-state/config.json" --update 2>/dev/null || {
            log_msg "WARN: Failed to sync config.json to iCloud"
            ERRORS=$((ERRORS + 1))
        }
    fi

    if [[ $ERRORS -gt 0 ]]; then
        log_msg "iCloud sync completed with $ERRORS warning(s)"
        return 1
    fi

    log_msg "iCloud sync completed successfully"
    return 0
}
```

- [ ] **Step 4: Replace single-backend dispatch with multi-backend loop**

Replace the existing dispatch block:

```bash
# --- Execute sync ---
SYNC_OK=false
case "$BACKEND" in
    drive)
        sync_drive && SYNC_OK=true ;;
    github)
        sync_github && SYNC_OK=true ;;
    *)
        exit 0 ;;
esac
```

With:

```bash
# --- Execute sync ---
IFS=',' read -ra BACKENDS <<< "$BACKEND"
SYNC_OK=false
for B in "${BACKENDS[@]}"; do
    case "$B" in
        drive)   sync_drive   && SYNC_OK=true ;;
        github)  sync_github  && SYNC_OK=true ;;
        icloud)  sync_icloud  && SYNC_OK=true ;;
        none)    exit 0 ;;
    esac
done
```

- [ ] **Step 5: Verify the script parses correctly**

```bash
bash -n core/hooks/personal-sync.sh && echo "OK" || echo "SYNTAX ERROR"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/personal-sync.sh
git commit -m "feat(personal-sync): add iCloud backend and multi-backend dispatch loop"
```

---

## Task 2: Add iCloud pull to session-start.sh

**Files:**
- Modify: `core/hooks/session-start.sh`

- [ ] **Step 1: Read the current file**

Read `core/hooks/session-start.sh`. Note the personal data pull section (starts around line 57) with `if/elif` for Drive and GitHub.

- [ ] **Step 2: Add ICLOUD_PATH to config parsing**

After the existing `PS_BACKEND`/`PS_DRIVE_ROOT`/`PS_REPO` parsing, add:

```bash
    PS_ICLOUD_PATH=""
    if command -v node &>/dev/null; then
        PS_ICLOUD_PATH=$(node -e "
            const fs = require('fs');
            try {
                const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
                process.stdout.write(c.ICLOUD_PATH || '');
            } catch { process.stdout.write(''); }
        " "$CONFIG_FILE" 2>/dev/null) || PS_ICLOUD_PATH=""
    else
        PS_ICLOUD_PATH=$(grep -o '"ICLOUD_PATH"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"ICLOUD_PATH"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "")
    fi
```

- [ ] **Step 3: Replace if/elif with multi-backend loop**

Replace the `if [[ "$PS_BACKEND" == "drive" ]]` / `elif [[ "$PS_BACKEND" == "github" ]]` block with:

```bash
    IFS=',' read -ra PS_BACKENDS <<< "$PS_BACKEND"
    for B in "${PS_BACKENDS[@]}"; do
        case "$B" in
            github)
                # GitHub pull first (cp-based, no --update)
                REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
                if [[ -d "$REPO_DIR/.git" ]]; then
                    (cd "$REPO_DIR" && git pull personal-sync main 2>/dev/null) || true
                    if [[ -d "$REPO_DIR/memory" ]]; then
                        for PROJECT_DIR in "$REPO_DIR"/memory/*/; do
                            [[ ! -d "$PROJECT_DIR" ]] && continue
                            PROJECT_KEY=$(basename "$PROJECT_DIR")
                            LOCAL_MEMORY="$CLAUDE_DIR/projects/$PROJECT_KEY/memory"
                            mkdir -p "$LOCAL_MEMORY"
                            cp -r "$PROJECT_DIR"* "$LOCAL_MEMORY/" 2>/dev/null || true
                        done
                    fi
                    [[ -f "$REPO_DIR/CLAUDE.md" ]] && cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true
                    [[ -f "$REPO_DIR/toolkit-state/config.json" ]] && cp "$REPO_DIR/toolkit-state/config.json" "$CONFIG_FILE" 2>/dev/null || true
                fi
                ;;
            drive)
                if command -v rclone &>/dev/null; then
                    REMOTE_BASE="gdrive:$PS_DRIVE_ROOT/Backup/personal"
                    if rclone lsd "$REMOTE_BASE/memory/" 2>/dev/null | grep -q .; then
                        for REMOTE_PROJECT in $(rclone lsd "$REMOTE_BASE/memory/" 2>/dev/null | awk '{print $NF}'); do
                            LOCAL_MEMORY="$CLAUDE_DIR/projects/$REMOTE_PROJECT/memory"
                            mkdir -p "$LOCAL_MEMORY"
                            rclone sync "$REMOTE_BASE/memory/$REMOTE_PROJECT/" "$LOCAL_MEMORY/" --update 2>/dev/null || true
                        done
                    fi
                    rclone copyto "$REMOTE_BASE/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" --update 2>/dev/null || true
                    rclone copyto "$REMOTE_BASE/toolkit-state/config.json" "$CONFIG_FILE" --update 2>/dev/null || true
                fi
                ;;
            icloud)
                if [[ -n "$PS_ICLOUD_PATH" && -d "$PS_ICLOUD_PATH" ]]; then
                    REMOTE_BASE="$PS_ICLOUD_PATH/Claude/Backup/personal"
                    if [[ -d "$REMOTE_BASE/memory" ]]; then
                        for PROJECT_DIR in "$REMOTE_BASE"/memory/*/; do
                            [[ ! -d "$PROJECT_DIR" ]] && continue
                            PROJECT_KEY=$(basename "$PROJECT_DIR")
                            LOCAL_MEMORY="$CLAUDE_DIR/projects/$PROJECT_KEY/memory"
                            mkdir -p "$LOCAL_MEMORY"
                            rclone sync "$PROJECT_DIR" "$LOCAL_MEMORY/" --update 2>/dev/null || true
                        done
                    fi
                    [[ -f "$REMOTE_BASE/CLAUDE.md" ]] && rclone copyto "$REMOTE_BASE/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" --update 2>/dev/null || true
                    [[ -f "$REMOTE_BASE/toolkit-state/config.json" ]] && rclone copyto "$REMOTE_BASE/toolkit-state/config.json" "$CONFIG_FILE" --update 2>/dev/null || true
                fi
                ;;
        esac
    done
```

Note: github runs first in the loop order (it's listed first in the case), then drive, then icloud — matching the design's specified pull order.

- [ ] **Step 4: Verify syntax**

```bash
bash -n core/hooks/session-start.sh && echo "OK" || echo "SYNTAX ERROR"
```

- [ ] **Step 5: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat(session-start): add iCloud pull and multi-backend loop"
```

---

## Task 3: Update setup wizard with iCloud restore and backend choice

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md`

- [ ] **Step 1: Read the current SKILL.md**

Read the full file. Locate:
1. Phase 0 Step 2 (backup source question) — find the iCloud "coming soon" placeholder
2. Phase 0C (abbreviated dependency check)
3. The personal sync backend question (in Phase 3 area)

- [ ] **Step 2: Replace iCloud placeholder in Phase 0 Step 2**

Find the line routing iCloud to "coming soon" and replace with:

```
- **3 (iCloud):** Proceed to **Phase 0C: iCloud Restore**.
```

- [ ] **Step 3: Insert Phase 0C (iCloud Restore) between Phase 0B and current Phase 0C**

Insert after Phase 0B's closing `---`:

```markdown
## Phase 0C: iCloud Restore

### Step 1: Detect iCloud Drive path

Detect the iCloud sync folder by checking these paths in order:

```bash
# macOS
[ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ] && echo "found:macos"

# Windows (classic installer)
[ -d "$HOME/iCloudDrive" ] && echo "found:windows-classic"

# Windows (Microsoft Store)
[ -d "$HOME/Apple/CloudDocs" ] && echo "found:windows-store"
```

If found, tell the user: "I found your iCloud Drive at [path] — is that right?"

If not found, tell the user: "I couldn't find an iCloud Drive folder on this machine. On Windows, you need the iCloud for Windows app installed and signed in. On Mac, iCloud Drive should be enabled in System Settings. Would you like to enter a custom path, or skip iCloud restore and do a fresh install?"

If skipping, proceed to **Phase 1**.

### Step 2: Install rclone if missing

Follow the exact same rclone installation steps as **Phase 4 → Life Dependencies → rclone** — same explanation, same platform commands, same verification (`rclone --version`).

### Step 3: Pull personal data from iCloud

```bash
ICLOUD_PATH="<detected_path>"
REMOTE_BASE="$ICLOUD_PATH/Claude/Backup/personal"

# Pull memory files
if [ -d "$REMOTE_BASE/memory" ]; then
    for PROJECT_DIR in "$REMOTE_BASE"/memory/*/; do
        [ ! -d "$PROJECT_DIR" ] && continue
        PROJECT_KEY=$(basename "$PROJECT_DIR")
        mkdir -p ~/.claude/projects/$PROJECT_KEY/memory
        rclone sync "$PROJECT_DIR" ~/.claude/projects/$PROJECT_KEY/memory/ --update 2>/dev/null \
            && echo "  Memory synced for $PROJECT_KEY." \
            || echo "  WARNING: Memory sync failed for $PROJECT_KEY."
    done
fi

# Pull CLAUDE.md
[ -f "$REMOTE_BASE/CLAUDE.md" ] && rclone copyto "$REMOTE_BASE/CLAUDE.md" ~/.claude/CLAUDE.md --update 2>/dev/null \
    && echo "  CLAUDE.md synced." \
    || echo "  WARNING: CLAUDE.md sync failed."

# Pull config
[ -f "$REMOTE_BASE/toolkit-state/config.json" ] && rclone copyto "$REMOTE_BASE/toolkit-state/config.json" ~/.claude/toolkit-state/config.json --update 2>/dev/null \
    && echo "  Config synced." \
    || echo "  WARNING: Config sync failed."
```

Note: Unlike Drive restore (Phase 0B), iCloud restore only pulls personal data — not encyclopedia files or transcripts (those are not backed up to iCloud by personal-sync).

### Step 4: Store iCloud path in config

```bash
# Write ICLOUD_PATH to config.json (create if needed)
mkdir -p ~/.claude/toolkit-state
node -e "
    const fs = require('fs');
    const path = process.argv[1];
    const icloudPath = process.argv[2];
    let config = {};
    try { config = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
    config.ICLOUD_PATH = icloudPath;
    fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
" ~/.claude/toolkit-state/config.json "$ICLOUD_PATH"
```

### Step 5: Confirm and continue

Tell the user: "Your personal data is restored from iCloud. Now let me confirm all the tools your config needs are installed on this machine."

Proceed to **Phase 0D: Abbreviated Dependency Check**.

---
```

- [ ] **Step 4: Rename Phase 0C → Phase 0D**

Find all occurrences of `Phase 0C` (the abbreviated dependency check) and rename to `Phase 0D`. Also update cross-references in Phase 0A and Phase 0B that say "Proceed to Phase 0C" to "Proceed to Phase 0D".

- [ ] **Step 5: Update personal sync backend question**

Find the personal sync backend question in Phase 3. Replace the 3-option list with:

```
Your memory, preferences, and personal config need a private home.
Where should Claude back those up? (You can choose more than one — for example, 1 and 2)

  1. Google Drive (recommended if you set up Drive earlier)
  2. iCloud (recommended on Mac, or Windows with iCloud app)
  3. Private GitHub repo
  4. Skip for now (you can set this up later with /setup)
```

Update the routing logic:
- If iCloud selected: run the same path detection as Phase 0C Step 1, store `ICLOUD_PATH`
- Store comma-separated result in `PERSONAL_SYNC_BACKEND` (e.g., `"drive,icloud"`)
- Option 4 sets `PERSONAL_SYNC_BACKEND: "none"` (exclusive)

- [ ] **Step 6: Verify the file renders correctly**

Read back the full SKILL.md. Confirm:
- Phase 0C (iCloud Restore) appears between Phase 0B and Phase 0D
- Phase 0D is the abbreviated dependency check
- All cross-references are updated
- Backend question has 4 options with multi-select

- [ ] **Step 7: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/skills/setup-wizard/SKILL.md
git commit -m "feat(setup-wizard): add iCloud restore flow and iCloud backend option"
```

---

## Task 4: Clean up backup-system-spec.md (remove drive-archive.sh)

**Files:**
- Modify: `core/specs/backup-system-spec.md`

- [ ] **Step 1: Read the current spec**

Read the full file. Identify all drive-archive.sh references.

- [ ] **Step 2: Remove drive-archive references**

Apply these changes:
1. **Line 5 (Feature location):** Remove `, ~/.claude/hooks/drive-archive.sh`
2. **Line 9 (Purpose):** Rewrite to remove "secondary write-only Drive archive" and `drive-archive.sh` references. Focus on Git as primary sync + personal-sync for personal data.
3. **Design decisions table:** Remove these rows:
   - "Drive archive scope: specs, skills, CLAUDE.md, transcripts"
   - "Drive archive is best-effort"
   - "`rclone copyto` with `--checksum` for Drive archive"
   - Update "Mutex lock" row to remove drive-archive reference
4. **Tracked files table:** Remove `*drive-archive.sh` from Hook scripts row
5. **Git Sync Flow:** Remove step 8 (Drive archive trigger)
6. **Drive Archive Flow section:** Remove the entire `### Drive Archive Flow` subsection
7. **Key state files:** Remove drive-archive from mutex "Written by" column
8. **Dependencies:** Remove rclone line from "Depends on"

- [ ] **Step 3: Bump version and add changelog**

Update version from 3.3 to 3.4, update Last updated date.

Add changelog entry:
```
| 2026-03-18 | 3.4 | Removed drive-archive.sh references — private script not distributed with public toolkit. Spec now focuses on git-sync.sh (primary) and personal-sync.sh (personal data). | Cleanup | — |
```

- [ ] **Step 4: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/specs/backup-system-spec.md
git commit -m "docs(spec): remove drive-archive.sh references from backup-system-spec v3.4"
```

---

## Task 5: Update personal-sync-spec.md to v2.0

**Files:**
- Modify: `core/specs/personal-sync-spec.md`

- [ ] **Step 1: Read the current spec**

Read the full file.

- [ ] **Step 2: Update Purpose section**

Add iCloud alongside Drive and GitHub in the opening paragraph.

- [ ] **Step 3: Add design decisions**

Add two rows to the Design Decisions table:

```
| iCloud uses rclone local-to-local sync | Treats the iCloud sync folder as a plain local path, using the same rclone `--update` commands as the Drive backend. Avoids the broken `iclouddrive:` rclone backend entirely. Same code shape, same error handling, just a different destination prefix. | Plain `cp -r` (no `--update` semantics), `rsync` (not available on Windows), native iCloud API (complex, fragile). |
| Multi-backend support via comma-separated config | `PERSONAL_SYNC_BACKEND` accepts comma-separated values (e.g., `drive,icloud`). Backward-compatible with existing single values. One shared debounce timer across all backends. | JSON array (breaks existing grep/node parsing), separate config keys per backend (messy), single backend only (doesn't meet user need). |
```

- [ ] **Step 4: Update config model section**

Add `ICLOUD_PATH` key. Update `PERSONAL_SYNC_BACKEND` to show comma-separated examples and note that `none` is exclusive.

- [ ] **Step 5: Add iCloud backend section**

After the GitHub backend section, add:

```markdown
### iCloud backend

- **Push path:** `{ICLOUD_PATH}/Claude/Backup/personal/`
- **Directory structure:** Same as Google Drive backend
- **Platform paths:**
  - macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/`
  - Windows (classic): `~/iCloudDrive/`
  - Windows (Store): `~/Apple/CloudDocs/`
- **Prerequisite:** iCloud Drive folder must exist locally. On macOS this is native. On Windows, requires iCloud for Windows app installed and signed in.
- **Push:** `rclone sync/copyto <local> <icloud-path> --update` for each content type (local-to-local, no remote)
- **Pull:** `rclone sync/copyto <icloud-path> <local> --update` (at session start)
```

- [ ] **Step 6: Update hook implementation section**

Add `icloud` case to the dispatch loop description. Add note about multi-backend dispatch and partial failure semantics.

- [ ] **Step 7: Update session-start integration**

Add iCloud pull block description. Document pull order: github → drive → icloud.

- [ ] **Step 8: Update setup wizard integration**

Replace the 3-option question with the 4-option multi-select version. Add iCloud path detection description.

- [ ] **Step 9: Update dependencies**

Add: iCloud backend requires the local iCloud sync folder to exist (no rclone remote config needed, but rclone must be installed for sync commands).

- [ ] **Step 10: Bump version and add changelog**

Version 1.0 → 2.0. Add:
```
| 2026-03-18 | 2.0 | Added iCloud as third backend using rclone local-to-local sync. Added multi-backend support via comma-separated PERSONAL_SYNC_BACKEND config. Updated setup wizard integration with iCloud option and multi-select. | Architecture | — |
```

- [ ] **Step 11: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/specs/personal-sync-spec.md
git commit -m "docs(spec): add iCloud backend and multi-backend support, personal-sync-spec v2.0"
```

---

## Task 6: Update remaining docs and config files

**Files:**
- Modify: `core/specs/destinclaude-spec.md`
- Modify: `core/templates/template-variables.json`
- Modify: `docs/system-architecture.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/quickstart.md`
- Modify: `docs/for-beginners/03-installing-the-toolkit.md`
- Modify: `bootstrap/prerequisites.md`

- [ ] **Step 1: Read all files**

Read each file to find the relevant sections.

- [ ] **Step 2: Update destinclaude-spec.md**

Find the "Planned Updates" section. Remove or resolve the iCloud entry (mark as implemented).

- [ ] **Step 3: Update template-variables.json**

1. Add `ICLOUD_PATH` variable entry with description, prompt, and default
2. Update `PERSONAL_SYNC_BACKEND` entry: add `icloud` to options, update description to mention comma-separated multi-select, update prompt text to match the 4-option question from the design

- [ ] **Step 4: Update docs/system-architecture.md**

1. Replace "iCloud restore: Not yet implemented" with "iCloud restore: supported"
2. Update personal-sync backend list to include iCloud

- [ ] **Step 5: Update CHANGELOG.md**

Add entry under the current version:
```
- **iCloud backup support:** Personal data (memory, CLAUDE.md, config) can now sync to iCloud Drive alongside or instead of Google Drive and GitHub. Setup wizard supports iCloud restore and multi-backend selection.
```

- [ ] **Step 6: Update README.md**

Find the restore options list. Add iCloud alongside GitHub and Google Drive.

- [ ] **Step 7: Update docs/quickstart.md**

Update the restore note to mention iCloud: "(GitHub, Google Drive, or iCloud)"

- [ ] **Step 8: Update docs/for-beginners/03-installing-the-toolkit.md**

Update Step 0 description to mention iCloud alongside GitHub and Google Drive.

- [ ] **Step 9: Update bootstrap/prerequisites.md**

Update "After the Script" to mention iCloud as a backup source option.

- [ ] **Step 10: Commit all doc changes**

```bash
cd ~/.claude/plugins/destinclaude
git add core/specs/destinclaude-spec.md core/templates/template-variables.json docs/system-architecture.md CHANGELOG.md README.md docs/quickstart.md docs/for-beginners/03-installing-the-toolkit.md bootstrap/prerequisites.md
git commit -m "docs: add iCloud references across specs, templates, and user-facing docs"
```

---

## Task 7: Update specs INDEX

**Files:**
- Modify: `core/specs/INDEX.md`

- [ ] **Step 1: Update version numbers**

Update the INDEX entries:
- Backup & Sync: 3.3 → 3.4
- Personal Data Sync: 1.0 → 2.0

- [ ] **Step 2: Commit**

```bash
cd ~/.claude/plugins/destinclaude
git add core/specs/INDEX.md
git commit -m "docs: update specs INDEX versions for backup-system v3.4 and personal-sync v2.0"
```

---

## Final Verification

- [ ] All bash scripts parse without errors: `bash -n core/hooks/personal-sync.sh && bash -n core/hooks/session-start.sh`
- [ ] `git log --oneline -10` shows all commits landed
- [ ] `grep -r "drive-archive" core/specs/backup-system-spec.md` returns nothing
- [ ] `grep -r "icloud\|iCloud\|ICLOUD" core/hooks/personal-sync.sh` returns expected matches
- [ ] `grep -r "Phase 0C" core/skills/setup-wizard/SKILL.md` returns only the iCloud Restore phase (not the old abbreviated check)
