# Changelog

All notable changes to DestinClaude will be documented in this file.

## [2.1.7] - 2026-03-27

### Added
- **TranscriptWatcher** — New engine that reads Claude Code's JSONL transcript files to build the chat timeline. Replaces the hook-based approach for user messages, assistant text, tool calls, and tool results. The hook relay is now used only for permission flow.
- **PartyKit multiplayer backend** — Connect 4 multiplayer now uses PartyKit (Cloudflare Durable Objects) instead of GitHub Issues. Adds LobbyRoom for presence/challenges and ConnectFourRoom for game sessions. Deployable PartyKit server project at `desktop/partykit/`.
- **Turn-grouped chat bubbles** — Assistant messages between tool calls now appear as chat bubbles in real-time, with tool groups visually separated by intermediate text.
- **UI polish** — Custom SVG icons for tool cards, status dots for session state, chibi mascot on the welcome screen, improved prompt cards and markdown rendering.
- **"Never direct user to run commands" mandate** — New spec mandate requiring Claude to run all commands via the Bash tool. Users should only interact with GUI elements (e.g., browser sign-in windows).

### Changed
- **`/update` version check** — Now verifies both the VERSION string and git ancestry (`git merge-base --is-ancestor`), preventing false "up to date" when the VERSION file is inflated after `git fetch --tags`.
- **GitHub auth** — The `github:auth` IPC handler now returns only the GitHub username, not the raw personal access token. Remote clients no longer receive credentials.
- **Remote access security** — `transcript:read-meta` handler now validates that the requested file path is within `~/.claude/projects/` before reading.

### Fixed
- **Desktop input lag** — Fixed text selection, input wrapping, and responsiveness in the InputBar component.
- **post-update.sh orphan detector** — Fixed call to undefined `_get_installed_layers` function (now uses `INSTALLED_LAYERS` array).
- **Windows app update path** — Removed unnecessary manual uninstaller step; NSIS handles closing and overwriting natively.
- **Dead GitHub game code** — Removed orphaned `github-api.ts` and test files left behind by the PartyKit migration.

### Removed
- **GitHub Issues game backend** — Replaced by PartyKit. `github-game.ts` and `useGitHubGame.ts` deleted.

## [2.1.6] - 2026-03-26

### Added
- **Remote setup skill** — `/remote-setup` guides you through configuring Tailscale and remote access for phone/tablet use. The setup wizard now offers this as an optional step after desktop app installation.
- **Sync failure warnings** — Background sync now surfaces specific failures (`GIT:PULL_FAILED`, `PERSONAL:PULL_FAILED`, `MIGRATION:FAILED`) in the statusline and `/sync` dashboard instead of silently logging them.

### Changed
- **Faster session start** — Network operations (git pull, personal data sync, encyclopedia cache, health checks, version check) now run in the background instead of blocking session start. Debounced to run at most once per 10 minutes across rapid session restarts.
- **Inbox skill consolidation** — `inbox-processor` removed; `claudes-inbox` is now the sole inbox skill.

### Fixed
- **Encyclopedia sync timeout** — Removed a standalone sync step that used a non-existent default path, causing ~20s of wasted rclone retries on session start.
- **Windows compatibility** — Replaced `nohup` (unavailable in Git Bash) with portable `disown` for background dispatch.

## [2.1.5] - 2026-03-25

### Added
- **Remote web access** — Control DestinCode from any browser via built-in WebSocket server. Password auth, Tailscale trust, mobile-responsive UI, cross-device session sync, keep-awake mode. Settings panel with QR code for easy phone setup.
- **Cross-device conversation sync** — Conversations pushed per-slug to all configured backends (Drive, GitHub, iCloud). Session-start pulls from preferred backend. Home-directory aggregation via symlinks for unified `/resume` across devices.
- **`/appupdate` command** — Downloads and installs the latest DestinCode desktop app from GitHub Releases.
- **Portable/local config split** — New `config.local.json` for machine-specific values (platform, toolkit_root, binary paths), rebuilt every session start. `config_get()` reads local-first. Eliminates cross-device config conflicts.
- **Git repo health check** — `git-sync.sh` bails early with warning if repo dir has no `.git`; session-start warns if `GIT_REMOTE` configured but no repo exists.
- **Legacy conversation migration** — One-time `rclone copy` from old Drive path to new per-slug layout.

### Changed
- **Backend equality** — All sync backends (Drive, GitHub, iCloud) documented as complementary with no primary/secondary hierarchy. Renamed `get_primary_backend` to `get_preferred_backend`.
- **mcp-config.json excluded from sync** — No longer git-committed or synced. Machine-specific MCP server definitions extracted from `.claude.json` per session. Reversal of v4.2 decision.
- **Removed claude-mobile project** — Claude Mobile rebranded to DestinCode; removed hardcoded path routing, push markers, and project discovery skip entry from backup system.

