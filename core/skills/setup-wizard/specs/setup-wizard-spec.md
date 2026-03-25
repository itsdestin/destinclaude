# Setup Wizard — Spec

**Version:** 1.1
**Last updated:** 2026-03-22
**Feature location:** `core/skills/setup-wizard/SKILL.md`, `core/skills/setup-wizard/plans/`

## Purpose

Interactive installer and restore flow for the DestinClaude toolkit. Walks users — including non-technical ones — through environment detection, conflict resolution, dependency installation, personalization, and verification. Also serves as the restore path for returning users migrating from another device. The wizard is conversational (pure markdown instructions, no executable code) and designed to be safe to re-run at any point.

## User Mandates

- The wizard is **additive and non-destructive** — never overwrite, delete, or modify existing user files without explicit permission. Always back up before changing anything. (2026-03-16)
- Back up existing files to `~/.claude/backups/pre-toolkit/` with a manifest before any modification. The `/toolkit-uninstall` command relies on this. (2026-03-16)
- Symlink-based registration into `~/.claude/skills/`, `~/.claude/commands/`, `~/.claude/hooks/` — NOT via `enabledPlugins` path entries (which are silently ignored by Claude Code for local plugins). (2026-03-16)
- Marketplace plugins are registered via `enabledPlugins` in `settings.json` — distinct from symlink-based local components. (2026-03-18)
- On Windows, if symlinks fail (Developer Mode not enabled), halt and instruct the user to enable Developer Mode. Copy-based installs are no longer supported — they caused 6+ months of silent file drift bugs. (2026-03-18, revised 2026-03-22)
- Wait for the user's answer before proceeding at every decision point. Never auto-advance past a question. (2026-03-16)
- Do NOT ask for feedback, feature requests, or contributions at setup completion — the user just finished a long process. (2026-03-16)

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Conversational wizard (markdown instructions, not executable code) | Claude interprets the SKILL.md as a conversation script, adapting to user responses naturally. No binary to maintain or debug. | Shell script installer (rejected: can't adapt to user confusion, no conversational error recovery), config file with `claude --init` (rejected: doesn't exist in Claude Code) |
| Prior-use check before anything else (Phase 0) | Returning users shouldn't sit through a fresh install. Detecting prior use first lets them skip to restore + abbreviated dependency check. | Ask at the end (rejected: wastes time on redundant installs), detect automatically from `~/.claude/` contents (rejected: can't distinguish "used toolkit before on another device" from "has some Claude Code config") |
| Comfort gate (Phase 0.5) with three levels | Users range from "scared of terminals" to power users. A single flow either over-explains for experts or under-explains for beginners. Three levels (beginner/intermediate/power_user) control verbosity and pacing throughout all subsequent phases. | Two levels (rejected: intermediate is the sweet spot most users land in), no adaptation (rejected: beginners get lost, experts get frustrated) |
| Output style plugins activated immediately in Phase 0.5 | The comfort level should take effect for the rest of the setup conversation, not just after setup completes. Registering the output style plugins in `enabledPlugins` right away means Claude's tone adapts immediately. | Activate after setup (rejected: the setup itself is where beginners need the most help) |
| Phases 1–6 linear flow for fresh installs | A linear flow is predictable and resumable. Each phase has clear entry/exit conditions. If setup is interrupted, the user can re-run `/setup-wizard` and phases detect prior state (existing symlinks, config.json) to skip completed steps. | Parallel install (rejected: harder to debug failures), single monolithic step (rejected: too much at once for beginners) |
| Restore paths (0A GitHub, 0B Drive) skip to Phase 0C then Phase 6 | Restored users already have personalization, templates, and config. They only need dependency verification and a health check. Skipping Phases 1–5 respects their time. | Run full flow anyway (rejected: wastes time re-personalizing), skip all verification (rejected: restored config may reference tools not installed on the new machine) |
| Hook schema uses nested `hooks` array format | Claude Code requires `{ "hooks": [{ "type": "command", "command": "..." }] }`, not `{ "command": "..." }`. The flat format causes silent "Expected array" errors. Documenting the correct schema in the SKILL.md prevents this recurring mistake. | Rely on Claude knowing the schema (rejected: this was a recurring bug source) |
| MCP servers registered via `~/.claude.json` under `mcpServers` | This is Claude Code's documented mechanism for local MCP server registration. The file may contain other Claude Code settings, so the wizard merges entries rather than overwriting. | `mcp.json` (rejected: not the standard location), `settings.json` (rejected: that's for hooks and plugins, not MCP servers) |
| Platform MCPs auto-registered from `core/mcp-manifest.json` | A manifest-driven approach means adding a new MCP server doesn't require modifying the wizard — just add an entry to the manifest. Platform gating (`"platform": "macos"`) prevents registering macOS-only servers on Windows. | Hardcoded in SKILL.md (rejected: requires wizard changes for every new MCP server) |

