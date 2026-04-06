# Backup & Sync -- Spec

**Version:** 5.0
**Last updated:** 2026-04-05
**Feature location:** `core/hooks/sync.sh`, `core/hooks/lib/backup-common.sh`, `core/skills/sync/SKILL.md`
**Supersedes:** personal-sync-spec.md v2.3 (retired — content merged here)

## Purpose

The Backup & Sync system replicates personal data and system config to configured cloud backends via a single unified hook, `sync.sh` (PostToolUse, Write|Edit, 15-minute debounce). It covers memory files, CLAUDE.md, encyclopedia cache, user-created skills, conversations, and system config (settings, keybindings, MCP config, history, plans, specs). Shared utilities live in `lib/backup-common.sh`. It provides automatic, cross-device backup with no user intervention during normal operation.

## User Mandates

- (2026-03-13, revised 2026-03-26) Failures MUST be logged to `~/.claude/backup.log` AND be surfaced to the user via `.sync-warnings` (statusline + `/sync` skill). Session-start network operations run in background and write failure-specific warnings (e.g., `GIT:PULL_FAILED`, `PERSONAL:PULL_FAILED`, `MIGRATION:FAILED`) to `.sync-warnings` for visibility. Silent failures with no visibility path are not acceptable.
- (2026-03-13) `RESTORE.md` MUST be kept in the Git repository root and MUST be updated whenever the backup structure changes.
- (2026-03-13) Specs are NEVER modified without the user's explicit approval of the specific changes.
- (2026-03-13) User Mandates in a spec are inviolable. If a proposed change conflicts with a mandate, stop and ask the user for approval to revise the mandate before proceeding.
- (2026-03-13) Credential/secret files (`credentials.json`, `token.json`, `.env`) MUST be excluded from backups -- enforced via `.gitignore`.
- (2026-03-13) `node_modules/` and `__pycache__/` MUST be excluded from all backups -- enforced via `.gitignore`.
- (2026-03-13) Manual backup commands MUST be supported via the trigger phrases listed in CLAUDE.md ("backup now", "force a full backup", "run a backup", "manual backup", "sync to Drive").
- (2026-03-16, revised 2026-04-05) All discovered git projects MUST be offered for registration via the `/sync` skill project onboarding flow. Project discovery runs at session start via `discover_projects()` in `lib/backup-common.sh`.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Single script (`sync.sh`) replaces two | `git-sync.sh` (git commit/push) + `personal-sync.sh` (cloud backends) had overlapping scope and both evolved to cover the same data. Consolidated into `sync.sh` built on `personal-sync.sh`'s battle-tested multi-backend architecture. No local `~/.claude/.git` repo required. | New script from scratch (rewrites working code), thin wrapper delegating to personal-sync (two files doing one job). |
| Write registry update before debounce | The registry must be updated on every write (immediate), regardless of whether a full sync is due (15-min debounce). Separating these two responsibilities — registry update (immediate) and cloud sync (debounced) — prevents `write-guard.sh` from having stale registry entries between sync cycles. | Update registry only at sync time (leaves 15-min window where concurrent sessions are undetected). |
| Sync scope includes system config | Settings, keybindings, MCP config, history, plans, and specs are now synced (previously only covered by the local git repo). Grouped under `system-backup/` on all remote backends so they don't clutter the top-level personal data folders. | Continue excluding (data loss risk if machine dies), mix with personal data root (confusing for users browsing Drive). |
| Sync is best-effort | sync.sh backend failures are logged but do not block the session. All backends are complementary. Backend failure isolation ensures one failure does not block others. | Hard failure on backend errors (blocks primary workflow for secondary concern), silent failure (violates logging mandate). |
| Mutex lock via `mkdir` | sync.sh acquires `~/.claude/toolkit-state/.sync-lock/` as a mutex. `mkdir` is atomic on all platforms. Stale locks are auto-broken. | File-based lock with `flock` (not portable to Git Bash on Windows), no locking (race conditions between concurrent hooks). |
| Symlink ownership detection | Symlinks into TOOLKIT_ROOT determine file ownership — toolkit-owned files are never backed up by personal-sync. This cleanly separates toolkit code (handled by the public repo) from personal data (handled by personal-sync). | Path-prefix allowlist (must be maintained separately), manual tagging (error-prone). |
| Migration framework | Schema-versioned backups with sequential migration runner. `v1.json` defines the baseline schema; `migrate.sh` runs vN-to-vN+1 scripts in order when restoring from an older backup. Enables safe evolution of the backup format without breaking restores. | Single-format backups (breaks on schema changes), no migration (forces manual recovery). |
| Toolkit integrity check | Session-start verifies repo completeness, auto-repairs identical copies to symlinks, warns about modified copies. Prevents silent drift between installed copies and toolkit source. | Post-install-only check (misses runtime drift), no check (silent failures as seen in pre-v2.4 installs). |
| Skills synced as directories | When syncing skills, the entire skill directory is copied (not just the changed file). Skills are coherent units; partial sync could leave broken state on the remote. | Single-file sync (risk of inconsistency), tarball (adds compression overhead). |
| Log rotation at 1000 lines | `backup.log` is trimmed to the last 500 lines when it exceeds 1000. Keeps logs useful without unbounded growth. | Fixed file size limit (harder to implement in bash), external log rotation (added dependency). |
| `rclone copyto` with `--checksum` for Drive sync | personal-sync.sh uses checksum comparison rather than modification time to decide whether to upload to Drive. More reliable across platforms where mtime may not be preserved. | `--update` flag (mtime-based, unreliable cross-platform), no flag (always copies, wasteful). |
| `.claude.json` excluded from backups | Machine-specific file (`numStartups`, feature flags, usage stats) that always diverges between machines. Regenerates automatically. | Keep in backups (guaranteed cross-machine conflict noise, minimal disaster recovery value). |
| Hook output via `hookSpecificOutput` JSON | `sync.sh` emits structured JSON so Claude Code surfaces error messages in the conversation, not just in verbose mode. | Plain stdout (only visible in verbose mode), stderr (same issue). |
| Write guard via centralized registry | Same-machine concurrency protection using a PreToolUse hook that checks `~/.claude/.write-registry.json` before Write/Edit. Blocks if a different, still-running PID last wrote the file. Registry updated in `sync.sh` PostToolUse (before debounce check), shared mutex serializes access. | Per-session tracking (catches manual edits but adds cleanup burden), file-system watcher (robust but adds daemon), no protection (silent overwrites). |
| Project discovery via `discover_projects()` | `session-start.sh` scans 7 common directories (`~/projects/`, `~/repos/`, `~/code/`, `~/dev/`, `~/src/`, `~/Documents/`, `~/Desktop/`) at depth 1 for git repos not already tracked by git-sync or registered in `tracked-projects.json`. Results written to `~/.claude/.unsynced-projects` for the `/sync` skill to consume. | Manual-only registration (users forget), recursive scan (too slow on large filesystems), file watcher daemon (added complexity). |
| `/sync` skill as the resolution layer | The detect → display → resolve pipeline: `session-start.sh` detects issues and writes `.sync-warnings`; `statusline.sh` displays them with a `/sync for info` hint; the `/sync` skill provides interactive resolution (status dashboard, warning resolution, project onboarding, force sync). The skill reads state files but does not duplicate hook logic. | Automatic resolution in hooks (too opinionated, may take unwanted actions), separate command per warning type (fragmented UX). |
| Portable/local config split | `config.json` holds portable user preferences (synced). `config.local.json` holds machine-specific values — platform, toolkit_root, binary paths — rebuilt by `session-start.sh` every session. `config_get()` reads local first, portable second. Eliminates cross-device conflicts from machine-specific data in synced config. See cross-device-sync-design (03-25-2026) D1. | Key-level merge during sync (complex bash merge logic), environment variables (not persistent). |
| mcp-config.json excluded from sync | `mcp-config.json` is extracted from `.claude.json` for local readability but NOT git-committed or synced. Contains absolute paths and platform-specific servers that break on other devices. Each device rebuilds its own via `.claude.json` extraction in session-start. **Reversal of v4.2 decision** which included mcp-config.json in tracked files. See cross-device-sync-design (03-25-2026) D2. | Sync with path rewriting (fragile), per-platform config files (proliferation). |
| No local git repo required | `sync.sh` does not maintain a `~/.claude/.git` repository. Cloud backends (Drive file versions, GitHub commit history via personal-sync-repo) provide version history. This eliminates `GIT:NOT_INITIALIZED` warnings, rebase conflict handling, and the confusing two-repo setup. See sync-consolidation-design (04-01-2026) D2. | Require git (excludes non-technical users), keep local repo (added complexity with no unique value vs. cloud version history). |

