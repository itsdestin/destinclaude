# Changelog

All notable changes to DestinClaude will be documented in this file.

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

Tags (`vX.Y.Z`) are pushed to master and automatically create a GitHub Release via Actions.

### Features
- macOS device control MCPs added to setup wizard: `macos-automator`, `home-mcp`, `apple-events` — all macOS-gated, auto-registered on Mac installs
- iMessage option added to setup wizard (Productivity layer, macOS)
- Session name + rate limit display added to statusline
- `/health` command added
- Personal data sync hook (memory, CLAUDE.md, config backup)
- GitHub Actions workflow: pushing a `v*` tag now auto-creates a GitHub Release with changelog notes

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
