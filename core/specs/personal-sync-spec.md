# Personal Data Sync — Spec

**Version:** 2.3
**Last updated:** 2026-03-25
**Feature location:** `core/hooks/personal-sync.sh`, session-start integration in `core/hooks/session-start.sh`

## Purpose

Backs up personal data (memory files, CLAUDE.md, toolkit config, encyclopedia cache, and user-created skills) to the user's chosen private backend — Google Drive, a private GitHub repo, or iCloud. Supports multiple backends simultaneously via a comma-separated config value. This is separate from the toolkit's public git sync (which handles toolkit code) and from the encyclopedia sync (which uses Drive as source of truth). Personal-sync protects data that would otherwise be lost if the user's machine dies, and enables cross-device continuity for memory and preferences.

## User Mandates

- (2026-03-17) Personal data must NEVER be synced to the public DestinClaude repo. This hook syncs to a private backend chosen by the user.
- (2026-03-17) The hook must work on Windows (Git Bash/MSYS2), macOS, and Linux without platform-specific branches unless absolutely necessary.
- (2026-03-17) Sync failures must be logged but must not block the user's session or interfere with other hooks.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Standalone hook, not integrated into git-sync.sh | git-sync.sh is tightly coupled to the toolkit's public repo. Personal data needs a separate sync path that works even if the user has no public git setup. Keeps responsibilities clean. | Extend git-sync.sh (couples public/private concerns, breaks for users without public git). |
| Two backend options: Drive or private GitHub | Drive is already available (rclone configured for encyclopedia). GitHub is familiar to technical users and provides versioned history. Offering both maximizes coverage across user types. | Drive-only (excludes users who prefer Git), GitHub-only (requires GitHub account), S3/cloud (adds dependency). |
| PostToolUse trigger with 15-min debounce | Matches the existing git-sync pattern. Syncs when data actually changes, not on a timer. Debounce prevents excessive API calls during active sessions. | SessionStart/SessionEnd only (mid-session data loss risk), every write (too frequent), cron (not available in Claude Code). |
| Session-start pull for cross-device sync | When a user switches devices, the session-start hook pulls the latest personal data from the backend before the session begins. Memory files and CLAUDE.md are then current. For first-session restore on a new device, the setup wizard (Phase 0B) performs the initial pull before the session-start hook is ever invoked — the hook then handles all subsequent syncs automatically. | Manual sync command (users forget), no pull (defeats cross-device purpose). |
| Config stored in toolkit-state/config.json | Consistent with existing config model. Setup wizard already reads/writes this file. | Separate config file (adds complexity), environment variable (not persistent). |
| rclone copy with --update for Drive backend | Uses `copy` (not `sync`) to prevent deletion propagation in either direction. `--update` skips files newer on the destination. Orphaned remote files accumulate but this is preferable to losing backup data. | `sync` (rejected: propagates accidental deletions, destroyed memory files in production), --checksum (slower for many small files), --force (overwrites newer remote). |
| Git backend uses simple add-commit-push | No rebase, no conflict resolution. If push fails (conflict), log it and move on. Personal data files rarely conflict since they're typically edited by one device at a time. | Full rebase flow like git-sync.sh (overkill for personal data, adds complexity). |
| iCloud backend via local folder copy | rclone's iCloud backend requires session cookies that expire, making it unreliable for automated sync. Native iCloud sync uses local folder operations on macOS (`~/Library/Mobile Documents/com~apple~CloudDocs/`) — no token management required. | rclone iCloud (rejected: session cookie expiry causes silent failures), no iCloud support (rejected: important platform for Apple-primary users). |
| Multi-backend loop | `PERSONAL_SYNC_BACKEND` can be comma-separated (e.g., `"drive,github"`) to enable multiple backends simultaneously. The hook iterates over each backend in sequence; failure in one is logged but does not block others. | Single-backend only (rejected: users may want redundancy), parallel execution (rejected: adds complexity, race conditions on shared state files). |
| Expanded backup scope | Now includes encyclopedia cache (`~/.claude/encyclopedia/`) and user-created skills (non-symlinks in `~/.claude/skills/`) in addition to memory, CLAUDE.md, and toolkit config. Symlinks into TOOLKIT_ROOT are explicitly excluded (those are toolkit-owned code). | Toolkit-code inclusion (rejected: toolkit code belongs in the public repo, not personal backup), encyclopedia exclusion (rejected: cache is valuable for cross-device continuity). |
| backup-meta.json | Written after each successful sync cycle with schema version, toolkit version, timestamp, and platform. Enables the migration framework to detect version skew when restoring on a new machine. | No metadata file (rejected: migration framework needs version info to know which migrations to run). |
| Conversations synced per-slug | Conversation `.jsonl` files pushed per-slug (`conversations/{slug}/{session-id}.jsonl`) to all backends. Uses `rclone copy --checksum` for Drive (append-only files where mtime is unreliable cross-platform). Other categories continue using `--update`. `aggregate_conversations()` symlinks all conversations into the home-directory slug for unified `/resume`. See cross-device-sync-design (03-25-2026) D3-D6. | Keep in git-sync only (requires git repo), flat directory (loses project origin), copy instead of symlink (wastes disk). |
| Machine-specific files excluded | `config.local.json` and `mcp-config.json` excluded via early-exit in path filter. Both contain absolute paths and platform-specific values. `config.local.json` rebuilt by session-start; `mcp-config.json` extracted from `.claude.json`. See cross-device-sync-design (03-25-2026) D1-D2. | Sync with merge logic (fragile in bash), sync everything and fix on restore. |
| Legacy conversation migration | One-time `rclone copy` from `gdrive:Claude/Backup/conversations/` to `gdrive:Claude/Backup/personal/conversations/`, gated by marker file. Uses copy (not move) to preserve data for unmigrated devices. See cross-device-sync-design (03-25-2026) D9. | rclone move (destructive), no migration (two locations forever). |