## Current Implementation

### Synced Scope

`sync.sh` fires on every PostToolUse Write|Edit and exits immediately if the changed file does not match a synced path. Synced categories:

| Content | Local path | Remote path |
|---------|-----------|-------------|
| Memory files | `*/projects/*/memory/*` | `memory/{project-key}/` |
| CLAUDE.md | `*/CLAUDE.md` | `CLAUDE.md` |
| Conversations | `*/projects/*/*.jsonl` | `conversations/{slug}/` |
| Encyclopedia cache | `*/encyclopedia/*` | `encyclopedia/` |
| User-created skills | `*/skills/*` (non-symlinks) | `skills/{name}/` |
| Toolkit config | `*/toolkit-state/config.json` | `system-backup/config.json` |
| Settings | `*/settings.json` | `system-backup/settings.json` |
| Keybindings | `*/keybindings.json` | `system-backup/keybindings.json` |
| MCP config | `*/mcp.json` | `system-backup/mcp.json` |
| History | `*/history.jsonl` | `system-backup/history.jsonl` |
| Plans | `*/plans/*` | `system-backup/plans/` |
| Specs | `*/specs/*` | `system-backup/specs/` |

**Excluded (machine-specific):** `config.local.json`, `mcp-config.json`, `settings.local.json`, credentials/tokens, toolkit-owned symlinks, `node_modules/`, `__pycache__/`

