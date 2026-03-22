# Inbox Processor v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the inbox processor skill from a classify-and-route model to an active resolver that uses Todoist MCP tools instead of curl.

**Architecture:** Single SKILL.md file rewrite with 7-phase processing flow. No new files created — the skill is a prompt-based instruction set, not executable code. Also updates the spec to v2.0 and adds a cross-skill contract to the journaling-assistant.

**Tech Stack:** Todoist MCP tools, `gws` CLI (calendar), `rclone` (Google Drive)

**Design spec:** `~/.claude/skills/inbox-processor/specs/2026-03-15-inbox-processor-v2-design.md`

---

## Chunk 1: Rewrite SKILL.md

### Task 1: Rewrite the inbox-processor SKILL.md

**Files:**
- Modify: `~/.claude/skills/inbox-processor/SKILL.md`

This is the core change. The entire SKILL.md gets rewritten to reflect the v2 resolve model.

- [ ] **Step 1: Read the current SKILL.md and the v2 design spec**

Read both files to have full context:
- `~/.claude/skills/inbox-processor/SKILL.md`
- `~/.claude/skills/inbox-processor/specs/2026-03-15-inbox-processor-v2-design.md`

- [ ] **Step 2: Rewrite the SKILL.md frontmatter**

Update the description to reflect the resolve model:
```yaml
---
name: inbox-processor
description: >
  Checks a dedicated Todoist project ("Claude's Inbox") for unprocessed notes captured
  from Destin's phone. Actively resolves items — answering questions, making small changes,
  applying feedback, creating tasks, deleting noise — rather than just classifying and
  presenting. Uses Todoist MCP tools. Meta-feedback is applied first, then all items are
  presented in a resolution table for approval before execution. Rants are queued for
  end-of-session journaling. Use this skill when the session-start hook detects inbox items,
  or when Destin says "check my inbox", "process my notes", or "what's in my inbox".
---
```

- [ ] **Step 3: Write the Purpose and Dependencies sections**

Replace the old Purpose and API Reference sections. Remove all curl/REST API references. New dependencies:
- Todoist MCP tools (find-projects, find-tasks, find-comments, add-tasks, complete-tasks, add-comments, delete-object, add-sections, find-sections)
- `gws` CLI for Google Calendar (design decision: not Google Calendar MCP)
- `rclone` with `gdrive:` remote for encyclopedia files
- Note: `$TODOIST_TOKEN` still needed for `check-inbox.sh` hook but NOT used by this skill

- [ ] **Step 4: Write the Classification Categories table**

Transcribe the 10-category table from the design spec (lines 14-25), including the Classification Boundary Rules section (lines 27-31). This replaces the old 4-row routing table.

- [ ] **Step 5: Write Phase 1 — Ingest**

Replace Steps 1-4 of v1. New flow:
If no processable tasks remain after filtering (empty inbox, all skipped by guards), report "Inbox is clear" (plus parked items count if any) and exit.

