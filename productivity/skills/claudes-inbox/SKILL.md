---
name: claudes-inbox
description: >
  Checks the user's configured capture sources (Todoist, Google Drive, Gmail,
  Apple Notes, Apple Reminders, iCloud Drive, local staging) for unprocessed
  notes and actively resolves them — answering questions, making changes,
  applying feedback, creating tasks, deleting noise. Provider-agnostic:
  users configure which sources to use during setup. Use this skill when
  the session-start hook detects inbox items, or when the user says
  "check my inbox", "process my notes", or "what's in my inbox".
---
<!-- SPEC: Read specs/claudes-inbox-spec.md before modifying this file -->

# Claude's Inbox

## Purpose

This skill processes notes from the user's configured capture sources and actively resolves them. Not just routing — answering questions, making changes, creating tasks, applying feedback, deleting noise. Items are ingested from any combination of providers (Todoist, Google Drive, Gmail, Apple Notes, Apple Reminders, iCloud Drive, local staging), normalized into a common format, classified, and then resolved after the user's approval.

## Dependencies

Dependencies are conditional on which providers are enabled:

- **Todoist MCP tools** (if Todoist provider enabled): `find-projects`, `find-tasks`, `find-comments`, `add-tasks`, `complete-tasks`, `add-comments`, `delete-object`, `add-sections`, `find-sections`
- **`gws` CLI** for Google Calendar operations (always — used for calendar event resolution). Design decision: NOT Google Calendar MCP — `gws` is proven and provides more control over calendar selection and event formatting.
- **`rclone`** with `gdrive:` remote (if Google Drive provider enabled): for Google Drive Inbox and encyclopedia files
- **Gmail MCP tools** (if Gmail provider enabled): `gmail_search_messages`, `gmail_read_message`, and label management tools
- **`osascript`** (if Apple providers enabled — macOS only): for Apple Notes, Apple Reminders, and iCloud Drive operations
- **Local filesystem** (always): for the `local` provider (`~/.claude/inbox/`), `journal-queue/`, and `parked/` directories
- **Note:** All Todoist access is via MCP tools — no API tokens or direct REST calls

---

## Classification Categories

| Category | What it covers | Resolution | Autonomy |
|---|---|---|---|
| Meta-feedback | Changes to how Claude behaves, skill/spec improvements, process corrections | Apply to skill/memory/spec files | Approval required |
| Small feature requests | Quick changes to existing skills/hooks/configs | Implement directly, update specs | Autonomous (spec changes shown) |
| Research questions | Questions for Claude to answer | Research and present answer inline | Autonomous |
| Document updates | Planned updates to specs, CLAUDE.md, non-encyclopedia system files | Apply changes | Autonomous |
| Todoist tasks | Actionable tasks that fit an existing project | Create in the matching project | Autonomous |
| Calendar events | Events, appointments, concerts with date/time | Create via `gws` | Autonomous if unambiguous |
| Encyclopedia facts | People info, preferences, biographical facts, ANY change to the 8 modular source files | Route to encyclopedia-update skill | Approval required (existing mandate) |
| Rants/reflections | Spoken word, journal-worthy thoughts, interview requests | Queue for end-of-session journal/interview | Presented, processed last |
| Spec-routable | Ideas/improvements/bugs that reference an existing skill or feature with a spec | Add to "Planned Updates" or "Known Bugs / Issues" in that feature's spec | Autonomous (spec changes shown) |
| Unresolvable | Big project ideas, unclear items, things needing a dedicated session | Present to the user for triage before building resolution table | User decides per-item |
| Noise | Accidental entries, typos, meaningless text | Delete | Shown in plan, deleted on approval |

### Classification Boundary Rules

