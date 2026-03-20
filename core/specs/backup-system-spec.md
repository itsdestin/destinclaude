# Backup & Sync — Spec

**Version:** 4.0
**Last updated:** 2026-03-20
**Feature location:** `core/hooks/backup-engine.sh`, `core/hooks/backends/`

## Purpose

The Backup & Sync system keeps Claude Code's personal data (memory, CLAUDE.md, conversation history, encyclopedia, journal, custom extensions) continuously replicated to the user's chosen storage backend. It operates through a single `backup-engine.sh` PostToolUse hook that delegates storage operations to pluggable backend drivers (`backend-drive.sh`, `backend-github.sh`, `backend-icloud.sh`). Toolkit-owned files (skills, hooks, commands, specs) are explicitly excluded — they are always re-installed from the public GitHub repo. The system supports push, pull, and restore modes with a primary + secondary backend model, per-backend debounce markers, and a canonical versioned backup schema for structure-independent restore across toolkit versions.

For full architecture detail, see `core/plans/backup-system-refactor-design (03-20-2026).md`.

## User Mandates

- (2026-03-13) Failures MUST be logged to `~/.claude/backup.log` AND produce an explicit error message visible in the Claude session — silent failures are not acceptable.
- (2026-03-13) `RESTORE.md` MUST be kept in the Git repository root and MUST be updated whenever the backup structure changes.
- (2026-03-13) Specs are NEVER modified without the user's explicit approval of the specific changes.
- (2026-03-13) User Mandates in a spec are inviolable. If a proposed change conflicts with a mandate, stop and ask the user for approval to revise the mandate before proceeding.
- (2026-03-13) Credential/secret files (`credentials.json`, `token.json`, `.env`) MUST be excluded from backups.
- (2026-03-13) `node_modules/` and `__pycache__/` MUST be excluded from all backups.
- (2026-03-13) Manual backup commands MUST be supported via the trigger phrases listed in CLAUDE.md ("backup now", "force a full backup", "run a backup", "manual backup", "sync to Drive").
- (2026-03-16) All Claude projects MUST be backed up to a private backend by default. When a new project is created, it should be added to the `backup_registry` in config.json.
- (2026-03-20) Toolkit-owned files (listed in `plugin-manifest.json`) MUST NOT be included in backups. They are always re-installed from the GitHub repo.

## Design Decisions

The full rationale for each decision is in `core/plans/backup-system-refactor-design (03-20-2026).md`. Key decisions:

| Decision | Summary | Design doc ref |
|----------|---------|---------------|
| Single backup engine with pluggable backends | Replaces `git-sync.sh`, `personal-sync.sh`, `drive-archive.sh` with one engine that delegates to drivers. Eliminates overlapping responsibility. | D1 |
| Plugin manifest for ownership classification | `plugin-manifest.json` is the authoritative list of toolkit-owned files. Engine consults it before every backup and restore operation. Works on symlink and copy-based installs. | D2 |
| Primary + secondary backend model | Users choose one primary backend (full backup + restore). Optional secondary receives write-only copies of high-value files (memory, CLAUDE.md, custom skills) as a DR mirror. | D3 |
| Toolkit integrity check with auto-recovery | `session-start.sh` verifies toolkit directory on every session; auto-clones from GitHub if anything is missing. | D4 |
| Installer-first restore ordering | Setup wizard installs fully first, then restores personal data on top. Backup files never overwrite the fresh install. | D5 |
| CLAUDE.md merge with user choice | On restore, user chooses: Merge (recommended) / Use backup / Start fresh. Merge is mechanical using HTML-comment markers. | D6 |
| Ask before backing up user-created extensions | Unrecognized skills/hooks trigger a one-time prompt; answer stored in config.json `user_extensions`. | D7 |
| Canonical backup schema with versioned migrations | Backup written to a versioned canonical structure (`backup-schema.json`). Migration scripts transform old backups forward on restore. | D8 |
| External projects via explicit registry | External repos tracked in `backup_registry` in config.json. Engine does not manage their git workflow — only the registry metadata and unregistered-project warnings. | D9 |
| Config key migration from current system | Old config keys (`PERSONAL_SYNC_BACKEND`, etc.) auto-migrated to new keys on first run. | D10 |
| Safe migration via temp directory | Schema migrations operate on a temp copy, never in-place. Remote backup is never modified during migration. | D11 |
| User-choice config keys backed up and merged | Selected config.json keys (comfort_level, installed_layers, backends, backup_registry) backed up and merged on restore. Structural keys (toolkit_root, platform) always regenerated. | D12 |

