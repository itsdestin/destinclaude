# Backup & Sync -- Spec

**Version:** 3.3
**Last updated:** 2026-03-18
**Feature location:** `~/.claude/hooks/git-sync.sh`, `~/.claude/hooks/drive-archive.sh`

## Purpose

The Backup & Sync system keeps Claude Code's configuration, memory, skills, and supporting files continuously replicated via a Git + GitHub repository as the primary sync mechanism, with a secondary write-only Drive archive for selected high-value files. It operates through two scripts: `git-sync.sh` (a PostToolUse hook that commits changes immediately and pushes on a debounced 15-minute interval) and `drive-archive.sh` (archives specs, skills, CLAUDE.md, and transcripts to Google Drive). Together they provide automatic, conflict-aware, cross-device backup with no user intervention required during normal operation.

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
| Drive archive scope: specs, skills, CLAUDE.md, transcripts | These are the highest-value files for disaster recovery beyond Git. Specs and skills represent significant investment; CLAUDE.md is the system's operating manual; transcripts are append-only historical records. Other files are adequately protected by Git alone. | Archive everything (slow, redundant with Git), archive nothing (loses Drive as DR layer), archive only transcripts (under-protects specs/skills). |
| Drive archive is best-effort | Drive archive failures are logged but do not block the Git commit/push workflow. Git is the primary sync mechanism; Drive is a secondary safety net. | Hard failure on Drive errors (blocks primary workflow for secondary concern), silent failure (violates logging mandate). |
| Mutex lock via `mkdir` | Both git-sync and drive-archive acquire `~/.claude/.backup-lock/` directory as a mutex. `mkdir` is atomic on all platforms. Stale locks (>2 minutes) are auto-broken. 30-second retry with 1-second polling. | File-based lock with `flock` (not portable to Git Bash on Windows), no locking (race conditions between concurrent hooks). |
| Skills: full directory add on commit | When a skill file changes, the entire skill directory is staged (not just the changed file). Skills are coherent units; partial commits could leave broken state. | Single-file skill commit (risk of inconsistency), tarball (adds compression overhead). |
| Log rotation at 1000 lines | `backup.log` is trimmed to the last 500 lines when it exceeds 1000. Keeps logs useful without unbounded growth. | Fixed file size limit (harder to implement in bash), external log rotation (added dependency). |
| `rclone copyto` with `--checksum` for Drive archive | Uses checksum comparison rather than modification time to decide whether to upload to Drive. More reliable across platforms where mtime may not be preserved. | `--update` flag (mtime-based, unreliable cross-platform), no flag (always copies, wasteful). |
| `.claude.json` excluded from backups | Machine-specific file (`numStartups`, feature flags, usage stats) that always diverges between machines. Regenerates automatically. | Keep in backups (guaranteed cross-machine conflict noise, minimal disaster recovery value). |
| Hook output via `hookSpecificOutput` JSON | `git-sync.sh` emits structured JSON so Claude Code surfaces the message in the conversation, not just in verbose mode. | Plain stdout (only visible in verbose mode), stderr (same issue). |
| Write guard via centralized registry | Same-machine concurrency protection using a PreToolUse hook that checks `~/.claude/.write-registry.json` before Write/Edit. Blocks if a different, still-running PID last wrote the file. Registry updated in `git-sync.sh` PostToolUse, shared mutex serializes access. | Per-session tracking (catches manual edits but adds cleanup burden), file-system watcher (robust but adds daemon), no protection (silent overwrites). |
| Multi-project support via path-based routing | A single `git-sync.sh` hook routes files to the correct Git repo based on path prefix. Each project gets independent push markers and rebase-fail counters. Branch detection is automatic via `git symbolic-ref`. | Separate hook scripts per project (duplicated logic, harder to maintain), monorepo (loses independent history and permissions). |

## Current Implementation

### Tracked Projects

The hook supports multiple independent Git repositories. File path routing determines which repo to commit to:

