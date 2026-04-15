# DestinClaude Toolkit — Spec

**Version:** 3.0
**Last updated:** 2026-04-14
**Feature location:** `~/.claude/plugins/destinclaude/` (toolkit root)

## Purpose

Canonical reference for the DestinClaude toolkit as a published, installable product. Documents what the toolkit is after the phase-3 decomposition, how it is installed (via the DestinCode desktop/Android app), what ships in core vs. extracted marketplace packages, and how runtime reconciliation works.

Individual features have their own specs in `specs/` or inside their skill directory — this spec covers the toolkit-level view.

## User Mandates

- The DestinCode app is the sole supported installer and lifecycle manager for the toolkit. The toolkit must be installable, updatable, and removable entirely through the app. (2026-04-14, supersedes the 2026-03-16 symlink-registration mandate.)
- The toolkit must be non-destructive. The app's reconcilers are the only components authorized to mutate `~/.claude/settings.json`, and they must never remove a user-added hook or MCP server. Prune rules apply only to entries the toolkit itself owns. (2026-04-14)
- Pure-CLI install (no DestinCode app) is explicitly unsupported for the end-user experience. A future "CLI Compatibility" skill may be published to document the manual install/update path for users without the app; until then, users without the app are directed to install it. (2026-04-14)

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Single flat core; no `core/`, `life/`, `productivity/` layers | The three-layer model was an artifact of the conversational setup-wizard's "choose what to install" phase. Once the app owns install (decomposition v3), users don't pick layers — the app installs the toolkit as one unit and lets the user add optional marketplace packages. Flattening removes a level of indirection from every path in the repo. | Keep layers for logical grouping only (rejected: creates drift between path structure and mental model), move layers into marketplace packages (partial: extracted skills DID become marketplace packages — the layer dirs were redundant) |
| App-owned reconciliation via `hook-reconciler`, `mcp-reconciler`, `integration-reconciler` | The old model (setup-wizard installs everything; `/update` refreshes symlinks) broke on every plugin reorg. Desired-state reconciliation driven by `hooks-manifest.json` / `mcp-manifest.json` / `plugin.json` survives reorgs automatically. The app re-runs reconcilers on every launch so "just restart the app" is a valid repair. | Symlink-based registration with `/update` orchestration (rejected v2.3.2: caused 8+ hook entries to go stale and break silently on decomposition; required a separate phased migration script that was itself fragile) |
| Prune rule: remove plugin-owned entries whose target file is gone, never user-added ones | Reconcilers must be self-healing — if a hook is dropped from the manifest in a future release, reconciliation should clean up existing installs' `settings.json`. Scoping the prune to entries whose command path is inside a known plugin root and whose file is missing distinguishes "we dropped this hook" from "user added their own hook." | Blanket "remove any hook whose file is missing" (rejected: could delete user-added hooks referencing out-of-repo paths during temporary conditions), explicit "ever-registered" tracking file (rejected: extra state to maintain; the plugin-root + file-exists rule is sufficient) |
| No `~/.claude/{hooks,commands,skills}/` symlinks | Claude Code v2.1+ discovers plugin commands/skills via `plugin.json` inside each `enabledPlugin`'s root. Symlinking those directories was a pre-v2.1 compatibility mechanism that no longer does anything except accumulate tombstones when the toolkit restructures. The app's `cleanupOrphanSymlinks()` sweep removes legacy symlinks from existing installs. | Continue creating symlinks for parity with old `/health` checks (rejected: pure technical debt), symlink only the setup-wizard (rejected: wizard isn't CLI-discoverable anymore, per the next decision) |
| Setup-wizard is a CLI fallback intake, not the install conductor | Post-decomposition the app conducts install. The surviving SKILL.md is a three-question intake (name, comfort level, sync backend) that writes profile data and delegates everything else. See `skills/setup-wizard/specs/setup-wizard-spec.md`. | Keep full Phase 0–6 wizard (rejected: unmaintainable in parallel with the app installer; the two paths drifted), remove the skill entirely (rejected: the 3-question intake captures useful profile data that lives in config, distinct from install state) |
| Auto-tag on root `plugin.json` version bump | Bumping `plugin.json` version on master is the single release trigger. `auto-tag.yml` creates the `vX.Y.Z` tag; the DestinCode app's own release workflows consume it downstream. | Manual tagging (rejected: forgotten too often), tag from VERSION file (rejected: `plugin.json.version` is what Claude Code reads, so keeping it canonical avoids drift) |

## Current Implementation

### 1. What ships in the toolkit

The toolkit repo root is flat — no more `core/`, `life/`, `productivity/`:

```
destinclaude/
├── plugin.json                 ← version + manifest Claude Code reads
├── VERSION                     ← release target (matches plugin.json.version)
├── hooks/
│   ├── hooks-manifest.json     ← declares which hooks are "required", with matchers/timeouts
│   ├── session-start.sh
│   ├── write-guard.sh
│   ├── worktree-guard.sh
│   ├── tool-router.sh
│   ├── statusline.sh
│   ├── lib/                    ← shared helpers sourced by hooks
│   └── migrations/             ← one-shot data migrations indexed by version
├── commands/
│   ├── update.md
│   ├── health.md
│   ├── diagnose.md
│   └── restore.md
├── skills/
│   ├── setup-wizard/           ← CLI-fallback intake (see setup-wizard-spec.md)
│   └── remote-setup/           ← companion skill for remote-access config
├── scripts/
│   ├── post-update.sh          ← phase dispatcher (self-check | migrations | verify | post-update)
│   ├── install-app.sh          ← bootstraps the DestinCode app install (one-time)
│   └── migrations/             ← shell migration runner
├── specs/                      ← system specs (this doc, etc.)
├── templates/                  ← CLAUDE.md fragments merged at install time
└── mcp-manifest.json           ← declares optional MCP servers the reconciler may register
```

### 2. Install flow (app-conducted)

```
User installs DestinCode app (.exe/.dmg/.AppImage/.apk) — the app bundles and self-installs its
        platform dependencies (Node on desktop, Termux + package bundle on Android).

App first-launch flow (prerequisite-installer.ts):
  ├── If Claude Code CLI not present → install via npm
  ├── If toolkit not present at ~/.claude/plugins/destinclaude/ →
  │        git clone itsdestin/destinclaude into that path
  ├── Write the four Claude Code registries (see PITFALLS) so the plugin is enabled
  └── Trigger app startup reconciliation (below)

App startup (every launch, via main.ts):
  ├── install-hooks.js          ← registers the app's OWN hooks (relay.js, title-update.sh, etc.)
  ├── reconcileIntegrations()   ← regenerates ~/.claude/integration-context.md from plugin manifests
  ├── reconcileHooks()          ← merges plugin hooks-manifest.json into settings.json,
  │                               updates stale paths, prunes dead plugin-owned entries,
  │                               enforces MAX timeout, never removes user-added hooks
  ├── cleanupOrphanSymlinks()   ← unlinks legacy ~/.claude/{hooks,commands,skills}/ symlinks
  │                               pointing into deleted plugin subtrees
  └── reconcileMcp()            ← merges auto:true, platform-matching entries from
                                  mcp-manifest.json into ~/.claude.json mcpServers
```

No `~/.claude/{hooks,commands,skills}/` symlinks are created or maintained. Commands and skills are discovered by Claude Code directly from the plugin root via `plugin.json`.

### 3. Component surface

| Kind | Source | How it loads |
|------|--------|--------------|
| Plugin manifest | `plugin.json` | Claude Code reads it based on `enabledPlugins["destinclaude@destincode"]: true` in `~/.claude/settings.json` |
| Skills | `skills/<name>/SKILL.md` | Claude Code auto-discovers via `plugin.json` |
| Commands | `commands/<name>.md` | Same |
| Hooks | `hooks/*.sh`, `hooks/*.js` | Registered into `~/.claude/settings.json` by the app's HookReconciler, keyed on `hooks-manifest.json` |
| Statusline | `hooks/statusline.sh` | Registered via `statusLine` entry in `~/.claude/settings.json` by the app |
| MCP servers | declared in `mcp-manifest.json` | Registered into `~/.claude.json` by the app's McpReconciler; only `auto: true` entries matching the current platform |
| CLAUDE.md fragments | `templates/claude-md-fragments/*.md` | Merged into `~/.claude/CLAUDE.md` between wrapped markers during install |

### 4. Marketplace extension model

Features that were previously in `life/` and `productivity/` now ship as optional marketplace packages installed via the DestinCode app's marketplace UI:

| Former location | Marketplace package | Purpose |
|-----------------|---------------------|---------|
| `life/skills/journaling-assistant` | `destinclaude-journal` (planned) | Daily journaling flow |
| `life/skills/encyclopedia-*` | `destinclaude-encyclopedia` (planned) | Personal knowledge base |
| `life/skills/google-drive` | `destinclaude-drive` (planned) | Drive-backed storage |
| `life/skills/fork-file` | `destinclaude-fork-file` (planned) | File-versioning utility |
| `productivity/skills/claudes-inbox` | `destinclaude-inbox` (planned) | Task inbox |
| `productivity/skills/skill-creator` | `destinclaude-skill-creator` (planned) | Custom skill authoring |
| `core/skills/theme-builder` | `destinclaude-themes` | Theme creation (ships with desktop app today) |
| `core/skills/sync` | `destinclaude-sync` (planned) | Cross-device sync |
| Output styles | `destinclaude-output-styles` (planned) | Comfort-level tonality |
| Messaging (iMessage / gmessages / windows-control MCPs) | `destinclaude-messaging` (planned) | Platform messaging integrations |

Each marketplace package ships its own `hooks-manifest.json` / `mcp-manifest.json` / `plugin.json`. The app's reconcilers walk every installed plugin's manifests, so marketplace packages get the same reconciliation guarantees as core.

### 5. CLI compatibility (planned, not current)

Pure-CLI users (no DestinCode app) have no supported install path in this release. A future "CLI Compatibility" skill may be published that:

- Walks Claude (not the user) through the install/update sequence
- Reimplements the app's reconciliation logic as a shell script set for CLI-only operation
- Documents the contract between the toolkit and the ambient Claude Code install (settings paths, manifest formats, version expectations)

This skill is explicitly **not** a rebuild of the old conversational setup-wizard — it is a tool that Claude uses to do what the app would have done.

## Dependencies

- Depends on: the DestinCode desktop/Android app (bundles Claude Code, conducts install, runs reconcilers on every launch), git, Claude Code CLI (discovery + hook execution), Node (for hook `.js` utilities)
- Depended on by: All published marketplace packages (they rely on the core hooks, reconciler semantics, and manifest contracts this spec defines)

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues).

