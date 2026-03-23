# Claude's Inbox Spec

**Version:** 3.0
**Created:** 2026-03-14
**Skill:** `~/.claude/skills/claudes-inbox/SKILL.md`

## Purpose

Processes notes captured from multiple configurable sources — Todoist, Google Drive, Gmail, Apple Notes, Apple Reminders, iCloud Drive, and local staging — actively resolving them: answering questions, applying feedback, creating tasks and events, routing encyclopedia facts. The processing engine is provider-agnostic; each capture source is defined in a modular provider instruction file. Replaces the deprecated Mid-Day Notes system with a phone-accessible, always-available, multi-source capture mechanism.

## User Mandates

1. **(2026-03-14)** Encyclopedia approval gate: All facts routed to the encyclopedia system must be presented to the user for approval before writing. (Per global CLAUDE.md modular files update policy.)
2. **(2026-03-14)** Open Threads & Goals approval gate: All reflections routed to Open Threads & Goals must be presented to the user for approval before writing.
3. **(2026-03-14)** Autonomous actions only for unambiguous single-destination notes: Notes that could route multiple ways, contain personal/substantive content, touch encyclopedia data, or have missing parameters must ask first.
4. **(2026-03-14)** Re-presentation guard: Do not re-show same-day skipped notes. Each provider defines its own Mark Presented mechanism (Todoist uses `[presented: YYYY-MM-DD]` comments, Gmail applies a label, etc.). Providers without a native mechanism use `~/.claude/inbox/state/presented-<date>.json` as fallback.
5. **(2026-03-14)** Read all before acting: All inbox entries (including comments and attachments) must be read before acting on any single entry. Entries may conflict, overlap, or add context to one another.
6. **(2026-03-14)** Error handling: Report failures and exit cleanly. Do not partially process — tasks already acted on are completed, remaining tasks are left for next run.
7. **(2026-03-15)** Meta-feedback applied first: Meta-feedback items are always processed before other categories.
8. **(2026-03-15)** Resolution table approval: All non-meta-feedback items are presented in a resolution table for approval before execution.
9. **(2026-03-15)** Todoist MCP only for Todoist provider operations — other providers use their own access methods (osascript, rclone, Gmail MCP, filesystem). This mandate means "when interacting with Todoist, use MCP tools, not curl/REST" — it does not require all providers to use MCP.

## Related: `/todo` Quick-Capture Hook

The `/todo <note>` command lets the user capture notes to Claude's Inbox mid-conversation without interrupting the current task. Implemented as a `UserPromptSubmit` hook (`~/.claude/hooks/todo-capture.sh`), not a skill. The hook intercepts prompts starting with `/todo ` and writes a local file to `~/.claude/inbox/<timestamp>_todo.md` with YAML frontmatter (source, captured timestamp, origin). No Claude involvement or external service dependency needed — the hook handles everything and returns a confirmation systemMessage. Works offline. Previously implemented as a Todoist MCP call (v2) and before that as a standalone skill (v1).

