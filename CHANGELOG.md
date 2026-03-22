# Changelog

All notable changes to DestinClaude will be documented in this file.

## v1.3.0 (2026-03-19)

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

## v1.2.1 (2026-03-18)

### Fixes
- **Self-healing toolkit discovery** — `session-start.sh` now resolves `TOOLKIT_ROOT` once at script start using `config.json` with a fallback path traversal. If `config.json` is missing, it auto-creates it from the discovered toolkit root. Previously, a missing `config.json` silently broke the entire auto-refresh pipeline — commands like `/update` were never installed and hooks were never refreshed.
- **Semver-aware version check** — Version comparison now uses `sort -V` instead of string inequality. Previously, having a VERSION ahead of the latest tag (e.g., `1.1.4` vs tag `v1.1.1`) falsely flagged "Update Available".
- **Auto-refresh installs missing files** — Hook, command, and script refresh now installs missing files (not just stale ones). Previously, if a command like `/update` was never installed in the first place, auto-refresh would never install it.
- **Session name from topic file** — Statusline reads `session_id` from session JSON and falls back to `~/.claude/topics/topic-{session_id}` when `session_name` is empty. Previously, session names only showed when explicitly set in the session JSON.
- **Independent rate limit colors** — Each rate limit timer (5h, 7d) is now colored by its own utilization percentage (green <50%, yellow 50-79%, red 80%+) instead of both sharing a single color based on the maximum.
- **Grey dividers throughout statusline** — All `|` dividers (model/context, sync/warnings, between warnings, between rate limit timers) are now consistently DIM grey instead of inheriting the color of surrounding text.
- **Field delimiter fix** — Switched session JSON parser from tab to unit separator (`0x1f`) to prevent bash `read` from swallowing empty leading fields on some platforms.
- **Label rename** — "Unbackedup Skills" renamed to "Skills Not Backed Up" for clarity.

## v1.1.6 (2026-03-18)

### Features
- **Fork File skill** — New food tracking skill (`life/skills/fork-file/`) with grocery inventory and fast food spending log. Manages pantry items across user-configured storage locations, processes receipt photos via messaging MCP servers (iMessages or Google Messages), tracks fast food visits by restaurant/item/size, and provides spending summaries. Self-bootstrapping — creates data directory, CSV files, and prompts for location setup on first use. Originally contributed by [@tjmorin03](https://github.com/tjmorin03) in PR #3.

### Documentation
- `life/skills/fork-file/specs/fork-file-spec.md` — Initial spec (v1.0)
- `core/specs/INDEX.md` — Added Fork File entry
- `docs/system-architecture.md` — Added Fork File to Life layer skill table

## v1.1.5 (2026-03-18)

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

## v1.1.4 (2026-03-18)

### Features
- **Windows Developer Mode auto-enablement** — PowerShell installer now detects whether Developer Mode is enabled and auto-enables it via UAC elevation before creating symlinks. If the user declines the prompt, the existing copy fallback handles it gracefully. Bash installer on Windows now checks Developer Mode status and nudges users toward the PowerShell installer when it's off.
- **Announcements system** — New `announcement-fetch.js` hook fetches broadcast messages from `announcements.txt` on GitHub at session start, caches them locally, and displays them right-aligned on statusline line 1. Allows the maintainer to communicate updates, tips, or notices to all toolkit users without requiring a version update.
- **Landing page integrations section** — New section on the landing page showing all supported integrations (Google Drive, Docs, Sheets, Slides, Calendar, Gmail, Google Messages, iMessage, iCloud, Apple Notes, Apple Reminders, Apple Calendar, Apple Mail, Todoist, GitHub, Chrome, Safari, Canva) with icons and expandable descriptions. Prerequisite cards updated with PAID/FREE badges, GitHub changed to Required.

### Documentation
- `bootstrap/prerequisites.md` — Added Windows Developer Mode note to "What Does NOT Happen" section
- `docs/for-beginners/03-installing-the-toolkit.md` — Added Developer Mode step to "what the script does" list
- `core/specs/destinclaude-spec.md` — Added Design Decision for auto-enabling Developer Mode, updated install flow diagram (v2.1)
- `core/skills/setup-wizard/SKILL.md` — Updated Windows symlink fallback note to reflect installer now handles Developer Mode

## v1.1.3 (2026-03-18)

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

## v1.1.2 (2026-03-18)

### Features
- **Marketplace plugin registration** — Setup wizard (Phase 5, Step 5f) now registers 14 recommended marketplace plugins via `enabledPlugins` in `settings.json`: superpowers, claude-md-management, code-review, code-simplifier, commit-commands, feature-dev, hookify, skill-creator, explanatory-output-style, learning-output-style, context7, linear, playwright, plugin-dev. Plugins download automatically on first use — no manual install needed.
- **Auto-register marketplace plugins on /update and /health** — After merging an update or running a health check, the toolkit detects any newly added marketplace plugins from the manifest and auto-registers them in `settings.json`.
- **Phase 6 verification** — Health check now confirms all 14 marketplace plugins are registered in `settings.json`.

### Documentation
- `docs/system-architecture.md` — Added Marketplace Plugins section with full plugin table
- `docs/for-beginners/03-installing-the-toolkit.md` — Updated Phase 5 description to mention plugin registration
- `core/specs/destinclaude-spec.md` — Documented `enabledPlugins` mechanism in Component Registration and Design Decisions (v1.8)

## v1.1.1 (2026-03-17)

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

## v1.1.0 (2026-03-17)

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

## v1.0.1 (2026-03-16)

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

## v1.0.0 (2026-03-16)

Initial public release.