## What Gets Synced

| Content | Local path | Purpose |
|---------|-----------|---------|
| Memory files | `~/.claude/projects/*/memory/**` | User/feedback/project/reference memories |
| CLAUDE.md | `~/.claude/CLAUDE.md` | User's customized system instructions |
| Toolkit config | `~/.claude/toolkit-state/config.json` | Personalization values, layer selection, backend choice |
| Encyclopedia cache | `~/.claude/encyclopedia/` | Local cache of encyclopedia source files |
| User-created skills | `~/.claude/skills/*/` (non-symlinks) | Skills created by user, not from toolkit repo |
| Backup metadata | `~/.claude/backup-meta.json` | Schema version for migration framework |
| Conversations | `~/.claude/projects/*/*.jsonl` | Session transcripts, cross-device /resume |

### What does NOT get synced

- Journal entries (written directly to Drive by journaling skill)
- Toolkit code (skills, hooks, commands — handled by public toolkit repo)
- Shell-snapshots, tasks (ephemeral runtime state)
- `config.local.json` (machine-specific config — rebuilt by session-start every session)
- `mcp-config.json` (machine-specific MCP server definitions — extracted from `.claude.json`)
- Credentials, tokens, secrets (security risk)

## Backend Configuration

### Config model

Two new keys in `~/.claude/toolkit-state/config.json`:

```json
{
  "PERSONAL_SYNC_BACKEND": "drive",
  "PERSONAL_SYNC_REPO": "",
  "ICLOUD_PATH": ""
}
```

- `PERSONAL_SYNC_BACKEND`: `"drive"`, `"github"`, `"icloud"`, `"none"` (opt out), or a comma-separated combination (e.g., `"drive,github"`)
- `PERSONAL_SYNC_REPO`: GitHub repo URL (only used when backend includes `"github"`)
- `ICLOUD_PATH`: Absolute path to the local iCloud Drive folder used for personal-sync (only used when backend includes `"icloud"`). Auto-detected on macOS and Windows if not set.

### Google Drive backend

- **Push path:** `gdrive:{DRIVE_ROOT}/Backup/personal/`
- **Directory structure on Drive:**
  ```
  {DRIVE_ROOT}/Backup/personal/
  ├── memory/                    # Flat merge of all project memory dirs
  │   ├── <project-key>/        # Project key as subfolder
  │   │   ├── MEMORY.md
  │   │   ├── user_profile.md
  │   │   └── ...
  │   └── <another-project-key>/
  │       └── ...
  ├── conversations/                # Conversation transcripts
  │   ├── <project-slug>/
  │   │   ├── <session-id>.jsonl
  │   │   └── ...
  │   └── ...
  ├── CLAUDE.md
  └── toolkit-state/
      └── config.json
  ```
- **Push:** `rclone copy <local> <remote> --update` for each content type (MUST use `copy`, not `sync` — `sync` propagates accidental local deletions to the backup, destroying the safety net)
- **Pull:** `rclone copy <remote> <local> --update` (at session start; MUST use `copy`, not `sync` — `sync` deletes local files not present on remote)

### Private GitHub backend