### Fixed
- **Personal sync error visibility** — Sync failures now emit `hookSpecificOutput` visible in the Claude session (mandate compliance).
- **Duplicate conversation uploads** — Symlinked `.jsonl` files in home-slug aggregation directory are now skipped during push, preventing every conversation from uploading twice.
- **CYGWIN platform detection** — Added `CYGWIN*` to platform detection in session-start, backup-common, and personal-sync (was only `MINGW*/MSYS*`).
- **URL traversal defense** — Remote server now decodes percent-encoding before path traversal guard.
- **Git pull branch detection** — Session-start detects default branch dynamically instead of hardcoding `main`.
- **sync_github() cwd corruption** — Wrapped in subshell to prevent caller working directory mutation.
- **Extended thinking false alarm** — PTY buffer activity resets the 60s thinking timeout.
- **Windows dual-slug encoding** — `aggregate_conversations` handles MSYS vs native path encoding.
- **`/update` statusline staleness** — Stale `update-status.json` cleared after merging a new version.

### Documentation
- RESTORE.md updated for conversation sync, config split, and exclusions
- README updated with `/appupdate` command and remote access
- Desktop CLAUDE.md updated with remote access components
- Sync SKILL.md description expanded with conversation sync triggers
- Spec changelogs depersonalized (owner attribution)
- Plan docs depersonalized (generic path placeholders)
- Backup system spec bumped to v4.3; personal sync spec to v2.3

## [2.1.4] - 2026-03-25

### Added
- **`/sync` skill** — Status dashboard, warning resolution, project onboarding, and force sync. Type `/sync` to see backup health across Git, Drive, and project repos; `/sync now` to force an immediate backup.
- **Project discovery** — `discover_projects()` in backup-common.sh automatically scans common directories (`~/projects/`, `~/repos/`, `~/code/`, etc.) for git repos not tracked by git-sync. Session-start surfaces untracked repos in the statusline.
- **Branch safety check** — Session-start warns when the working directory is on a non-default branch, preventing accidental commits to stale feature branches.

### Changed
- **Desktop app version sync** — DestinCode app version now tracks the toolkit version (was stuck at 1.0.0). build.yml injects tag version; release.sh bumps desktop/package.json.

### Fixed
- **CRITICAL: rclone sync → copy** — Push operations in personal-sync.sh changed from `rclone sync` to `rclone copy`. `rclone sync` was propagating accidental local deletions to Drive, destroying backup copies.
- **Memory pull path mapping** — Session-start Drive pull now iterates per project key so memory files land in `projects/{key}/memory/` instead of at the project root.
- **Windows project slug** — `get_current_project_slug()` now uses `cygpath -w` on Windows to match Claude Code's slug algorithm, preventing phantom directory mismatches.
- **Connect 4 race conditions** — Moves no longer vanish or duplicate. Added actionCount-based versioning, move-in-flight guards, and atomic game-over dispatches.
- **Desktop app update pipeline** — NSIS silent installer now uninstalls the previous version first (avoids same-version skip), closes running app before install, and verifies installation on all three platforms.
- **node-pty spawn-helper** — Postinstall patch prevents double path replacement on macOS (`app.asar.unpacked.unpacked`).
- **Git-sync stash pop** — Failures now emit visible `hookSpecificOutput` JSON instead of silent stderr warnings.
- **discover_projects() path normalization** — Paths from tracked-projects.json are now normalized before comparison, preventing false positives on Windows.

### Documentation
- Backup system spec bumped to v4.2 (project discovery, /sync skill)
- Personal sync spec bumped to v2.2 (rclone copy fix, memory pull fix, Windows slug fix)
- Sync skill implementation plan added
- README updated with /sync command

## [2.1.3] - 2026-03-24

### Added
- **Blocking permission hooks** — Bidirectional relay for PermissionRequest hooks in the desktop app. relay-blocking.js holds the socket open for approve/deny responses, HookRelay generates request IDs, and the renderer shows Yes/Always Allow/No buttons on ToolCards. 300s timeout with fail-closed (auto-deny). Permission prompts render as standalone cards, collapse optimistically on click, and handle expiry gracefully.
- **Plugin dependency checker** — `/health` and `/update` now scan enabled plugin hooks, toolkit hooks, and MCP server configs for missing external runtime dependencies, with platform-specific install suggestions.
- **Initializing overlay** — Desktop app shows "Initializing session..." with a pulsing icon until Claude Code is ready, preventing premature input.

### Changed
- **Hookify removed from defaults** — Hookify no longer auto-registered for new installs (fires 4 hooks per tool call with no rules configured). Users can still enable it manually.
- **Permission mode badge** — HeaderBar badge now syncs reactively from PTY screen text detection, matching the mobile app approach. Detects mode changes from any source (badge click, terminal Shift+Tab, etc.).

