# Personal Data Sync — Spec

**Version:** 1.0
**Last updated:** 2026-03-17
**Feature location:** `core/hooks/personal-sync.sh`, session-start integration in `core/hooks/session-start.sh`

## Purpose

Backs up personal data (memory files, CLAUDE.md, toolkit config) to the user's chosen private backend — Google Drive or a private GitHub repo. This is separate from the toolkit's public git sync (which handles skills, hooks, commands) and from the encyclopedia sync (which uses Drive as source of truth). Personal-sync protects data that would otherwise be lost if the user's machine dies, and enables cross-device continuity for memory and preferences.

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
| rclone sync with --update for Drive backend | Uses modification time to avoid overwriting newer remote files. Simple, reliable, bidirectional-safe for the pull-then-push pattern. | --checksum (slower for many small files), --force (overwrites newer remote). |
| Git backend uses simple add-commit-push | No rebase, no conflict resolution. If push fails (conflict), log it and move on. Personal data files rarely conflict since they're typically edited by one device at a time. | Full rebase flow like git-sync.sh (overkill for personal data, adds complexity). |

## What Gets Synced

| Content | Local path | Purpose |
|---------|-----------|---------|
| Memory files | `~/.claude/projects/*/memory/**` | User/feedback/project/reference memories |
| CLAUDE.md | `~/.claude/CLAUDE.md` | User's customized system instructions |
| Toolkit config | `~/.claude/toolkit-state/config.json` | Personalization values, layer selection, backend choice |

### What does NOT get synced

- Encyclopedia files (handled by sync-encyclopedia.sh, Drive is source of truth)
- Journal entries (written directly to Drive by journaling skill)
- Toolkit code (skills, hooks, commands — handled by public toolkit repo)
- Sessions, shell-snapshots, tasks (ephemeral runtime state)
- Credentials, tokens, secrets (security risk)

## Backend Configuration

### Config model

Two new keys in `~/.claude/toolkit-state/config.json`:

```json
{
  "PERSONAL_SYNC_BACKEND": "drive",
  "PERSONAL_SYNC_REPO": ""
}
```

- `PERSONAL_SYNC_BACKEND`: `"drive"`, `"github"`, or `"none"` (opt out)
- `PERSONAL_SYNC_REPO`: GitHub repo URL (only used when backend is `"github"`)

### Google Drive backend

- **Push path:** `gdrive:{DRIVE_ROOT}/Backup/personal/`
- **Directory structure on Drive:**
  ```
  {DRIVE_ROOT}/Backup/personal/
  ├── memory/                    # Flat merge of all project memory dirs
  │   ├── C--Users-desti/        # Project key as subfolder
  │   │   ├── MEMORY.md
  │   │   ├── user_profile.md
  │   │   └── ...
  │   └── C--Users-desti-claude-mobile/
  │       └── ...
  ├── CLAUDE.md
  └── toolkit-state/
      └── config.json
  ```
- **Push:** `rclone sync <local> <remote> --update` for each content type
- **Pull:** `rclone sync <remote> <local> --update` (at session start)

### Private GitHub backend

- **Repo:** User-provided private repo URL
- **Remote name:** `personal-sync` (to avoid colliding with `origin` on any existing repo)
- **Branch:** `main`
- **Repo structure:** Same directory layout as Drive (memory/, CLAUDE.md, toolkit-state/)
- **Init:** On first use, if the repo is empty, the hook initializes it with a README and .gitignore
- **Push:** `git add -A && git commit -m "auto: personal sync" && git push personal-sync main`
- **Pull:** `git pull personal-sync main` (at session start)
- **.gitignore in personal repo:**
  ```
  .DS_Store
  Thumbs.db
  *.tmp
  ```

## Hook Implementation: `personal-sync.sh`

### Trigger

PostToolUse hook on Write and Edit actions.

### Flow

1. **Parse stdin JSON** — extract `file_path` from the tool input.
2. **Path check** — exit immediately if the changed file is not in a synced path:
   - `~/.claude/projects/*/memory/*`
   - `~/.claude/CLAUDE.md`
   - `~/.claude/toolkit-state/config.json`
3. **Read config** — load `PERSONAL_SYNC_BACKEND` and `DRIVE_ROOT` (or `PERSONAL_SYNC_REPO`) from `~/.claude/toolkit-state/config.json`. Exit if backend is `"none"` or unconfigured.
4. **Debounce check** — read `~/.claude/toolkit-state/.personal-sync-marker`. Exit if last sync was less than 15 minutes ago.
5. **Sync** — based on backend:
   - **Drive:** `rclone sync` each content category to `gdrive:{DRIVE_ROOT}/Backup/personal/`
   - **GitHub:** `cd` to local personal repo checkout, copy files in, `git add -A`, commit, push
6. **Update marker** — write current timestamp to `.personal-sync-marker`.
7. **Log** — append success/failure to `~/.claude/backup.log`.

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

## Session-Start Integration

New block in `session-start.sh`, after the encyclopedia cache sync:

1. **Read config** — load `PERSONAL_SYNC_BACKEND` from config.json.
2. **Pull** — based on backend:
   - **Drive:** `rclone sync` from `gdrive:{DRIVE_ROOT}/Backup/personal/` to local paths
   - **GitHub:** `cd` to local repo checkout, `git pull personal-sync main`
3. **Conflict handling** — if pull fails, log a warning and continue with local state. Never block session start.

### Pull target mapping

| Remote path | Local path |
|-------------|-----------|
| `personal/memory/{project-key}/` | `~/.claude/projects/{project-key}/memory/` |
| `personal/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `personal/toolkit-state/config.json` | `~/.claude/toolkit-state/config.json` |

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

## Known Bugs / Issues

*None — initial release.*

## Planned Updates

*None — initial release.*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-17 | 1.0 | Initial spec | New | — |
