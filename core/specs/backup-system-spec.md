# Backup & Sync -- Spec

**Version:** 4.3
**Last updated:** 2026-03-25
**Feature location:** `core/hooks/git-sync.sh`, `core/hooks/personal-sync.sh`, `core/hooks/lib/backup-common.sh`, `core/skills/sync/SKILL.md`

## Purpose

The Backup & Sync system keeps Claude Code's configuration, memory, skills, and supporting files continuously replicated via a Git + GitHub repository as one of several complementary sync mechanisms. It operates through two scripts: `git-sync.sh` (a PostToolUse hook that commits changes immediately and pushes on a debounced 15-minute interval) and `personal-sync.sh` (replicates personal data — memory, CLAUDE.md, config, encyclopedia, user-created skills — to all configured backends: Drive, GitHub, iCloud, on a 15-minute debounce). Shared utilities live in `lib/backup-common.sh`. Together they provide automatic, conflict-aware, cross-device backup with no user intervention required during normal operation.

## User Mandates

- (2026-03-13) Failures MUST be logged to `~/.claude/backup.log` AND produce an explicit error message visible in the Claude session -- silent failures are not acceptable.
- (2026-03-13) `RESTORE.md` MUST be kept in the Git repository root and MUST be updated whenever the backup structure changes.
- (2026-03-13) Specs are NEVER modified without the user's explicit approval of the specific changes.
- (2026-03-13) User Mandates in a spec are inviolable. If a proposed change conflicts with a mandate, stop and ask the user for approval to revise the mandate before proceeding.
- (2026-03-13) Credential/secret files (`credentials.json`, `token.json`, `.env`) MUST be excluded from backups -- enforced via `.gitignore`.
- (2026-03-13) `node_modules/` and `__pycache__/` MUST be excluded from all backups -- enforced via `.gitignore`.
- (2026-03-13) Manual backup commands MUST be supported via the trigger phrases listed in CLAUDE.md ("backup now", "force a full backup", "run a backup", "manual backup", "sync to Drive").
- (2026-03-16) All Claude projects MUST be backed up to a private GitHub repo by default. When a new project is created, it should be added to git-sync.sh's project routing.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Immediate commit, debounced 15-minute push | Every tracked file change is committed to the local Git repo immediately (preserving full history). Pushes to GitHub are debounced to a 15-minute interval to avoid excessive API calls during active editing sessions. | Commit + push on every save (too many pushes), batch commit at push time (loses granular history), longer debounce (stale remote). |
| `.gitignore` strategy for exclusions | Credentials, `node_modules/`, `__pycache__/`, `.claude.json`, and other machine-specific files are excluded via `.gitignore`. Simpler and more robust than per-command exclude flags. | Per-command `--exclude` flags (error-prone, must be maintained in multiple places), separate tracked-files whitelist (adds indirection). |
| Personal-sync scope | `personal-sync.sh` handles all backend replication including encyclopedia cache and user-created skills. It absorbs the former drive-archive.sh scope and extends it to all personal data categories. | Archive everything (slow, redundant with Git), archive nothing (loses Drive as DR layer), separate per-backend scripts (duplicated logic). |
| Personal-sync is best-effort | personal-sync.sh backend failures are logged but do not block the Git commit/push workflow. All backends are complementary — personal-sync handles data not covered by git-sync. Backend failure isolation ensures one failure does not block others. | Hard failure on backend errors (blocks primary workflow for secondary concern), silent failure (violates logging mandate). |
| Mutex lock via `mkdir` | Both git-sync and personal-sync acquire `~/.claude/.backup-lock/` directory as a mutex. `mkdir` is atomic on all platforms. Stale locks (>2 minutes) are auto-broken. 30-second retry with 1-second polling. | File-based lock with `flock` (not portable to Git Bash on Windows), no locking (race conditions between concurrent hooks). |
| Symlink ownership detection | Symlinks into TOOLKIT_ROOT determine file ownership — toolkit-owned files are never backed up by personal-sync. This cleanly separates toolkit code (handled by the public repo) from personal data (handled by personal-sync). | Path-prefix allowlist (must be maintained separately), manual tagging (error-prone). |
| Migration framework | Schema-versioned backups with sequential migration runner. `v1.json` defines the baseline schema; `migrate.sh` runs vN-to-vN+1 scripts in order when restoring from an older backup. Enables safe evolution of the backup format without breaking restores. | Single-format backups (breaks on schema changes), no migration (forces manual recovery). |
| Toolkit integrity check | Session-start verifies repo completeness, auto-repairs identical copies to symlinks, warns about modified copies. Prevents silent drift between installed copies and toolkit source. | Post-install-only check (misses runtime drift), no check (silent failures as seen in pre-v2.4 installs). |
| Skills: full directory add on commit | When a skill file changes, the entire skill directory is staged (not just the changed file). Skills are coherent units; partial commits could leave broken state. | Single-file skill commit (risk of inconsistency), tarball (adds compression overhead). |
| Log rotation at 1000 lines | `backup.log` is trimmed to the last 500 lines when it exceeds 1000. Keeps logs useful without unbounded growth. | Fixed file size limit (harder to implement in bash), external log rotation (added dependency). |
| `rclone copyto` with `--checksum` for Drive sync | personal-sync.sh uses checksum comparison rather than modification time to decide whether to upload to Drive. More reliable across platforms where mtime may not be preserved. | `--update` flag (mtime-based, unreliable cross-platform), no flag (always copies, wasteful). |
| `.claude.json` excluded from backups | Machine-specific file (`numStartups`, feature flags, usage stats) that always diverges between machines. Regenerates automatically. | Keep in backups (guaranteed cross-machine conflict noise, minimal disaster recovery value). |
| Hook output via `hookSpecificOutput` JSON | `git-sync.sh` emits structured JSON so Claude Code surfaces the message in the conversation, not just in verbose mode. | Plain stdout (only visible in verbose mode), stderr (same issue). |
| Write guard via centralized registry | Same-machine concurrency protection using a PreToolUse hook that checks `~/.claude/.write-registry.json` before Write/Edit. Blocks if a different, still-running PID last wrote the file. Registry updated in `git-sync.sh` PostToolUse, shared mutex serializes access. | Per-session tracking (catches manual edits but adds cleanup burden), file-system watcher (robust but adds daemon), no protection (silent overwrites). |
| Multi-project support via path-based routing | A single `git-sync.sh` hook routes files to the correct Git repo based on path prefix. Each project gets independent push markers and rebase-fail counters. Branch detection is automatic via `git symbolic-ref`. | Separate hook scripts per project (duplicated logic, harder to maintain), monorepo (loses independent history and permissions). |
| Project discovery via `discover_projects()` | `session-start.sh` scans 7 common directories (`~/projects/`, `~/repos/`, `~/code/`, `~/dev/`, `~/src/`, `~/Documents/`, `~/Desktop/`) at depth 1 for git repos not already tracked by git-sync or registered in `tracked-projects.json`. Results written to `~/.claude/.unsynced-projects` for the `/sync` skill to consume. | Manual-only registration (users forget), recursive scan (too slow on large filesystems), file watcher daemon (added complexity). |
| `/sync` skill as the resolution layer | The detect → display → resolve pipeline: `session-start.sh` detects issues and writes `.sync-warnings`; `statusline.sh` displays them with a `/sync for info` hint; the `/sync` skill provides interactive resolution (status dashboard, warning resolution, project onboarding, force sync). The skill reads state files but does not duplicate hook logic. | Automatic resolution in hooks (too opinionated, may take unwanted actions), separate command per warning type (fragmented UX). |
| Portable/local config split | `config.json` holds portable user preferences (synced). `config.local.json` holds machine-specific values — platform, toolkit_root, binary paths — rebuilt by `session-start.sh` every session. `config_get()` reads local first, portable second. Eliminates cross-device conflicts from machine-specific data in synced config. See cross-device-sync-design (03-25-2026) D1. | Key-level merge during sync (complex bash merge logic), environment variables (not persistent). |
| mcp-config.json excluded from sync | `mcp-config.json` is extracted from `.claude.json` for local readability but NOT git-committed or synced. Contains absolute paths and platform-specific servers that break on other devices. Each device rebuilds its own via `.claude.json` extraction in session-start. **Reversal of v4.2 decision** which included mcp-config.json in tracked files. See cross-device-sync-design (03-25-2026) D2. | Sync with path rewriting (fragile), per-platform config files (proliferation). |
| Git repo health check, not requirement | Session-start warns if `GIT_REMOTE` is configured but `~/.claude/.git` doesn't exist. `/sync` can repair. git-sync bails early with log warning if no repo. Git is not required — personal-sync provides full functionality independently. See cross-device-sync-design (03-25-2026) D8. | Require git (excludes non-technical users), silent failure (prior broken state). |

