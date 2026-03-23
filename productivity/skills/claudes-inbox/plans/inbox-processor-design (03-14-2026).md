# Inbox Processor — Design Spec

**Version:** 1.1
**Date:** 2026-03-14
**Status:** Superseded by inbox-processor-v2-design (03-15-2026).md

## Problem

Destin has realizations, remembers facts/stories, and learns about events throughout the day but doesn't always have access to Claude Code. The current Mid-Day Notes system (a .docx file on Google Drive) requires desktop access to update and only gets processed during nightly journal sessions — which may not happen for days or weeks. Information is lost or forgotten before it can be incorporated into the encyclopedia system.

## Solution

A Todoist-based capture inbox paired with a session-start processor that routes notes into the appropriate system (encyclopedia, calendar, Todoist, Open Threads & Goals). Mid-Day Notes is fully deprecated.

## Design

### 1. Capture Layer

**Mechanism:** A dedicated Todoist project called "Claude Inbox."

**User workflow:** Open Todoist on phone → create a task with whatever text, screenshots, images, or file attachments (via task comments) capture the thought. No formatting conventions, labels, or structure required.

**Inbox signal:** Any incomplete task in the Claude Inbox project is unprocessed. The project starts empty.

### 2. Ingest & Processing

**Trigger:** Every Claude Code session start, implemented as a SessionStart hook that injects a prompt directing Claude to invoke the inbox-processor skill. This ensures the processor runs within the conversation context where it can present ambiguous items interactively and wait for user input.

If the Claude Inbox project is empty, the skill exits silently — no output, no interruption.

**Processing flow:**

| Step | Action |
|------|--------|
| 1 | Pull all incomplete tasks from Claude Inbox project (via Todoist REST API v1), ordered by creation date (oldest first) |
| 2 | For each task, read the title, description, and any comments (which may contain file attachments) |
| 3 | For images/screenshots: download attachment URLs from task comments, describe content, extract text, facts, dates, and actionable information. For unsupported or unprocessable files (corrupt, too large, non-image/non-PDF): note the attachment exists but skip extraction, and include a notice in the summary so Destin can handle it manually. |
| 4 | Classify each note and determine routing (see Routing Table below) |
| 5 | Execute autonomous actions; present ambiguous items for user input |
| 6 | Complete all processed tasks in Todoist |
| 7 | Present summary of actions taken and any pending decisions |

**Re-presentation guard:** If ambiguous notes were presented to Destin in a prior session but he didn't address them (e.g., was focused on something else), Claude adds a Todoist comment to the task with the text `[presented: YYYY-MM-DD]`. On subsequent runs within the same calendar day, tasks with a `[presented: <today>]` comment are skipped. The next calendar day, the note is surfaced again. This uses Todoist's own comment system as persistence — no local state files needed.

### 3. Routing Table

| Note type | Destination | Autonomy | Examples |
|-----------|-------------|----------|----------|
| Events, appointments, concerts | Google Calendar via gws | Autonomous if date/time/event are clear; ask if ambiguous (which calendar, what time, etc.) | "Concert at Crescent Ballroom Saturday 8pm" |
| Tasks, to-dos, reminders | Todoist (appropriate project, not Claude Inbox) | Autonomous | "Need to call dentist Monday" |
| Facts, preferences, people info | Encyclopedia-update (approval gate per CLAUDE.md) | Ask first | "Bri's favorite restaurant is now Postino" |
| Reflections, realizations, journal-worthy content | Open Threads & Goals (new thread flagged for journal discussion) | Ask first | "Been thinking about whether the MPP program is worth finishing" |

**Classification heuristic — autonomous vs. ask:**
- **Autonomous:** The note has a single clear action with no ambiguity about destination, timing, or interpretation. All relevant parameters (date, time, event name, project, etc.) are present or trivially inferrable.
- **Ask first:** The note could route multiple ways, contains personal/substantive content, touches encyclopedia data, or has missing parameters that require judgment rather than inference.

### 4. Todoist API Integration

**Authentication:** Bearer token via `$TODOIST_TOKEN` env var (already configured, per `reference_todoist.md`).

**Base URL:** `https://api.todoist.com/api/v1/`

**Required operations:**
- List projects (to find/verify Claude Inbox project ID)
- Get tasks in a project (filter by project ID, incomplete only)
- Get task comments (to retrieve file attachments)
- Add a comment to a task (for re-presentation guard)
- Complete a task
- Create a task (for routing to-dos to other projects)

**Project identification:** On first run, locate the "Claude Inbox" project by name and cache the project ID. If the project doesn't exist, create it. If the project is deleted while tasks exist, recreate it (orphaned tasks from the deleted project are unrecoverable).