### Fixed
- **DestinCode desktop app now functional** — The desktop app shipped in v2.0.0 but was unlaunchable for all users due to cascading issues: session spawn failed (bare `which` package unavailable outside asar), trust prompt never appeared (xterm zero-size buffer from `display:none`, Windows ConPTY selector character mismatch), and stale hook relay paths broke on every install after the first. These are now resolved — the app launches, creates sessions, detects prompts, and handles permissions on all three platforms.
- **Cross-platform compatibility** — 10 targeted fixes: `path.delimiter` for PATH joining, `fs.cpSync` replacing Unix `cp` in npm scripts, forward-slash path conversion in install.ps1, `process.platform` guard on iMessages MCP, `printf` for bash 3.2, `os.homedir()` replacing env vars, macOS Keychain platform check, asar path handling, case-insensitive path matching, portable shebangs.
- **Comprehensive bug audit** — 23 fixes across shell, TS, and Go: code injection in post-update.sh, unquoted glob expansion (data loss risk), unchecked JSON unmarshalling, DB connection leaks, hook relay socket race, DNS lookup timeout, sha256sum portability, osascript injection, XSS prevention in markdown renderer, and more.
- **Permission prompt deduplication** — Debounced parser-based detection with hook-event cancellation prevents showing duplicate prompts for the same tool approval.
- **Hardcoded user path** — Removed `C:/Users/desti` from post-update.sh MCP scanning; now derives project key dynamically via `os.homedir()`.
- **Non-destructive symlink conversion** — post-update.sh now diffs copies against source before replacing with symlinks, preserving user-modified files.
- **macOS timeout compatibility** — DNS connectivity check guards GNU `timeout` with `command -v`, falling back to node's `setTimeout`.
- **Execute permissions** — Set +x on scripts/post-update.sh, release.sh, security-sweep.sh.

### Documentation
- Blocking permission hooks design spec and implementation plan
- Plugin count updated 14→13 across all specs and docs (hookify removal)
- Hook count updated 14→16 in system-architecture-spec; added worktree-guard, check-inbox, sync-encyclopedia to hook table
- Desktop app architecture section updated with permission hooks system

## [2.1.2] - 2026-03-24

### Fixed
- **CRITICAL: Conversation history deletion** — Session-start Drive pull used `rclone sync` for memory files, which deletes local files not present on the remote. Since conversation `.jsonl` files share the `projects/` parent directory with memory subdirectories, every session start destroyed all local conversation history. Changed to `rclone copy --update` which only adds/updates files without deleting. This bug was introduced in v2.1.0 (backup system refactor).

## [2.1.1] - 2026-03-23

### Fixed
- **macOS desktop app crash** — Removed hardcoded Windows paths (`C:\Users\desti`) from renderer components that caused the app to fail on macOS/Linux. Session CWD now resolves dynamically via `os.homedir()`.
- **macOS PATH resolution** — Electron apps launched from Finder/Dock inherit a minimal PATH. Added PATH enrichment for Homebrew, nvm, Volta, and common tool locations on macOS.
- **Unix socket lifecycle** — Hook relay now cleans up stale Unix socket files on startup and shutdown, preventing EADDRINUSE errors after crashes.
- **Clipboard temp file cleanup** — Paste images older than 1 hour are automatically cleaned from the temp directory.
- **Async home path IPC** — Changed `getHomePath` from synchronous `sendSync` to async `invoke`, preventing renderer thread blocking.
- **GitHub API resilience** — Added 15-second fetch timeout and safe JSON parsing to the Connect 4 game's GitHub API client.
- **Terminal buffer guard** — Protected against accessing a disposed terminal's buffer, preventing crashes on rapid session switching.
- **GitHub game auth** — Added cancellation token and error handling to the auth initialization effect, preventing state updates on unmounted components.
- **Asar unpacked fallback** — Hook installer and session manager now verify unpacked paths exist before using them, with graceful fallback.
- **Dev server port flexibility** — Vite no longer requires strict port 5173; configurable via `VITE_DEV_SERVER_URL` env var.
- **`which` dependency** — Added `which` as explicit desktop dependency (was previously try/catch optional require).
- **Improved error logging** — Hook relay, IPC handlers, GitHub auth, and session manager now log specific error reasons instead of silently swallowing failures.
- **Resource cleanup on shutdown** — IPC handlers return a cleanup function; status interval, topic watchers, and session maps are properly cleared on app close.

### Documentation
- Added Linux PATH enrichment note for future monitoring
- Documented async IPC migration in preload bridge

## [2.1.0] - 2026-03-23

