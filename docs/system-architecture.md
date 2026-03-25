# System Architecture

This document covers the technical architecture of DestinClaude for power users and developers who want to understand, extend, or contribute to the system. For the governance spec (mandates, design decisions, enforcement mechanisms), see `core/specs/system-architecture-spec.md`.

## Layer System

The toolkit is organized into four installable layers, each a standalone Claude Code plugin:

```
destinclaude/
├── core/           → Foundation (required)
├── life/           → Personal knowledge system
├── productivity/   → Task management & communication
└── modules/        → Optional domain-specific add-ons
```

**Dependency rules:**
- `core` has no dependencies — it's the foundation
- `life` depends on `core` (uses hooks, specs system, templates)
- `productivity` depends on `core`
- `life` and `productivity` are independent of each other
- Each module in `modules/` is fully independent — its own `plugin.json`, no cross-dependencies

Each layer has a `plugin.json` manifest that Claude Code discovers automatically. Plugins are loaded from `~/.claude/plugins/` or wherever the toolkit is cloned.

## Hooks

Hooks are bash scripts that run automatically in response to Claude Code events. The core layer provides:

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.sh` | SessionStart | Git pull, encyclopedia sync, MCP config extraction, version check, inbox check |
| `statusline.sh` | Statusline | Renders sync status, model info, context remaining, toolkit version |
| `git-sync.sh` | PostToolUse | Commits and syncs changes after file modifications (skips toolkit-owned symlinks) |
| `write-guard.sh` | PreToolUse | Prevents writes to protected paths (specs, live system files) |
| `worktree-guard.sh` | PreToolUse | Blocks branch switches in main plugin directory — enforces worktree usage for concurrent sessions |
| `tool-router.sh` | PreToolUse | Blocks Claude.ai Gmail/Calendar MCP tools, redirects to GWS CLI |
| `contribution-detector.sh` | SessionStart | Detects local toolkit improvements, suggests contributing upstream |
| `title-update.sh` | PostToolUse | Updates conversation title based on context |
| `todo-capture.sh` | PostToolUse | Captures TODO items from conversation |
| `checklist-reminder.sh` | Stop | Reminds about system change checklist if system files were modified |
| `usage-fetch.js` | PostToolUse | Tracks API usage statistics |
| `announcement-fetch.js` | SessionStart | Fetches announcements from GitHub, caches to `~/.claude/.announcement-cache.json` |
| `personal-sync.sh` | PostToolUse | Backs up personal data (memory, CLAUDE.md, config, encyclopedia, skills) to all configured backends: Drive, GitHub, iCloud (15-min debounce) |
| `done-sound.sh` | Stop | Plays audio notification when Claude finishes a task (cross-platform) |
| `lib/backup-common.sh` | (sourced library) | Shared utilities: debounce, logging, config reading, symlink ownership detection |
| `lib/migrate.sh` | (sourced library) | Backup schema migration runner — reads backup-meta.json, runs sequential vN-to-vN+1 scripts |

**Hook composition:** If a user already has hooks at the same trigger points, the setup wizard offers to merge logic (preserving both) or let the user choose which to keep. The backup system ensures nothing is lost.

The life layer adds `sync-encyclopedia.sh` (rclone-based Google Drive sync for encyclopedia files).

**Shared libraries:** `core/hooks/lib/` contains sourced utilities (`backup-common.sh`, `migrate.sh`) that are not hooks themselves but are loaded by hooks at runtime. `core/hooks/migrations/` contains schema migration scripts and the v1 baseline definition.

**File permissions:** All `.sh` hook scripts must be committed with the execute bit set (`100755` in git). Without this, macOS and Linux users get "Permission denied" errors when Claude Code invokes the hooks. Windows git does not enforce file permissions, so this is invisible during development on Windows — always verify with `git ls-files -s core/hooks/*.sh` before releasing. Use `git update-index --chmod=+x <file>` on Windows to set the bit.

## Specs System

Specs are structured documentation files that describe features with enough detail that a future Claude session can modify them correctly. They follow a three-tier hierarchy:

1. **User Mandates** — Inviolable rules. Cannot be changed without explicit user approval.
2. **Design Decisions** — Include rationale. Must be understood before proposing alternatives.
3. **Implementation Details** — Can be changed freely as long as mandates and decisions are preserved.

Specs live in `specs/` directories within each layer. The meta-spec (`core/specs/specs-system-spec.md`) documents how specs themselves work.

**Naming conventions:**
- Specs: `{topic}-spec.md` (versioned in frontmatter)
- Designs: `{topic}-design (MM-DD-YYYY).md`
- Plans: `{topic}-plan (MM-DD-YYYY).md`

## Encyclopedia Data Model

The life layer's encyclopedia system maintains a living biography through 8 modular source files:

| File | Purpose |
|------|---------|
| Core Identity | Permanent facts — name, birth, family |
| Status Snapshot | Present-tense portrait — current job, living situation, relationships |
| People Database | All people and groups with tier assignments |
| Chronicle | Significant life events, chronological |
| Beliefs and Positions | Political worldview, values, opinions |
| Predictions | Predictions with outcomes tracking |
| Open Threads and Goals | Active goals, unresolved threads |
| Preferences and Reference Data | Lookup data, preferences |

**Compilation:** The `encyclopedia-compile` skill merges all 8 files into a single narrative document. It supports four detail levels (Full, Personal, Professional, Public) that control how much intimate detail appears.

**Sync architecture:** Files are stored in Google Drive (`gdrive:Claude/The Journal/System/`) and cached locally at `~/.claude/encyclopedia/`. The `sync-encyclopedia.sh` hook syncs on session start. The encyclopedia-update skill writes changes back to Drive after user approval.

## Fork File

The life layer includes Fork File, a food tracking skill contributed by [@tjmorin03](https://github.com/tjmorin03). It manages two data files:

| File | Purpose |
|------|---------|
| `~/.claude/fork-file/pantry.csv` | Grocery inventory with category, location, quantity, price, and freshness |
| `~/.claude/fork-file/fastfood.csv` | Fast food visits tracked by restaurant, item, size, and price |

Storage locations are user-configured (stored in `locations.txt`), not hardcoded. The skill self-bootstraps on first use — creating its data directory, CSV headers, and prompting for location setup.

Receipt photos can be processed via either the `imessages` (macOS) or `gmessages` (all platforms) MCP server. The skill auto-detects which server is available. Without a messaging server, manual entry and all query operations still work.

## Setup Wizard

The `/setup-wizard` skill is the primary entry point for both first-time installs and returns from another device. It runs as a guided conversation — no executable code, just structured prompts that Claude follows.

**Phase 0 — Prior use check:** The wizard's first question is whether the user has run DestinClaude before on another device. Returning users choose from three restore sources (GitHub, Google Drive, or iCloud) and enter a restore sub-flow; new users proceed to Phase 1.

- **Phase 0A (GitHub restore):** Clones or pulls the user's private config repo into `~/.claude/`, rewrites hardcoded HOME paths and project slugs, and merges `mcp-servers/mcp-config.json` back into `~/.claude.json`. Then jumps to Phase 0D.
- **Phase 0B (Drive restore):** Installs rclone if missing, configures the `gdrive:` remote, and syncs encyclopedia files, personal data (memory, CLAUDE.md, config), and conversation transcripts from Drive. Then jumps to Phase 0D.
- **Phase 0C (iCloud restore):** Detects the iCloud Drive folder (macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude/`, Windows: `~/iCloudDrive/DestinClaude/`), copies personal data, and proceeds to Phase 0D.
- **Phase 0D (abbreviated dependency check):** Runs the same dependency checks as Phase 4 but frames them as "confirming everything your restored config needs." Skips Phase 5 (personalization) entirely since templates and config already exist from backup. Proceeds directly to Phase 6 (verification).

**Phases 1–6 (fresh install):** Environment check → conflict resolution → layer selection → dependency install → personalization (encyclopedia templates, CLAUDE.md fragments, marketplace plugins) → verification.

**Pre-toolkit backup:** Before modifying any existing file, the setup wizard backs up to `~/.claude/backups/pre-toolkit/` with a manifest recording what was changed. The `/toolkit-uninstall` command uses this to restore the original setup.

## Backup and Sync

**Git sync:** The `git-sync.sh` hook commits and pushes changes to a private git remote after file modifications. This provides cross-device sync and version history.

**Google Drive sync:** rclone handles bidirectional sync for encyclopedia files and journal entries. Configured during setup with `rclone config` for Google Drive OAuth.

**Personal data sync:** The `personal-sync.sh` hook (PostToolUse, 15-min debounce) backs up memory files, CLAUDE.md, and `toolkit-state/config.json` to all configured backends (Google Drive, GitHub, and/or iCloud). The `session-start.sh` hook pulls the latest personal data from the primary backend at the start of every session for cross-device continuity. On a brand-new device, the setup wizard or `/restore` command performs the initial pull.

## Memory System

Claude Code's built-in memory system stores persistent context in `~/.claude/projects/<project-key>/memory/`. The toolkit provides:

- A `MEMORY.md` index template
- Memory file templates with proper frontmatter (type, name, description)
- Categories: user, feedback, project, reference

Memory files use YAML frontmatter and markdown content. The index (`MEMORY.md`) maps to individual files — it's a table of contents, not a store.

## Marketplace Plugins

In addition to local toolkit components (registered via symlinks), the setup wizard registers 13 marketplace plugins via `enabledPlugins` in `~/.claude/settings.json`. These are downloaded automatically by Claude Code on first use — no local binary or manual install needed.

| Plugin | Purpose |
|--------|---------|
| `superpowers` | Core workflow discipline: TDD, debugging, collaboration patterns |
| `claude-md-management` | Audit and maintain CLAUDE.md files |
| `code-review` | Automated PR code review with specialized agents |
| `code-simplifier` | Simplifies code for clarity while preserving functionality |
| `commit-commands` | Streamlined git commit/push/PR workflow |
| `feature-dev` | Full feature development workflow (explore → architect → review) |
| `skill-creator` | Create, test, and benchmark skills |
| `explanatory-output-style` | Adds educational insights about implementation choices |
| `learning-output-style` | Requests meaningful code contributions at decision points |
| `context7` | Live documentation lookup from source repos |
| `linear` | Linear issue tracking integration |
| `playwright` | Browser automation and end-to-end testing |
| `plugin-dev` | Tools for building Claude Code plugins |

Registration happens in Phase 5 (Step 5f) of the setup wizard. The setup wizard merges these into any existing `enabledPlugins` entries — it never overwrites plugins already present.

## Commands

| Command | Purpose |
|---------|---------|
| `/setup-wizard` | Interactive setup wizard — installs layers, resolves conflicts, personalizes |
| `/update` | Version management — fetches tags, shows changelog, merges updates, auto-registers new marketplace plugins |
| `/contribute` | Contribution flow — diffs changes, filters private content, creates PR |
| `/toolkit-uninstall` | Clean removal — restores backups, removes toolkit files |
| `/toolkit` | Full reference card — all features, trigger phrases, hooks, and commands |
| `/health` | Quick health check — verifies hooks, symlinks, MCP servers, and marketplace plugins |
| `/restore` | Ad-hoc personal data restore from any configured backend, with migration support and CLAUDE.md merge options |

Commands are markdown files in `commands/` directories. They contain instructions that Claude follows conversationally — no executable code, just structured prompts.

## Agents

**Contribution detector:** A SessionStart hook + agent pair. The hook (`contribution-detector.sh`) runs `git diff` against the installed release tag, filters private content using `.private-manifest`, and tracks suggestion state in `~/.claude/toolkit-state/contribution-tracker.json`. The agent (`agents/contribution-detector/agent.md`) tells Claude how to present contribution suggestions naturally.

## Privacy Architecture

Personal data is protected through multiple layers:

1. **`.private-manifest`** — Gitignore-style patterns for files that should never be shared. Default patterns cover encyclopedia, journal, memory, credentials.
2. **Write guard** — Hook that prevents accidental writes to protected paths.
3. **Contribution filter** — The `/contribute` command and contribution detector both exclude private content.
4. **Setup marker comments** — CLAUDE.md modifications are wrapped in `<!-- DESTINCLAUDE BEGIN/END -->` markers for clean removal.

## DestinCode Desktop App

An Electron + React GUI that wraps Claude Code CLI. Located at `desktop/` in the toolkit repo.

- **Main process** (`desktop/src/main/`) — SessionManager (PTY pool, multi-session), HookRelay (named pipe/Unix socket server for hook events), IPC handlers
- **Renderer** (`desktop/src/renderer/`) — Terminal view (xterm.js), chat view (message bubbles, tool cards), command drawer (skill discovery), Connect 4 multiplayer game
- **Hook scripts** (`desktop/hook-scripts/`) — Relay scripts that forward Claude Code hook events to the desktop app via named pipe. Includes `relay-blocking.js` for bidirectional permission hooks (holds socket open for approve/deny response, 300s timeout, fail-closed)
- **Permission hooks** — Blocking permission relay: when Claude Code requests tool approval, the desktop app shows Yes/Always Allow/No buttons on a ToolCard. The relay holds the hook socket open until the user responds or the 300s timeout expires (auto-deny). Design doc at `docs/superpowers/specs/2026-03-23-blocking-permission-hooks-design.md`
- **Build** — Cross-platform via electron-builder (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`); CI build workflow at `.github/workflows/build.yml`
- **Install** — Optional, offered during setup-wizard Phase 5b or bootstrap; runs `desktop/scripts/install-app.sh`

## State Files

The toolkit maintains state in `~/.claude/toolkit-state/`:

| File | Purpose |
|------|---------|
| `config.json` | Installed version, selected layers, preferences |
| `update-status.json` | Cached version check result (current, latest, update_available) |
| `contribution-tracker.json` | Tracks suggested/declined/contributed file changes |
| `destintip-state.json` | Tracks session count and tip rotation state for DestinTip system |

## CI/CD

Three GitHub Actions workflows handle versioning, releases, and builds:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `auto-tag.yml` | Push to `master` that changes `plugin.json` | Detects version bump, creates and pushes a `vX.Y.Z` git tag |
| `release.yml` | Push of a `v*` tag | Extracts the matching section from `CHANGELOG.md` and creates a GitHub Release |
| `build.yml` | Push of a `v*` tag | Builds cross-platform DestinCode desktop app installers (Windows `.exe`, macOS `.dmg`, Linux `.AppImage`) |

**Release flow:** Bump the `version` field in `plugin.json` → push to master → `auto-tag.yml` creates the tag → tag push triggers `release.yml` → GitHub Release published with changelog notes. No manual tagging needed.

**Versioning policy** (documented in CHANGELOG.md):
- **Major (X.0.0)** — Breaking changes requiring `/setup-wizard` re-run or manual migration
- **Minor (1.X.0)** — New features, layers, skills, or significant UX changes
- **Patch (1.0.X)** — Bug fixes, doc/copy updates, hook corrections

The `VERSION` file and `plugin.json` version field must stay in sync. The `/update` command and statusline both read from `VERSION` to determine the installed version and check for updates via git tags.

## Building on Top

**Creating a skill:** Add a `SKILL.md` file in a `skills/<name>/` directory within any layer. The file contains Claude's instructions. Add a spec if the skill has non-obvious behavior.

**Creating a hook:** Add a `.sh` script in the `hooks/` directory. Claude Code auto-discovers hooks from plugins. Use the appropriate event trigger (SessionStart, PreToolUse, PostToolUse, etc.).

**Creating a module:** Create a new directory under `modules/` with its own `plugin.json`. Modules are self-contained — include everything they need.

**Creating a command:** Add a `.md` file in `commands/`. The filename becomes the slash command name. Use YAML frontmatter for the description.

For detailed guidance on each component type, ask Claude: "How do I create a new skill for the toolkit?"

## System Change Checklist

**Mandatory** — applies whenever you create, modify, or remove a skill, hook, spec, MCP server, or other system feature. Every item is non-negotiable. Do not skip items because they "probably don't apply."

1. **Read the relevant spec(s)** before making any changes. If the feature has a spec, confirm you understand its mandates and design decisions.
2. **Update CLAUDE.md fragments** (`core/templates/claude-md-fragments/`) if the change affects user-facing instructions, skill tables, or MCP server tables.
3. **Update `.gitignore`** if new files or directories need to be tracked or excluded from version control.
4. **Update `git-sync.sh`** if new paths need to be included in or excluded from automatic backup.
5. **Bump the spec version** if you changed a user mandate, reversed a design decision, or made an architectural shift. Batch multiple changes in one session into a single bump.
6. **Update `README.md`** if the change is user-facing (new feature, changed command, removed capability).
7. **Update `core/specs/INDEX.md`** if a spec was added, removed, or had its version bumped.
8. **Grep for stale references** to anything you renamed or removed — check specs, SKILL.md files, hooks, commands, and docs for outdated paths, function names, or feature references.
9. **Update `docs/system-architecture.md`** if the change affects the architecture (new hook, new layer component, changed data flow).
10. **Verify file permissions** for any new or modified `.sh` scripts. All shell scripts must be `100755` (executable) in git, not `100644`. On Windows, use `git update-index --chmod=+x <file>` since `chmod` has no effect. On macOS/Linux, use `chmod +x <file> && git add <file>`. Check with `git ls-files -s <file>` — the first column must be `100755`. Without this, macOS/Linux users get "Permission denied" when hooks fire.
11. **Offer to create a spec** if you created a new feature with behavior or workflow logic that a future session would need to understand to modify correctly.
