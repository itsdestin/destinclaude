# Todoist Provider

**Platform:** all

Reads items from the configured Todoist project. This is the primary capture provider — most items arrive here from mobile captures.

All Todoist access uses MCP tools (`mcp__todoist__*`). Never use curl or the REST API directly.

## Configuration

Reads `inbox_provider_config.todoist.project_name` from `~/.claude/toolkit-state/config.json`. Default project name: `"Claude's Inbox"`.

## List

1. Call `find-projects` with search=`<project_name>`. If no project matches, report the provider as unavailable and skip it. If not found, do not create — the project must be configured by the user.

2. Call `find-sections` with projectId=`<project ID>`. Look for a section named `"Claude Tasks"`. If none exists, create it via `add-sections` with name=`"Claude Tasks"` and projectId=`<project ID>`. Record its section ID.

3. Call `find-tasks` with projectId=`<project ID>` and limit=100 to fetch all incomplete tasks.

4. Separate Claude Tasks items: identify tasks whose `sectionId` matches the Claude Tasks section ID. Exclude these from processing. Count them — this count is reported in the run summary as "X items parked in Claude Tasks."

5. For each remaining task, call `find-comments` with taskId=`<task ID>`. Check for:
   - A comment with text matching `[presented: YYYY-MM-DD]` where the date is today — skip this task (re-presentation guard: already shown today).
   - A comment with text matching `[queued-for-journal: YYYY-MM-DD]` — skip this task (already queued for journaling; the journaling skill handles it).

6. Return remaining tasks sorted by creation date, newest first.

## Read

1. Item content = task `content` field.
2. Item detail = task `description` field (may be empty).
3. Call `find-comments` for all comments — include them as additional context.
4. If any comment has an `attachment` field, note it as `"has Todoist attachment (not accessible)"`. Todoist file attachment URLs require web session cookies and cannot be downloaded programmatically. The actual file content should be in the Drive Inbox instead.

## Mark Processed

Resolved items (completed, task created, event created, spec updated, etc.) — call `complete-tasks` with the task ID.

Noise items — call `delete-object` with type=`"task"` and id=`<task ID>`.

Deferred items and rants — see Mark Presented below.

## Mark Presented

Call `add-comments` on the task with comment text: `[presented: YYYY-MM-DD]` (using today's date).

The task is NOT deleted or completed — it stays in the inbox and the re-presentation guard prevents it from appearing in the next same-day run.

## Claude Tasks Section

The Claude Tasks section is a parking area for items that cannot be resolved in the current run (classified as "Unresolvable" and routed to Claude Tasks by the user in Phase 4.5).

To park an item in Claude Tasks:
1. Create a new task via `add-tasks` with sectionId=`<Claude Tasks section ID>`, preserving the original content and description.
2. Complete the original inbox task via `complete-tasks`.

## Rant Queuing

Rants/reflections are not completed — they are marked with a `[queued-for-journal: YYYY-MM-DD]` comment via `add-comments`. The journaling skill picks these up and calls `complete-tasks` after journaling.