### Remote Storage Layout (all backends)

```
{root}/                          # gdrive:{DRIVE_ROOT}/Backup/personal/
├── CLAUDE.md
├── memory/
│   └── {project-key}/
├── conversations/
│   └── {slug}/
├── encyclopedia/
├── skills/
│   └── {skill-name}/
└── system-backup/
    ├── config.json
    ├── settings.json
    ├── keybindings.json
    ├── mcp.json
    ├── history.jsonl
    ├── plans/
    └── specs/
```

### Project Discovery & Registration

`discover_projects()` in `lib/backup-common.sh` scans common working directories for git repos not already tracked. Called by `session-start.sh` on every session start:

1. **Build skip set** — the git-sync path (`~/.claude/`) plus all `projects[].path` and `ignored[]` entries from `tracked-projects.json`
2. **Scan** — checks depth-1 children of `~/projects/`, `~/repos/`, `~/code/`, `~/dev/`, `~/src/`, `~/Documents/`, `~/Desktop/` for `.git/` directories
3. **Output** — writes discovered paths to `~/.claude/.unsynced-projects` (one per line, sorted, deduped)
4. **Warn** — writes `PROJECTS:<count>` to `~/.claude/.sync-warnings` for statusline display

The `/sync` skill consumes `.unsynced-projects` and walks the user through registration (create GitHub repo, register in `tracked-projects.json`) or ignoring each project.

**`tracked-projects.json` schema:**
```json
{
  "projects": [
    { "path": "/c/Users/user/projects/myapp", "remote": "user/myapp", "registered": "2026-03-24T..." }
  ],
  "ignored": [
    "/c/Users/user/Documents/old-experiment"
  ]
}
```

### Sync Status & Resolution (`/sync` skill)

The `/sync` skill (`core/skills/sync/SKILL.md`) completes the detect → display → resolve pipeline for sync health. It provides four capabilities:

1. **Status dashboard** — reads state files (`.sync-marker`, `backup-meta.json`, `tracked-projects.json`, `.sync-warnings`) and displays a unified overview of personal data sync, skill backup, and project tracking status.

2. **Warning resolution** — walks through each active warning from `.sync-warnings` with targeted diagnosis and actionable options:
   - `OFFLINE` → advisory (resolves automatically)
   - `PERSONAL:NOT_CONFIGURED` → refers to `/setup-wizard`
   - `PERSONAL:STALE` → diagnoses cause (hook missing? backend unreachable? debounce stuck?), offers force sync
   - `SKILLS:<names>` → offers to add unbackedup skills to git tracking
   - `PROJECTS:<count>` → transitions to project onboarding

3. **Project onboarding** — interactive per-project flow reading `.unsynced-projects`: detect git/remote status, offer to create GitHub repos, register in `tracked-projects.json`, or ignore.

4. **Force sync** — manual trigger (`/sync now` or trigger phrases from mandate) that resets the debounce marker and runs `sync.sh` immediately. Fulfills the manual backup mandate.

### Interactive Restore (Setup Wizard)

The setup wizard (`core/skills/setup-wizard/SKILL.md`) provides an interactive restore path for returning users on new devices. When the user identifies prior use, the wizard:

