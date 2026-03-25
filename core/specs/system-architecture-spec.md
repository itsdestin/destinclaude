# System Design — Spec

**Version:** 1.3
**Last updated:** 2026-03-24
**Feature location:** `~/.claude/` (entire system)

## Purpose

Canonical architecture reference for the user's Claude Code automation system. For the public-facing developer guide (component listings, CI/CD, how to build on top), see `docs/system-architecture.md`. Documents how all components relate, how data flows between local/Git/Drive, what happens during a session lifecycle, and how enforcement mechanisms ensure consistency. Individual feature specs remain authoritative for their own domains — this spec covers the system-level view and cross-cutting conventions.

## User Mandates

- (2026-03-15) System Change Protocol is mandatory — the checklist in `docs/system-architecture.md` must be followed whenever a system feature is added, removed, or significantly changed.
- (2026-03-15) Spec-creation threshold: any feature with behavior or workflow logic that a future session would need to understand to modify correctly must have a spec. A "feature" is a logical unit that may span multiple files.
- (2026-03-15) All three enforcement layers (CLAUDE.md hard gate, skill SKILL.md spec-reminder comments, Stop hook) must remain active.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Three-layer enforcement (CLAUDE.md gate → SKILL.md spec-reminder comments → Stop hook) | Defense in depth — each layer catches what the others miss. CLAUDE.md is always in context with the System Change Protocol; spec-reminder comments in SKILL.md files remind at point of action; hook catches forgotten checks at session end. The System Change Checklist lives in `docs/system-architecture.md` and is referenced by the CLAUDE.md protocol. | Hook-only (rejected: latency on all sessions), prompt-only (rejected: no safety net), four layers with separate system-architecture.md (rejected: extra file became a dead link; three layers provide sufficient coverage) |
| specs/ for living specs, plans/ for design docs and implementation plans | Prevents confusion about which file is authoritative. Living specs are maintained; plans are historical artifacts | Everything in specs/ (rejected: muddies living specs with dated artifacts) |
| Git primary + Drive secondary for backup | Git provides native version control; Drive provides human-browsable archive of high-value files | rclone-only (rejected: reimplements Git), Git-only (rejected: loses browsable archive) |
| Local encyclopedia cache at `~/.claude/encyclopedia/` | Eliminates rclone round-trips during sessions; synced at session start | No cache (rejected: slow), cache in Git (rejected: commit churn from frequent syncs) |

## Current Implementation

### 1. System Map

**Components and locations:**

| Component | Location | Authoritative Spec |
|-----------|----------|-------------------|
| 10 skills (3 layers) | `~/.claude/skills/{name}/` (symlinked from toolkit) | Each skill's `specs/{name}-spec.md` |
| 16 hooks | `~/.claude/hooks/` (symlinked from toolkit) | `backup-system-spec.md` (git-sync, session-start, personal-sync), `write-guard-spec.md`, `worktree-guard-spec.md`, `statusline-spec.md` (title-update), this spec (checklist-reminder, done-sound) |
| 7 MCP servers | Configured in `~/.claude.json`, definitions in `core/mcp-manifest.json` | `destinclaude-spec.md` (registration); individual servers documented in CLAUDE.md |
| Statusline | `~/.claude/statusline.sh` + hooks | `statusline-spec.md` |
| Encyclopedia system | `~/.claude/encyclopedia/` (cache), `gdrive:Claude/The Journal/System/` (source of truth) | `encyclopedia-system-spec.md` |
| Backup/sync | `core/hooks/git-sync.sh` + `session-start.sh` + `personal-sync.sh` | `backup-system-spec.md` |
| Write guard | `core/hooks/write-guard.sh` | `write-guard-spec.md` |
| Memory system | `~/.claude/projects/{project-key}/memory/` | `memory-system-spec.md` |
| Specs system | `core/specs/` (system), `{layer}/skills/{name}/specs/` (skill) | `specs-system-spec.md` |

**Dependency relationships:**
- `git-sync.sh` → writes `.write-registry.json` (consumed by `write-guard.sh` and `checklist-reminder.sh`)
- `session-start.sh` → runs `git pull`, `rclone sync` (encyclopedia), and `check-inbox.sh`
- Encyclopedia skills → read from `~/.claude/encyclopedia/` (cache), write to Drive (source of truth)
- `checklist-reminder.sh` → reads `.write-registry.json` (written by `git-sync.sh`)
- All skills → governed by CLAUDE.md rules, skill-specific specs, and system-architecture.md checklist

### 2. Data Flow

