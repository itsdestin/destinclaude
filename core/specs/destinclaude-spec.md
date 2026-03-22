# DestinClaude Toolkit — Spec

**Version:** 2.5
**Last updated:** 2026-03-20
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
| Symlink-based registration for local components (not `enabledPlugins` paths) | Claude Code's `enabledPlugins` only supports `"name@marketplace": true` format for local paths — those are silently ignored. Symlinks into standard auto-discovery dirs (`~/.claude/skills/`, etc.) work reliably across platforms | `enabledPlugins` with paths (rejected: silently ignored), `--plugin-dir` flag (rejected: per-session only), local marketplace (rejected: over-engineered for current scope) |
| `enabledPlugins` for marketplace plugins | Marketplace plugins (superpowers, context7, etc.) use `"name@marketplace": true` in `settings.json` and are downloaded automatically by Claude Code — no local binary or symlink needed | Skipping marketplace plugins entirely (rejected: superpowers provides core workflow discipline that new installs benefit from immediately), manual post-install docs (rejected: users won't read them) |
| Homebrew installed by default on Mac | Nearly every Mac dependency (node, gh, rclone, gcloud, go) uses `brew install`. Installing Homebrew first simplifies all downstream steps to one-liners | Ask user to choose (rejected: added friction for non-technical users), direct .pkg downloads (rejected: inconsistent install paths, harder to update) |
| Bootstrap script + setup wizard (two-phase install) | Bootstrap handles prerequisites and cloning (can run via `curl \| bash`). Setup wizard handles interactive decisions (layer selection, personalization, conflict resolution) that require Claude | Single script (rejected: can't do interactive Claude conversation), wizard-only (rejected: can't install prerequisites without Claude running) |
| Root-level `skills/` and `commands/` mirror core | Bootstrap needs to symlink setup-wizard before the full setup runs. Root-level dirs provide a stable reference without depending on layer structure | Symlink directly to `core/` (current approach after fix), hardcoded paths (rejected: fragile) |
| Beginner-friendly auth walkthroughs | Users may be non-technical. Every auth step (gcloud, gh, rclone, Todoist) is written as a click-by-click walkthrough with plain-English explanations of what each tool is and why it's needed | Terse developer-style instructions (rejected: confused non-technical testers), links to external docs (rejected: context-switching loses users) |
| Symlinks required, no copy fallback | Copy-based installs caused persistent file drift: installed copies diverged from toolkit source, edits landed on the wrong side, updates silently failed to propagate, and bidirectional conflicts were unresolvable. Requiring symlinks eliminates this entire class of bugs. On Windows, Developer Mode + `MSYS=winsymlinks:nativestrict` are prerequisites — the installer enables Developer Mode automatically and fails with a clear error if it can't. | Copy fallback (rejected v1.4: caused 6+ months of silent drift bugs — stale skills, lost user edits, bidirectional conflicts in production), copy-only (rejected: doesn't track upstream changes) |
| Auto-enable Developer Mode on Windows | Windows symlinks require Developer Mode (a registry flag). Both installers (bash + PowerShell) check this and auto-enable it via UAC elevation before creating symlinks. If the user declines UAC, the install fails with instructions to enable Developer Mode manually — no copy fallback. | Prompt-only without enabling (rejected: adds friction, most users would say yes anyway), skip symlinks on Windows entirely (rejected: the entire registration system depends on symlinks), graceful copy fallback (rejected v1.4: root cause of file drift bugs) |
| Auto-tag on `plugin.json` version bump | Two-workflow chain: `auto-tag.yml` watches for `plugin.json` version changes on master and creates a git tag; `release.yml` fires on `v*` tag pushes and creates a GitHub Release with changelog notes. Eliminates manual tagging — bumping the version is the only release step | Manual `git tag && git push --tags` (rejected: easy to forget, caused v1.1.2–v1.1.4 to ship without releases), single workflow that both tags and releases (rejected: separating concerns is cleaner and each workflow stays simple), GitHub Release UI (rejected: doesn't create tags for `/update` to discover) |

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
  ├── Enable Developer Mode (Windows only, via UAC elevation)
  ├── Symlink /setup-wizard command + setup-wizard skill
  ├── Verify symlinks (fallback to copy if broken)
  └── Print "Run: claude → /setup-wizard"

User runs: claude → /setup-wizard
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

**Local toolkit components** (skills, commands, hooks) are registered via symlinks into Claude Code's auto-discovery directories:

| Component type | Source location | Symlink target |
|---------------|----------------|---------------|
| Skills | `{layer}/skills/{name}/` | `~/.claude/skills/{name}` |
| Commands | `core/commands/{name}.md` | `~/.claude/commands/{name}.md` |
| Hooks | `{layer}/hooks/{name}.sh` | `~/.claude/hooks/{name}.sh` |
| Utility scripts | `core/hooks/{name}.js` | `~/.claude/hooks/{name}.js` |
| Statusline | `core/hooks/statusline.sh` | `~/.claude/statusline.sh` (NOT in hooks/) |

**Utility scripts** (`announcement-fetch.js`, `usage-fetch.js`) are not hooks themselves but are called by hooks as sibling files. They must be installed alongside hooks so they can be found at runtime. Hook scripts use a two-step discovery: (1) read `toolkit_root` from config, (2) fall back to symlink resolution.

Hook trigger-point registration is written to `~/.claude/settings.json` under the `hooks` key. Each hook entry uses the nested `hooks` array format: `{ "matcher": "...", "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/foo.sh" }] }`. The `command` property must NOT be placed directly on the entry object — it must be inside the `hooks` array. The statusline is **not** a hook — it requires a separate `statusLine` config entry in `settings.json`:

```json
{ "statusLine": { "type": "command", "command": "bash ~/.claude/statusline.sh" } }
```

**Marketplace plugins** are registered separately via `enabledPlugins` in `~/.claude/settings.json`. The setup wizard (Phase 5, Step 5f) merges 14 recommended plugins into this key. Claude Code downloads them automatically on first use — no local binary or symlink needed:

```json
{ "enabledPlugins": { "superpowers@claude-plugins-official": true, "context7@claude-plugins-official": true, ... } }
```

### 3. Layers and Components

| Layer | Skills | Commands | Hooks | MCP Servers |
|-------|--------|----------|-------|-------------|
| Core | setup-wizard | setup-wizard, toolkit, contribute, toolkit-uninstall, update, health | checklist-reminder, contribution-detector, git-sync, personal-sync, session-start, title-update, todo-capture, tool-router, write-guard + statusline (separate config) | — |
| Life | encyclopedia-compile, encyclopedia-interviewer, encyclopedia-librarian, encyclopedia-update, fork-file, google-drive, journaling-assistant | — | sync-encyclopedia | — |
| Productivity | inbox-processor, skill-creator | — | — | todoist, gmessages, windows-control (Windows) |
| Modules | (optional domain-specific add-ons) | — | — | — |

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

**`/toolkit` command** — Full reference card showing all installed features, trigger phrases, hooks, and commands. Always includes an "AVAILABLE (not installed)" section listing layers/modules the user doesn't have, with descriptions. When a user asks about a feature from an uninstalled layer, Claude explains which layer it belongs to and offers `/setup-wizard`.

**DestinTip** — Adaptive toolkit hint system. At session start, selects up to 4 tips from a catalog (`core/data/destintip-catalog.json`) based on comfort level, usage history, and rotation. Injects them into Claude's system prompt via `additionalContext`. Claude weaves `★ DestinTip` hints naturally into conversation when relevant. Replaces the old periodic `/toolkit` reminder. See `core/specs/destintip-spec.md`.

**Error guidance tips** — CLAUDE.md fragment that instructs Claude to occasionally show a `★ Tip` block when errors occur, reassuring non-technical users that Claude can likely fix the problem if they say "go ahead and fix it" or "propose some solutions." Throttled to ~once per 5 errors, suppressed for technical users.

**Contribute policy** — The `/contribute` command and contribution-detector agent exist for organic discovery, but contributing is NOT promoted during setup. The setup completion message and gh auth success message focus on the user's features, not upstream contributions. New users should explore before being asked to give back.

## Dependencies

- **Depends on:** Claude Code (skill/command/hook auto-discovery, settings.json hook registration), git, Node.js, platform package manager (Homebrew on Mac)
- **Depended on by:** All toolkit skills, hooks, and commands — this spec documents how they get installed

## Known Issues

### MCP servers — resolved items and remaining gaps

MCP server configs have been audited against the author's desktop `~/.claude.json` and ported to the toolkit:

- **windows-control** — Added to setup wizard (Windows only, `uvx windows-mcp`).
- **macos-automator, home-mcp, apple-events** — Added to setup wizard (macOS only, v1.1.0). Covers macOS desktop control.
- **todoist** — Config verified: `"type": "http", "url": "https://ai.todoist.net/mcp"`. Works out of the box.
- **gmessages** — Config verified. Pre-built Windows binary (`gmessages.exe`) included in repo. Setup wizard handles platform-appropriate binary name.


Remaining gap: No Linux desktop control MCP server equivalent to `windows-control` or `macos-automator`.

### `/contribute` command has no recovery path for non-technical users

The `/contribute` flow involves git concepts (forks, branches, remotes, pull requests) that non-technical users can't recover from if something goes wrong mid-flow. If a fork fails, a branch checkout errors, or a push is rejected, the user may be stranded on a detached or orphan branch with no idea how to get back to a working state. The command instructs Claude to "explain what GitHub is" at the start, but the mid-flow steps (diffing against tags, checking out contribution branches, adding fork remotes) generate git output that Claude would need to interpret and recover from on behalf of the user. Needs: a clear "bail out" instruction at the top (e.g., "If anything goes wrong, type `git checkout main` to get back to safety"), and ideally a pre-flight check that verifies the repo is in a clean state before starting.

### Messaging setup is the longest and most complex optional phase

The messaging setup (iMessage permissions + Google Messages Go compilation) is easily the most intimidating part of the wizard for non-technical users. It involves granting macOS Full Disk Access, installing a compiler, building from source, and deferring phone pairing to a future session. This complexity is embedded in the middle of the setup wizard rather than being a separate, deferrable flow. Users who just want journaling or task management may abandon setup when confronted with "I need to install a programming language to build a text messaging server." Consider: extracting messaging into a standalone post-setup flow (e.g., "say 'set up messaging' anytime") so users can finish core setup quickly and tackle messaging later if they want it.

### Hook distribution pipeline (resolved in v2.3, superseded in v2.4)

The `/update` command merged new code into the repo but did NOT refresh the active hooks in `~/.claude/hooks/` or `~/.claude/statusline.sh`. On copy-based installs, hooks stayed frozen at whatever version was originally copied during setup. Fixed in v2.3 with copy-refresh mechanism. **Superseded in v2.4:** copy-based installs are no longer supported. All components must be symlinks, which inherently track the toolkit source. The copy-refresh code in `session-start.sh` was replaced with a symlink verification check that flags copies and directs users to `/health` for repair.

### Copy-based installs eliminated (v2.4)

Copy-based installs caused persistent, hard-to-diagnose file drift: installed copies diverged from toolkit source in both directions, user edits landed on the installed copy while toolkit updates landed on the repo copy, and bidirectional conflicts within the same skill were unresolvable. On Windows, the root cause was that Git Bash's `ln -sf` silently creates copies instead of real symlinks unless `MSYS=winsymlinks:nativestrict` is set. Fixed by: (1) requiring Developer Mode on Windows (installer enables automatically, fails if it can't), (2) setting `MSYS=winsymlinks:nativestrict` in all symlink-creating code paths, (3) removing all copy fallback code from bootstrap, setup wizard, `/update`, and `session-start.sh`, (4) adding symlink verification to `session-start.sh` that warns if copies are detected.