**File attachments:** Todoist REST API v1 returns file attachments in comments as URLs. The processor downloads these URLs to process them. Supported file types for content extraction: images (PNG, JPG, GIF, WebP) and PDFs (via Claude's native PDF reading capability — no additional library needed). All other file types are noted in the summary but not processed for content.

**Error handling:** If the Todoist API or gws is unreachable during processing, the processor reports the failure and exits. Incomplete tasks remain in the inbox and will be processed on the next successful session. No partial processing — if the API fails mid-batch, tasks that were already acted on are completed, but remaining tasks are left for the next run.

### 5. Deprecations

The Mid-Day Notes system is fully deprecated:

| Component | Action |
|-----------|--------|
| `Mid-Day Notes.docx` at `gdrive:Claude/The Journal/Misc. Entries and Information/` | No longer written to or read from |
| Mid-Day Notes Archive folder | Preserved (historical), no longer written to |
| Journaling-assistant Step 1b: read and triage Mid-Day Notes into 3 categories | Remove the Mid-Day Notes reading and triage. The rest of Step 1b (reading Open Threads & Goals, staleness check) is unchanged. |
| Journaling-assistant Steps 2-4: mid-day notes weaving | Remove only the mid-day notes weaving from these steps. The steps themselves (Day Overview, Domain Coverage, Threads & Goals check-in) remain fully intact. |
| Journaling-assistant Step 9: archive and clear Mid-Day Notes | Remove entirely |
| Encyclopedia-update Step 3b: read Mid-Day Notes as source | Remove. Also remove the "Mid-Day Notes authority" mandate and the `python-docx` dependency entirely (Mid-Day Notes is the only reason it exists in this spec). |
| Journaling-assistant mandates re: Mid-Day Notes (archive before clear, don't archive if empty, categories not shown to user) | Remove |
| Journaling-assistant `python-docx` dependency | Remove entirely (Mid-Day Notes is the only reason it exists in this spec). |

**What replaces Mid-Day Notes in the journal flow:**
- The journaling assistant already reads Open Threads & Goals at session start (Step 1b) and surfaces unaddressed threads during the session. Reflections and journal-worthy content captured via the inbox will appear as new threads, naturally integrating into the existing journal flow without any Mid-Day Notes mechanism.

### 6. Integration Points

**Session-start mechanism:** A SessionStart hook injects a prompt that directs Claude to invoke the inbox-processor skill. This is the same pattern used by `session-start.sh` — a hook that runs at session start and produces output that Claude acts on. The skill invocation happens within the conversation, allowing interactive presentation of ambiguous items.

**Encyclopedia-update:** Durable facts route through the existing encyclopedia-update skill with the mandatory approval gate. The inbox processor invokes encyclopedia-update with the specific facts to route, not the raw note text.

**Google Calendar:** Events are created via `gws calendar events create`. The processor determines the appropriate calendar from context (Work Events, Social Events, Appointments, etc.) or asks if ambiguous.

**Todoist task creation:** To-do items extracted from notes are created as tasks in the appropriate Todoist project (not Claude Inbox). Project selection uses context clues or asks if ambiguous.

**Open Threads & Goals:** Journal-worthy reflections are added as new threads to the Open Threads & Goals file, with a source attribution (e.g., "Source: Inbox note, 2026-03-14") and flagged for journal discussion. This follows the existing encyclopedia-update approval gate since Open Threads & Goals is one of the 8 modular files.

### 7. Spec & System Changes Required

| Target | Changes |
|--------|---------|
| `journaling-assistant` spec (v1.1) | Remove Mid-Day Notes from Steps 1b, 2-4 (weaving only), 9. Remove Mid-Day Notes mandates (archive before clear, don't archive if empty, categories not shown). Remove `python-docx` dependency entirely. Bump version. |
| `encyclopedia-update` spec (v1.1) | Remove Step 3b (Mid-Day Notes reading). Remove "Mid-Day Notes authority" mandate. Remove `python-docx` dependency entirely. Bump version. |
| `CLAUDE.md` | Add inbox-processor to skills table. Remove Mid-Day Notes references from Journaling System Paths. |
| `specs/INDEX.md` | Add inbox-processor entry. |
| `RESTORE.md` | Add inbox-processor skill entry. Note Todoist API dependency ($TODOIST_TOKEN). Remove Mid-Day Notes references. |
| `git-sync.sh` / `session-start.sh` | No changes needed — `*/skills/*` pattern already covers new skill files. |
| `backup-system.md` spec | No changes needed — no new tracked files outside `~/.claude/skills/`. |

### 8. Non-Goals

- Real-time processing (notes are batch-processed at session start, not as they arrive)
- Voice capture or transcription (Todoist handles this natively if the user chooses)
- Pre-categorization or structured input conventions
- Processing notes outside of Claude Code sessions