## Current Implementation

### Phase Flow

```
Phase 0: Prior Use Check
  ├─ Returning user → Phase 0A (GitHub) or 0B (Drive) → Phase 0C → Phase 6
  └─ New user → Phase 0.5 (Comfort Gate) → Phase 1

Phase 0.5: Comfort Level Selection
  → Sets output style plugins, stores comfort_level in config
  → Comfort level controls verbosity in all subsequent phases

Phase 1: Environment Inventory
  → Detects platform, toolkit root, existing skills/hooks/CLAUDE.md/MCP servers/memory

Phase 2: Conflict Resolution
  → Backs up existing files, resolves naming conflicts (keep/replace/rename)

Phase 3: Layer Selection
  → User chooses Core (required) + Life + Productivity + Modules

Phase 4: Dependency Installation
  → Core: git, gh CLI, gcloud (optional)
  → Life: rclone + Google Drive auth
  → Productivity: messaging (iMessage/gmessages), Go (if building gmessages), Todoist

Phase 5: Personalization
  → 5.1: Collect template variables (name, Drive root, Git remote, sync backend)
  → 5.2: Process template files (replace {{VAR}} placeholders)
  → 5.3: Install encyclopedia starter templates (fresh install only)
  → 5.4: Merge CLAUDE.md fragments (append or update between markers)
  → 5.5: Symlink skills, commands, hooks (halt on failure, no copy fallback)
  → 5b: DestinCode Desktop App (optional — offer install, run install-app.sh)
  → 5d: Register hooks in settings.json
  → 5d-ii: Register statusline in settings.json (separate from hooks)
  → 5e: Verify symlinks
  → 5f: Register 13 marketplace plugins in enabledPlugins

Phase 6: Verification
  → Core checks (git, toolkit root, CLAUDE.md, hooks, symlinks, statusline, marketplace plugins)
  → Life checks (rclone, encyclopedia templates, journal directory)
  → Productivity checks (MCP server initialize handshake for each registered server)
  → First-run guided experience (journal / inbox / explore)
```

### Key Files

- `core/skills/setup-wizard/SKILL.md` — The wizard itself (conversational instructions)
- `core/templates/template-variables.json` — Variables collected during Phase 5
- `core/templates/claude-md-fragments/` — CLAUDE.md sections merged in Phase 5.4
- `core/mcp-manifest.json` — Platform-gated MCP server definitions for Phase 5.6
- `~/.claude/toolkit-state/config.json` — Persisted state (platform, layers, comfort level, paths, timestamps)
- `~/.claude/backups/pre-toolkit/` — Pre-install backups created in Phase 2

### Comfort Level Behavior

| Phase | Beginner | Intermediate | Power User |
|-------|----------|-------------|------------|
| Phase 1 (Inventory) | Plain-language explanations of each finding | Standard presentation | Silent scan; only report if conflicts found |
| Phase 2 (Conflicts) | Explain each conflict and recommend safe defaults | Standard | Terse table format |
| Phase 3 (Layers) | Full explanations; recommend full install | Standard | "Installing all layers. Good?" |
| Phase 4 (Dependencies) | Explain what each tool is before installing | Standard | Silent install; summary table at end |
| Phase 5 (Personalization) | Full framing for each question | Standard | Rapid-fire questions, no framing |
| Phase 6 (Verification) | Celebrate warmly; explain any failures in plain language | Standard | Compact pass/fail table; detail only on failures |

### Re-run Safety

The wizard is safe to re-run. Each phase detects prior state:
- Phase 0.5 pre-selects the stored comfort level and asks if the user wants to change it
- Phase 1 inventories what already exists
- Phase 2 only resolves new conflicts
- Phase 5 skips existing symlinks, merges (not overwrites) CLAUDE.md sections, preserves existing `enabledPlugins` entries

## Dependencies

- Depends on: Claude Code (host environment), `core/templates/` (fragments, variables, spec template), `core/mcp-manifest.json` (MCP server definitions)
- Depended on by: All other toolkit features (the wizard is the primary installation path), `/toolkit-uninstall` (reads backup manifest), `/update` (re-runs hook refresh and marketplace plugin registration)

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type | Approved by | Session |
|------|---------|-------------|------|-------------|---------|
| 2026-03-20 | 1.0 | Initial spec | New | — | |