### Other gaps

- Linux desktop control MCP server equivalent to `windows-control` / `macos-automator` not yet bundled.

## Planned Updates

- Add Linux desktop control MCP server equivalent (Mac resolved via macos-automator/home-mcp/apple-events in v1.1.0)
- Add recovery/bail-out instructions to `/contribute` command for non-technical users
- Extract messaging setup from the main wizard into a standalone post-setup flow
- Add difficulty options for install: (1) full beginner — hold my hand, (2) some experience — guidance but not every explanation, (3) expert — let's hurry this up (from inbox 2026-03-17)
- Add clearer explanations of how to create new skills/workflows and how dynamic Claude is (from inbox 2026-03-17, partial — marketplace plugin registration resolved in v1.8)
- ~~Add setup feature to restore configuration from Google Drive~~ (resolved in v1.1.3 — Phase 0 restore flow)
- Add more tip prompts and hints in the first setup wizard run — mention Google Drive widget or Apple Notes widget on home screen for quick inbox capture, which can be emptied later from laptop, etc. (from inbox 2026-03-17)
- Add iCloud support via rclone as a Drive alternative — rclone has native iCloud backend (from inbox 2026-03-17)
- **Desktop App (Phase 2)** — Electron GUI wrapping Claude Code CLI with chat view, tool cards, approval flow, and session management UI. Phase 1 (terminal-only) complete on `DesktopApp` branch. Phase 2 adds structured chat view with message bubbles, tool card rendering from hook events, and approval buttons for blocking hooks. See `~/.claude/specs/claude-desktop-ui-spec.md` for full design.

