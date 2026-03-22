# Specs System — Spec

**Version:** 2.4
**Last updated:** 2026-03-16
**Feature location:** `~/.claude/specs/` (system specs), `~/.claude/skills/{name}/specs/{name}-spec.md` (skill specs), `~/.claude/plans/` (system plans/designs), `~/.claude/skills/{name}/plans/` (skill plans/designs)

## Purpose

A living specification system for every feature in the user's Claude automation framework. Serves two audiences: (1) Claude, as a guardrail that prevents accidental drift when skills, hooks, or systems are modified in future sessions, and (2) the user, as reference documentation for understanding and making decisions about the system they've built. Captures *why* things are built the way they are, which design choices were user-mandated vs. implementation details, and what constraints must be preserved when making changes.

## User Mandates

- Specs are NEVER modified without the user's explicit approval of the specific changes (2026-03-13)
- Hard enforcement rule in CLAUDE.md: Claude must read the spec before any modification to a feature (2026-03-13)
- User Mandates vs. implementation detail distinction is required in every spec — mandates cannot be changed without approval, implementation details can be changed freely (2026-03-13)
- Spec depth must be proportional to feature complexity — light specs for simple features, full specs for complex ones (2026-03-13)
- Skill specs live in their skill folder (`{skill}/specs/{skill}-spec.md`), system specs live in `~/.claude/specs/` (2026-03-13)
- Specs are backed up via the existing backup system — no separate Drive folder (2026-03-13)
- All existing features get first-draft specs (2026-03-13)
- Routine skill/hook edits (implementation changes) do NOT trigger spec updates. Specs are only updated when: a user mandate is added/removed/changed, a design decision is reversed or a new one made, or the implementation architecture fundamentally changes. Multiple spec-worthy changes in one session are batched into a single version bump. (2026-03-13)
- After completing changes to a feature with a spec, Claude must review whether the spec needs updating before considering the work done. Spec updates are part of the implementation, not a separate follow-up task. (2026-03-14)
- Every SKILL.md must include a spec reminder comment at the top: `<!-- SPEC: Read specs/{name}-spec.md before modifying this file -->`. This puts the enforcement reminder at the point of action. (2026-03-14)
- Design docs produced during brainstorming are preserved in `plans/` directories as frozen point-in-time artifacts. They are not authoritative (specs are); they provide historical context for decisions. (2026-03-16, revised from 2026-03-14)
- Implementation sections in specs should focus on architecture and flow (how pieces connect, what calls what, key flows), not line-by-line code documentation. Detail remains proportional to complexity. (2026-03-14)
- Every spec must include a "Planned Updates" section for logging future improvement ideas with brief context. (2026-03-14)
- Specs use `{topic}-spec.md` naming — no date prefix; version tracked in frontmatter (2026-03-16)
- Designs use `{topic}-design (MM-DD-YYYY).md` naming — point-in-time architecture decisions (2026-03-16)
- Plans use `{topic}-plan (MM-DD-YYYY).md` naming — implementation checklists (2026-03-16)
- Plans and designs live in separate `plans/` directories, never mixed with specs: `~/.claude/plans/` for system-level, `~/.claude/skills/{name}/plans/` for skill-level (2026-03-16)
- Skill specs use `{name}-spec.md` naming (not generic `spec.md`) for grep-ability across the system (2026-03-16)

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Single spec file per feature (not split across multiple files) | Simplicity — one place to look, easy to back up and sync | Multi-file spec structure (rejected: overkill for this scale) |
| Skill specs in skill folders, system specs centralized | Keeps specs colocated with the code they document; skill folders already backed up as units | All specs centralized (rejected: breaks the "skill as a self-contained folder" pattern) |
| Central INDEX.md as a directory | Fast lookup without reading individual files; version tracking at a glance | No index, rely on filesystem (rejected: harder to discover what has specs) |
| Minor versioning (1.0 → 1.1 → 2.0) with session batching | Most iteration is implementation-only and doesn't touch specs. When spec changes do happen, minor bumps (1.1) for small additions, major bumps (2.0) for architectural shifts. Multiple changes in one session are batched into a single bump. | Pure integer (rejected: no distinction between small and large changes), semver (rejected: implies compatibility model), dates only (rejected: versions communicate intentional change) |
| Change log in each spec | Keeps history colocated with the spec; no separate changelog file to maintain | Git history only (rejected: git history doesn't distinguish spec changes from incidental edits) |
| Spec reminder comment in SKILL.md files | Puts enforcement at the point of action — Claude sees the reminder when opening a file to edit, making it much harder to forget. Complements the CLAUDE.md rule which can be forgotten mid-session. | PreToolUse hook (rejected: would need to track Read calls, which hooks don't fire on), rely on CLAUDE.md alone (insufficient: occasionally forgotten) |
| Design docs preserved in plans/ as frozen artifacts | Design docs and plans provide historical context for decisions. Specs remain the single source of truth; plans/designs are read-only historical records. | Delete after use (rejected: loses decision history), keep alongside specs (rejected: creates "which file is authoritative?" confusion) |
| Plans and designs in separate `plans/` directories | Eliminates confusion about which file is authoritative. Specs are the single source of truth; plans/designs provide frozen historical context. Parallel structure (`specs/` + `plans/`) at both system and skill levels. | Mixed in specs/ (rejected: creates "which file is current?" confusion), deleted after use (rejected: loses decision history), centralized plans-only directory (rejected: breaks skill co-location) |
| Implementation sections focus on architecture/flow | Prevents specs from becoming stale copies of the code. Architecture and flow change less frequently than implementation details, so the spec stays accurate longer. | Full implementation documentation (rejected: high maintenance burden, drifts from code), no implementation section (rejected: loses the "how pieces connect" context that aids modification) |
| Planned Updates section in every spec | Provides a persistent, feature-scoped place to capture future ideas without acting on them. Survives across sessions. Brief context (not dates) explains why each item was logged. | Memory files for future ideas (rejected: not scoped to the feature), Todoist tasks (rejected: loses the spec context), no tracking (rejected: ideas get lost between sessions) |

## Current Implementation

### Spec template structure
Each spec has these sections: Purpose, User Mandates (dated), Design Decisions (table with rationale + alternatives), Current Implementation (focused on architecture and flow), Dependencies, Known Bugs / Issues (active bugs and known limitations, removed when resolved), Planned Updates (bullets with brief context), Change Log (with Session ID linking to the Claude conversation transcript where the change was made).

### Enforcement
A `## Specs System` section in CLAUDE.md establishes hard rules:
1. Read spec before modifying any feature
2. User Mandates are inviolable without approval
3. Design Decisions include rationale that must be presented alongside alternatives
4. Implementation details can change freely within mandate/decision constraints
5. Specs are never modified without approval; changes get version bumps
6. After completing changes, review whether the spec needs updating before considering work done
7. Confirm you read the relevant spec(s) is the first item in the System Change Checklist
8. If no spec exists for a feature being modified or created, and that feature has behavior/workflow logic a future session would need to understand, offer to create one

### Backup
- System specs (`~/.claude/specs/*.md`) are tracked by Git and archived to Drive on each push via `git-sync.sh`
- Skill specs are automatically included because skill folders are already backed up as directories
- Pull-before-push merges remote specs on full snapshot

### Skill-creator integration
When a new skill is created via skill-creator, a first-draft spec is generated and presented for approval before saving.

## Dependencies

- Depends on: Backup & Sync (for backup of system-level specs), CLAUDE.md (for enforcement rule)
- Depended on by: All other features (specs are consulted before modifications)

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

- **Title Case convention for UI text:** Specs that cover user-facing features (statusline, menus, notifications) should document that all displayed text must use Title Case. This convention should be part of the standard spec template guidance for any feature that surfaces text to the user.
- **"What do we need to improve?" utility** — A tool or command that searches all specs' Planned Updates sections and aggregates them into a single prioritized list. Would give a quick overview of logged improvement ideas across the entire system.

## Change Log

| Date | Version | What changed | Type | Approved by | Session |
|------|---------|-------------|------|-------------|---------|
| 2026-03-13 | 1.0 | Initial spec | New | — | n/a |
| 2026-03-13 | 1.1 | Added minor versioning (1.0→1.1→2.0), session batching, and explicit guidance that routine implementation edits don't trigger spec updates | Revised | — | n/a |
| 2026-03-14 | 1.2 | Added mandate: spec updates are part of implementation, not a follow-up task. Added enforcement rule 6. | Mandate | — | n/a |
| 2026-03-14 | 2.0 | Architecture overhaul: broadened purpose to dual audience (Claude + the user), added SKILL.md spec reminder mandate, design docs ephemeral policy, implementation sections focus on architecture/flow, Planned Updates section in every spec, spec-check as first System Change Checklist item | Architecture | — | n/a |
| 2026-03-14 | 2.1 | Added Session column to change log for tracing changes back to Claude conversation transcripts | Revised | — | 87696010-3f8e-4d35-aae4-58b928353af9 |
| 2026-03-15 | 2.2 | Added enforcement rule #8 (spec-creation threshold), fixed stale sync-to-drive.sh reference | Revised | — | |
| 2026-03-16 | 2.3 | Added "Known Bugs / Issues" as a standard section in the spec template (between Dependencies and Planned Updates). Added to all 25 existing specs. | Revised | — | |
| 2026-03-16 | 2.4 | Added naming convention mandates for specs/designs/plans, separate plans/ directories, revised ephemeral design docs policy to preserve in plans/, updated skill spec naming to {name}-spec.md | Architecture | — | |