## Current Implementation

### Tracked Projects

The hook tracks the `~/.claude/` Git repository:

| Project | Local path | GitHub repo | Branch |
|---------|-----------|-------------|--------|
| Claude Config | `~/.claude/` | `{github-user}/claude-config` (private) | `main` |

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

1. **Status dashboard** — reads state files (`.sync-status`, `.push-marker`, `.personal-sync-marker`, `backup-meta.json`, `tracked-projects.json`, `.sync-warnings`) and displays a unified overview of Git sync, personal data sync, skill backup, and project tracking status.

2. **Warning resolution** — walks through each active warning from `.sync-warnings` with targeted diagnosis and actionable options:
   - `OFFLINE` → advisory (resolves automatically)
   - `PERSONAL:NOT_CONFIGURED` → refers to `/setup-wizard`
   - `PERSONAL:STALE` → diagnoses cause (hook missing? backend unreachable? debounce stuck?), offers force sync
   - `SKILLS:<names>` → offers to add unbackedup skills to git tracking
   - `PROJECTS:<count>` → transitions to project onboarding

3. **Project onboarding** — interactive per-project flow reading `.unsynced-projects`: detect git/remote status, offer to create GitHub repos, register in `tracked-projects.json`, or ignore.

4. **Force sync** — manual trigger (`/sync now` or trigger phrases from mandate) that resets debounce markers and runs git-sync + personal-sync immediately. Fulfills the manual backup mandate.

