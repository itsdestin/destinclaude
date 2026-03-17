# Changelog

All notable changes to DestinClaude will be documented in this file.

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
