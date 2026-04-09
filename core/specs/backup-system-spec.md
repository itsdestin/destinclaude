# Backup & Sync -- Spec

**Version:** 6.0
**Last updated:** 2026-04-09
**Feature location:** `core/skills/sync/SKILL.md`, `core/commands/restore.md`, `core/hooks/write-registry.sh`, `core/hooks/lib/backup-common.sh`
**Supersedes:** v5.0 (sync.sh + session-end-sync.sh + automatic backend orchestration — removed)

## Purpose

Personal data sync is owned by the **DestinCode desktop app**. The toolkit retains a **manual sync escape hatch** (the `/sync` skill) for CLI users without the app, plus shared utilities (`backup-common.sh`) used by `/restore` and the manual sync skill. The toolkit no longer runs automatic backup hooks.

This split keeps the toolkit usable as a Claude Code plugin on any machine while the app provides the polished sync UX (background push every 15 min, native UI, multi-device coordination).

## User Mandates

- (2026-03-13) Credential/secret files (`credentials.json`, `token.json`, `.env`) MUST be excluded from any backup the toolkit produces. App-managed sync is governed by the app's own exclusion list.
- (2026-03-13) `node_modules/` and `__pycache__/` MUST be excluded from any backup the toolkit produces.
- (2026-03-13) Specs are NEVER modified without the user's explicit approval of the specific changes.
- (2026-03-13) User Mandates in a spec are inviolable. If a proposed change conflicts with a mandate, stop and ask the user for approval to revise the mandate before proceeding.
- (2026-04-09) The toolkit and the DestinCode app MUST agree on the shared contract (config keys, state file paths, directory layouts) below. If either side changes the contract, the other side must be updated in lockstep.
- (2026-04-09) Manual `/sync` push and pull MUST be safe to run while the app is also running — both sides operate against the same state files and use rclone/git/rsync flags that prefer "newer wins" semantics.

## Architecture

```
┌──────────────────────────┐         ┌────────────────────────────┐
│   DestinCode app         │         │  destinclaude toolkit       │
│   (Electron/Android)     │         │  (Claude Code plugin)       │
├──────────────────────────┤         ├────────────────────────────┤
│ SyncService (native)     │         │ /sync skill (manual)        │
│  - Pull on launch        │         │  - Status dashboard         │
│  - Background push 15min │         │  - Force push (§5)          │
│  - Session-end push      │         │  - Force pull (§6)          │
│  - SyncPanel UI          │         │  - Backend reconfig (§7)    │
│                          │         │ /restore command            │
│ Writes:                  │         │  - Pull from backend        │
│  .app-sync-active marker │         │  - Apply to live locations  │
│                          │         │ write-registry.sh hook      │
│                          │         │  - Updates .write-registry  │
│                          │         │    on every Write/Edit      │
└────────────┬─────────────┘         └────────────┬───────────────┘
             │                                     │
             └───────────────┬─────────────────────┘
                             │
                ┌────────────▼──────────────┐
                │   Shared contract          │
                │   (config + state files)   │
                └────────────────────────────┘
```

### App owns

- Automatic push every 15 minutes (Drive / GitHub / iCloud)
- Pull on launch and after session end
- Cross-device slug rewriting and conversation aggregation
- Conversation index management
- Backend connectivity health checks
- SyncPanel UI for adding/removing/configuring backends

### Toolkit owns

- `/sync` skill — manual push/pull/status/configure for CLI users
- `/restore` command — ad-hoc restore from a backend
- `write-registry.sh` — lightweight PostToolUse hook that records `{pid, timestamp, content_hash}` for every Write/Edit. Consumed by `write-guard.sh` (PreToolUse) and `checklist-reminder.sh` (Stop). The toolkit's only automatic sync-adjacent hook.
- `lib/backup-common.sh` — shared bash library: `config_get`, `rewrite_project_slugs`, `aggregate_conversations`, `merge_conversation_index`, `regenerate_topic_cache`, `discover_projects`, `get_backends`, etc.
- `session-start.sh` health checks — surfaces unrouted-skill and untracked-project warnings to `~/.claude/.sync-warnings`

## Shared Contract

Both systems read and write the same files. Either side can update them safely; the other will pick up the change on its next operation.

### Config keys (`~/.claude/toolkit-state/config.json`)

