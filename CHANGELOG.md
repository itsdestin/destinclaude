# Changelog

All notable changes to DestinClaude will be documented in this file.

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

### Core
- Session hooks — git sync, statusline, write guard, title update, todo capture, checklist reminder, usage tracking
- Specs system for structured feature documentation with mandate/decision/implementation tiers
- Memory system templates for cross-session persistence
- Setup wizard with non-destructive installation, conflict resolution, and layer selection
- `/update` command with changelog display and safe merge-based updates
- `/contribute` command for forking, filtering private content, and creating upstream PRs
- `/toolkit-uninstall` command for clean removal with backup restoration
- Contribution detector — proactive SessionStart hook that suggests sharing improvements
- Statusline with toolkit version display and update notification

### Life
- Journaling assistant with Socratic-style conversational prompts
- Encyclopedia system — 8 modular source files with 4-level compilation (Full/Personal/Professional/Public)
- Encyclopedia interviewer for gap-filling interviews
- Encyclopedia librarian for reports, briefings, and deep search
- Google Drive sync via rclone

### Productivity
- Inbox processor for Todoist integration with active resolution
- Skill creator for building, testing, and benchmarking skills
- Google Messages MCP server for SMS/RCS through Claude

### Modules (Optional)
- Arizona Elections Notebook — legislative candidate and campaign finance tracking
- JLBC Fiscal Note Drafter — fiscal impact analysis in official format

### Documentation
- Beginner's guide (4 pages, zero jargon)
- Quickstart for existing Claude Code users
- System architecture deep dive
- Contributing guide
- Bootstrap scripts for macOS/Linux (bash) and Windows (PowerShell)