## Change Log

| Date | Version | What changed | Type |
|------|---------|-------------|------|
| 2026-04-14 | 3.0 | **Decomposition v3.** Three-layer model retired; repo flattened (no core/, life/, productivity/). App-owned reconciliation replaces setup-wizard + /update as the install model. `~/.claude/{hooks,commands,skills}/` symlinks retired; cleanup module sweeps legacy orphans. HookReconciler adds a prune pass for dropped plugin-owned entries. Setup-wizard reduced to CLI-fallback intake. CLI-only install explicitly unsupported (future "CLI Compatibility" skill planned). Extracted skills documented as marketplace packages. Supersedes 2026-03-16 symlink-registration mandate. | Major |
| 2026-04-07 | 2.9 | Added theme-builder to Core skills, session-end-sync to Core hooks. | Update |
| 2026-04-05 | 2.8 | Sync consolidation: unified sync hook. | Update |
| 2026-03-23 | 2.7 | Backup system refactor (lib/, migrations/, /restore, iCloud). | Update |
| 2026-03-20 | 2.5 | DestinTip replaces periodic /toolkit reminder. | Update |
| 2026-03-20 | 2.4 | Eliminated copy-based installs; symlinks required. | Update |
| 2026-03-18 | 2.3 | Fixed hook distribution pipeline. | Update |
| 2026-03-18 | 2.2 | Auto-tag workflow. | Update |
| 2026-03-18 | 2.1 | PowerShell installer auto-enables Developer Mode. | Update |
| 2026-03-18 | 2.0 | Phase 6 connectivity probes (MCP JSON-RPC handshake). | Update |
| 2026-03-18 | 1.9 | Mac desktop control gap corrected. | Fix |
| 2026-03-18 | 1.8 | Marketplace plugin registration added. | Update |
| 2026-03-17 | 1.7 | Inbox planned updates. | Inbox |
| 2026-03-17 | 1.6 | Author's MCP server configs ported. | Update |
| 2026-03-17 | 1.5 | Usability review. | Update |
| 2026-03-16 | 1.4 | CLAUDE.md fragments system documented. | Update |
| 2026-03-16 | 1.3 | /toolkit command added. | Update |
| 2026-03-16 | 1.2 | Beginner-friendly walkthroughs, symlink fallback. | Update |
| 2026-03-16 | 1.1 | Statusline documented as separate from hooks. | Update |
| 2026-03-16 | 1.0 | Initial spec. | New |