### Interactive Restore (Setup Wizard)

The setup wizard (`core/skills/setup-wizard/SKILL.md`) provides an interactive restore path for returning users on new devices. When the user identifies prior use, the wizard:

- **GitHub backend:** Clones or pulls the private config repo, rewrites hardcoded paths, and merges `mcp-servers/mcp-config.json` back into `~/.claude.json`
- **Drive backend:** Configures rclone, then pulls encyclopedia files, personal data, and transcripts using the same rclone paths as the session-start hook

After restore, the wizard runs an abbreviated dependency check and skips personalization (Phase 5). The session-start hook then handles all subsequent downsyncing automatically on every session start.

The manual `restore.sh` script (in the private config repo) remains available as a power-user alternative.

### Tracked Files (Claude Config)

The hook fires on every PostToolUse for Write/Edit but immediately exits if the changed file does not match a tracked project path. For the Claude Config repo, `.gitignore` controls which files within `~/.claude/` are tracked. Currently tracked categories:

| Category | Pattern(s) |
|----------|-----------|
| Memory files | `*/memory/*` |
| CLAUDE.md | `*CLAUDE.md` |
| Settings | `*settings.json`, `*settings.local.json`, `*keybindings.json` |
| MCP config | `*mcp.json` |
| Hook scripts | `*git-sync.sh`, `*personal-sync.sh`, `*write-guard.sh`, `*check-inbox.sh`, `*statusline.sh`, `*usage-fetch.js`, `*prune-backups.sh` |
| OAuth | `*gws/client_secret.json` |
| Plugins | `*installed_plugins.json`, `*blocklist.json` |
| Skills | `*/skills/*` |
| MCP servers | `*/mcp-servers/*` (excludes `mcp-config.json` — machine-specific, not git-committed since v4.3) |
| Plans | `*/plans/*` |
| Specs | `*/specs/*` |
| History | `*history.jsonl` |
| Restore guides | `*RESTORE.md`, `*README.md` |
| Conversations | `~/.claude/projects/*/*.jsonl` |

