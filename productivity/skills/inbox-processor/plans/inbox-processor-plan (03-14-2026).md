# Inbox Processor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Superseded by inbox-processor-v2-plan (03-15-2026).md

**Goal:** Build a Todoist-based inbox processor skill that checks for unprocessed notes each session, routes them to the appropriate system (calendar, encyclopedia, Todoist, Open Threads), and deprecates the Mid-Day Notes system.

**Architecture:** A SKILL.md file defines the inbox-processor skill with instructions for checking a "Claude's Inbox" Todoist project, classifying notes, routing them, and completing tasks. A SessionStart hook triggers the skill each session. Existing journaling-assistant and encyclopedia-update skills are modified to remove Mid-Day Notes references.

**Tech Stack:** Todoist REST API v1 (`https://api.todoist.com/api/v1/`), `gws` CLI for Google Calendar, `rclone` for Google Drive, `curl` for API calls.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `~/.claude/skills/inbox-processor/SKILL.md` | New skill — inbox processing logic, routing table, API commands |
| `~/.claude/skills/inbox-processor/specs/spec.md` | New spec — mandates, design decisions (derived from design doc) |
| `~/.claude/hooks/check-inbox.sh` | New SessionStart hook — checks Todoist inbox and injects prompt |
| `~/.claude/skills/journaling-assistant/SKILL.md` | Modified — remove Mid-Day Notes from Steps 1b, 2-4, 7, 9 |
| `~/.claude/skills/journaling-assistant/specs/spec.md` | Modified — remove Mid-Day Notes mandates and design decisions |
| `~/.claude/skills/encyclopedia-update/SKILL.md` | Modified — remove Step 3b and Mid-Day Notes references |
| `~/.claude/skills/encyclopedia-update/specs/spec.md` | Modified — remove Mid-Day Notes mandate and python-docx dep |
| `~/.claude/CLAUDE.md` | Modified — add inbox-processor skill, remove Mid-Day Notes paths |
| `~/CLAUDE.md` | Modified — mirror changes from `~/.claude/CLAUDE.md` |
| `~/.claude/specs/INDEX.md` | Modified — add inbox-processor entry |
| `~/.claude/RESTORE.md` | Modified — add inbox-processor, remove Mid-Day Notes refs |
| `~/.claude/settings.json` | Modified — register check-inbox.sh as SessionStart hook |

---

## Chunk 1: Core Skill & Hook

### Task 1: Create the inbox-processor SKILL.md

**Files:**
- Create: `~/.claude/skills/inbox-processor/SKILL.md`

- [ ] **Step 1: Write the SKILL.md file**

```markdown
---
name: inbox-processor
description: >
  Checks a dedicated Todoist project ("Claude's Inbox") for unprocessed notes captured
  from Destin's phone. Routes notes to the appropriate system: calendar events via gws,
  Todoist tasks to other projects, encyclopedia facts via encyclopedia-update, and
  journal-worthy reflections to Open Threads & Goals. Autonomous for obvious actions,
  asks for ambiguous ones. Use this skill when the session-start hook detects inbox items,
  or when Destin says "check my inbox", "process my notes", or "what's in my inbox".
---

# Inbox Processor

## Purpose

This skill processes notes captured in a dedicated Todoist project ("Claude's Inbox") and routes them to the appropriate system. Destin captures thoughts, events, facts, and screenshots on his phone throughout the day via Todoist. This skill reads those notes each session and acts on them.

## API Reference

**Base URL:** `https://api.todoist.com/api/v1/`
**Auth:** `Authorization: Bearer $TODOIST_TOKEN` (token in `~/.bash_profile`)