## Change Log

| Date | Version | What changed | Type |
|------|---------|-------------|------|
| 2026-03-20 | 2.5 | Replaced periodic `/toolkit` reminder with DestinTip — adaptive hint system using catalog-based tip selection, comfort-level filtering, and session rotation. See `core/specs/destintip-spec.md`. | Update |
| 2026-03-20 | 2.4 | Eliminated copy-based installs. Symlinks are now required — no fallback. Bootstrap installers (bash + PowerShell) require Developer Mode on Windows and fail with clear error if unavailable. Bash installer sets `MSYS=winsymlinks:nativestrict` for real Windows symlinks. Setup wizard copy fallback removed. `/update` verifies symlinks instead of diffing copies. `session-start.sh` copy-refresh replaced with symlink verification. Added skills to `/update` refresh scope. Major bump: architectural change to install model. | Update |
| 2026-03-18 | 2.3 | Fixed hook distribution pipeline: `/update` now refreshes hooks + utility scripts, sibling discovery uses config-based `toolkit_root` with symlink fallback, utility scripts added to install list, post-update verification with visual statusline check added. Documented utility scripts as a component type. | Update |
| 2026-03-18 | 2.2 | Added auto-tag workflow Design Decision. Two-workflow release chain: `auto-tag.yml` (version bump → tag) + `release.yml` (tag → GitHub Release). | Update |
| 2026-03-18 | 2.1 | PowerShell installer auto-enables Developer Mode on Windows for symlink support. Added Design Decision entry. Updated install flow diagram. Bash installer now detects Developer Mode and nudges toward PowerShell when it's off. | Update |
| 2026-03-18 | 2.0 | Phase 6 connectivity probes: replace registration/existence checks with JSON-RPC initialize handshake tests for all stdio MCP servers and a POST probe for todoist. Windows gmessages now uses pre-built binary (no Go required). Updated mcp-manifest.json setup_note for gmessages. Major bump: behavioral change to verification flow. | Update |
| 2026-03-18 | 1.9 | Corrected stale Mac desktop control gap — macOS resolved in v1.1.0 via macos-automator/home-mcp/apple-events; Linux still open. Updated Known Issues and Planned Updates accordingly. | Fix |
| 2026-03-18 | 1.8 | Add marketplace plugin registration to setup wizard (Phase 5 Step 5f + Phase 6 check): 14 plugins via `enabledPlugins`. Document in Component Registration section and Design Decisions. Partially resolve "superpowers in repo" planned item. | Update |
| 2026-03-17 | 1.7 | Inbox processing: add 5 planned updates (difficulty options, superpowers in repo, restore from Drive, setup wizard tips, iCloud support) | Inbox |
| 2026-03-17 | 1.6 | Ported MCP server configs from author's desktop: added windows-control (Windows), verified todoist and gmessages configs, included pre-built gmessages.exe binary, removed gmail-extended (deprecated), updated mcp-servers.md template fragment | Update |
| 2026-03-17 | 1.5 | Usability review: added /health command, fixed uninstall marker mismatch, improved wizard phase summaries and first-run experience, added messaging and /contribute to known issues with planned extraction, improved template variable prompts and rclone fallback guidance, fixed PowerShell installer instructions | Update |
| 2026-03-16 | 1.4 | Documented CLAUDE.md fragments system, /toolkit reference card + periodic reminder, error guidance tips, contribute policy. Updated install flow diagram. Synced with CHANGELOG v1.0.1. | Update |
| 2026-03-16 | 1.3 | Added /toolkit command. Reverted premature MCP "resolved" claims — configs are untested templates, not working setups. Toned down upstream contribution pressure. Added MCP audit to planned updates. | Update |
| 2026-03-16 | 1.2 | Added design decisions for beginner-friendly walkthroughs and symlink fallback, documented root-level copy sync gap | Update |
| 2026-03-16 | 1.1 | Statusline is not a hook — documented as separate component type with own config entry in settings.json. gh CLI upgraded to strongly recommended. | Update |
| 2026-03-16 | 1.0 | Initial spec — documents install flow, registration mechanism, dependency chain, and known MCP gaps | New |