## Current Implementation

### Architecture Overview

```
core/hooks/
├── backup-engine.sh          # Single PostToolUse hook (push) + session-start (pull)
└── backends/
    ├── backend-drive.sh      # Google Drive via rclone copyto/sync
    ├── backend-github.sh     # Private GitHub repo via git add/commit/push
    └── backend-icloud.sh     # iCloud Drive via cp

plugin-manifest.json          # Toolkit-owned file list (auto-generated at release)
backup-schema.json             # Canonical schema version + category-to-path map

core/commands/restore.md      # /restore ad-hoc command
core/migrations/
└── v1-to-v2.sh               # Schema migration script(s)
```

### Backend Driver Interface

Each driver implements three functions:

```bash
backup_push <local_path> <remote_path>    # Upload file/directory
backup_pull <remote_path> <local_path>    # Download file/directory
backup_check                               # Return 0 if backend is reachable/configured
```

| Driver | Push | Pull | Conflict strategy |
|--------|------|------|-------------------|
| `backend-drive.sh` | `rclone copyto --checksum` | `rclone sync --update` | mtime-based |
| `backend-github.sh` | `git add/commit/push` | `git pull` | git merge |
| `backend-icloud.sh` | `cp` to iCloud path | `cp` from iCloud path | last-write-wins |

### Data Classification

| Category | Examples | Backed up? | Restore behavior |
|----------|----------|-----------|-----------------|
| Toolkit-owned | Skills, hooks, commands, specs in manifest | Never | Re-cloned from GitHub |
| Personal data | Memory, CLAUDE.md, keybindings, conversations | Always | Direct restore (CLAUDE.md gets merge prompt) |
| User-created extensions | Custom skills/hooks not in manifest | Ask user, remember | Restore after toolkit install, ask per item |
| Generated config | settings.json, .claude.json | Never | Regenerated by installer/wizard |
| User-choice config | config.json (partial) | Yes (primary only) | Merged — user-choice keys from backup, structural keys from wizard |
| External projects | ~/destincode/, etc. | Per registry | Independent git repos |
| Ephemeral | Sessions, tasks, locks | Never | Regenerated at runtime |
| Secrets | Credentials, tokens, .env | Never | User re-authenticates |

For the full data classification table and backup scope (primary vs. secondary), see the design doc.

### Tracked Personal Data

| Content | Local path |
|---------|-----------|
| Memory files | `~/.claude/projects/*/memory/**` |
| CLAUDE.md | `~/.claude/CLAUDE.md` |
| User-choice config | `~/.claude/toolkit-state/config.json` (partial — user-choice keys only) |
| Keybindings | `~/.claude/settings.local.json` (keybindings only) |
| Conversation history | `~/.claude/projects/*/*.jsonl` |
| Encyclopedia | `~/.claude/encyclopedia/*.md` |
| Journal entries | Per journaling skill paths |
| Custom extensions | Skills/hooks not in plugin-manifest.json (after user consent) |

### Canonical Backup Structure

```
{backup_root}/
├── backup-schema.json
├── memory/{project-key}/*.md
├── claude-md/CLAUDE.md
├── config/keybindings.json + user-choices.json
├── conversations/{project-key}/*.jsonl
├── encyclopedia/*.md
├── journal/entries/*.md
└── extensions/skills/{name}/ + hooks/
```

### Push Flow (PostToolUse on Write/Edit)

1. Parse stdin JSON, extract `file_path`
2. Classify file: manifest check → exclusion check → personal data list → user extension list
3. If not backupable, exit silently
4. Map local path to canonical backup path
5. Push to primary backend (debounced 15 min per backend via `.push-marker-{backend}`)
6. If secondary configured AND file is high-value (memory, CLAUDE.md, custom skills): push to secondary (best-effort, non-blocking)
7. Log result to `~/.claude/backup.log`, emit status to `~/.claude/.sync-status`

### Pull Flow (Session-Start)

1. Pull from primary backend only
2. Read `backup-schema.json` from backend
3. Run migrations if schema version < current (via temp directory — D11)
4. Classify each pulled file before writing locally
5. Never overwrite toolkit-owned files (manifest check)
6. Write personal data to correct local paths via path map

### Restore Flow (Setup Wizard Phase 5R or `/restore`)