## Design Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Todoist project as inbox | Phone-accessible, supports text/screenshots/files, already in the user's workflow | Google Keep (broken in gws CLI), Google Drive folder (no phone quick-capture), dedicated app |
| Task completion = processed signal | Simple, no extra state needed. Incomplete tasks are unprocessed. | Explicit labels, local marker files, separate database |
| Session-start check every session | API call is fast and free. Todoist's own state (completed tasks) makes throttling unnecessary. | Hourly check, time-based throttle, marker file |
| Todoist comments for re-presentation state | Persists across machines, no local state files to sync. Tied to the task itself. | Local marker file, separate state database |
| Ten classification categories | Covers all actual note types observed in practice (v1's 4 categories missed project ideas, questions, meta-feedback, noise) | Four categories (v1) |
| Mid-Day Notes fully deprecated | Inbox processor covers all Mid-Day Notes use cases with better accessibility and processing frequency | Keep both systems, partial deprecation |
| Todoist MCP over curl | MCP tools are native to Claude Code, no token management in skill, consistent with other MCP usage | curl/REST API (v1 approach) |
| gws CLI over Google Calendar MCP | gws is proven and integrated; provides more control over calendar selection and event formatting | Google Calendar MCP |
| Resolve model over route model | Most inbox items are things Claude can act on directly; routing just defers work to the user | Classify-and-route (v1) |
| Claude Tasks section for unresolvable | Prevents inbox from becoming a permanent parking lot; dedicated section separates active inbox from parked items | Leave in inbox, separate project |
| Newest-to-oldest processing order | Newer notes more likely to supersede older ones; matches the user's stated preference | Oldest first (v1) |
| Google Drive Inbox for screenshots/files | Todoist file attachment URLs require web session cookies and cannot be downloaded programmatically. Screenshots and files are uploaded to `gdrive:Claude/Inbox` instead, where rclone has full authenticated access. Files are deleted from Drive after processing. | Fix Todoist auth (not possible — server-side limitation), Playwright browser login (fragile, requires credentials) |
| Spec-routable category | Items referencing existing skills/features should be added to that feature's GitHub Issues — as a planned update or bug report — not just parked in Claude Tasks. Captures intent where it's actionable. | Move all to Claude Tasks (loses context), create separate tracking project |
| Triage unresolvables before tabling | Unresolvable items are presented to the user for routing direction before the resolution summary, not silently included with a recommendation. Prevents Claude from guessing wrong on big-ticket items. | Include in resolution table with recommendation (v2.0 approach) |
| Grouped presentation | Resolution summary is grouped by category (Completed, Research Answers, Actions, Noise, Rants, Unresolvable) instead of one flat table. Easier to scan and approve. | Single flat table (v2.0 approach) |
| Provider instruction files over inline conditionals | Modularity, maintainability, easy to add new providers without modifying core skill. Each provider is a self-contained markdown file with List/Read/Mark Processed/Mark Presented operations. | Inline if/else chains in SKILL.md (fragile, hard to extend) |
| Local staging for /todo over Todoist MCP | Offline, no external dependency, faster, no round-trip through external service for in-session capture | Todoist MCP add-tasks (v2 approach — requires network, slower, appears in Todoist app unnecessarily) |
| Journal-queue directory over Todoist comments | Works without Todoist, simpler cross-skill contract, filesystem-based. Rants queued for journaling are written to `~/.claude/inbox/journal-queue/`. | Todoist `[queued-for-journal]` comments (v2 approach — Todoist-coupled, breaks if Todoist not enabled) |
| Mark Presented in provider contract | Re-presentation guard is provider-specific; each source has its own mechanism for recording that an item was shown but deferred. Part of the four-operation provider interface. | Centralized state file (loses provider-native mechanisms like Todoist comments, Gmail labels) |
| Config-driven provider selection | Users choose their own capture tools during setup. Stored in `~/.claude/toolkit-state/config.json`. Platform-gated: Apple providers only on macOS. | Hardcoded provider list (inflexible), auto-detect all (noisy, slow) |
| Gmail cloud-hosted MCP connectors | Always available when enabled in Claude Code settings, no local server needed. Setup wizard verifies accessibility. | Local Gmail MCP server (requires local setup, maintenance) |
| Skip-and-warn for unavailable providers | One broken source should not block all processing. Unavailable providers are skipped with a warning in the Phase 5 summary. | Fail-fast on any provider error (blocks entire inbox run) |

## Dependencies

Dependencies are conditional on which providers are enabled:

| Dependency | Required By | Purpose |
|------------|-------------|---------|
| Todoist MCP server (`~/.claude.json`) | `todoist` provider | MCP tools for task/comment/project operations |
| Todoist MCP tools (`find-projects`, `find-tasks`, `find-comments`, `add-tasks`, `complete-tasks`, `add-comments`, `delete-object`, `add-sections`, `find-sections`) | `todoist` provider | Inbox CRUD and Claude Tasks parking |
| `rclone` with `gdrive:` remote | `google-drive` provider, `encyclopedia-update` integration | Google Drive file access |
| `gws` CLI | Calendar event creation (any provider) | Google Calendar operations |
| Gmail MCP tools (`mcp__claude_ai_Gmail__*`) | `gmail` provider | Cloud-hosted Anthropic MCP connectors for Gmail |
| `osascript` | `apple-notes`, `apple-reminders` providers | macOS scripting bridge (macOS only) |
| Local filesystem | `local`, `icloud-drive` providers | File read/write, always available |

## Integration Points

- **SessionStart hook:** `~/.claude/hooks/check-inbox.sh` reads `inbox_providers` from config, performs lightweight count checks per enabled provider (with 5s timeout each), and outputs a systemMessage if items are found. Skips unavailable providers silently (session-start prioritizes speed).
- **encyclopedia-update skill:** Invoked when facts need routing to modular source files.
- **journaling-assistant skill:** Checks `~/.claude/inbox/journal-queue/` as primary source for queued rants. Legacy: also checks Todoist for `[queued-for-journal]` comments if Todoist provider is enabled (transition period until next major journaling skill version bump).
- **Open Threads & Goals:** Routing goes through journaling -> encyclopedia-update chain, not direct.
- **Setup wizard:** Phase 4 (Dependency Installation) includes a new capture source selection step. Presents platform-gated options, verifies dependencies, walks through one-time setup per provider, saves selection to config.json. `local` is always enabled by default.

## Known Issues & Planned Updates

### Known Issues

1. `/todo` command has been rewritten from Todoist MCP to local file write — may still need testing across edge cases (empty notes, special characters, concurrent writes).

### Planned Updates

1. Better rant processing — currently rants are queued for journaling with minimal preprocessing. Could benefit from sentiment detection and topic extraction before handoff.
3. Formalize response format — standardize the resolution table format and approval flow into a documented schema.

See also [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for tracked issues and planned updates.

## Change Log

| Date | Version | Changes | Type | Author |
|------|---------|---------|------|--------|
| 2026-03-14 | 1.0 | Initial spec. Todoist-based inbox processor replacing Mid-Day Notes. | Creation | the user |
| 2026-03-15 | 2.0 | Architectural shift from classify-and-route to resolve model. Todoist MCP migration. 10 classification categories. Claude Tasks section. Cross-skill rant handoff to journaling-assistant. Newest-to-oldest processing. | Architecture | the user |
| 2026-03-15 | 2.1 | Added spec-routable category (items referencing existing features go to that feature's spec as planned updates). Added Phase 4.5 to triage unresolvable items with the user before building resolution summary. Restructured Phase 5 from flat table to grouped-by-category presentation. | Design | the user |
| 2026-03-16 | 2.2 | Spec-routable items can now target either "Planned Updates" (improvements/ideas) or "Known Bugs / Issues" (bug reports) in the destination spec. | Design | the user |
| 2026-03-16 | 2.3 | Marked planned update #2 (quick-add command) as done — implemented as `/todo` skill. | Update | Claude |
| 2026-03-16 | 2.4 | Added Google Drive Inbox (`gdrive:Claude/Inbox`) as secondary ingest source for screenshots/files. Todoist file attachments are inaccessible via API (require web session cookies). Screenshots uploaded to Drive are downloaded via rclone, processed, then deleted. | Design | the user |
| 2026-03-23 | 3.0 | Provider-agnostic architecture. 7 capture sources (Todoist, Google Drive, Gmail, Apple Notes, Apple Reminders, iCloud Drive, local staging). Provider instruction files. Renamed from inbox-processor to claudes-inbox. Local staging for /todo hook. Journal-queue directory for rant handoff. Config-driven provider selection. Session-start check across providers. | Architecture | the user |