- **GitHub backend:** Clones or pulls the private config repo, rewrites hardcoded paths, and merges `mcp-servers/mcp-config.json` back into `~/.claude.json`
- **Drive backend:** Configures rclone, then pulls encyclopedia files, personal data, and transcripts using the same rclone paths as the session-start hook

After restore, the wizard runs an abbreviated dependency check and skips personalization (Phase 5). The session-start hook then handles all subsequent downsyncing automatically on every session start.

The manual `restore.sh` script (in the private config repo) remains available as a power-user alternative.

### Sync Flow (`sync.sh`)

### Key State Files

| File | Purpose | Written by |
|------|---------|-----------|
| `~/.claude/toolkit-state/.sync-marker` | Last sync timestamp (15-min debounce) | sync.sh |
| `~/.claude/toolkit-state/.sync-lock/` | Mutex — prevents concurrent sync instances | sync.sh (cleaned up on exit) |
| `~/.claude/backup.log` | Persistent log of all backup operations | sync.sh |
| `~/.claude/.write-registry.json` | Write guard: last-writer PID + hash per tracked file | sync.sh (before debounce) |
| `~/.claude/backup-meta.json` | Schema version and toolkit version stamp, written after each successful sync cycle | sync.sh |
| `~/.claude/.unsynced-projects` | Discovered git repos not registered | session-start (via `discover_projects()`) |
| `~/.claude/tracked-projects.json` | Project registry — tracked and ignored project paths | `/sync` skill |
| `~/.claude/toolkit-state/config.local.json` | Machine-specific config (platform, toolkit_root, binary paths). Rebuilt every session start. Never synced. | session-start (`rebuild_local_config`) |
| `~/.claude/toolkit-state/.legacy-conversations-migrated` | Marker for one-time legacy conversation migration | session-start |
| `~/.claude/conversation-index.json` | Session-to-topic mapping for cross-device topic display. Synced to `system-backup/` on all backends. | sync.sh, session-end-sync |

## Dependencies

- **Depends on:**
  - `rclone` (Drive backend) — must be installed and configured with a `gdrive:` remote.
  - `git` + `gh` (GitHub backend) — must be installed and authenticated. Not required for Drive or iCloud backends.
  - iCloud app (iCloud backend) — for local folder sync on macOS/Windows.
  - `node` (Node.js) — used to parse stdin JSON (extracts `tool_input.file_path`) and update write registry.
  - `date`, `find`, `mkdir`, `rsync` — standard Unix utilities (available in Git Bash on Windows).
  - Claude Code hook system — PostToolUse hook invocation with JSON on stdin.
  - `lib/backup-common.sh` — shared utilities (debounce, mutex, logging, atomic write).