```
Local (~/.claude/)
  ├── Git (GitHub private repo: claude-config)
  │     ├── Tracked: CLAUDE.md, settings, hooks, skills, specs, plans,
  │     │            docs, memory, mcp-server source, restore.sh
  │     ├── Ignored: credentials, binaries, caches, state files,
  │     │            transcripts, encyclopedia cache, .claude.json
  │     ├── Commit: immediate on every Write|Edit (via git-sync.sh)
  │     └── Push: debounced every 15 min (via git-sync.sh)
  │
  ├── Drive Archive (gdrive:Claude/Backup/)
  │     ├── Triggered: on each successful git push
  │     ├── Scope: specs/, skills/, CLAUDE.md, conversation transcripts
  │     ├── Format: timestamped folders (MM-DD-YYYY @ TIMEpm)/
  │     └── Policy: write-only, append-only, no pruning, best-effort
  │
  └── Encyclopedia (gdrive:Claude/The Journal/System/)
        ├── Source of truth: 8 modular files on Drive
        ├── Local cache: ~/.claude/encyclopedia/ (synced at session start)
        ├── Read: skills read from local cache
        ├── Write: skills write to local cache, push to Drive after approval
        └── Not cached: journal entries, Entry Index, compiled Encyclopedia
```

### 3. Hook Architecture

| Hook | Event | Matcher | Purpose | State Files |
|------|-------|---------|---------|-------------|
| `session-start.sh` | SessionStart | `startup` | Git pull, encyclopedia cache sync, inbox check, DestinTip injection | None (reads remote state) |
| `contribution-detector.sh` | SessionStart | `startup` | Detect toolkit contributions and offer to submit upstream | None |
| `write-guard.sh` | PreToolUse | `Write\|Edit` | Block writes when another active session owns the file | Reads `.write-registry.json` |
| `worktree-guard.sh` | PreToolUse | `Bash` | Block git branch switches in the main plugin directory | None |
| `tool-router.sh` | PreToolUse | `mcp__claude_ai_Gmail__\|mcp__claude_ai_Google_Calendar__` | Block Claude.ai native Gmail/Calendar MCP tools; redirect to GWS CLI equivalents | None |
| `git-sync.sh` | PostToolUse | `Write\|Edit` | Commit to Git, debounced push, Drive archive, update write registry | Writes `.write-registry.json`, `.push-marker`, `.sync-status` |
| `personal-sync.sh` | PostToolUse | `Write\|Edit` | Sync personal data files to Drive after edits | None |
| `title-update.sh` | PostToolUse | `.*` | Prompt Claude to set session topic (10-min throttle) | Reads/writes `~/.claude/topics/marker-{sid}` |
| `todo-capture.sh` | UserPromptSubmit | `.*` | Capture task mentions from user prompts to Todoist | None |
| `checklist-reminder.sh` | Stop | `.*` | Remind Claude to verify system change checklist if system files were modified | Reads `.write-registry.json` |
| `done-sound.sh` | Stop | `.*` | Play a chime sound when Claude finishes | None |
| `check-inbox.sh` | (utility) | — | Check inbox providers for items, called by session-start.sh | None |
| `sync-encyclopedia.sh` | PostToolUse | `Write\|Edit` | Sync encyclopedia cache to Drive after edits (life layer) | None |
| `announcement-fetch.js` | (utility) | — | Fetch broadcast announcements from GitHub repo | Writes `.announcement-cache.json` |
| `usage-fetch.js` | (utility) | — | Retrieve and cache API usage/rate-limit data | Writes `.usage-cache.json` |
| `statusline.sh` | (statusLine) | — | Render multi-line status bar for Claude Code | Reads topics, sync-status, caches |

**Execution order within same event:** Hooks fire in the order listed in `settings.json`. For PostToolUse, `git-sync.sh` (Write|Edit only) fires before `title-update.sh` (all tools).

### 4. Session Lifecycle

**Start:**
1. `session-start.sh` fires → `git pull --rebase` (cross-device sync)
2. `rclone sync` encyclopedia cache from Drive
3. `check-inbox.sh` → checks configured inbox providers for items, injects prompt for claudes-inbox skill
4. CLAUDE.md loaded into context (always)
5. MEMORY.md loaded into context (always)

**During:**
- Every Write|Edit → `write-guard.sh` (PreToolUse) checks for conflicts → `git-sync.sh` (PostToolUse) commits + debounced push
- Claude.ai Gmail/Calendar MCP calls → `tool-router.sh` (PreToolUse) blocks and redirects to GWS CLI
- Every tool use → `title-update.sh` (PostToolUse) throttled topic reminder
- Skills load their SKILL.md (includes system rules footer)
- On-demand docs (system-architecture.md, skills.md, work.md) read when relevant