1. Connect to backend, verify reachable
2. Read `backup-schema.json`, run migrations if needed (temp directory)
3. Restore memory, conversations, keybindings → direct write
4. CLAUDE.md → three-option merge prompt (Merge / Use backup / Start fresh)
5. Encyclopedia → migrate to current doc types
6. Journal entries → migrate to current format
7. Custom skills → ask per skill
8. External projects → offer to re-register from backup registry
9. Verify toolkit files still intact (manifest check)

### State Files

| File | Purpose | Written by |
|------|---------|-----------|
| `~/.claude/.push-marker-{backend}` | Per-backend debounce timer (e.g., `.push-marker-drive`, `.push-marker-github`) | backup-engine |
| `~/.claude/.push-marker-{project}` | External project debounce (unchanged from old system) | backup-engine |
| `~/.claude/.sync-status` | Human-readable status for statusline display | backup-engine |
| `~/.claude/.sync-warnings` | Warning flags for statusline | backup-engine |
| `~/.claude/.backup-lock/` | Mutex directory (created/removed) | backup-engine |
| `~/.claude/backup.log` | Persistent log of all backup operations | backup-engine |
| `~/.claude/.write-registry.json` | Write guard: last-writer PID + hash per tracked file | backup-engine |
| `~/.claude/.unsynced-projects` | Unregistered project detection | backup-engine |

## Dependencies

- **Depends on:**
  - `node` (Node.js) — JSON parsing of stdin and config in backup-engine.sh
  - `rclone` — Drive backend (backend-drive.sh); must be installed and configured with a `gdrive:` remote
  - `git` — GitHub backend (backend-github.sh); must be installed and authenticated
  - `cp` — iCloud backend (backend-icloud.sh); standard Unix utility
  - `date`, `find`, `mkdir`, `sed`, `wc`, `head`, `tail`, `basename` — standard Unix utilities (available in Git Bash on Windows)
  - Claude Code hook system — `backup-engine.sh` relies on PostToolUse hook invocation with JSON on stdin
  - `plugin-manifest.json` — toolkit-owned file list; must be present at toolkit root
  - `backup-schema.json` — canonical schema definition; must be present at toolkit root

- **Depended on by:**
  - **Statusline** (`~/.claude/statusline.sh`) — reads `~/.claude/.sync-status` to display backup state
  - **Session-start hook** — calls backup-engine pull logic on every session start
  - **Setup wizard** — Phase 5R restore flow invokes backup-engine in restore mode
  - **All tracked personal data files** — any file matching the personal data filter implicitly depends on this system for cross-device persistence
  - **CLAUDE.md manual backup instructions** — references trigger phrases

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*None currently tracked.*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-20 | 4.0 | Major architecture rewrite: replaced three-script system (git-sync, personal-sync, drive-archive) with single backup-engine.sh and pluggable backend drivers (drive, github, icloud). Added plugin-manifest.json for toolkit file exclusion. Added canonical backup-schema.json with versioned migrations. Primary + secondary backend model. Per-backend debounce markers. New mandate: toolkit-owned files must never be backed up. New /restore command. Installer-first restore ordering in setup wizard. | Architecture | Destin |
| 2026-03-18 | 3.3 | Added Interactive Restore section: setup wizard now handles restore for returning users via GitHub or Drive, complementing the existing manual restore.sh path. | Update | — |
| 2026-03-16 | 3.2 | Multi-project backup support: git-sync.sh now routes files to the correct Git repo based on path prefix. Each project gets independent push markers and rebase-fail counters. Branch detection is automatic. New mandate: all Claude projects must be backed up to private GitHub repos by default. | Update | — |
| 2026-03-16 | 3.1 | Added `mcp-config.json`: session-start hook extracts mcpServers from `.claude.json` into a Git-tracked file. | Update | — |
| 2026-03-15 | 3.0 | Git + Drive hybrid migration: primary sync moved to Git + GitHub, Drive archive retained as secondary. | Architecture | — |
| 2026-03-15 | 2.3 | Added pre-snapshot notification announce. | Update | — |
| 2026-03-13 | 1.0 | Initial spec. | New | — |
| 2026-03-14 | 1.1 | CLAUDE.md moved to global, README.md added to full snapshots. | Update | — |
| 2026-03-14 | 1.2 | OAuth tracking switched to `gws/client_secret.json`. | Update | — |
| 2026-03-14 | 2.0 | Four architectural changes: .claude.json removed from backups, safe_copy() content check, history.jsonl merged across machines, conversation transcript backup. | Architecture | — |
| 2026-03-14 | 2.1 | Added write guard (write-guard.sh PreToolUse hook). | Update | — |
| 2026-03-14 | 2.2 | Added check-inbox.sh to tracked hook scripts. | Update | — |