- **Repo:** User-provided private repo URL
- **Remote name:** `personal-sync` (to avoid colliding with `origin` on any existing repo)
- **Branch:** `main`
- **Repo structure:** Same directory layout as Drive (memory/, conversations/{slug}/, CLAUDE.md, toolkit-state/)
- **Init:** On first use, if the repo is empty, the hook initializes it with a README and .gitignore
- **Push:** `git add -A && git commit -m "auto: personal sync" && git push personal-sync main`
- **Pull:** `git pull personal-sync main` (at session start)
- **.gitignore in personal repo:**
  ```
  .DS_Store
  Thumbs.db
  *.tmp
  ```

### iCloud backend

- **Push path:** `{ICLOUD_PATH}/` (auto-detected or from config)
- **Directory structure on iCloud:**
  ```
  {ICLOUD_PATH}/
  ├── memory/
  │   ├── <project-key>/
  │   │   ├── MEMORY.md
  │   │   └── ...
  │   └── ...
  ├── CLAUDE.md
  ├── toolkit-state/
  │   └── config.json
  ├── conversations/
  │   └── <project-slug>/
  │       └── ...
  ├── encyclopedia/
  │   └── ...
  └── skills/
      └── ...
  ```
- **Push:** `rsync -a --update <local> <icloud-path>/` for each content type
- **Pull:** `rsync -a --update <icloud-path>/ <local>` (at session start)

## Hook Implementation: `personal-sync.sh`

### Trigger

PostToolUse hook on Write and Edit actions.

### Flow

1. **Parse stdin JSON** — extract `file_path` from the tool input.
2. **Path check** — exit immediately if the changed file is not in a synced path (expanded filter):
   - `~/.claude/projects/*/memory/*`
   - `~/.claude/CLAUDE.md`
   - `~/.claude/toolkit-state/config.json`
   - `~/.claude/encyclopedia/*`
   - `~/.claude/skills/*` (non-symlinks only — symlinks into TOOLKIT_ROOT are skipped)
3. **Read config** — load `PERSONAL_SYNC_BACKEND` and `DRIVE_ROOT` (or `PERSONAL_SYNC_REPO`, `ICLOUD_PATH`) from `~/.claude/toolkit-state/config.json`. Exit if backend is `"none"` or unconfigured.
4. **Debounce check** — read `~/.claude/toolkit-state/.personal-sync-marker`. Exit if last sync was less than 15 minutes ago.
5. **Multi-backend loop** — parse `PERSONAL_SYNC_BACKEND` as comma-separated list; iterate over each backend:
   - **Drive:** `rclone copy --update` each content category to `gdrive:{DRIVE_ROOT}/Backup/personal/`
   - **GitHub:** `cd` to local personal repo checkout, copy files in, `git add -A`, commit, push
   - **iCloud:** `rsync -a --update` each content category to `{ICLOUD_PATH}/`
   - Failure in one backend is logged but does not block remaining backends.
6. **Update marker** — write current timestamp to `.personal-sync-marker`.
7. **Write backup-meta.json** — record schema version, toolkit version, timestamp, and platform.
8. **Log** — append success/failure to `~/.claude/backup.log`.

### Cross-platform considerations