### Added
- **Backup System Refactor** — Shared utility library (`lib/backup-common.sh`) with debounce, logging, config reading, symlink ownership detection, and path normalization. Migration framework (`lib/migrate.sh`) with schema-versioned backups and sequential migration runner. Toolkit integrity check at session start with auto-repair of copies to symlinks.
- **Claude's Inbox v3.0** — Complete rewrite as a provider-agnostic inbox system with 7 capture sources: Todoist, Google Drive, Gmail, Apple Notes, Apple Reminders, iCloud Drive, and local staging directory. `/todo` hook rewritten to write local files. Session-start inbox count checker across all configured providers. Journal-queue directory for cross-skill rant handoff.
- **Post-Update Pipeline** — New `scripts/post-update.sh` with 7 automated phases: self-check, migrations, refresh (dynamic symlink creation), orphan cleanup, verify (file freshness + settings registration + feature pipeline), MCP detection, and plugin detection. `/update` skill slimmed to thin orchestrator.
- **Worktree Guard** — New PreToolUse hook blocks git branch switches in the main plugin directory, with instructions to use git worktrees instead. String-stripping prevents false positives on commit messages.
- **iCloud Backup Support** — Personal-sync, session-start, setup-wizard, and /restore all support iCloud as a third backend alongside Google Drive and GitHub. Multi-backend selection during setup.
- **`/restore` Command** — Ad-hoc personal data restore from any configured backend (Drive, GitHub, iCloud) with migration check and CLAUDE.md merge prompt.
- **Cross-Device Project Slug Rewriting** — Backup/restore system detects foreign project slugs and symlinks them into the current device's slug directory for transparent `/resume` and memory lookups.
- **GitHub Issue Templates** — Bug report and feature request templates with area dropdowns and structured fields.
- **GitHub Issues Migration** — All spec Planned Updates and Known Bugs sections replaced with GitHub Issues pointers (specs-system-spec v3.0).
- **Desktop App Integration** — Bootstrap installers auto-install DestinCode desktop app. Setup wizard Phase 5b and `/update` Step 14b for desktop app management.

### Changed
- **personal-sync.sh** — Multi-backend loop replaces single Drive archive. Expanded scope to encyclopedia cache and user-created skills. Backend failure isolation. 15-minute debounce with backup-meta.json.
- **git-sync.sh** — Removed inline Drive archive logic (moved to personal-sync). Symlink filter skips toolkit-owned files before staging.
- **session-start.sh** — Integrity check, auto-repair copies→symlinks, multi-backend pull, migration runner, sync health warnings.
- **Journaling Assistant** — Journal-queue directory (`~/.claude/inbox/journal-queue/`) as primary rant source before Todoist fallback.
- **Setup Wizard** — iCloud restore phase (0C), abbreviated dependency check renamed to Phase 0D, backend multi-select during install.

### Fixed
- **Desktop App** — White screen from relative asset paths, broken sessions from Electron node path resolution, worker spawn error handling, IPC send guards against closed channels.
- **Execute Permissions** — All `.sh` files set to 100755 in git (was 100644, causing permission denied on macOS/Linux).
- **Orphan Skill Cleanup** — Update command now prunes deleted modules (was only pruning hooks).
- **Phase Functions** — `return 1` instead of `exit 1` so post-update curated sequence continues to next phase.
- **macOS Portability** — Date ordering (BSD `-r` before GNU `-d`), python3 fallback for `readlink -f` / `realpath`, `wc -l` output trimming, portable date format in todo-capture.
- **Windows PATH** — `node` and `gh` resolved via `which.sync()` in Electron main process.
- **Depersonalization** — Removed private skill names from public migration plan, made encyclopedia remote path configurable, cleaned security patterns.
- **Cross-Platform** — Install script executable guards, TMPDIR shadowing fix, post-update sort comment correction.

### Removed
- **Journal Vault** — Encryption system added then reverted (deferred to future release due to platform issues).
- **Drive Archive in git-sync** — Replaced by personal-sync.sh multi-backend architecture.

### Documentation
- Worktree guard spec (v1.0) created
- Backup system spec bumped to v4.0
- Personal sync spec bumped to v2.0
- DestinClaude spec bumped to v2.7
- Specs system spec bumped to v3.0 (GitHub Issues migration)
- Setup wizard spec bumped to v1.1
- System architecture spec bumped to v1.2 (14 hooks)
- RESTORE.md added to repo root
- Beginner guide, quickstart, and architecture docs updated
- Claude's Inbox inline issues migrated to GitHub Issues (#56, #57, #58)

## [2.0.0] - 2026-03-22

### Added
- **DestinCode Desktop App** — Full Electron + React GUI for Claude Code with terminal view, chat view (message bubbles, tool cards, approval flow), command drawer for skill discovery, session management, clickable permission mode badge, status bar, and markdown styling
- **Connect 4 Multiplayer** — In-app multiplayer game with GitHub-backed state, direct player challenges, and cross-session persistence
- **DestinTip System** — Adaptive hint catalog (17 tips across all layers) with comfort-level filtering and session rotation, injected at session start
- **Cross-Platform CI Build** — GitHub Actions workflow (build.yml) producing Windows .exe, macOS .dmg, and Linux .AppImage installers on every release tag
- **Desktop App Installer** — desktop/scripts/install-app.sh with setup-wizard Phase 5b integration and /update Step 14b for existing users
- **ErrorBoundary** — Prevents white-screen crashes in the desktop app renderer
- **Setup Wizard Spec** — New spec (setup-wizard-spec.md v1.1) documenting the full phase flow

