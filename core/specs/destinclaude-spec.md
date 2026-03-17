# DestinClaude Toolkit — Spec

**Version:** 1.6
**Last updated:** 2026-03-17
**Feature location:** `~/.claude/plugins/destinclaude/` (toolkit root)

## Purpose

Canonical reference for the DestinClaude toolkit as a published, installable product. Documents the bootstrap/install flow, setup wizard behavior, component registration mechanism, dependency chain, and known gaps between the author's desktop environment and what the toolkit actually configures during installation.

Individual features (skills, hooks, MCP servers) have their own specs — this spec covers the toolkit-level view: how it gets onto a user's machine and what works (and doesn't) after setup.

## User Mandates

- (2026-03-16) The bootstrap installer and setup wizard must be non-destructive — never overwrite, delete, or modify existing user files without explicit permission. Always back up before changing anything.
- (2026-03-16) Component registration must use symlinks into `~/.claude/skills/`, `~/.claude/commands/`, and `~/.claude/hooks/` — NOT `enabledPlugins` path-based entries, which are silently ignored by Claude Code.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Symlink-based registration (not plugin marketplace) | Claude Code's `enabledPlugins` only supports `"name@marketplace": true` format. Symlinks into standard auto-discovery dirs (`~/.claude/skills/`, etc.) work reliably across platforms without requiring marketplace setup | `enabledPlugins` with paths (rejected: silently ignored), `--plugin-dir` flag (rejected: per-session only), local marketplace (rejected: over-engineered for current scope) |
| Homebrew installed by default on Mac | Nearly every Mac dependency (node, gh, rclone, gcloud, go) uses `brew install`. Installing Homebrew first simplifies all downstream steps to one-liners | Ask user to choose (rejected: added friction for non-technical users), direct .pkg downloads (rejected: inconsistent install paths, harder to update) |
| Bootstrap script + setup wizard (two-phase install) | Bootstrap handles prerequisites and cloning (can run via `curl \| bash`). Setup wizard handles interactive decisions (layer selection, personalization, conflict resolution) that require Claude | Single script (rejected: can't do interactive Claude conversation), wizard-only (rejected: can't install prerequisites without Claude running) |
| Root-level `skills/` and `commands/` mirror core | Bootstrap needs to symlink setup-wizard before the full setup runs. Root-level dirs provide a stable reference without depending on layer structure | Symlink directly to `core/` (current approach after fix), hardcoded paths (rejected: fragile) |
| Beginner-friendly auth walkthroughs | Users may be non-technical. Every auth step (gcloud, gh, rclone, Todoist) is written as a click-by-click walkthrough with plain-English explanations of what each tool is and why it's needed | Terse developer-style instructions (rejected: confused non-technical testers), links to external docs (rejected: context-switching loses users) |
| Bootstrap symlink fallback to copy | Some Mac filesystems or permission configs break symlinks. If symlink verification fails, bootstrap copies the files directly so `/setup` always works | Symlink-only (rejected: silent failure on some Macs), copy-only (rejected: doesn't track upstream changes) |

## Current Implementation

### 1. Install Flow

```
User runs: curl -fsSL .../install.sh | bash
  │
  ├── Detect OS (macOS / Linux / Windows)
  ├── Install Homebrew (macOS only, if missing)
  ├── Install Node.js (via brew on Mac, apt/dnf on Linux)
  ├── Check for git
  ├── Install Claude Code (npm install -g)
  ├── Clone toolkit → ~/.claude/plugins/destinclaude/
  ├── Symlink /setup command + setup-wizard skill
  ├── Verify symlinks (fallback to copy if broken)
  └── Print "Run: claude → /setup"

User runs: claude → /setup
  │
  ├── Phase 1: Environment inventory
  ├── Phase 2: Conflict resolution (backup + merge/keep/replace)
  ├── Phase 3: Layer selection (core/life/productivity/modules)
  ├── Phase 4: Dependency installation (git, gh, gcloud, rclone, go, todoist)
  ├── Phase 5: Personalization (templates, CLAUDE.md, symlinks, hooks, MCP)
  ├── Phase 6: Verification (health checks on all installed components)
  └── Show /toolkit reference card (first look at all features)
```

### 2. Component Registration

Skills, commands, and hooks are registered via symlinks into Claude Code's auto-discovery directories:

| Component type | Source location | Symlink target |
|---------------|----------------|---------------|
| Skills | `{layer}/skills/{name}/` | `~/.claude/skills/{name}` |
| Commands | `core/commands/{name}.md` | `~/.claude/commands/{name}.md` |
| Hooks | `{layer}/hooks/{name}.sh` | `~/.claude/hooks/{name}.sh` |
| Statusline | `core/hooks/statusline.sh` | `~/.claude/statusline.sh` (NOT in hooks/) |

Hook trigger-point registration is written to `~/.claude/settings.json` under the `hooks` key. The statusline is **not** a hook — it requires a separate `statusLine` config entry in `settings.json`:

```json
{ "statusLine": { "type": "command", "command": "bash ~/.claude/statusline.sh" } }
```

### 3. Layers and Components

| Layer | Skills | Commands | Hooks | MCP Servers |
|-------|--------|----------|-------|-------------|
| Core | setup-wizard | setup, toolkit, contribute, toolkit-uninstall, update, health | checklist-reminder, git-sync, session-start, title-update, todo-capture, write-guard + statusline (separate config) | — |
| Life | encyclopedia-compile, encyclopedia-interviewer, encyclopedia-librarian, encyclopedia-update, google-drive, journaling-assistant | — | sync-encyclopedia | — |
| Productivity | inbox-processor, skill-creator | — | — | todoist, gmessages, windows-control (Windows) |
| Elections Notebook | elections-notebook | — | — | — |
| JLBC Fiscal Note | jlbc-fiscal-note | — | — | — |

### 4. Dependencies by Layer

| Dependency | Layer | Required? | Install method (Mac) |
|-----------|-------|-----------|---------------------|
| Homebrew | All (Mac) | Yes | Auto-installed by bootstrap |
| Node.js | All | Yes | `brew install node` |
| git | All | Yes | Xcode CLI tools |
| gh CLI | Core | Strongly recommended | `brew install gh` |
| gcloud CLI | Core | Optional | `brew install --cask google-cloud-sdk` |
| rclone | Life | Yes | `brew install rclone` |
| Go | Productivity | Yes (for gmessages) | `brew install go` |

### 5. CLAUDE.md Fragments

The toolkit ships CLAUDE.md fragment templates in `core/templates/claude-md-fragments/`. Each fragment is merged into the user's `~/.claude/CLAUDE.md` during setup (Phase 5 Step 4), wrapped in markers for clean updates on re-install:

| Fragment | Purpose |
|----------|---------|
| `installed-skills.md` | Skill table populated by setup wizard based on selected layers |
| `mcp-servers.md` | MCP server table populated based on configured servers |
| `specs-system.md` | Specs system rules (mandates, versioning, governance) |
| `system-change-protocol.md` | Mandatory checklist for modifying system features |
| `error-guidance.md` | Instructs Claude to show `★ Tip` blocks when errors occur and the user seems unsure |

### 6. User Experience Features

**`/toolkit` command** — Full reference card showing all installed features, trigger phrases, hooks, and commands. Always includes an "AVAILABLE (not installed)" section listing layers/modules the user doesn't have, with descriptions. When a user asks about a feature from an uninstalled layer, Claude explains which layer it belongs to and offers `/setup`.

**Periodic `/toolkit` reminder** — The session-start hook counts sessions and shows `Tip: Type /toolkit to see all your features and useful phrases.` every ~20 sessions. Tracked in `~/.claude/toolkit-state/toolkit-reminder.json`.

**Error guidance tips** — CLAUDE.md fragment that instructs Claude to occasionally show a `★ Tip` block when errors occur, reassuring non-technical users that Claude can likely fix the problem if they say "go ahead and fix it" or "propose some solutions." Throttled to ~once per 5 errors, suppressed for technical users.

**Contribute policy** — The `/contribute` command and contribution-detector agent exist for organic discovery, but contributing is NOT promoted during setup. The setup completion message and gh auth success message focus on the user's features, not upstream contributions. New users should explore before being asked to give back.

## Dependencies

- **Depends on:** Claude Code (skill/command/hook auto-discovery, settings.json hook registration), git, Node.js, platform package manager (Homebrew on Mac)
- **Depended on by:** All toolkit skills, hooks, and commands — this spec documents how they get installed

## Known Issues

### MCP servers — resolved items and remaining gaps

MCP server configs have been audited against the author's desktop `~/.claude.json` and ported to the toolkit:

- **windows-control** — Added to setup wizard (Windows only, `uvx windows-mcp`). No Mac/Linux equivalent bundled yet.
- **todoist** — Config verified: `"type": "http", "url": "https://ai.todoist.net/mcp"`. Works out of the box.
- **gmessages** — Config verified. Pre-built Windows binary (`gmessages.exe`) included in repo. Setup wizard handles platform-appropriate binary name.
- **gmail-extended** — Deprecated and removed. Superseded by Claude.ai's native Gmail MCP connector.

Remaining gap: No Mac/Linux desktop control MCP server equivalent to `windows-control`.

### `/contribute` command has no recovery path for non-technical users

The `/contribute` flow involves git concepts (forks, branches, remotes, pull requests) that non-technical users can't recover from if something goes wrong mid-flow. If a fork fails, a branch checkout errors, or a push is rejected, the user may be stranded on a detached or orphan branch with no idea how to get back to a working state. The command instructs Claude to "explain what GitHub is" at the start, but the mid-flow steps (diffing against tags, checking out contribution branches, adding fork remotes) generate git output that Claude would need to interpret and recover from on behalf of the user. Needs: a clear "bail out" instruction at the top (e.g., "If anything goes wrong, type `git checkout main` to get back to safety"), and ideally a pre-flight check that verifies the repo is in a clean state before starting.

### Messaging setup is the longest and most complex optional phase

The messaging setup (iMessage permissions + Google Messages Go compilation) is easily the most intimidating part of the wizard for non-technical users. It involves granting macOS Full Disk Access, installing a compiler, building from source, and deferring phone pairing to a future session. This complexity is embedded in the middle of the setup wizard rather than being a separate, deferrable flow. Users who just want journaling or task management may abandon setup when confronted with "I need to install a programming language to build a text messaging server." Consider: extracting messaging into a standalone post-setup flow (e.g., "say 'set up messaging' anytime") so users can finish core setup quickly and tackle messaging later if they want it.

### Other gaps

- No automated test for verifying MCP server connectivity after setup.
- Root-level `skills/setup-wizard/` is a file copy of `core/skills/setup-wizard/`, not a git symlink — must be manually synced after edits.

## Planned Updates

- Add Mac/Linux desktop control MCP server equivalent
- Add MCP connectivity verification to Phase 6
- Convert root-level `skills/setup-wizard` from copy to proper symlink in git
- Add recovery/bail-out instructions to `/contribute` command for non-technical users
- Extract messaging setup from the main wizard into a standalone post-setup flow

## Change Log

| Date | Version | What changed | Type |
|------|---------|-------------|------|
| 2026-03-17 | 1.6 | Ported MCP server configs from author's desktop: added windows-control (Windows), verified todoist and gmessages configs, included pre-built gmessages.exe binary, removed gmail-extended (deprecated), updated mcp-servers.md template fragment | Update |
| 2026-03-17 | 1.5 | Usability review: added /health command, fixed uninstall marker mismatch, improved wizard phase summaries and first-run experience, added messaging and /contribute to known issues with planned extraction, improved template variable prompts and rclone fallback guidance, fixed PowerShell installer instructions | Update |
| 2026-03-16 | 1.4 | Documented CLAUDE.md fragments system, /toolkit reference card + periodic reminder, error guidance tips, contribute policy. Updated install flow diagram. Synced with CHANGELOG v1.0.1. | Update |
| 2026-03-16 | 1.3 | Added /toolkit command. Reverted premature MCP "resolved" claims — configs are untested templates, not working setups. Toned down upstream contribution pressure. Added MCP audit to planned updates. | Update |
| 2026-03-16 | 1.2 | Added design decisions for beginner-friendly walkthroughs and symlink fallback, documented root-level copy sync gap | Update |
| 2026-03-16 | 1.1 | Statusline is not a hook — documented as separate component type with own config entry in settings.json. gh CLI upgraded to strongly recommended. | Update |
| 2026-03-16 | 1.0 | Initial spec — documents install flow, registration mechanism, dependency chain, and known MCP gaps | New |
