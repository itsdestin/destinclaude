# Inbox Processor v2 Design

**Date:** 2026-03-15
**Status:** Implemented
**Skill:** `~/.claude/skills/inbox-processor/SKILL.md`
**Spec:** `~/.claude/skills/inbox-processor/specs/spec.md`

## Summary

Redesign the inbox processor from a "classify and route" model to a "resolve" model. The processor actively resolves items — answering questions, making small changes, applying feedback, creating tasks — rather than just presenting them to Destin for manual triage. Uses Todoist MCP tools instead of curl API calls.

## Classification Categories

| Category | What it covers | Resolution | Autonomy |
|---|---|---|---|
| Meta-feedback | Changes to how Claude behaves, skill/spec improvements, process corrections | Apply to skill/memory/spec files | Approval required |
| Small feature requests | Quick changes to existing skills/hooks/configs | Implement directly, update specs | Autonomous (spec changes shown) |
| Research questions | Questions for Claude to answer | Research and present answer inline | Autonomous |
| Document updates | Planned updates to specs, CLAUDE.md, non-encyclopedia system files | Apply changes | Autonomous |
| Todoist tasks | Actionable tasks that fit an existing project | Create in the matching project | Autonomous |
| Calendar events | Events, appointments, concerts with date/time | Create via `gws` | Autonomous if unambiguous |
| Encyclopedia facts | People info, preferences, biographical facts, ANY change to the 8 modular source files | Route to encyclopedia-update | Approval required (existing mandate) |
| Rants/reflections | Spoken word, journal-worthy thoughts, interview requests | Queue for end-of-session journal/interview | Presented, processed last |
| Unresolvable | Big project ideas, unclear items, things needing a dedicated session | Present with recommendation (Claude Tasks, Open Thread, leave, delete) | User decides per-item |
| Noise | Accidental entries, typos, meaningless text | Delete | Shown in plan, deleted on approval |

### Classification Boundary Rules

- **Meta-feedback vs. small features:** Meta-feedback = corrections or behavioral changes that affect the *current inbox processing run* (e.g., "read newest first", "stop summarizing"). Small features = skill/hook/config changes that improve functionality but don't alter the current run's behavior (e.g., "add source file paths to librarian output").
- **Document updates vs. encyclopedia facts:** Any note targeting the 8 encyclopedia modular files (Core Identity, Status Snapshot, People Database, Chronicle, Beliefs and Positions, Predictions, Open Threads and Goals, Preferences and Reference Data) is always classified as "Encyclopedia facts," regardless of phrasing. "Document updates" covers specs, CLAUDE.md, and non-encyclopedia system files only.
- **Due dates as signals:** If a Todoist task has a due date set, use it as a classification signal — it likely indicates a calendar event or time-sensitive Todoist task rather than a reflection or idea.

## Processing Flow

### Phase 1 — Ingest

- Fetch all incomplete tasks from Claude's Inbox via Todoist MCP (`find-tasks`)
- For each task, fetch comments (`find-comments`) — check re-presentation guard
- Process attachments (images via vision, PDFs via native reader)
- Read all entries before any action, newest to oldest (deliberate reversal of v1's oldest-first order — newer notes are more likely to supersede or correct older ones, and this matches Destin's stated preference)

### Phase 2 — Classify & Extract Meta-Feedback

- Classify every entry into the categories above
- Extract all meta-feedback items regardless of position in the list

### Phase 3 — Apply Meta-Feedback

- Present proposed meta-feedback changes (which files/specs/memories would change and how)
- Wait for Destin's approval
- Apply changes
- Remaining items processed under the updated behavior

### Phase 4 — Build Resolution Plan

Process remaining items in priority order:

1. Small feature requests — identify the change, which files it touches
2. Research questions — do the research, prepare the answer
3. Document updates — identify the spec/file and the proposed change
4. Todoist tasks — identify the target project
5. Calendar events — identify calendar, date/time, summary
6. Encyclopedia facts — prepare the proposed update
7. Unresolvable — prepare a recommendation (Claude Tasks section / Open Thread / leave / delete)
8. Noise — flag for deletion

### Phase 5 — Present Resolution Table

Single table with all items, proposed action, and target:

| # | Entry | Category | Proposed Action |
|---|---|---|---|
| 1 | "read entries most recent first" | Meta-feedback | Applied — updated SKILL.md processing order |
| 2 | "check if I have code security agent" | Research | Answer: No dedicated security agent installed... |
| 3 | "rebuild Google Messages" | Document update | Add planned update to gmessages spec |
| 4 | "Concert Saturday 8pm" | Calendar | Create event on Social Events calendar |
| 5 | "om" | Noise | Delete |
| 6 | "package for Tanner" | Unresolvable | → Claude Tasks section |
| 7 | AI economics rant | Rant | Queue for journal entry at end of session |

Destin approves or tweaks individual items, then execution happens.

### Phase 6 — Execute