| Key | Purpose | Set by |
|-----|---------|--------|
| `PERSONAL_SYNC_BACKEND` | Comma-separated list of active backends (`drive`, `github`, `icloud`, or `none`) | App SyncPanel, `/sync` §7, `/setup-wizard` (no longer prompts — set elsewhere) |
| `DRIVE_ROOT` | Top-level folder name on Google Drive (default: `Claude`) | App SyncPanel, `/sync` §7 |
| `PERSONAL_SYNC_REPO` | Private GitHub repo URL for the GitHub backend | App SyncPanel, `/sync` §7 |
| `ICLOUD_PATH` | Absolute path to the iCloud DestinClaude folder | App SyncPanel, `/sync` §7 |
| `toolkit_root` | Absolute path to the toolkit checkout | `session-start.sh` (rebuilt every session into `config.local.json`) |

### State files (under `~/.claude/`)

| File | Purpose | Written by |
|------|---------|-----------|
| `toolkit-state/.app-sync-active` | Marker indicating the DestinCode app is running and owns automatic sync | App on start, removed on stop |
| `toolkit-state/.sync-marker` | Last successful push timestamp (15-min debounce) | App SyncService, `/sync` §5 |
| `toolkit-state/.session-sync-marker` | Last session-start health check timestamp | `session-start.sh` |
| `backup-meta.json` | Last successful sync metadata (timestamp, source, backends) | App SyncService, `/sync` §5 |
| `.sync-warnings` | Newline-separated warning codes (e.g., `SKILLS:unrouted:foo,bar`, `PROJECTS:3`) | `session-start.sh` (toolkit health), App (backend issues) |
| `.unsynced-projects` | Discovered git repos not yet registered for backup | `session-start.sh` via `discover_projects()` |
| `tracked-projects.json` | Project registry: tracked + ignored project paths | `/sync` §4 (Project Onboarding) |
| `toolkit-state/skill-routes.json` | Per-skill backup routing (`personal` / `contribute` / `none`) | `/sync` §8 (Skill Backup Management) |
| `conversation-index.json` | Cross-device session-to-topic mapping | App SyncService, `/sync` §5/6, `/restore` |
| `.write-registry.json` | Per-file last-writer info for write-guard | `core/hooks/write-registry.sh` |

### Backend layouts

All three backends use the same folder structure under their root:

```
{backend-root}/
├── CLAUDE.md
├── memory/{project-key}/...
├── conversations/{slug}/*.jsonl
├── encyclopedia/*.md
├── skills/{skill-name}/...
└── system-backup/
    ├── config.json
    ├── settings.json
    ├── keybindings.json
    ├── mcp.json
    ├── history.jsonl
    ├── plans/
    ├── specs/
    └── conversation-index.json
```

- **Drive root:** `gdrive:{DRIVE_ROOT}/Backup/personal/`
- **GitHub root:** `~/.claude/toolkit-state/personal-sync-repo/` (cloned from `PERSONAL_SYNC_REPO`)
- **iCloud root:** `{ICLOUD_PATH}/`

### Excluded (machine-specific, never synced)

- `~/.claude/toolkit-state/config.local.json` (rebuilt every session by `session-start.sh`)
- `~/.claude/mcp-servers/mcp-config.json` (extracted from `.claude.json`, contains absolute paths)
- `~/.claude/settings.local.json`
- Credential files, `node_modules/`, `__pycache__/`

## Coordination Protocol

The `.app-sync-active` marker is the only direct coordination channel between the two sync engines:

1. App writes `~/.claude/toolkit-state/.app-sync-active` (containing its PID) on start
2. App removes it on shutdown
3. Manual `/sync` push/pull checks for the marker and warns the user before proceeding (it's safe to proceed — operations don't lock — but the user should know the app is also active)
4. `/restore` checks for the marker and asks the user to quit the app first (restore touches more files at once, higher conflict risk)

There is no IPC. There is no lock file. Both sides operate against the file system using "newer wins" semantics (rclone `--update`, rsync `--update`, `cp -n`).

## What Was Removed (v5.0 → v6.0)

Removed in the sync-decoupling refactor (April 2026):