### Git Sync Flow (`git-sync.sh`)

1. **Parse stdin JSON** -- extracts `tool_input.file_path`, normalizes backslashes to forward slashes.
2. **Project routing** -- matches file path to `~/.claude/`. Exits silently if no match.
3. **Branch detection** -- reads the repo's default branch via `git symbolic-ref refs/remotes/origin/HEAD`.
4. **gitignore check** -- exits silently if the file is ignored by the project's `.gitignore`.
5. **Update write registry** -- records `{pid, timestamp, content_hash}` for the written file in `~/.claude/.write-registry.json` so the PreToolUse write guard (`write-guard.sh`) can detect concurrent same-machine edits.
6. **Git commit** -- stages the changed file and commits immediately with an auto-generated message (`auto: <filename>`).
7. **Debounced push** -- checks the project-specific push marker for the last push timestamp. If 15+ minutes have elapsed (or no marker exists), pushes to GitHub and updates the marker.
8. **Symlink filter** -- skips files that are symlinks into TOOLKIT_ROOT (toolkit-owned, not backed up).
9. **Report** -- emits success/failure JSON via `hookSpecificOutput` and writes status to `~/.claude/.sync-status`.

### Key State Files

| File | Purpose | Written by |
|------|---------|-----------|
| `~/.claude/.push-marker` | Last push timestamp for Claude Config (15-min debounce) | git-sync |
| `~/.claude/.sync-status` | Human-readable status for statusline display | git-sync |
| `~/.claude/backup.log` | Persistent log of all backup operations | both scripts |
| `~/.claude/.write-registry.json` | Write guard: last-writer PID + hash per tracked file | git-sync (via `update_registry`) |
| `~/.claude/backup-meta.json` | Schema version and toolkit version stamp, written by personal-sync after each successful sync cycle | personal-sync |
| `~/.claude/.unsynced-projects` | Discovered git repos not tracked by git-sync or registered | session-start (via `discover_projects()`) |
| `~/.claude/tracked-projects.json` | Project registry — tracked and ignored project paths | `/sync` skill |
| `~/.claude/toolkit-state/config.local.json` | Machine-specific config (platform, toolkit_root, binary paths). Rebuilt every session start. Never synced. | session-start (`rebuild_local_config`) |
| `~/.claude/toolkit-state/.legacy-conversations-migrated` | Marker for one-time legacy conversation migration | session-start |

## Dependencies

- **Depends on:**
  - `git` -- all version control operations (add, commit, push, pull). Must be installed and configured with GitHub remote.
  - `rclone` -- Drive archive operations only. Must be installed and configured with a `gdrive:` remote.
  - `node` (Node.js) -- used to parse stdin JSON in `git-sync.sh` (extracts `tool_input.file_path`).
  - `date`, `find`, `mkdir`, `sed`, `wc`, `head`, `tail`, `basename`, `hostname` -- standard Unix utilities (available in Git Bash on Windows).
  - Claude Code hook system -- `git-sync.sh` relies on PostToolUse hook invocation with JSON on stdin.
  - `~/.claude/RESTORE.md` -- included in the Git repository (must exist locally).

- **Depended on by:**
  - **Statusline** (`~/.claude/statusline.sh`) -- reads `~/.claude/.sync-status` to display backup state in the Claude Code status bar.
  - **All tracked files** -- any file matching the tracked-files filter implicitly depends on this system for cross-device persistence.
  - **CLAUDE.md manual backup instructions** -- references the hook scripts directly and documents trigger phrases.
  - **Specs INDEX** (`~/.claude/specs/INDEX.md`) -- lists this spec.
  - **`/sync` skill** (`core/skills/sync/SKILL.md`) -- reads state files to provide status dashboard and interactive resolution.

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
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