- Carry out approved actions
- Complete processed tasks via `complete-tasks`
- Delete noise via `delete-object`
- Route unresolvable items to Claude Tasks section
- Mark deferred items with `[presented: YYYY-MM-DD]` comment via `add-comments`

### Phase 7 — Rants/Reflections (End of Session)

- Queued rants get `[queued-for-journal: YYYY-MM-DD]` comment
- When journaling skill runs, it checks for queued rants in Claude's Inbox
- Processes as journal entry or short interview per the note's instructions
- Completes the task after journaling
- If rants accumulate across multiple days without a journal session, they remain queued — each subsequent inbox run skips them (re-presentation guard on the `[queued-for-journal]` marker) until a journaling session processes them

**Cross-skill contract:** The journaling-assistant SKILL.md must be updated to:
1. Check Claude's Inbox for tasks with `[queued-for-journal: YYYY-MM-DD]` comments at session start
2. Present queued rants as available topics alongside its normal thread surfacing
3. Complete the inbox task after the rant is journaled

### Open Threads & Goals Routing

v1 routed reflections directly to OT&G. v2 removes this direct routing — reflections now go through the journaling skill, which itself triggers encyclopedia-update at end of session. OT&G updates happen through that chain (journaling → encyclopedia-update → OT&G file). Mandate #2 (OT&G approval gate) still applies when encyclopedia-update writes to the OT&G file.

## Todoist MCP Migration

| Operation | Old (curl) | New (MCP) |
|---|---|---|
| Find Claude's Inbox project | `curl GET /projects` | `find-projects` search="Claude's Inbox" |
| Fetch tasks | `curl GET /tasks?project_id=` | `find-tasks` projectId= |
| Fetch comments | `curl GET /comments?task_id=` | `find-comments` taskId= |
| Create task (routing) | `curl POST /tasks` | `add-tasks` |
| Complete task | `curl POST /tasks/<id>/close` | `complete-tasks` |
| Add comment (re-presentation) | `curl POST /comments` | `add-comments` |
| Find target projects | `curl GET /projects` | `find-projects` |
| Delete noise tasks | `curl DELETE /tasks/<id>` | `delete-object` type="task" |

### Removed Dependencies (SKILL.md only)

- `curl` for Todoist API calls (replaced by MCP tools)

**Note:** `$TODOIST_TOKEN` remains a system dependency — the `check-inbox.sh` SessionStart hook runs in bash before a Claude session exists and cannot use MCP tools. The token is only removed as a SKILL.md dependency.

### Kept Dependencies

- `$TODOIST_TOKEN` environment variable (for `check-inbox.sh` hook only)
- `gws` CLI for Google Calendar operations
- `rclone` with `gdrive:` remote for Google Drive (encyclopedia files)

**Design decision:** Calendar operations use `gws` CLI rather than the Google Calendar MCP. Rationale: `gws` is already proven and integrated; provides more control over calendar selection and event formatting.

## Claude Tasks Section

- A section within the Claude's Inbox project for items that need a dedicated session
- Created automatically if it doesn't exist (`add-sections`)
- Items in Claude Tasks are **excluded from standard inbox processing** — they do not appear in the resolution table on subsequent runs
- When processing the inbox, items in the Claude Tasks section are skipped entirely (filter by sectionId)
- A separate "Parked Items" summary line is shown at the end: "X items parked in Claude Tasks" with option to review if requested
- Covers: big project ideas, unclear items, things requiring extended work

## Re-presentation Guard

- Unchanged: deferred items get `[presented: YYYY-MM-DD]` comment, skipped same day
- Resolved items: completed via `complete-tasks`
- Noise: deleted via `delete-object`
- Claude Tasks items: stay as open tasks in that section, no guard needed
- Queued rants: marked with `[queued-for-journal: YYYY-MM-DD]`, picked up by journaling skill

## Error Handling

Error handling is **per-item, not all-or-nothing.** If Phase 6 execution fails mid-way:
- Items already acted on are completed (their Todoist tasks closed)
- The failed item is reported with the error
- Remaining items are left for next run
- Meta-feedback applied in Phase 3 is not rolled back (it's already written to files)

This matches v1's approach ("tasks already acted on are completed, remaining tasks are left for next run") but clarifies that Phase 3 changes are durable.

## Existing Mandates (Unchanged)

All existing spec mandates carry forward:
1. Encyclopedia approval gate
2. Open Threads & Goals approval gate (now enforced via journaling → encyclopedia-update chain; see OT&G Routing section)
3. Autonomous actions only for unambiguous single-destination notes (expanded with per-category autonomy rules)
4. Re-presentation guard
5. Read all before acting
6. Error handling — report failures, exit cleanly (clarified as per-item; see above)

## Spec Versioning

This design supersedes spec v1.0. Upon implementation, the spec at `specs/spec.md` will be updated to v2.0, reflecting the architectural shift from classify-and-route to resolve.