- **Meta-feedback vs. small features:** Meta-feedback = corrections or behavioral changes that affect the *current inbox processing run* (e.g., "read newest first", "stop summarizing"). Small features = skill/hook/config changes that improve functionality but don't alter the current run's behavior (e.g., "add source file paths to librarian output").
- **Document updates vs. encyclopedia facts:** Any note targeting the 8 encyclopedia modular files (Core Identity, Status Snapshot, People Database, Chronicle, Beliefs and Positions, Predictions, Open Threads and Goals, Preferences and Reference Data) is ALWAYS classified as "Encyclopedia facts," regardless of phrasing. "Document updates" covers specs, CLAUDE.md, and non-encyclopedia system files only.
- **Due dates as signals:** If a Todoist task has a due date set, use it as a classification signal — it likely indicates a calendar event or time-sensitive Todoist task rather than a reflection or idea.
- **Spec-routable vs. unresolvable:** If an item references an existing skill or feature that has a spec (e.g., "refactor gmessages", "improve voice skill", "gmessages crashes when..."), classify it as "Spec-routable" — it gets added to that feature's spec under either "Planned Updates" (for improvements/ideas) or "Known Bugs / Issues" (for bug reports/problems). Only classify as "Unresolvable" if there's no clear spec target (standalone project ideas, unclear items, things that don't map to any existing feature).

---

## Phase 1 — Ingest

Phase 1 is provider-agnostic. The skill reads from all configured capture sources, normalizes items into a common model, and merges them into a single processing queue.

### Steps

1. **Read provider configuration.** Read the `inbox_providers` array from `~/.claude/toolkit-state/config.json`. This lists which providers the user has enabled (e.g., `["todoist", "local", "gmail"]`).

2. **Detect current platform.** Run `uname -s` to determine the OS. Map the result: `Darwin` = macOS, `MINGW*` or `MSYS*` or `CYGWIN*` = Windows (win32), `Linux` = Linux. This is used to skip platform-incompatible providers.

3. **Iterate over enabled providers.** For each provider name in the `inbox_providers` array:

   a. **Check platform compatibility.** Read the provider's instruction file at `providers/<provider-name>.md` (relative to this skill file). Each provider file declares a `Platform` field. If the current platform does not match (e.g., an `macos`-only provider on Windows), skip with a note: "Skipped <provider> — requires macOS."

   b. **Check dependency availability.** Follow the provider file's dependency requirements. If the provider's dependency is unavailable (command not found, MCP server not responding, required directory does not exist), log a warning and skip to the next provider. Do not fail the entire run.

   c. **Follow the provider's List operation.** Execute the List instructions from the provider file to retrieve all unprocessed items.

   d. **Follow the provider's Read operation.** For each item returned by List, execute the Read instructions from the provider file to get full content, attachments, and metadata.

   e. **Normalize each item.** Convert each item into the normalized item model (see table below).

4. **Always check the `local` provider.** Even if `local` is not explicitly listed in the `inbox_providers` array, always check `~/.claude/inbox/` for pending items. This provider powers the `/todo` hook and must always be active.

5. **Merge all items.** Combine items from all providers into a single list, sorted newest-to-oldest by timestamp.

6. **Record skipped providers.** Track any providers that were skipped (platform mismatch, dependency unavailable) along with the reason. These are shown in the Phase 5 summary.

7. **Check for empty inbox.** If no items were found across all providers, report "Inbox is clear" and exit. Include a count of parked items if any exist:
   - Check `~/.claude/inbox/parked/` directory for local parked items.
   - If Todoist provider is enabled, check the Claude Tasks section for parked Todoist items.

8. **Read all entries before acting on any.** Process newest to oldest (deliberate: newer notes are more likely to supersede or correct older ones). Consider cross-entry context — later notes may override earlier ones, and multiple notes may describe a single event or fact.

### Normalized Item Model

| Field | Type | Description |
|---|---|---|
| content | string | The note text |
| source | string | Provider name (`local`, `todoist`, `gmail`, `google-drive`, `apple-notes`, `apple-reminders`, `icloud-drive`) |
| source_id | string | Provider-specific identifier for mark-processed |
| timestamp | datetime | When the item was created/captured |
| attachments | list | Images/files, downloaded to platform temp dir (Unix: `/tmp/`, Windows: `$TEMP` or Git Bash `/tmp/`) |
| metadata | object | Provider-specific extras (Todoist due date, email subject, note title, etc.) |

---

## Phase 2 — Classify & Extract Meta-Feedback

Classify every entry into the 10 categories above. Apply the classification boundary rules.

Extract all meta-feedback items regardless of their position in the list. These are processed first in Phase 3 so that subsequent phases operate under updated behavior.

---

## Phase 3 — Apply Meta-Feedback

If meta-feedback items exist:

1. Present proposed changes: which files, specs, or memories would change and how.
2. Wait for the user's approval.
3. Apply the approved changes.
4. Remaining items are now processed under the updated behavior.

If no meta-feedback items exist, skip this phase silently.

---

## Phase 4 — Build Resolution Plan

For remaining items, build a resolution plan in this priority order:

1. **Small feature requests** — Identify the change, which files it touches, and prepare the implementation. Read relevant specs before proposing changes.

2. **Research questions** — Actually do the research. Prepare a concise answer to present inline in the resolution table.

3. **Document updates** — Identify the target spec/file and the proposed change.

4. **Todoist tasks** — Identify the target project via `find-projects`. Prepare `add-tasks` parameters (content, projectId, due_string if applicable). Only create tasks that fit an existing project.

5. **Calendar events** — Identify the correct calendar using the mapping table below. Prepare the `gws` command with summary, start/end times.

6. **Encyclopedia facts** — Prepare the proposed update for the `encyclopedia-update` skill. The approval gate per CLAUDE.md applies.

7. **Spec-routable** — For items that reference an existing skill or feature with a spec, read the target spec and prepare an entry under either "Planned Updates" (for improvements/ideas) or "Known Bugs / Issues" (for bug reports/problems). The entry should capture the intent of the note in a way that's actionable in a future session.

8. **Noise** — Flag for deletion.

9. **Rants/reflections** — Flag for end-of-session journaling. These are ALWAYS last and executed after all other items.

10. **Unresolvable** — Do NOT include in the resolution table yet. These are handled in Phase 4.5.

### Calendar Mapping

| Event type | Target calendar |
|---|---|
| Work events | Work Events |
| Social / concerts / friends | Social Events |
| Appointments (dentist, doctor, etc.) | Appointments |
| Partner's stuff | Partner's Schedule |
| School | School Events |
| Family | Family |
| Default (when unclear) | Appointments |

---

## Phase 4.5 — Triage Unresolvable Items

If any items were classified as "Unresolvable" in Phase 2, present them to the user **before** building the resolution table. For each item, briefly state what it is and why it can't be resolved in this run, then ask where it should go:

- **Claude Tasks** — if Todoist provider is enabled: create a task in the Claude Tasks section. If Todoist is not enabled: write to `~/.claude/inbox/parked/<timestamp>_<slug>.md` with YAML frontmatter (source, original content, captured date, parked date).
- **Open Thread** — add to Open Threads & Goals (approval gate applies)
- **Delete** — discard it
- **Leave** — keep in inbox for next run

Example:

> **I couldn't resolve these on my own — where should they go?**
>
> 1. "package Claude system for a friend" — Big project: deidentification, security review, install docs. **Claude Tasks / Open Thread / Delete / Leave?**
> 2. "full system audit" — Multi-session effort across specs and CLAUDE.md. **Claude Tasks / Open Thread / Delete / Leave?**

Wait for the user's direction on each item before proceeding to Phase 5. Items routed to Claude Tasks or Open Thread are then included in the resolution table with their assigned action.

---

## Phase 5 — Present Resolution Summary

If any providers were skipped during Phase 1, show a note at the top:

> **Note:** Skipped providers: <provider> (<reason>), <provider> (<reason>).

Present results **grouped by category**, not as one flat table. Each group has a header and only appears if it has items. Order:

### Completed
Items that were already done or can be immediately closed. Listed as bullet points.
> - "implement inbox processor" — already live, completing
> - "inbox processor implementation gap" — gaps already patched, completing

### Meta-Feedback Applied
Show what was changed and where (already done in Phase 3). Listed as bullet points.
> - "read newest first" — already in skill, no change needed
> - "improve thoroughness" — already matches current skill design

### Research Answers
For each question, give the answer directly. Listed as Q&A pairs.
> **"check if i have code security agent"**
> No — no security agent or skill installed. Could build one or find an existing tool on GitHub.
>
> **"can you create Android apps?"**
> Yes — via PWAs, React Native/Expo, or Flutter. Claude can write the code.

### Actions Ready to Execute
Items Claude will act on (tasks, calendar events, document updates, spec-routable items, small features). Shown as a compact table with a Source column.
> | # | Entry | Source | Action |
> |---|---|---|---|
> | 1 | "Concert Saturday 8pm" | Apple Reminders | Create event on Social Events calendar |
> | 2 | "refactor gmessages" | Todoist | Add as planned update in gmessages spec |

### Noise
Items flagged for deletion. Listed as bullet points.
> - "om" — delete

### Rants (Queued for Journal)
Listed last. Brief summary of each, flagged for end-of-session journaling.
> - AI economics rant — queue for journal (with short interview as requested)

### Unresolvable (Triaged)
Items from Phase 4.5, showing the user's chosen routing.
> - "package for a friend" → Claude Tasks
> - "full system audit" → Open Thread

Rules:
- Skip any group that has zero items
- The user approves, tweaks, or rejects individual items within each group
- After all groups, show: "X items parked in Claude Tasks" if any exist

---

## Phase 6 — Execute

For each approved item, execute in resolution table order (rants last):

**Calendar events:**
```bash
gws calendar events create --params '{"calendarId": "<CALENDAR_ID>"}' \
  --json '{"summary": "<EVENT>", "start": {"dateTime": "<START>"}, "end": {"dateTime": "<END>"}}'
```

**Todoist tasks:** Use `add-tasks` MCP tool with the target projectId, content, and due_string.

**Encyclopedia facts:** Invoke the `encyclopedia-update` skill with the specific facts. The approval gate per CLAUDE.md applies — present proposed changes and wait for the user's approval before writing.

**Small feature requests:** Implement the change. Update specs if needed (per specs system rules).

**Document updates:** Apply the change to the target file.

**Spec-routable items:** Read the target spec, add the item to either "Planned Updates" (for improvements/ideas) or "Known Bugs / Issues" (for bug reports/problems) — create the section if it doesn't exist. Include the original note content and a brief description of what the update would involve.

**Unresolvable items routed to Claude Tasks:** If Todoist provider is enabled, create a new task in the Claude Tasks section via `add-tasks` with sectionId=<Claude Tasks section ID>. Preserve the original content and description. If Todoist is not enabled, write to `~/.claude/inbox/parked/<timestamp>_<slug>.md` with YAML frontmatter.

**Noise:** Read the provider file for the item's `source` field and follow its **Mark Processed** operation.

**Rants/reflections (ALWAYS LAST):** Write each rant to `~/.claude/inbox/journal-queue/<timestamp>_rant.md` with YAML frontmatter including: source, original source_id, captured date, queued date. If the item's source is `todoist`, also add a `[queued-for-journal: YYYY-MM-DD]` comment on the Todoist task via `add-comments` (dual-write during transition). Do NOT mark these as processed — the journaling skill handles that after the rant is journaled. Additionally, add each rant as an Open Thread in `Open Threads and Goals.md` (approval gate applies) with status "Queued for journal" so it's tracked even if journaling doesn't happen immediately.

**Mark Processed:** For each resolved item (except rants and deferred items), read the provider file for the item's `source` field and follow its **Mark Processed** operation.

**Mark Presented for deferred items:** For items that were presented but not approved, read the provider file for the item's `source` field and follow its **Mark Presented** operation.

### Per-Item Error Handling

If execution fails for one item:
- Report the error for that specific item
- Continue processing remaining items
- Failed items are left in their source for the next run

---

## Phase 7 — Rant Handoff (Cross-Skill)

Rants queued in Phase 6 are picked up by the `journaling-assistant` skill:

1. The journaling skill checks `~/.claude/inbox/journal-queue/` for `.md` files at session start.
2. **Legacy:** If the Todoist provider is enabled, the journaling skill also checks Claude's Inbox for tasks with `[queued-for-journal: YYYY-MM-DD]` comments (transition period support).
3. Queued rants are presented as available topics alongside the journaling skill's normal thread surfacing.
4. After a rant is journaled, the journaling skill deletes the `journal-queue/` file. If the rant's source was `todoist`, it also completes the original inbox task via `complete-tasks`.
5. If rants accumulate across multiple days without a journaling session, they remain queued — each subsequent inbox run skips them (the re-presentation guard recognizes queued-for-journal items) until a journaling session processes them.

---

## Tone

Direct and brief. No affirmations. Status report style:

"Found 5 notes in your inbox. Applied 1 meta-feedback change. 3 items ready for your review:"

---

## Error Handling

Error handling is **per-item, not all-or-nothing.**

- If one item fails during Phase 6 execution, report the error and continue with remaining items.
- Items already acted on are marked processed via their provider's operation.
- The failed item is reported with the specific error.
- Remaining items continue processing.
- Meta-feedback applied in Phase 3 is not rolled back — those changes are already written to files and are durable.
- If a provider is unavailable during Phase 1, skip it with a warning and continue. This is not a fatal error.

---
**System rules:** If this skill or its supporting files are modified, follow the System Change Protocol in `CLAUDE.md` and the System Change Checklist in `~/.claude/docs/system.md`. All items are mandatory.
