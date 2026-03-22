# Inbox Processor Spec

**Version:** 2.4
**Created:** 2026-03-14
**Skill:** `~/.claude/skills/inbox-processor/SKILL.md`

## Purpose

Processes notes captured in a dedicated Todoist project ("Claude's Inbox") and screenshots/files from Google Drive Inbox (`gdrive:Claude/Inbox`), actively resolving them — answering questions, applying feedback, creating tasks and events, routing encyclopedia facts — rather than simply classifying and routing. Replaces the deprecated Mid-Day Notes system with a phone-accessible, always-available capture mechanism.

## User Mandates

1. **(2026-03-14)** Encyclopedia approval gate: All facts routed to the encyclopedia system must be presented to the user for approval before writing. (Per global CLAUDE.md modular files update policy.)
2. **(2026-03-14)** Open Threads & Goals approval gate: All reflections routed to Open Threads & Goals must be presented to the user for approval before writing.
3. **(2026-03-14)** Autonomous actions only for unambiguous single-destination notes: Notes that could route multiple ways, contain personal/substantive content, touch encyclopedia data, or have missing parameters must ask first.
4. **(2026-03-14)** Re-presentation guard: Do not re-show same-day skipped notes. Use Todoist comments with `[presented: YYYY-MM-DD]` markers.
5. **(2026-03-14)** Read all before acting: All inbox entries (including comments and attachments) must be read before acting on any single entry. Entries may conflict, overlap, or add context to one another.
6. **(2026-03-14)** Error handling: Report failures and exit cleanly. Do not partially process — tasks already acted on are completed, remaining tasks are left for next run.
7. **(2026-03-15)** Meta-feedback applied first: Meta-feedback items are always processed before other categories.
8. **(2026-03-15)** Resolution table approval: All non-meta-feedback items are presented in a resolution table for approval before execution.
9. **(2026-03-15)** Todoist MCP only: All Todoist operations use MCP tools, not curl/REST API.

## Related: `/todo` Quick-Capture Hook

The `/todo <note>` command lets the user capture notes to Claude's Inbox mid-conversation without interrupting the current task. Implemented as a `UserPromptSubmit` hook (`~/.claude/hooks/todo-capture.sh`), not a skill. The hook intercepts prompts starting with `/todo ` and returns a `systemMessage` instructing Claude to use the Todoist MCP `add-tasks` tool, confirm briefly, and resume. Previously implemented as a standalone skill (`~/.claude/skills/todo/`), converted to a hook on 2026-03-16 for non-interrupting behavior.

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
| Spec-routable category | Items referencing existing skills/features should be added to that feature's spec — under "Planned Updates" for improvements/ideas or "Known Bugs / Issues" for bug reports — not just parked in Claude Tasks. Captures intent where it's actionable. | Move all to Claude Tasks (loses context), create separate tracking project |
| Triage unresolvables before tabling | Unresolvable items are presented to the user for routing direction before the resolution summary, not silently included with a recommendation. Prevents Claude from guessing wrong on big-ticket items. | Include in resolution table with recommendation (v2.0 approach) |
| Grouped presentation | Resolution summary is grouped by category (Completed, Research Answers, Actions, Noise, Rants, Unresolvable) instead of one flat table. Easier to scan and approve. | Single flat table (v2.0 approach) |

## Dependencies

- Todoist MCP server configured in `~/.claude.json`
- Todoist MCP tools (`find-projects`, `find-tasks`, `find-comments`, `add-tasks`, `complete-tasks`, `add-comments`, `delete-object`, `add-sections`, `find-sections`)
- `gws` CLI for Google Calendar operations
- `rclone` with `gdrive:` remote for Google Drive (encyclopedia files + `gdrive:Claude/Inbox` for screenshots/files)

## Integration Points

- **SessionStart hook:** `~/.claude/hooks/check-inbox.sh` checks for unprocessed notes each session
- **encyclopedia-update skill:** Invoked when facts need routing to modular source files
- **journaling-assistant skill:** Cross-skill contract — queued rants picked up via `[queued-for-journal]` comments; journaling skill checks Claude's Inbox for queued rants at session start
- **Open Threads & Goals:** Routing now goes through journaling → encyclopedia-update chain, not direct

## Known Bugs / Issues

1. **`/todo` command not working** — The `/todo` quick-add command (UserPromptSubmit hook at `~/.claude/hooks/todo-capture.sh`) needs fixing. *(Reported 2026-03-16)*

## Planned Updates

1. **Better rant/mini journal processing** — Improve how rants and short reflections are handled during inbox processing. Current flow queues them for journaling, but there may be room for lighter-weight processing (e.g., short rants that don't need a full journal session, quick reflections that could be captured as encyclopedia facts or open threads without invoking the full journaling skill). *(Added 2026-03-15 from inbox)*

2. ~~**Quick-add to Claude's Inbox from Claude Code interface**~~ — **DONE (2026-03-16).** Implemented as `/todo` via UserPromptSubmit hook at `~/.claude/hooks/todo-capture.sh`. Returns systemMessage instructing Claude to use Todoist MCP tools, confirms briefly, and resumes prior task.

3. **Formalize response format** — Define a strict, consistent output format for the inbox processor's resolution summary. Current format evolved organically — needs a formal spec for the grouped-by-category presentation (headers, table schemas, bullet point styles, ordering rules) so it's reproducible across sessions. *(Added 2026-03-16)*

## Change Log

| Date | Version | Changes | Type | Author |
|------|---------|---------|------|--------|
| 2026-03-14 | 1.0 | Initial spec. Todoist-based inbox processor replacing Mid-Day Notes. | Creation | the user |
| 2026-03-15 | 2.0 | Architectural shift from classify-and-route to resolve model. Todoist MCP migration. 10 classification categories. Claude Tasks section. Cross-skill rant handoff to journaling-assistant. Newest-to-oldest processing. | Architecture | the user |
| 2026-03-15 | 2.1 | Added spec-routable category (items referencing existing features go to that feature's spec as planned updates). Added Phase 4.5 to triage unresolvable items with the user before building resolution summary. Restructured Phase 5 from flat table to grouped-by-category presentation. | Design | the user |
| 2026-03-16 | 2.2 | Spec-routable items can now target either "Planned Updates" (improvements/ideas) or "Known Bugs / Issues" (bug reports) in the destination spec. | Design | the user |
| 2026-03-16 | 2.3 | Marked planned update #2 (quick-add command) as done — implemented as `/todo` skill. | Update | Claude |
| 2026-03-16 | 2.4 | Added Google Drive Inbox (`gdrive:Claude/Inbox`) as secondary ingest source for screenshots/files. Todoist file attachments are inaccessible via API (require web session cookies). Screenshots uploaded to Drive are downloaded via rclone, processed, then deleted. | Design | the user |