1. Find Claude's Inbox project via `find-projects` search="Claude's Inbox"
2. Find or create "Claude Tasks" section via `find-sections` then `add-sections` if missing
3. Fetch all incomplete tasks via `find-tasks` projectId=<ID> limit=100
4. Identify which tasks are in the Claude Tasks section (by sectionId) — exclude them from processing, count them for the "Parked Items" summary
5. For remaining tasks, fetch comments via `find-comments` — check for `[presented: YYYY-MM-DD]` (today's date) or `[queued-for-journal: YYYY-MM-DD]` markers; skip those
6. Process attachments (images via vision, PDFs via native reader) — use curl to download file_url to /tmp/
7. Read all entries before any action, newest to oldest

- [ ] **Step 6: Write Phase 2 — Classify & Extract Meta-Feedback**

Classify every entry into the 10 categories. Extract meta-feedback items regardless of position. Apply boundary rules.

- [ ] **Step 7: Write Phase 3 — Apply Meta-Feedback**

Present proposed meta-feedback changes with:
- Which files/specs/memories would change
- What the change would be
- Wait for Destin's approval
- Apply changes
- Note: if no meta-feedback items exist, skip this phase silently

- [ ] **Step 8: Write Phase 4 — Build Resolution Plan**

For each remaining item in priority order:
1. Small feature requests — identify the change, which files it touches, and prepare the implementation
2. Research questions — actually do the research, prepare a concise answer
3. Document updates — identify the spec/file and the proposed change
4. Todoist tasks — identify the target project via `find-projects`, prepare `add-tasks` params
5. Calendar events — identify calendar via mapping table (keep from v1), prepare `gws` command
6. Encyclopedia facts — prepare the proposed update for encyclopedia-update skill
7. Unresolvable — prepare a recommendation: Claude Tasks section, Open Thread, leave in inbox, or delete
8. Noise — flag for deletion
9. Rants/reflections — flag for end-of-session journaling (always listed last in the resolution table; their execution — queuing via comment — happens after all other items are executed in Phase 6)

Include the calendar mapping table from v1 (Work Events, Social Events, Appointments, Bri's Schedule, School Events, Family, default → Appointments).

- [ ] **Step 9: Write Phase 5 — Present Resolution Table**

Single table with columns: #, Entry (truncated original text), Category, Proposed Action.
- Meta-feedback items shown as already applied (from Phase 3)
- Research answers shown inline in the Proposed Action column
- User approves, tweaks individual items, or rejects
- After the table, show: "X items parked in Claude Tasks" if any

- [ ] **Step 10: Write Phase 6 — Execute**

For each approved item:
- Calendar events: `gws calendar events create` (same syntax as v1)
- Todoist tasks: `add-tasks` MCP tool
- Encyclopedia facts: invoke `encyclopedia-update` skill (approval gate applies)
- Small features: implement the change
- Document updates: apply the change
- Unresolvable → Claude Tasks: move task to Claude Tasks section (Todoist MCP doesn't support moving between sections directly — create new task in section via `add-tasks` with sectionId, preserving the original task's content and description, then `complete-tasks` the original)
- Noise: `delete-object` type="task" id=<taskId>
- Rants: `add-comments` with `[queued-for-journal: YYYY-MM-DD]`
- Deferred items: `add-comments` with `[presented: YYYY-MM-DD]`
- All resolved items: `complete-tasks`

Per-item error handling: if one item fails, report the error, continue with remaining items.

- [ ] **Step 11: Write the Tone and Error Handling sections**

Tone (keep from v1): Direct and brief. No affirmations. Status report style.
Error handling: per-item, not all-or-nothing. Report failures, continue processing.

- [ ] **Step 12: Verify the rewritten SKILL.md**

Read back the full SKILL.md and verify:
- No curl commands remain (except for attachment downloads which is still needed)
- All 10 classification categories present
- All 7 phases present (Phase 7 is the cross-skill rant handoff, documented but executed by journaling skill)
- Calendar mapping table preserved
- Re-presentation guard logic correct
- Claude Tasks section handling correct

---

## Chunk 2: Update Spec and Cross-Skill Contract

### Task 2: Update the inbox-processor spec to v2.0

**Files:**
- Modify: `~/.claude/skills/inbox-processor/specs/spec.md`

- [ ] **Step 1: Read the current spec**

Read `~/.claude/skills/inbox-processor/specs/spec.md`

- [ ] **Step 2: Update spec to v2.0**

Major changes:
- Version: 1.0 → 2.0
- Purpose: update to reflect resolve model
- Add new mandates:
  - **(2026-03-15)** Meta-feedback applied first: Meta-feedback items are always processed before other categories.
  - **(2026-03-15)** Resolution table approval: All non-meta-feedback items are presented in a resolution table for approval before execution.
  - **(2026-03-15)** Todoist MCP only: All Todoist operations use MCP tools, not curl/REST API (except check-inbox.sh hook).
- Update Design Decisions table:
  - Add: "Todoist MCP over curl" — Rationale: MCP tools are native, no token management in skill, consistent with other MCP usage
  - Add: "gws CLI over Google Calendar MCP" — Rationale: gws is proven, provides more control over calendar selection and event formatting
  - Add: "Resolve model over route model" — Rationale: most inbox items are things Claude can act on; routing just defers work
  - Add: "Claude Tasks section for unresolvable" — Rationale: prevents inbox from becoming a permanent parking lot; dedicated section separates active inbox from parked items
  - Add: "Newest-to-oldest processing order" — Rationale: newer notes more likely to supersede older ones
  - Update: "Four routing destinations" → "Ten classification categories" with rationale
- Update Dependencies: remove curl for Todoist, add Todoist MCP tools, keep $TODOIST_TOKEN for hook only
- Update Integration Points: add journaling-assistant cross-skill contract, note OT&G routing change
- Add changelog entry: 2026-03-15, v2.0, architectural shift from classify-and-route to resolve model

- [ ] **Step 3: Verify spec update**

Read back spec.md and confirm version is 2.0, all mandates present, design decisions updated.

### Task 3: Update the journaling-assistant SKILL.md with cross-skill contract

**Files:**
- Modify: `~/.claude/skills/journaling-assistant/SKILL.md`

- [ ] **Step 1: Read the full journaling-assistant SKILL.md**

Read `~/.claude/skills/journaling-assistant/SKILL.md` to find the right insertion point.

- [ ] **Step 2: Add inbox rant pickup to the journaling skill**

Add a new section (or integrate into the existing session-start flow) that:
1. At the start of a journaling session, check Claude's Inbox for tasks with `[queued-for-journal: YYYY-MM-DD]` comments via `find-tasks` + `find-comments`
2. Present queued rants as available topics: "You have X queued rants from your inbox — want to include any in today's session?"
3. After a rant is journaled, complete the original inbox task via `complete-tasks`

This should use Todoist MCP tools (not curl), consistent with the inbox processor v2 migration.

- [ ] **Step 3: Verify the journaling skill update**

Read back the modified section and confirm it references the correct MCP tools and comment markers.

### Task 4: Update the inbox-processor skill description in CLAUDE.md

**Files:**
- Modify: `~/.claude/CLAUDE.md`
- Modify: `~/CLAUDE.md`

- [ ] **Step 1: Read both CLAUDE.md files**

Read `~/.claude/CLAUDE.md` and `~/CLAUDE.md` to find the inbox-processor description in the skills table.

- [ ] **Step 2: Update the inbox-processor description**

In both files, update the skills table entry for `inbox-processor`:
- Old: "Processes Todoist 'Claude's Inbox' notes — routes to calendar, encyclopedia, Todoist, Open Threads"
- New: "Processes Todoist 'Claude's Inbox' notes — actively resolves items (answers questions, makes changes, creates tasks, queues rants for journaling)"

- [ ] **Step 3: Verify CLAUDE.md updates**

Read back both files and confirm the description is updated.

---

## Chunk 3: Spec Index and Final Verification

### Task 5: Update specs INDEX.md

**Files:**
- Modify: `~/.claude/specs/INDEX.md`

- [ ] **Step 1: Read the specs index**

Read `~/.claude/specs/INDEX.md`

- [ ] **Step 2: Update inbox-processor entry**

Update the version number to 2.0 and add the v2 design spec reference if not already listed.

- [ ] **Step 3: Verify index update**

Read back and confirm.

### Task 6: System Change Checklist

Per CLAUDE.md, significant skill changes require working through the checklist.

**Files:**
- Check: `~/.claude/RESTORE.md`
- Check: `~/.claude/projects/C--Users-desti/memory/reference_todoist.md`

- [ ] **Step 1: Check RESTORE.md for inbox-processor references**

Read `~/.claude/RESTORE.md`. If it mentions the inbox processor's curl/REST API dependency or `$TODOIST_TOKEN` as a skill dependency, update to note the skill now uses Todoist MCP tools (token still needed for `check-inbox.sh` hook only).

- [ ] **Step 2: Check reference_todoist.md memory file**

Read `~/.claude/projects/C--Users-desti/memory/reference_todoist.md`. If it references the inbox processor using the REST API directly, add a note that the inbox-processor skill now uses Todoist MCP tools instead.

- [ ] **Step 3: Grep for stale curl/REST API references**

Search `~/.claude/skills/inbox-processor/` for any remaining references to `curl`, `api.todoist.com`, or `$TODOIST_TOKEN` that shouldn't be there. The only acceptable curl usage is for downloading attachments (file_url). The only acceptable `$TODOIST_TOKEN` reference is the note that it's needed for `check-inbox.sh` only.

- [ ] **Step 4: Verify no backup system changes needed**

The backup system's `*/skills/*` pattern already covers all inbox-processor files. No hook changes needed since no new tracked files are introduced outside `~/.claude/skills/`.

### Task 7: Final verification pass

- [ ] **Step 1: Read the completed SKILL.md one more time**

Full read of `~/.claude/skills/inbox-processor/SKILL.md` — confirm no curl Todoist commands, all phases present, all categories present.

- [ ] **Step 2: Read the completed spec.md one more time**

Full read of `~/.claude/skills/inbox-processor/specs/spec.md` — confirm v2.0, all mandates, all design decisions.

- [ ] **Step 3: Read the journaling-assistant modification**

Confirm the cross-skill contract section is present and uses MCP tools.

- [ ] **Step 4: Spot-check CLAUDE.md**

Confirm inbox-processor description updated in both CLAUDE.md files.