- `core/hooks/sync.sh` — PostToolUse multi-backend push (605 lines)
- `core/hooks/session-end-sync.sh` — SessionEnd push (139 lines)
- `core/hooks/session-start.sh` personal data pull (~310 lines of pull/migration logic)
- `scripts/install-app.sh` — app distribution script
- `core/commands/appupdate.md` — app update command
- Setup wizard Phase 0A/0B/0C (restore from backends)
- Setup wizard Phase 0D (abbreviated dependency check after restore)
- Setup wizard Phase 5.0 (Personal Data Backup Setup)
- Setup wizard Phase 5b (DestinCode app install)
- Setup wizard Phase 5c (Remote access setup)
- `core/specs/personal-sync-spec.md` (already retired in v5.0)

The `retired` list in `core/hooks/hooks-manifest.json` ensures `phase_settings_migrate` removes the deleted hooks from users' `settings.json` on next `/update`.

## Dependencies

- **rclone** — required by `/sync` skill and `/restore` for the Drive backend; required by the `google-drive` skill regardless. The toolkit no longer probes Drive connectivity automatically.
- **git** + **gh** — required by `/sync` skill and `/restore` for the GitHub backend.
- **iCloud app** — required for the iCloud backend on Windows; built-in on macOS.
- **node** — used for JSON parsing in `write-registry.sh`, `backup-common.sh`, `/sync`, `/restore`.
- **Claude Code hook system** — PostToolUse hook invocation for `write-registry.sh`.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-04-09 | 6.0 | Sync decoupling. Removed automatic sync hooks (sync.sh, session-end-sync.sh) and the session-start.sh pull logic. The DestinCode app now owns automatic backup; the toolkit retains a manual `/sync` skill and `/restore` command as CLI escape hatches. Extracted write-registry update from sync.sh into a standalone `write-registry.sh` PostToolUse hook so write-guard still works. Added a `retired` list to hooks-manifest.json so `phase_settings_migrate` removes old entries on next `/update`. Removed install-app.sh, appupdate.md, setup-wizard restore phases, setup-wizard backend config phase. Updated backup-common.sh header to reflect new caller list. Replaced v5.0 spec with this rewrite. | Architecture | owner |
| 2026-04-05 | 5.0 | Sync consolidation: merged git-sync.sh + personal-sync.sh into single sync.sh. Removed local ~/.claude git repo requirement. Expanded sync scope to include settings, keybindings, mcp.json, history, plans, specs under system-backup/ on remote. Write registry update moved from git-sync.sh into sync.sh (before debounce). Renamed .personal-sync-marker → .sync-marker, removed .push-marker and .sync-status. GIT_REMOTE config key retired. Added conversation index to sync scope. See sync-consolidation-design (04-01-2026) and conversation-index-spec.md. personal-sync-spec.md retired — content merged here. | Architecture | owner |
| 2026-03-26 | 4.4 | Revised error visibility mandate: session-start network operations now run in background with failure-specific warnings (GIT:PULL_FAILED, PERSONAL:PULL_FAILED, MIGRATION:FAILED) surfaced via .sync-warnings instead of hookSpecificOutput. Statusline and /sync skill provide the visibility path. | Update | owner |
| 2026-03-25 | 4.3 | Cross-device sync: portable/local config split (D1), mcp-config.json excluded from sync (D2, reversal of v4.2), conversations added to personal-sync scope, home-directory conversation aggregation via symlinks, git repo health check (D8), renamed get_primary_backend to get_preferred_backend. All backends now documented as complementary (no primary/secondary hierarchy). | Update | owner |
| 2026-03-24 | 4.2 | Added `/sync` skill and project discovery. `discover_projects()` in backup-common.sh scans common directories for untracked git repos; session-start.sh now actively writes `.unsynced-projects`. The `/sync` skill provides status dashboard, warning resolution, project onboarding, and force sync — fulfilling the manual backup mandate. | Update | owner |
| 2026-03-23 | 4.0 | Refactored: symlink-based ownership detection replaces drive-archive.sh — all backend replication now handled by personal-sync.sh. New shared library (lib/backup-common.sh), migration framework (lib/migrate.sh, migrations/v1.json), toolkit integrity check in session-start. | Architecture | — |
| 2026-03-15 | 3.0 | Git + Drive hybrid migration: primary sync moved from rclone/Drive snapshots to Git + GitHub. | Architecture | — |
| 2026-03-13 | 1.0 | Initial spec | New | — |