- Use `date +%s` for timestamps (works in Git Bash, macOS, Linux)
- Path separators: normalize `\` to `/` on Windows (same as git-sync.sh)
- `rclone` and `git` must be in PATH (setup wizard verifies this)
- Use `command -v` to check tool availability, not `which` (more portable)
- Avoid GNU-specific flags; stick to POSIX where possible
- Use `mkdir -p` for directory creation (universal)
- Temp files in `$TMPDIR` or `/tmp` (Git Bash maps this correctly on Windows)

### State files

| File | Purpose |
|------|---------|
| `~/.claude/toolkit-state/.personal-sync-marker` | Timestamp of last sync (debounce) |
| `~/.claude/toolkit-state/personal-sync-repo/` | Local checkout of private GitHub repo (GitHub backend only) |

## Auto-Detection (Self-Healing)

If `PERSONAL_SYNC_BACKEND` is unset or `"none"`, session-start auto-detects available backends before reporting the warning. Detection order:

1. **Google Drive** — `rclone lsd "gdrive:$DRIVE_ROOT/Backup/"` succeeds
2. **iCloud Drive** (macOS only) — `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/` exists

If detected, the backend flag is written to config.json so auto-detection only runs once. This prevents false "Not Configured" warnings when the backup infrastructure is working but the setup wizard didn't set the flag (e.g., manual rclone setup, migrating from another machine).

## Session-Start Integration

New block in `session-start.sh`, after the encyclopedia cache sync:

1. **Read config** — load `PERSONAL_SYNC_BACKEND` from config.json. If unset, run auto-detection (see above).
2. **Pull** — based on backend:
   - **Drive:** `rclone copy --update` from `gdrive:{DRIVE_ROOT}/Backup/personal/` to local paths (MUST use `copy`, not `sync` — `sync` deletes local files not present on remote)
   - **GitHub:** `cd` to local repo checkout, `git pull personal-sync main`
3. **Conversation pull** — same mechanics as memory pull, but using `--checksum` for Drive and per-slug directory mapping. After pull, `aggregate_conversations()` symlinks all `.jsonl` files into the home-directory slug.
4. **Legacy conversation migration** — one-time `rclone copy` from `gdrive:Claude/Backup/conversations/` to `gdrive:Claude/Backup/personal/conversations/`, gated by `~/.claude/toolkit-state/.legacy-conversations-migrated` marker file.
5. **Conflict handling** — if pull fails, log a warning and continue with local state. Never block session start.

### Pull target mapping

| Remote path | Local path |
|-------------|-----------|
| `personal/memory/{project-key}/` | `~/.claude/projects/{project-key}/memory/` |
| `personal/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `personal/toolkit-state/config.json` | `~/.claude/toolkit-state/config.json` |
| `personal/conversations/{slug}/*.jsonl` | `~/.claude/projects/{slug}/*.jsonl` |

## Setup Wizard Integration

New question added after layer selection (Phase 3) and before dependency installation (Phase 4):

> "Your toolkit improvements sync to the public DestinClaude repo — that's just skills, hooks, and commands, nothing personal. But your memory, preferences, and personal config need a private home. Where should Claude back those up?"
>
> 1. **Google Drive** (recommended if you set up Drive earlier)
> 2. **Private GitHub repo** (creates a new private repo for you)
> 3. **Skip for now** (you can set this up later with `/setup-wizard`)

If **Drive:** verify rclone is configured, set `PERSONAL_SYNC_BACKEND: "drive"`.

If **GitHub:** walk through `gh repo create --private`, clone to `~/.claude/toolkit-state/personal-sync-repo/`, set `PERSONAL_SYNC_BACKEND: "github"` and `PERSONAL_SYNC_REPO` to the URL.

If **Skip:** set `PERSONAL_SYNC_BACKEND: "none"`.

## Dependencies

- **Depends on:**
  - `rclone` (Drive backend) — must be installed and configured with `gdrive:` remote
  - `git` + `gh` (GitHub backend) — must be installed and authenticated
  - `~/.claude/toolkit-state/config.json` — must exist (created by setup wizard)
  - Claude Code hook system — PostToolUse invocation with JSON on stdin

- **Depended on by:**
  - **Session-start hook** — calls personal-sync pull logic
  - **Setup wizard** — configures the backend choice

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-25 | 2.3 | Cross-device conversation sync: conversations added as synced category (per-slug, --checksum for Drive), home-directory aggregation via symlinks, config.local.json and mcp-config.json excluded, legacy conversation migration (D9), renamed get_primary_backend to get_preferred_backend. See cross-device-sync-design (03-25-2026). | Update | owner |
| 2026-03-25 | 2.2 | Three fixes: (1) Push operations changed from `rclone sync` to `rclone copy` — sync propagated accidental local deletions to Drive, destroying backup copies. (2) Pull path mapping fixed — memory files were restored to project root instead of `memory/` subdirectory. (3) Windows slug calculation fixed — `cygpath -w` used instead of `realpath` to match Claude Code's slug algorithm. Also fixed git-sync stash pop to emit visible `hookSpecificOutput` warning instead of silent stderr. | Bugfix | owner |
| 2026-03-24 | 2.1 | Critical fix: session-start Drive pull used `rclone sync` for memory which destroyed local conversation .jsonl files. Changed to `rclone copy --update`. | Bugfix | owner |
| 2026-03-23 | 2.0 | Added iCloud backend, multi-backend loop, expanded scope (encyclopedia, user-created skills), backup-meta.json writing. Absorbed Drive archive from git-sync.sh. See backup-system-refactor-design (03-22-2026). | Architecture | — |
| 2026-03-17 | 1.0 | Initial spec | New | — |
| 2026-03-19 | 1.1 | Added auto-detection/self-healing for Drive and iCloud backends; added `"icloud"` as a backend option; documented the false-warning bug fix | Update | owner |