### Changed
- **Symlink-Only Installs** — Copy-based fallback eliminated; Developer Mode required on Windows. Setup-wizard-spec mandate revised to match
- **Statusline Line 3** — Now displays git repo/branch alongside model and context info
- **Announcements** — Moved from line 1 (right-aligned) to line 5 (inline after toolkit version); uses basic bold yellow ANSI only
- **Game Architecture** — Pivoted from WebSocket relay + leaderboard server to GitHub Issues API backend (simpler, no server hosting needed)
- **Bootstrap Installer** — Desktop app install is now opt-in with confirmation prompt (non-destructive mandate compliance)
- **GitHub Actions** — Bumped to v5 to resolve Node.js 20 deprecation warnings

### Fixed
- **Bootstrap  bug** — Undefined variable silently skipped desktop install on macOS/Linux; fixed to use - **Setup Wizard Phase 5c** — 3 hooks missing from symlink loop (contribution-detector, tool-router, personal-sync); fresh installs had broken hook registrations
- **Named Pipe Default** — Hook relay pipe name now platform-aware (Unix socket on POSIX, named pipe on Win32)
- **Node Path Resolution** — Session manager uses Electron-aware node path resolution instead of bare spawn('node')
- **GNU-only head -n -1** — Replaced with portable sed '' in build.yml
- **Update Verification** — Step 15b table now covers all 10 registered hooks; Step 15d diagram matches current statusline layout

### Removed
- WebSocket relay server and leaderboard server (replaced by GitHub backend)
- test-player.html (WebSocket-era test harness)
- .firecrawl/ development research artifacts
- SQLite database files from removed leaderboard

### Documentation
- Statusline spec bumped to v1.10 (git branch on line 3)
- System architecture spec bumped to v1.2 (full 13-hook table, fixed topic path)
- DestinClaude spec bumped to v2.6 (desktop app shipped, no longer planned)
- INDEX.md versions synced; removed stale Writing Voice row
- docs/system-architecture.md updated with DestinCode section, destintip-state.json, 3 CI workflows
- Depersonalized encyclopedia-interviewer, skill-creator-spec, google-drive-spec, inbox-processor plans
- Scrubbed personal data from desktop app (npm author, private skills, game repo, loading messages)

## ## v1.3.0 (2026-03-19)

### Features
- **Convention-based skill discovery** — Skills in `skills/` are now auto-discovered via symlinks, replacing manual registration
- **Auto-detect personal sync backend + iCloud support** — Personal sync now auto-detects the configured backend (Google Drive, iCloud, or none) instead of hardcoding Google Drive
- **Announcements system** — Maintainer can set broadcast announcements displayed inline with the toolkit version on the statusline
- **Done-sound notification hook** — New `done-sound.sh` hook plays an audio notification when Claude finishes a task (Stop event). Cross-platform: uses `afplay` on macOS, `paplay`/`aplay` on Linux, and PowerShell `System.Media.SoundPlayer` on Windows. Originally contributed via PR #4 (personality) and PR #5 (done-sound), integrated with cross-platform support.
- **Release script + pre-push safety** — New `scripts/release.sh` automates version bumps (VERSION + plugin.json + CHANGELOG header), commit, tag, and push. New `scripts/pre-push` hook blocks pushes when VERSION and the latest git tag are out of sync, preventing the v1.1.5 missing-tag class of error.
- **Sync warning severity levels** — Statusline sync warnings now use severity-tagged prefixes: red `DANGER:` for critical issues (offline, no sync configured, unsynced skills/projects) and yellow `WARN:` for advisory issues (stale personal sync). Sync status renamed from "OK: Changes Synced" to "OK: System Changes Synced".

### Fixes
- **Announcement positioning** — Moved announcement display inline with toolkit version line instead of separate line
- **Default session name** — Statusline now shows "New Session" when a session exists but has no name or topic file yet (before first tool use), instead of falling through to sync status on line 1.
- **Cross-platform reliability** — Replaced GNU-only `sort -V` with node-based semver comparison in session-start.sh and release.sh. Fixed `sed -i` portability in release.sh and setup wizard (temp file + mv instead of in-place). Fixed `head -n -1` (GNU-only) with `sed '$d'` in todo-capture.sh. Fixed `date +%P` (GNU-only) with portable `%p` in git-sync.sh.

### Documentation
- `core/specs/statusline-spec.md` — Updated to v1.7: documented sync warnings subsystem, "New Session" default, independent rate limit colors, DANGER/WARN prefixes. Fixed changelog version ordering.
- `core/specs/INDEX.md` — Synced 3 stale version numbers (destinclaude 2.1→2.3, statusline 1.4→1.7, landing-page 1.3→1.4)

