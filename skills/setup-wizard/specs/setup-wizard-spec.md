# Setup Wizard — Spec

**Version:** 2.0
**Last updated:** 2026-04-14
**Feature location:** `skills/setup-wizard/SKILL.md`

## Purpose

A minimal CLI-fallback intake skill. Captures user profile data (preferred name, comfort level, sync backend preference) for toolkit hooks and optional marketplace packages to read. It does **not** install anything, configure hooks or MCPs, or create symlinks — all of that is owned by the DestinCode app (see `specs/destinclaude-spec.md` v3.0).

## User Mandates

- The wizard must never attempt to install plugins, register hooks, configure MCP servers, create symlinks, or modify `~/.claude/settings.json`. Install-level concerns belong to the DestinCode app's reconcilers. (2026-04-14, supersedes the 2026-03-16 "symlink-based registration" mandate.)
- If invoked on a system without the DestinCode app installed, the wizard halts with a clear message directing the user to install the app. A future "CLI Compatibility" skill may replace this halt with an actual install path, but the setup-wizard itself remains profile-intake-only. (2026-04-14)
- The wizard is safe to re-run. Re-running pre-populates answers from `~/.claude/toolkit-state/config.json` and asks only what's missing or what the user wants to change. (2026-04-14, retains the 2026-03-16 re-run-safe intent.)

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Three-question intake only (name, comfort level, sync backend) | Install/reconcile work is the app's job (v3.0). The data the wizard collects — display name, conversational tone preference, preferred sync backend — is profile data that outlives any one install. Keeping the wizard scope to this intake means it doesn't drift when the install model changes. | Full Phase 0–6 conductor (rejected v3.0: duplicated the app installer and went stale on every plugin reorg), zero-question "just write defaults" skill (rejected: comfort level meaningfully changes downstream tone and deserves an explicit choice) |
| Writes to `~/.claude/toolkit-state/config.json`, never to `settings.json` or `~/.claude.json` | Profile data is orthogonal to Claude Code's plugin/hook/MCP registration state. Mixing the two was the source of recurring "wizard wrote a bad `hooks:` entry" bugs. Isolating the wizard's output to its own config file keeps responsibilities clean. | Write to `settings.json` (rejected: conflicts with the app's HookReconciler), write to a skill-local file (rejected: other hooks and skills legitimately need to read the profile) |
| Halt cleanly when the DestinCode app is absent | The wizard genuinely cannot complete a working setup without the app in v3.0. A polite halt with install instructions is more honest than pretending to succeed. A future CLI Compatibility skill can fill this gap, but not under the setup-wizard's name. | Attempt a best-effort install (rejected: reintroduces the drift problems v3.0 eliminated), silently write config anyway (rejected: leaves the user confused about whether setup worked) |
| Conversational markdown, not executable code | The skill is instructions for Claude to follow, not a shell script. Makes re-run behavior, comfort-adjusted phrasing, and platform differences trivially easy to author and test in prose. | Shell/Node installer (rejected: all install concerns moved out of the wizard; what remains is pure prompting) |

## Current Implementation

### Flow

```
Invoke /setup-wizard
  ├── Detect DestinCode app install state
  │     ├── Present → continue to intake
  │     └── Absent  → halt with install instructions, exit
  │
  ├── Load existing ~/.claude/toolkit-state/config.json if present
  │
  ├── Question 1: preferred name
  │     (Re-run: pre-filled; ask only if user wants to change)
  │
  ├── Question 2: comfort level (beginner / intermediate / power_user)
  │     (Re-run: pre-filled; ask only if user wants to change)
  │     - Beginner: verbose explanations, celebrate milestones
  │     - Intermediate: standard presentation
  │     - Power user: terse, table-first
  │
  ├── Question 3: sync backend (drive / github / icloud / none)
  │     (Re-run: pre-filled; ask only if user wants to change)
  │     Writes PERSONAL_SYNC_BACKEND entries for the sync package to consume
  │
  └── Write config.json
        {
          "profile": { "name": "...", "comfort_level": "...", "sync_backend": "..." },
          "version": 2,
          "updated_at": "..."
        }
```

### Key Files

- `skills/setup-wizard/SKILL.md` — the conversation script
- `~/.claude/toolkit-state/config.json` — profile output (portable across devices via sync)

### What the wizard explicitly does NOT do

- Install Claude Code, git, Node, or any other binary
- Write to `~/.claude/settings.json` (hooks, enabledPlugins, statusLine)
- Write to `~/.claude.json` (mcpServers)
- Create symlinks under `~/.claude/{hooks,commands,skills}/`
- Run any `post-update.sh` phases
- Install or configure marketplace packages
- Perform backup or restore of prior toolkit state

All of the above are the app's responsibility (`prerequisite-installer.ts`, `hook-reconciler.ts`, `mcp-reconciler.ts`, `integration-reconciler.ts`, `symlink-cleanup.ts`).

## Dependencies

- Depends on: the DestinCode app (checked for presence on invocation; the wizard halts if absent)
- Depended on by: any hook or marketplace skill that wants to adapt output to the user's comfort level or read their preferred name / sync backend

## Known Issues & Planned Updates

- CLI Compatibility skill (planned) — would give non-app users a supported install path; setup-wizard's halt branch would point users there instead of at the app install.

## Change Log

| Date | Version | What changed | Type | Approved by | Session |
|------|---------|-------------|------|-------------|---------|
| 2026-04-14 | 2.0 | **Decomposition v3 rewrite.** Scope reduced to profile intake (name / comfort / sync backend). Install, backup, symlink, MCP, and hook-registration responsibilities removed — the DestinCode app owns all of them. Wizard halts cleanly when the app is absent. Supersedes 2026-03-16 symlink-registration and "Phases 0–6" mandates. | Major | Destin | 2026-04-14 release |
| 2026-03-20 | 1.0 | Initial spec. | New | — | |