- **Depended on by:**
  - **All synced files** — any file matching the sync path filter depends on this system for cross-device persistence.
  - **CLAUDE.md manual backup instructions** — references the hook and documents trigger phrases.
  - **Specs INDEX** (`~/.claude/specs/INDEX.md`) — lists this spec.
  - **`/sync` skill** (`core/skills/sync/SKILL.md`) — reads state files to provide status dashboard and interactive resolution.
  - **`session-start.sh`** — pulls from preferred backend on session start, calls `sync.sh` for stale-sync catch-up.

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-04-05 | 5.0 | Sync consolidation: merged git-sync.sh + personal-sync.sh into single sync.sh. Removed local ~/.claude git repo requirement. Expanded sync scope to include settings, keybindings, mcp.json, history, plans, specs under system-backup/ on remote. Write registry update moved from git-sync.sh into sync.sh (before debounce). Renamed .personal-sync-marker → .sync-marker, removed .push-marker and .sync-status. GIT_REMOTE config key retired. Added conversation index to sync scope. See sync-consolidation-design (04-01-2026) and conversation-index-spec.md. personal-sync-spec.md retired — content merged here. | Architecture | owner |
| 2026-03-26 | 4.4 | Revised error visibility mandate: session-start network operations now run in background with failure-specific warnings (GIT:PULL_FAILED, PERSONAL:PULL_FAILED, MIGRATION:FAILED) surfaced via .sync-warnings instead of hookSpecificOutput. Statusline and /sync skill provide the visibility path. | Update | owner |
| 2026-03-25 | 4.3 | Cross-device sync: portable/local config split (D1), mcp-config.json excluded from sync (D2, reversal of v4.2), conversations added to personal-sync scope, home-directory conversation aggregation via symlinks, git repo health check (D8), renamed get_primary_backend to get_preferred_backend. All backends now documented as complementary (no primary/secondary hierarchy). See cross-device-sync-design (03-25-2026). Removed Claude Mobile (`~/claude-mobile/`) as a tracked project — git-sync.sh now only tracks `~/.claude/`. Removed associated state files and project discovery skip entry. | Update | owner |
| 2026-03-24 | 4.2 | Added `/sync` skill and project discovery. `discover_projects()` in backup-common.sh scans common directories for untracked git repos; session-start.sh now actively writes `.unsynced-projects`. The `/sync` skill provides status dashboard, warning resolution, project onboarding, and force sync — fulfilling the manual backup mandate (line 19). New state files: `.unsynced-projects`, `tracked-projects.json`. New design decisions: project discovery, `/sync` as resolution layer. | Update | owner |
| 2026-03-24 | 4.1 | Critical fix: session-start Drive pull used `rclone sync` for memory, which deletes local files (including conversation .jsonl) not present on the remote. Changed to `rclone copy --update`. This was silently destroying conversation history on every session start when Drive backend was configured. | Bugfix | owner |
| 2026-03-23 | 4.0 | Refactored: symlink-based ownership detection replaces drive-archive.sh — all backend replication now handled by personal-sync.sh. New shared library (lib/backup-common.sh), migration framework (lib/migrate.sh, migrations/v1.json), toolkit integrity check in session-start. See backup-system-refactor-design (03-22-2026). | Architecture | — |
| 2026-03-18 | 3.3 | Added Interactive Restore section: setup wizard now handles restore for returning users via GitHub or Drive, complementing the existing manual restore.sh path. | Update | — |
| 2026-03-16 | 3.2 | Multi-project backup support: git-sync.sh now routes files to the correct Git repo based on path prefix (`~/.claude/` → claude-config, `~/claude-mobile/` → claude-mobile). Each project gets independent push markers and rebase-fail counters. Branch detection is automatic. New mandate: all Claude projects must be backed up to private GitHub repos by default. | Update | — |
| 2026-03-16 | 3.1 | Added `mcp-config.json`: session-start hook extracts mcpServers from `.claude.json` into a Git-tracked file (`mcp-servers/mcp-config.json`); restore.sh merges it back on restore. Solves the problem where `.claude.json` is excluded from Git but MCP server definitions don't regenerate automatically. | Update | — |
| 2026-03-15 | 3.0 | Git + Drive hybrid migration: primary sync moved from rclone/Drive snapshots to Git + GitHub (immediate commit, debounced 15-min push). Drive archive retained as secondary write-only layer for specs, skills, CLAUDE.md, transcripts. Removed obsolete design decisions (dedup window, pull-before-push, stage-then-swap, session heartbeat, device tagging, history merge). Added new design decisions (immediate commit / debounced push, .gitignore strategy, Drive archive scope, Drive archive is best-effort). Updated mandates for Git context (credential exclusion via .gitignore, RESTORE.md in Git repo). | Architecture | — |
| 2026-03-15 | 2.3 | Added pre-snapshot notification announce so full snapshots are visibly flagged before they start (not just after completion) | Update | — |
| 2026-03-13 | 1.0 | Initial spec | New | — |
| 2026-03-14 | 1.1 | CLAUDE.md moved to global (`~/.claude/CLAUDE.md`), `README.md` added to full snapshots alongside `RESTORE.md`, `usage-fetch.js` moved to `~/.claude/hooks/` | Update | — |
| 2026-03-14 | 1.2 | OAuth tracking switched from `google-calendar-oauth.json` (gcal MCP, removed) to `gws/client_secret.json` (gws CLI) | Update | — |
| 2026-03-14 | 2.0 | Four architectural changes: (1) `.claude.json` removed from backups — machine-specific, always conflicts; (2) `safe_copy()` uses `cmp -s` content check to eliminate timestamp false-positive conflicts; (3) `history.jsonl` merged across machines instead of conflict-keep-local; (4) conversation transcripts (`~/.claude/projects/*/*.jsonl`) backed up via `rclone copy --size-only` to `gdrive:Claude/Backup/conversations/` | Architecture | — |
| 2026-03-14 | 2.1 | Added write guard: PreToolUse hook (`write-guard.sh`) blocks same-machine concurrent writes to tracked files via centralized registry (`~/.claude/.write-registry.json`). Registry update added to `sync-to-drive.sh`. New tracked file: `write-guard.sh`. | Update | — |
| 2026-03-14 | 2.2 | Added `check-inbox.sh` to tracked hook scripts (filter, incremental case, full snapshot, pull-before-push, sync-from-drive pull) | Update | — |