**End:**
- `checklist-reminder.sh` (Stop) checks write registry for system file modifications
- If system files were touched: injects checklist reminder into Claude's context

### 5. Enforcement Mechanisms

| Layer | Trigger | Coverage | Strength |
|-------|---------|----------|----------|
| CLAUDE.md System Change Protocol | Always in context | Every session | Strong — hard gate language with STOP/MUST, references checklist in `docs/system-architecture.md` |
| SKILL.md spec-reminder comments | Loaded when skill file is opened for editing | Skill modification sessions | Medium — point-of-action reinforcement (`<!-- SPEC: Read specs/... -->`) |
| Stop hook (checklist-reminder.sh) | Session end, if system files were modified | Advisory catch-all | Best-effort — cannot block, only remind |

**What each layer catches:**
- CLAUDE.md: Claude starts modifying a system feature → protocol tells it to read the spec and follow the checklist
- SKILL.md comments: Claude opens a skill file to edit → sees the spec reminder before making changes
- Stop hook: Claude does all the work but forgets the checklist → hook reminds before session ends

### 6. Spec Governance

- **Creation threshold:** Features with behavior or workflow logic that a future session would need to understand. Skills, hooks, MCP servers, multi-file utilities, and integrations are typical examples. Simple data files, config entries, and static references don't need specs.
- **INDEX management:** `specs/INDEX.md` lists all specs with type, location, and version. Updated whenever a spec is created or versioned (checklist item).
- **Versioning:** Minor bumps (1.0 → 1.1) for additions; major bumps (1.x → 2.0) for architectural changes. Session batching — multiple changes in one session = one bump.
- **Hierarchy:** User Mandates (inviolable) > Design Decisions (defensible, with rationale) > Implementation (freely changeable)
- **Authoritative reference:** `specs-system-spec.md`

### 7. File Conventions

| Directory | Purpose | Maintained? |
|-----------|---------|-------------|
| `specs/` | Living specifications — versioned, updated when architecture changes | Yes — actively maintained |
| `plans/` | Design docs and implementation plans — historical artifacts, dated | No — written once, read for context |
| `docs/` | Operational guides — system-architecture.md, skills.md, work.md | Yes — updated when systems change |
| `skills/` | Skill directories (SKILL.md + specs/ + references/) | Yes — per skill lifecycle |
| `hooks/` | Shell scripts fired by Claude Code events | Yes — per hook lifecycle |
| `mcp-servers/` | MCP server source code and data | Yes — per server lifecycle |
| `encyclopedia/` | Local cache of 8 modular files (NOT in Git) | Synced — session start only |
| `memory/` | Auto-memory files (in projects/{project-key}/memory/) | Yes — Claude reads/writes directly |

### 8. Cross-Cutting Rules

These rules are enforced globally. Each has an authoritative spec — do NOT duplicate the rule here, only point to it.

| Rule | Authoritative Spec | Summary |
|------|-------------------|---------|
| Encyclopedia approval gate | `encyclopedia-system-spec.md` | Never save modular files or compiled Encyclopedia to Drive without explicit approval |
| Encyclopedia archive rule | `encyclopedia-system-spec.md` | Every compiled Encyclopedia save creates a timestamped archive copy |
| Write guard | `write-guard-spec.md` | Block writes when another active session owns the file |
| Backup tracked files | `backup-system-spec.md` | Git tracks config; Drive archives high-value files on push |
| Memory boundaries | `memory-system-spec.md` | Operational context only; biographical detail goes to Encyclopedia |
| Spec governance | `specs-system-spec.md` | Read spec before modifying; mandates are inviolable |

## Dependencies

- **Depends on:** Git, GitHub (private repo), rclone (Drive sync), Node.js (JSON parsing in hooks), Claude Code (hook system, auto-memory, skill loading)
- **Depended on by:** All features — this spec documents the system they operate within

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type | Approved by | Session |
|------|---------|-------------|------|-------------|---------|
| 2026-03-15 | 1.0 | Initial spec — consolidates system architecture from overhaul design into living spec | New | — | |
| 2026-03-20 | 1.1 | Reduced enforcement from 4 layers to 3 (removed ghost system.md reference), updated component counts, fixed stale paths, added cross-reference to docs/system-architecture.md | Revised | — | |
| 2026-03-24 | 1.3 | Updated hook count 14→16, added worktree-guard.sh, check-inbox.sh, sync-encyclopedia.sh to hook table | Update | — | |