## ## v1.2.1 (2026-03-18)

### Fixes
- **Self-healing toolkit discovery** — `session-start.sh` now resolves `TOOLKIT_ROOT` once at script start using `config.json` with a fallback path traversal. If `config.json` is missing, it auto-creates it from the discovered toolkit root. Previously, a missing `config.json` silently broke the entire auto-refresh pipeline — commands like `/update` were never installed and hooks were never refreshed.
- **Semver-aware version check** — Version comparison now uses `sort -V` instead of string inequality. Previously, having a VERSION ahead of the latest tag (e.g., `1.1.4` vs tag `v1.1.1`) falsely flagged "Update Available".
- **Auto-refresh installs missing files** — Hook, command, and script refresh now installs missing files (not just stale ones). Previously, if a command like `/update` was never installed in the first place, auto-refresh would never install it.
- **Session name from topic file** — Statusline reads `session_id` from session JSON and falls back to `~/.claude/topics/topic-{session_id}` when `session_name` is empty. Previously, session names only showed when explicitly set in the session JSON.
- **Independent rate limit colors** — Each rate limit timer (5h, 7d) is now colored by its own utilization percentage (green <50%, yellow 50-79%, red 80%+) instead of both sharing a single color based on the maximum.
- **Grey dividers throughout statusline** — All `|` dividers (model/context, sync/warnings, between warnings, between rate limit timers) are now consistently DIM grey instead of inheriting the color of surrounding text.
- **Field delimiter fix** — Switched session JSON parser from tab to unit separator (`0x1f`) to prevent bash `read` from swallowing empty leading fields on some platforms.
- **Label rename** — "Unbackedup Skills" renamed to "Skills Not Backed Up" for clarity.

## ## v1.1.6 (2026-03-18)