| Project | Local path | GitHub repo | Branch |
|---------|-----------|-------------|--------|
| Claude Config | `~/.claude/` | `{github-user}/claude-config` (private) | `main` |
| Claude Mobile | `~/claude-mobile/` | `{github-user}/claude-mobile` (private) | `master` |

Each project has independent push markers and rebase-fail counters. Drive archive only runs for the Claude Config repo.

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
| Hook scripts | `*git-sync.sh`, `*drive-archive.sh`, `*write-guard.sh`, `*check-inbox.sh`, `*statusline.sh`, `*usage-fetch.js`, `*prune-backups.sh` |
| OAuth | `*gws/client_secret.json` |
| Plugins | `*installed_plugins.json`, `*blocklist.json` |
| Skills | `*/skills/*` |
| MCP servers | `*/mcp-servers/*` (includes `mcp-config.json` — extracted mcpServers block from `.claude.json`) |
| Plans | `*/plans/*` |
| Specs | `*/specs/*` |
| History | `*history.jsonl` |
| Restore guides | `*RESTORE.md`, `*README.md` |
| Conversations | `~/.claude/projects/*/*.jsonl` |

### Git Sync Flow (`git-sync.sh`)

1. **Parse stdin JSON** -- extracts `tool_input.file_path`, normalizes backslashes to forward slashes.
2. **Project routing** -- matches file path to a tracked project (`~/.claude/` or `~/claude-mobile/`). Exits silently if no match.
3. **Branch detection** -- reads the repo's default branch via `git symbolic-ref refs/remotes/origin/HEAD`.
4. **gitignore check** -- exits silently if the file is ignored by the project's `.gitignore`.
5. **Update write registry** -- records `{pid, timestamp, content_hash}` for the written file in `~/.claude/.write-registry.json` so the PreToolUse write guard (`write-guard.sh`) can detect concurrent same-machine edits.
6. **Git commit** -- stages the changed file and commits immediately with an auto-generated message (`auto: <filename>`).
7. **Debounced push** -- checks the project-specific push marker for the last push timestamp. If 15+ minutes have elapsed (or no marker exists), pushes to GitHub and updates the marker.
8. **Drive archive** -- (Claude Config repo only) archives specs, skills, CLAUDE.md, and transcripts to Google Drive on successful push.
9. **Report** -- emits success/failure JSON via `hookSpecificOutput` and writes status to `~/.claude/.sync-status`.

### Drive Archive Flow (`drive-archive.sh`)

1. **Trigger** -- called from `git-sync.sh` after a successful push, or manually.
2. **Scope** -- archives only: specs (`~/.claude/specs/`), skills (`~/.claude/skills/`), CLAUDE.md files, and conversation transcripts.
3. **Upload** -- uses `rclone copyto --checksum` to `gdrive:Claude/Backup/` for the scoped files.
4. **Best-effort** -- failures are logged to `~/.claude/backup.log` but do not block the primary Git workflow.

### Key State Files

| File | Purpose | Written by |
|------|---------|-----------|
| `~/.claude/.push-marker` | Last push timestamp for Claude Config (15-min debounce) | git-sync |
| `~/.claude/.push-marker-claude-mobile` | Last push timestamp for Claude Mobile (15-min debounce) | git-sync |
| `~/.claude/.sync-status` | Human-readable status for statusline display | git-sync |
| `~/.claude/.backup-lock/` | Mutex directory | git-sync, drive-archive (created/removed) |
| `~/.claude/backup.log` | Persistent log of all backup operations | both scripts |
| `~/.claude/.write-registry.json` | Write guard: last-writer PID + hash per tracked file | git-sync (via `update_registry`) |
| `~/.claude/.rebase-fail-count-claude-mobile` | Consecutive rebase failure counter for Claude Mobile | git-sync |

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

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

- **Full snapshot time estimate:** Track how long full snapshots take (start/end timestamps) and include an estimated duration in the pre-snapshot notification (e.g., "[Backup] Full snapshot starting — usually takes ~15s"). Could use a rolling average stored in a stats file.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
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