**Key endpoints:**
- `GET /projects` — list projects (find Claude's Inbox by name)
- `POST /projects` — create project (if Claude's Inbox doesn't exist)
- `GET /tasks?project_id=<ID>` — get incomplete tasks in project
- `GET /comments?task_id=<ID>` — get comments (with file attachments)
- `POST /comments` — add comment to task (for re-presentation guard)
- `POST /tasks/<ID>/close` — close/complete a task
- `POST /tasks` — create a new task (for routing to other projects)

---

## Processing Flow

### Step 1: Find or Create the Claude's Inbox Project

```bash
curl -s "https://api.todoist.com/api/v1/projects" \
  -H "Authorization: Bearer $TODOIST_TOKEN"
```

Search the results for a project named "Claude's Inbox". If not found, create it:

```bash
curl -s -X POST "https://api.todoist.com/api/v1/projects" \
  -H "Authorization: Bearer $TODOIST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Claude's Inbox"}'
```

### Step 2: Pull Incomplete Tasks

```bash
curl -s "https://api.todoist.com/api/v1/tasks?project_id=<PROJECT_ID>" \
  -H "Authorization: Bearer $TODOIST_TOKEN"
```

If the response contains no results (empty `results` array), exit silently — nothing to process.

Sort tasks by `added_at` (oldest first).

### Step 2b: Read All Before Acting

**IMPORTANT:** Read ALL inbox entries (including their comments and attachments) before acting on any single entry. Entries may conflict, overlap, or add context to one another. For example, a later note may correct an earlier one, or two notes together may describe a single event. Only after the full picture is assembled should classification and routing begin (Step 5).

### Step 3: Re-presentation Guard

For each task, check its comments for a `[presented: YYYY-MM-DD]` marker matching today's date:

```bash
curl -s "https://api.todoist.com/api/v1/comments?task_id=<TASK_ID>" \
  -H "Authorization: Bearer $TODOIST_TOKEN"
```

If a comment contains `[presented: <today's date>]`, skip this task. It was already shown to Destin today and he didn't act on it.

### Step 4: Process Attachments

For each task comment that has an `attachment` field (non-null):
- If `file_type` starts with `image/` → download the `file_url` and use Claude's vision to describe content, extract text, facts, dates
- If `file_type` is `application/pdf` → download and read with Claude's native PDF capability
- For all other types → note the attachment exists but skip content extraction; include a notice in the summary

Download attachments via:
```bash
curl -s -o /tmp/inbox-attachment.<ext> "<file_url>"
```

### Step 5: Classify and Route

Now that all entries have been read (per Step 2b), classify each note using this routing table. Consider cross-entry context — later notes may supersede earlier ones, and multiple notes may describe a single event or fact:

| Note type | Destination | Autonomy |
|-----------|-------------|----------|
| Events, appointments, concerts | Google Calendar via `gws calendar events create` | Autonomous if date/time/event are clear; ask if ambiguous |
| Tasks, to-dos, reminders | Todoist task in appropriate project | Autonomous |
| Facts, preferences, people info | Encyclopedia-update skill (approval gate) | Ask first |
| Reflections, realizations, journal-worthy | Open Threads & Goals (new thread) | Ask first |

**Autonomous classification (act without asking):**
- The note has a single clear action with no ambiguity
- All relevant parameters (date, time, event name, project) are present or trivially inferrable
- Examples: "Concert at Crescent Ballroom Saturday 8pm", "Need to call dentist Monday"

**Ask first:**
- Note could route multiple ways
- Contains personal/substantive content
- Touches encyclopedia data
- Has missing parameters requiring judgment
- Examples: "Bri's favorite restaurant is now Postino", "Been thinking about whether the MPP program is worth finishing"

### Step 6: Execute Actions

**Calendar events:**
```bash
gws calendar events create --params '{"calendarId": "<CALENDAR_ID>"}' \
  --json '{"summary": "<EVENT>", "start": {"dateTime": "<START>"}, "end": {"dateTime": "<END>"}}'
```

Use `gws calendar list-calendars` to identify the right calendar if needed. Calendar mapping:
- Work events → Work Events calendar
- Social/concerts/friends → Social Events calendar
- Appointments (dentist, doctor) → Appointments calendar
- Bri's stuff → Bri's Schedule calendar
- School → School Events calendar
- Family → Family calendar
- Default → Appointments calendar

**Todoist tasks:**
```bash
curl -s -X POST "https://api.todoist.com/api/v1/tasks" \
  -H "Authorization: Bearer $TODOIST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "<TASK>", "project_id": "<TARGET_PROJECT_ID>", "due_string": "<DATE>"}'
```

**Encyclopedia facts:**
Invoke the `encyclopedia-update` skill with the specific facts to route. The approval gate per CLAUDE.md applies — present proposed changes and wait for Destin's approval.

**Open Threads & Goals:**
Read the current Open Threads & Goals file, add a new thread with source attribution:
```
| <Thread description> | Inbox note, YYYY-MM-DD | YYYY-MM-DD | YYYY-MM-DD | Open — needs context |
```
Present the proposed addition for Destin's approval before writing (per CLAUDE.md modular files update policy).

### Step 7: Complete Processed Tasks

For each task that was fully acted on:
```bash
curl -s -X POST "https://api.todoist.com/api/v1/tasks/<TASK_ID>/close" \
  -H "Authorization: Bearer $TODOIST_TOKEN"
```

### Step 8: Mark Ambiguous Tasks as Presented

For ambiguous tasks that were shown to Destin but not resolved (he moved on to something else), add a comment:

```bash
curl -s -X POST "https://api.todoist.com/api/v1/comments" \
  -H "Authorization: Bearer $TODOIST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"task_id": "<TASK_ID>", "content": "[presented: YYYY-MM-DD]"}'
```

### Step 9: Present Summary

After all processing, present a brief summary:
- Actions taken autonomously (calendar events created, tasks moved)
- Items that need Destin's input (encyclopedia facts, reflections, ambiguous items)
- Any skipped attachments or errors

---

## Error Handling

- If the Todoist API is unreachable, report the failure and exit. Tasks remain in the inbox for next session.
- If gws is unreachable for calendar creation, report which events couldn't be created. Leave those tasks incomplete.
- Tasks that were already acted on before the error are completed. Remaining tasks are left for next run.

---

## Tone

Direct and brief. No affirmations. Present findings like a status report:
- "Found 3 notes in your inbox. Created a calendar event for [X]. Two items need your input: [Y] and [Z]."
```

- [ ] **Step 2: Verify the skill file was created and reads correctly**

Run: Read the file and confirm it's well-formed.

- [ ] **Step 3: Commit**

This is not a git repo — no commit needed. Backup happens via hook.

---

### Task 2: Create the SessionStart hook

**Files:**
- Create: `~/.claude/hooks/check-inbox.sh`
- Modify: `~/.claude/settings.json` (or `~/.claude/settings.local.json`)

- [ ] **Step 1: Read the existing settings file to understand hook registration**

```bash
cat ~/.claude/settings.json
cat ~/.claude/settings.local.json 2>/dev/null
```

Also read `session-start.sh` to understand the existing SessionStart hook pattern.

- [ ] **Step 2: Write the check-inbox.sh hook**

```bash
#!/bin/bash
# SessionStart hook: checks Todoist "Claude's Inbox" for unprocessed notes.
# If notes exist, outputs a prompt directing Claude to invoke the inbox-processor skill.

# Source token from bash_profile (not hardcoded — this file is backed up to Drive)
TODOIST_TOKEN="${TODOIST_TOKEN:-$(grep 'TODOIST_TOKEN' ~/.bash_profile 2>/dev/null | sed 's/.*="\(.*\)"/\1/')}"
if [ -z "$TODOIST_TOKEN" ]; then
    exit 0  # No token available
fi
API_BASE="https://api.todoist.com/api/v1"

# Find the Claude's Inbox project
PROJECTS=$(curl -s "$API_BASE/projects" -H "Authorization: Bearer $TODOIST_TOKEN" 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$PROJECTS" ]; then
    exit 0  # Silent exit if API unreachable
fi

PROJECT_ID=$(echo "$PROJECTS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('results', []):
    if p.get('name') == 'Claude's Inbox':
        print(p['id'])
        break
" 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
    exit 0  # No Claude's Inbox project exists yet
fi

# Check for incomplete tasks
TASKS=$(curl -s "$API_BASE/tasks?project_id=$PROJECT_ID" -H "Authorization: Bearer $TODOIST_TOKEN" 2>/dev/null)
TASK_COUNT=$(echo "$TASKS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(len(data.get('results', [])))
" 2>/dev/null)

if [ "$TASK_COUNT" = "0" ] || [ -z "$TASK_COUNT" ]; then
    exit 0  # No tasks to process
fi

echo "[Inbox] $TASK_COUNT note(s) in Claude's Inbox. Invoke the inbox-processor skill to process them."
```

- [ ] **Step 3: Make the hook executable**

```bash
chmod +x ~/.claude/hooks/check-inbox.sh
```

- [ ] **Step 4: Register the hook in settings**

Read the current settings file, then add the SessionStart hook for `check-inbox.sh`. The hook should be registered alongside the existing `session-start.sh` SessionStart hook.

The settings format uses a nested structure with `matcher` and inner `hooks` array. The existing SessionStart entry looks like this:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/session-start.sh"
          }
        ]
      }
    ]
  }
}
```

Add a second entry to the `SessionStart` array (after the session-start entry):

```json
{
  "matcher": "startup",
  "hooks": [
    {
      "type": "command",
      "command": "bash C:/Users/desti/.claude/hooks/check-inbox.sh"
    }
  ]
}
```

- [ ] **Step 5: Test the hook manually**

```bash
bash ~/.claude/hooks/check-inbox.sh
```

Expected: Either silent exit (no inbox/no tasks) or a message like `[Inbox] N note(s) in Claude's Inbox...`

---

### Task 3: Create the inbox-processor spec

**Files:**
- Create: `~/.claude/skills/inbox-processor/specs/spec.md`

- [ ] **Step 1: Write the spec file**

Derive from the design doc at `~/.claude/skills/inbox-processor/specs/2026-03-14-inbox-processor-design.md`. The spec should follow the format of existing specs (e.g., journaling-assistant/specs/spec.md):
- Version: 1.0
- Purpose section
- User Mandates (with dates)
- Design Decisions table (with rationale and alternatives)
- Current Implementation summary

Key mandates to include:
- Encyclopedia approval gate applies to all fact routing
- Open Threads & Goals approval gate applies to all reflection routing
- Autonomous actions only for unambiguous single-destination notes
- Re-presentation guard: don't re-show same-day skipped notes
- Error handling: report and exit, don't partial-process

Key design decisions:
- Todoist project as inbox (vs. Keep, Drive folder)
- Unlabeled = unprocessed signal (vs. explicit label)
- Session-start check every session (vs. throttled/timed)
- Todoist comments for re-presentation state (vs. local marker file)
- Four routing destinations (calendar, Todoist, encyclopedia, Open Threads)

- [ ] **Step 2: Verify the spec reads correctly**

---

## Chunk 2: Deprecate Mid-Day Notes

### Task 4: Update journaling-assistant SKILL.md

**Files:**
- Modify: `~/.claude/skills/journaling-assistant/SKILL.md`

- [ ] **Step 1: Read the full current SKILL.md**

Read the entire file to identify all Mid-Day Notes references.

- [ ] **Step 2: Remove Mid-Day Notes from Step 1b**

Remove the entire "Mid-Day Notes" subsection from Step 1b (lines ~63-82 in current file), including:
- The `.docx` reading commands (bash and web)
- The 3-category triage logic
- The "If the Mid-Day Notes document is empty or missing" line

Keep the rest of Step 1b intact (Open Threads & Goals reading, staleness check, session opening).

- [ ] **Step 3: Remove Mid-Day Notes weaving from Steps 2-4**

In Step 2: Remove the paragraph about weaving category-1 mid-day follow-up items (~line 92).

In Step 3: Remove the paragraph about mid-day follow-up items not yet covered (~line 100-101) and the "Remaining mid-day follow-up items" paragraph (~line 118).

In Step 7 (Calendar): Remove the reference to "mid-day notes calendar candidates (category 2 from Step 1b)" from the intro paragraph (~line 235). Remove "mid-day notes" references from the workflow section (~line 249).

- [ ] **Step 4: Remove Step 9 entirely**

Delete the entire Step 9 section (archive and clear Mid-Day Notes, ~lines 293-328).

- [ ] **Step 5: Add a closing confirmation line after encyclopedia update**

After removing Step 9, the session closing confirmation ("confirm to Destin that the entry, encyclopedia system, and mid-day notes are all handled") is gone. Add a brief closing line at the end of Step 8 (encyclopedia update invocation) or wherever the daily entry flow ends:

```
After the encyclopedia update completes, confirm to Destin that the entry and encyclopedia system are handled. Do not add affirmations or "great session" language — keep it neutral and brief.
```

- [ ] **Step 6: Edit the Step 1b intro paragraph (line 49)**

(Note: "and the Mid-Day Notes document" reference in opening sentence)

Change:
```
Read the Open Threads and Goals document and the Mid-Day Notes document to load current context into the session. Both threads/goals and mid-day notes are used throughout Steps 2–7.
```
To:
```
Read the Open Threads and Goals document to load current context into the session. Threads/goals are used throughout Steps 2–7.
```

- [ ] **Step 7: Grep for any remaining Mid-Day Notes references**

```bash
grep -ni "mid-day\|mid_day\|midday" ~/.claude/skills/journaling-assistant/SKILL.md
```

Expected: No results. If any remain, remove them.

- [ ] **Step 8: Verify the modified file reads correctly**

Read back the modified sections to confirm they flow naturally without Mid-Day Notes references.

---

### Task 5: Update journaling-assistant spec

**Files:**
- Modify: `~/.claude/skills/journaling-assistant/specs/spec.md`

- [ ] **Step 1: Read the full spec**

- [ ] **Step 2: Remove Mid-Day Notes mandates**

Remove these mandates:
- "(2026-03-13) Mid-Day Notes: archive before clearing."
- "(2026-03-13) Mid-Day Notes: do not archive or clear if empty/missing."
- "(2026-03-13) Mid-day notes categories must not be shown to Destin."

- [ ] **Step 3: Update the Purpose section**

Remove "archiving/clearing mid-day notes" and any other Mid-Day Notes references from the purpose description. The purpose should describe only the remaining responsibilities (journaling, Open Threads reading, calendar events, encyclopedia update invocation).

- [ ] **Step 4: Update Design Decisions table**

Remove the "Mid-Day Notes triage into 3 categories" row and the "Archive Mid-Day Notes with date-stamped filename before clearing" row.

- [ ] **Step 5: Remove python-docx dependency**

Remove python-docx from the dependencies section. This is a definitive removal — python-docx was only needed for Mid-Day Notes `.docx` extraction, which is now fully deprecated.

- [ ] **Step 6: Update Current Implementation section**

Update the Current Implementation summary to remove references to Mid-Day Notes processing (Step 1b triage, Step 9 archive/clear, category weaving in Steps 2-4, calendar candidates in Step 7). The summary should reflect the post-deprecation flow.

- [ ] **Step 7: Bump version to 1.2, add changelog entry**

Bump the `Version` field from `1.1` to `1.2`. Add a changelog entry to the Change Log table:

```
| 2026-03-14 | 1.2 | Removed Mid-Day Notes system (Steps 1b, 2-4 weaving, 7 calendar candidates, 9). Mid-Day Notes replaced by inbox-processor skill routing to Open Threads & Goals. Removed python-docx dependency. Removed 3 Mid-Day Notes mandates and 2 design decisions. | Deprecation | Destin |
```

---

### Task 6: Update encyclopedia-update SKILL.md

**Files:**
- Modify: `~/.claude/skills/encyclopedia-update/SKILL.md`

- [ ] **Step 1: Read the full SKILL.md**

- [ ] **Step 2: Remove Step 3b (Mid-Day Notes reading)**

Delete the entire Step 3b section (~lines 135-144), including the python-docx reading command and the authority statement.

- [ ] **Step 3: Remove Mid-Day Notes references from other steps**

In Step 3: Remove "Skip the Mid-Day Notes document" instruction and "mid-day notes content in Step 3b" reference.

In Step 4: Remove "Also incorporate any substantive mid-day notes content from Step 3b."

In Step 6: Remove "and any mid-day notes" from the processing instruction.

In Step 6g (Open Threads & Goals): Remove "and any substantive mid-day notes" from the opening line.

In Full Rebuild: Remove "skip `Mid-Day Notes.docx`" instruction.

- [ ] **Step 4: Verify the modified file reads correctly**

---

### Task 7: Update encyclopedia-update spec

**Files:**
- Modify: `~/.claude/skills/encyclopedia-update/specs/spec.md`

- [ ] **Step 1: Read the full spec**

- [ ] **Step 2: Remove Mid-Day Notes mandate**

Remove: "(2026-03-13) Mid-Day Notes authority: Mid-day notes have the same authority as journal session statements..."

- [ ] **Step 3: Update Purpose section**

Remove "mid-day notes" from the list of sources in the purpose description.

- [ ] **Step 4: Remove python-docx dependency references**

Remove any python-docx dependency entries.

- [ ] **Step 5: Remove Mid-Day Notes design decisions**

Remove the design decision row about Mid-Day Notes being read as .docx via python3.

- [ ] **Step 6: Update Current Implementation section**

Update the Current Implementation summary to remove references to Step 3b (Mid-Day Notes reading), mid-day notes content in Step 4, and mid-day notes references in Step 6 processing. The summary should reflect the post-deprecation flow.

- [ ] **Step 7: Remove python-docx dependency**

Remove `python3` with `python-docx` library from the Dependencies section. This is a definitive removal — python-docx is no longer needed by any part of the encyclopedia-update skill.

- [ ] **Step 8: Bump version to 1.2, add changelog entry**

Bump the `Version` field from `1.1` to `1.2`. Add a changelog entry to the Change Log table:

```
| 2026-03-14 | 1.2 | Removed Mid-Day Notes system (Step 3b). Mid-Day Notes replaced by inbox-processor skill. Removed "Mid-Day Notes authority" mandate. Removed python-docx dependency. Removed Mid-Day Notes design decision. | Deprecation | Destin |
```

---

## Chunk 3: System Updates

### Task 8: Update CLAUDE.md files

**Files:**
- Modify: `~/.claude/CLAUDE.md`
- Modify: `~/CLAUDE.md`

- [ ] **Step 1: Read both CLAUDE.md files**

- [ ] **Step 2: Add inbox-processor to the skills table**

Add row:
```
| `inbox-processor` | Processes Todoist "Claude's Inbox" notes — routes to calendar, encyclopedia, Todoist, Open Threads |
```

- [ ] **Step 3: Check for Mid-Day Notes references in CLAUDE.md**

Search both CLAUDE.md files for any explicit Mid-Day Notes references (grep for "mid-day", "Mid-Day Notes", "python-docx"). Remove any found. The Journaling System Paths section lists "Misc. Entries and Information" generically, which is fine — that folder still exists for other content.

- [ ] **Step 4: Apply same changes to ~/CLAUDE.md**

Mirror the changes from `~/.claude/CLAUDE.md`.

---

### Task 9: Update specs/INDEX.md

**Files:**
- Modify: `~/.claude/specs/INDEX.md`

- [ ] **Step 1: Add inbox-processor entry**

```
| Inbox Processor | skill | ~/.claude/skills/inbox-processor/specs/spec.md | 1.0 |
```

---

### Task 10: Update RESTORE.md

**Files:**
- Modify: `~/.claude/RESTORE.md`

- [ ] **Step 1: Read the current RESTORE.md**

- [ ] **Step 2: Add inbox-processor skill entry**

Add a section noting:
- Skill files at `~/.claude/skills/inbox-processor/`
- Dependency: `$TODOIST_TOKEN` env var in `~/.bash_profile`
- SessionStart hook: `~/.claude/hooks/check-inbox.sh`

- [ ] **Step 3: Remove Mid-Day Notes references**

If RESTORE.md mentions python-docx as a dependency for Mid-Day Notes, remove it.

---

### Task 11: Verify end-to-end

- [ ] **Step 1: Run the check-inbox hook manually**

```bash
bash ~/.claude/hooks/check-inbox.sh
```

Verify it either exits silently (no inbox) or reports the note count.

- [ ] **Step 2: Create a test note in Todoist**

```bash
# First, find or create the Claude's Inbox project
PROJECT_ID=$(curl -s "https://api.todoist.com/api/v1/projects" \
  -H "Authorization: Bearer $TODOIST_TOKEN" | \
  python3 -c "import sys,json; [print(p['id']) for p in json.load(sys.stdin)['results'] if p['name']=='Claude's Inbox']" 2>/dev/null)

# If no project, create it
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(curl -s -X POST "https://api.todoist.com/api/v1/projects" \
    -H "Authorization: Bearer $TODOIST_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name": "Claude's Inbox"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
fi

# Create a test task
curl -s -X POST "https://api.todoist.com/api/v1/tasks" \
  -H "Authorization: Bearer $TODOIST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"Test inbox note — concert at Crescent Ballroom Saturday 8pm\", \"project_id\": \"$PROJECT_ID\"}"
```

- [ ] **Step 3: Run the hook again**

```bash
bash ~/.claude/hooks/check-inbox.sh
```

Expected: `[Inbox] 1 note(s) in Claude's Inbox. Invoke the inbox-processor skill to process them.`

- [ ] **Step 4: Verify all modified files**

Read each modified file and confirm:
- No stale Mid-Day Notes references remain in journaling-assistant SKILL.md
- No stale Mid-Day Notes references remain in encyclopedia-update SKILL.md
- CLAUDE.md has the inbox-processor skill listed
- INDEX.md has the inbox-processor entry
- Both specs have been bumped to 1.2

- [ ] **Step 5: Grep for remaining Mid-Day Notes references**

```bash
grep -ri "mid-day\|mid_day\|midday\|Mid-Day Notes" ~/.claude/skills/ ~/.claude/CLAUDE.md ~/CLAUDE.md --include="*.md" | grep -v "specs/2026-03-14" | grep -v "Archive"
```

Expected: No results (except possibly the design doc and references to the archive folder being "preserved").