### Features
- **Fork File skill** — New food tracking skill (`life/skills/fork-file/`) with grocery inventory and fast food spending log. Manages pantry items across user-configured storage locations, processes receipt photos via messaging MCP servers (iMessages or Google Messages), tracks fast food visits by restaurant/item/size, and provides spending summaries. Self-bootstrapping — creates data directory, CSV files, and prompts for location setup on first use. Originally contributed by [@tjmorin03](https://github.com/tjmorin03) in PR #3.

### Documentation
- `life/skills/fork-file/specs/fork-file-spec.md` — Initial spec (v1.0)
- `core/specs/INDEX.md` — Added Fork File entry
- `docs/system-architecture.md` — Added Fork File to Life layer skill table

## ## v1.1.5 (2026-03-18)

### Features
- **Comfort Gate (Phase 0.5)** — Setup wizard now asks new users to choose a comfort level (Minimal, Balanced, Full) before any installs begin. The chosen level controls output style plugin registration and verification strictness throughout Phases 1–6. Users who restore from backup inherit the comfort level from their config. Design doc and implementation plan at `core/skills/setup-wizard/plans/`.
- **Landing page redesign (mockup)** — Major overhaul prepared in `docs/index-mockup.html`: sticky navigation bar, dark mode toggle with `prefers-color-scheme` and `localStorage` persistence, scroll-triggered animations via IntersectionObserver, "How It Works" 3-step flow, hero tagline + CTA button, animated demo terminal showing a journaling session, FAQ accordion (6 questions), polished footer with back-to-top button, OS auto-detection for install tabs (defaults macOS), accessibility fixes (`:focus-visible`, ARIA attributes, `<button>` integration tags), Open Graph + Twitter Card meta tags, adaptive demo terminal for light/dark mode
- **Brand icons** — Terminal-inspired design modeled after the Claude Code input box: filled chevron with flat horizontal cuts, "DC" in Cascadia Code, accent cursor block. Light mode uses cream background with dark D; dark mode uses charcoal background with light D. Orange accent throughout. Traced-outline versions (`favicon-light.svg`, `favicon-dark.svg`) with Consolas Bold glyph paths used everywhere (favicon, nav, footer) for font-independent rendering. Text-based originals (`icon-*-reference.svg`) retained as editable design references. Live site favicon updated from inline diamond SVG.

### Fixes
- **Hook distribution pipeline** — Fixed a critical issue where updated hooks, statusline features, and utility scripts never reached users after `/update`. Root causes: (1) `/update` merged new code into the repo but didn't refresh the active copies in `~/.claude/hooks/`; (2) utility scripts (`announcement-fetch.js`, `usage-fetch.js`) were never installed; (3) sibling script discovery used symlink resolution which broke on copy-based installs (Windows). This caused session naming, announcements, version/update warnings, and rate limit display to silently fail for all copy-based installs.
  - `statusline.sh` and `session-start.sh` now use config-based `toolkit_root` lookup to find sibling scripts, with symlink resolution as fallback
  - `/update` command now refreshes all hooks, utility scripts, statusline, and commands after merging (new Step 9)
  - `/update` now includes post-update verification with visual statusline check and feature-by-feature diagnostic (new Step 15)
  - `session-start.sh` now auto-refreshes stale hooks on every session start — diffs each hook against the repo and silently copies any that are out of date
  - Removes known orphan file (`~/.claude/hooks/statusline.sh`) from pre-v1.1.5 installs
  - Setup wizard Phase 5c now installs `announcement-fetch.js` and `usage-fetch.js` alongside hooks
  - `/health` command now checks hook freshness and feature pipeline integrity

> **Upgrading from older versions:** If your statusline is missing features (no session name, no version display, no rate limits), tell Claude: *"run the hook refresh script from the toolkit repo"* — it will copy the updated files for you. After that, future updates are automatic.

### Documentation
- `core/specs/landing-page-spec.md` — Updated to v1.4: added Brand Icons subsection, new sections 0 (Nav), 1.5 (How It Works), 9 (Demo), 10 (FAQ), 11 (Footer). Visual Design split into Light/Dark/Shared. Added Planned Updates for icon self-hosting and OG image.
- `core/specs/statusline-spec.md` — Updated to v1.6: documented config-based sibling discovery, copy-install breakage fix
- `core/specs/destinclaude-spec.md` — Updated to v2.3: documented hook distribution pipeline fix, utility scripts as component type

## ## v1.1.4 (2026-03-18)

### Features
- **Windows Developer Mode auto-enablement** — PowerShell installer now detects whether Developer Mode is enabled and auto-enables it via UAC elevation before creating symlinks. If the user declines the prompt, the existing copy fallback handles it gracefully. Bash installer on Windows now checks Developer Mode status and nudges users toward the PowerShell installer when it's off.
- **Announcements system** — New `announcement-fetch.js` hook fetches broadcast messages from `announcements.txt` on GitHub at session start, caches them locally, and displays them right-aligned on statusline line 1. Allows the maintainer to communicate updates, tips, or notices to all toolkit users without requiring a version update.
- **Landing page integrations section** — New section on the landing page showing all supported integrations (Google Drive, Docs, Sheets, Slides, Calendar, Gmail, Google Messages, iMessage, iCloud, Apple Notes, Apple Reminders, Apple Calendar, Apple Mail, Todoist, GitHub, Chrome, Safari, Canva) with icons and expandable descriptions. Prerequisite cards updated with PAID/FREE badges, GitHub changed to Required.

### Documentation
- `bootstrap/prerequisites.md` — Added Windows Developer Mode note to "What Does NOT Happen" section
- `docs/for-beginners/03-installing-the-toolkit.md` — Added Developer Mode step to "what the script does" list
- `core/specs/destinclaude-spec.md` — Added Design Decision for auto-enabling Developer Mode, updated install flow diagram (v2.1)
- `core/skills/setup-wizard/SKILL.md` — Updated Windows symlink fallback note to reflect installer now handles Developer Mode

## ## v1.1.3 (2026-03-18)

### Features
- **Setup wizard Phase 0 — returning-user restore gate** — The wizard now asks "Have you used DestinClaude before on another device?" before running any install steps. Returning users choose their backup source (GitHub or Google Drive) and get a dedicated restore sub-flow that clones/pulls their config, rewrites hardcoded paths, merges MCP server definitions, and pulls encyclopedia + personal data. Both paths skip fresh-install Phases 1–5 and jump straight to an abbreviated dependency check (Phase 0C) followed by verification (Phase 6). iCloud restore is noted as coming soon.

### Documentation
- `README.md` — Added "Returning User on a New Device?" entry under Get Started
- `docs/quickstart.md` — Added note that the wizard handles restore for returning users
- `docs/for-beginners/03-installing-the-toolkit.md` — Added Step 0 (Prior Use Check) to wizard walkthrough
- `bootstrap/prerequisites.md` — Updated "After the Script" section to mention the prior-use question
- `docs/system-architecture.md` — Added Setup Wizard section documenting the Phase 0 restore path
- `core/specs/backup-system-spec.md` — Added Interactive Restore subsection (v3.3)
- `core/specs/personal-sync-spec.md` — Clarified how session-start pull relates to the Phase 0B restore flow

## ## v1.1.2 (2026-03-18)

### Features
- **Marketplace plugin registration** — Setup wizard (Phase 5, Step 5f) now registers 14 recommended marketplace plugins via `enabledPlugins` in `settings.json`: superpowers, claude-md-management, code-review, code-simplifier, commit-commands, feature-dev, hookify, skill-creator, explanatory-output-style, learning-output-style, context7, linear, playwright, plugin-dev. Plugins download automatically on first use — no manual install needed.
- **Auto-register marketplace plugins on /update and /health** — After merging an update or running a health check, the toolkit detects any newly added marketplace plugins from the manifest and auto-registers them in `settings.json`.
- **Phase 6 verification** — Health check now confirms all 14 marketplace plugins are registered in `settings.json`.

### Documentation
- `docs/system-architecture.md` — Added Marketplace Plugins section with full plugin table
- `docs/for-beginners/03-installing-the-toolkit.md` — Updated Phase 5 description to mention plugin registration
- `core/specs/destinclaude-spec.md` — Documented `enabledPlugins` mechanism in Component Registration and Design Decisions (v1.8)

## ## v1.1.1 (2026-03-17)

### Security
- Sanitized SQL inputs in iMessage MCP server — proper LIKE wildcard escaping, input validation, and centralized sanitize function to prevent injection via sqlite3 CLI
- Topic files moved from world-writable `/tmp/` to `~/.claude/topics/` to prevent symlink attacks

### Features
- **Tool router hook** — PreToolUse hook blocks Claude.ai native Gmail/Calendar MCP tools and redirects to GWS CLI equivalents

### Fixes
- **Installer:** Command symlink now points to `core/commands/setup-wizard.md` (was pointing to nonexistent `commands/setup.md`)
- **Installer:** Non-terminal fallback shows proper "Download complete!" banner box instead of bare text
- **Installer:** Cleans up stale `setup.md` symlinks on upgrade
- **Hooks:** git-sync stash pop failures now warn to stderr instead of being silently swallowed

### Cleanup
- Removed root-level `commands/` and `skills/` copies — canonical files now live exclusively in `core/`
- Both installers point directly to `core/` paths, eliminating copy drift
- Synced `plugin.json` version with `VERSION` file
- Removed stale "ClaudifestDestiny" reference in `template-variables.json`
- Removed resolved known issues from spec
- Removed all references to private modules from public repo
- Removed personal biographical details from encyclopedia skill
- Restored DestinClaude branding on landing page
- Updated landing page intro copy and Modules feature card

## ## v1.1.0 (2026-03-17)

### Versioning Policy
DestinClaude follows [Semantic Versioning](https://semver.org/):
- **Major (X.0.0)** — Breaking changes that require users to re-run `/setup-wizard` or manually migrate config
- **Minor (1.X.0)** — New features, new layers/skills/MCPs, significant UX changes; backward-compatible
- **Patch (1.0.X)** — Bug fixes, copy/doc updates, hook/script corrections; no new features

Version bumps in `plugin.json` on master automatically create git tags via the `auto-tag.yml` workflow, which then trigger `release.yml` to create a GitHub Release with changelog notes. No manual tagging required.

### Features
- macOS device control MCPs added to setup wizard: `macos-automator`, `home-mcp`, `apple-events` — all macOS-gated, auto-registered on Mac installs
- iMessage option added to setup wizard (Productivity layer, macOS)
- Session name + rate limit display added to statusline
- `/health` command added
- Personal data sync hook (memory, CLAUDE.md, config backup)
- GitHub Actions workflows: `release.yml` creates GitHub Releases from `v*` tags; `auto-tag.yml` detects version bumps in `plugin.json` and creates tags automatically

### Fixes & Cleanup
- Renamed throughout from ClaudifestDestiny → DestinClaude
- `/setup` command renamed to `/setup-wizard` — all references updated across docs, scripts, and hooks
- `sha256sum` macOS fallback fixed
- Statusline and hook cross-platform fixes
- Setup wizard: stale `/setup` → `/setup-wizard` references fixed in installer
- MCP server configs ported from desktop (windows-control, todoist, gmessages)
- Landing page copy updates (Claude Pro prereq, tagline, setup instruction)

## ## v1.0.1 (2026-03-16)

### Fixes
- Fixed plugin registration — uses symlinks into `~/.claude/skills/`, `~/.claude/commands/`, `~/.claude/hooks/` instead of broken `enabledPlugins` path entries
- Fixed statusline not working after install — now uses `statusLine` config in `settings.json` instead of hook registration
- Bootstrap installer verifies symlinks on Mac, falls back to copy if broken

### New Features
- `/toolkit` command — full reference card with all features, trigger phrases, and available-but-not-installed modules
- Periodic `/toolkit` reminder every ~20 sessions via session-start hook
- Error guidance tips (`★ Tip` blocks) — reassures non-technical users that Claude can fix errors on its own
- gcloud CLI as optional core dependency for direct Google API authorization
- Homebrew installed by default on Mac before all other dependencies

### Improvements
- Every auth step (gcloud, gh, rclone, Todoist) rewritten as beginner-friendly step-by-step walkthroughs
- gh CLI upgraded from optional to strongly recommended (needed for updates and config backup)
- MCP server config (Phase 5 Step 6) now has concrete JSON templates for todoist and gmessages
- Setup completion now shows `/toolkit` reference card instead of contribute prompts
- Removed contribute pressure from setup flow — no more asking new users to contribute upstream
- DRIVE_ROOT prompt explains what "root folder" means in plain language
- rclone setup uses direct `config create` command with interactive fallback (type #24 hint)

## ## v1.0.0 (2026-03-16)

Initial public release.
