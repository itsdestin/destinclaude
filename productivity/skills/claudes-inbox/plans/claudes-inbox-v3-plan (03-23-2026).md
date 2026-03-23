# Claude's Inbox v3.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the inbox-processor skill into a provider-agnostic "Claude's Inbox" system supporting 7 capture sources across macOS and Windows.

**Architecture:** Provider instruction files (`providers/*.md`) define source-specific ingest operations. The core SKILL.md reads config to determine enabled providers, ingests from each, normalizes items into a common model, then processes them through the existing classify/resolve/present/execute pipeline unchanged.

**Tech Stack:** Markdown skill files, bash hooks, Todoist MCP, Gmail MCP, rclone, osascript (macOS), `~/.claude/toolkit-state/config.json`

**Design doc:** `productivity/skills/inbox-processor/plans/claudes-inbox-v3-design (03-23-2026).md`

---

## File Map

### New Files (Create)

| File | Purpose |
|---|---|
| `productivity/skills/claudes-inbox/SKILL.md` | Core skill — provider-agnostic processing engine |
| `productivity/skills/claudes-inbox/providers/local.md` | Local staging dir provider |
| `productivity/skills/claudes-inbox/providers/todoist.md` | Todoist MCP provider |
| `productivity/skills/claudes-inbox/providers/google-drive.md` | Google Drive via rclone provider |
| `productivity/skills/claudes-inbox/providers/gmail.md` | Gmail MCP provider |
| `productivity/skills/claudes-inbox/providers/apple-notes.md` | Apple Notes via osascript provider (macOS) |
| `productivity/skills/claudes-inbox/providers/apple-reminders.md` | Apple Reminders via osascript provider (macOS) |
| `productivity/skills/claudes-inbox/providers/icloud-drive.md` | iCloud Drive local folder provider (macOS) |
| `productivity/skills/claudes-inbox/specs/claudes-inbox-spec.md` | v3.0 spec |
| `core/hooks/check-inbox.sh` | Session-start inbox count checker |

### Modify Files

| File | Change |
|---|---|
| `core/hooks/todo-capture.sh` | Rewrite to write local files instead of Todoist MCP |
| `life/skills/journaling-assistant/SKILL.md:65-84` | Add journal-queue directory check alongside Todoist check |
| `core/skills/setup-wizard/SKILL.md:365,492,991,1412` | Rename references + add capture source selection step |
| `core/specs/destinclaude-spec.md:93` | Rename inbox-processor → claudes-inbox |
| `core/specs/INDEX.md:26` | Update spec path and version |
| `core/specs/system-architecture-spec.md:95` | Update check-inbox.sh description |
| `core/commands/toolkit.md:15,46` | Rename inbox-processor → claudes-inbox |
| `life/skills/journaling-assistant/specs/journaling-assistant-spec.md` | Add journal-queue integration point |

### Move/Delete

| Action | Path |
|---|---|
| Preserve (read-only reference) | `productivity/skills/inbox-processor/` — keep old plans/specs as historical reference |
| Create new | `productivity/skills/claudes-inbox/` — new skill directory |
| Update symlink | `~/.claude/skills/inbox-processor` → `~/.claude/skills/claudes-inbox` |

---

## Task 1: Create Directory Structure & Local Provider

**Files:**
- Create: `productivity/skills/claudes-inbox/providers/local.md`
- Create: `productivity/skills/claudes-inbox/specs/.gitkeep`

This is the simplest provider and validates the provider file format before writing more complex ones.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p productivity/skills/claudes-inbox/providers
mkdir -p productivity/skills/claudes-inbox/specs
mkdir -p productivity/skills/claudes-inbox/plans
touch productivity/skills/claudes-inbox/specs/.gitkeep
```

- [ ] **Step 2: Write local provider file**

Create `productivity/skills/claudes-inbox/providers/local.md` with the full provider instruction content:

```markdown
# Local Staging Provider

**Platform:** all

Reads items from the local staging directory (`~/.claude/inbox/`). This provider is always enabled — it requires no external services and powers the `/todo` in-session capture hook.

## List

1. Check if `~/.claude/inbox/` exists. If not, return no items.
2. List all `.md` files in `~/.claude/inbox/` (not subdirectories — `journal-queue/`, `parked/`, and `state/` are managed by the core skill, not this provider).
3. For each file, parse the YAML frontmatter to extract `source`, `captured`, and `origin` fields.
4. Return items sorted by `captured` timestamp, newest first.

## Read

1. Read the full file content (everything after the YAML frontmatter `---` closing delimiter).
2. The content is plain text — the note body.
3. There are no attachments for local items (text only).

## Mark Processed

Delete the file:
```
rm ~/.claude/inbox/<filename>
```

## Mark Presented

Write the item's filename to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` (keyed by filename). On next List, check this file and skip entries found there. The original file is NOT deleted — deferred items stay in the inbox until the next day or until they are resolved.

## File Format

Local staging files use this format:

```
---
source: local
captured: 2026-03-23T14:30:00-07:00
origin: todo
---
The note content here
```

- `source` is always `local`
- `captured` is ISO 8601 with timezone
- `origin` is optional: `todo` for /todo hook captures, `manual` for manually placed files
```

- [ ] **Step 3: Verify file structure**

```bash
find productivity/skills/claudes-inbox -type f | sort
```

Expected:
```
productivity/skills/claudes-inbox/providers/local.md
productivity/skills/claudes-inbox/specs/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add productivity/skills/claudes-inbox/
git commit -m "feat(claudes-inbox): create directory structure and local provider"
```

---

## Task 2: Write Todoist Provider

**Files:**
- Create: `productivity/skills/claudes-inbox/providers/todoist.md`

The most complex provider — extracted from the current SKILL.md Phase 1 Todoist logic.

- [ ] **Step 1: Write todoist provider file**

Create `productivity/skills/claudes-inbox/providers/todoist.md`. Extract the Todoist-specific ingest instructions from the current `inbox-processor/SKILL.md` (lines 57-82) and restructure into the provider contract format:

- **Platform:** all
- **List:** `find-projects` for configured project name → `find-tasks` with projectId → separate Claude Tasks section items (count for summary, exclude from processing) → `find-comments` per task for re-presentation guard (`[presented: YYYY-MM-DD]` where date is today) and journal-queue guard (`[queued-for-journal: YYYY-MM-DD]`)
- **Read:** Task content + description + all comments. Note Todoist file attachment URLs as inaccessible.
- **Mark Processed:** `complete-tasks` for resolved items, `delete-object` for noise, `add-comments` for markers
- **Mark Presented:** `add-comments` with `[presented: YYYY-MM-DD]` on the task
- Include the Claude Tasks section logic: `find-sections` for "Claude Tasks" section, create if missing, used by Phase 4.5 to park unresolvable items
- Include configuration reference: reads `project_name` from `inbox_provider_config.todoist` in config.json

- [ ] **Step 2: Verify provider follows contract**

Read the file and confirm it has all 4 operations (List, Read, Mark Processed, Mark Presented) plus Platform metadata.

- [ ] **Step 3: Commit**

```bash
git add productivity/skills/claudes-inbox/providers/todoist.md
git commit -m "feat(claudes-inbox): add Todoist provider"
```

---

## Task 3: Write Google Drive Provider

**Files:**
- Create: `productivity/skills/claudes-inbox/providers/google-drive.md`

- [ ] **Step 1: Write google-drive provider file**

Extract from current SKILL.md (lines 71-78) and restructure:

- **Platform:** all
- **List:** `rclone lsf "gdrive:<inbox_path>"` using configured path from `inbox_provider_config.google-drive.inbox_path`. Parse output for filenames and modification times.
- **Read:** `rclone copy "gdrive:<inbox_path>/<filename>" /tmp/` (or `$TEMP` on Windows). For images (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) — read with Claude's vision. For PDFs — read with native PDF capability. All other types — attempt text read.
- **Mark Processed:** `rclone deletefile "gdrive:<inbox_path>/<filename>"`
- **Mark Presented:** Write entry to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` keyed by filename. On List, check this file and skip entries found there.
- Note: rclone must be installed and `gdrive:` remote configured. If `rclone` command fails, provider is skipped per runtime availability policy.

- [ ] **Step 2: Commit**

```bash
git add productivity/skills/claudes-inbox/providers/google-drive.md
git commit -m "feat(claudes-inbox): add Google Drive provider"
```

---

## Task 4: Write Gmail Provider

**Files:**
- Create: `productivity/skills/claudes-inbox/providers/gmail.md`

- [ ] **Step 1: Write gmail provider file**

New provider (not extracted from existing skill):

- **Platform:** all
- **List:** Use `gmail_search_messages` MCP tool with query `label:<configured_label>` (reads label from `inbox_provider_config.gmail.label`, default "Claude Inbox"). Limit to 50 messages. Filter out messages already labeled "Claude-Processed".
- **Read:** Use `gmail_read_message` with message ID. Extract subject line (used as item title), body text, and note any attachments. For messages with attachments, note them but do not attempt download (Gmail MCP attachment handling varies).
- **Mark Processed:** Use `gmail_search_messages` to find the message, then archive it. If a "Claude-Processed" label exists, apply it.
- **Mark Presented:** Apply a "Claude-Presented" label to the message. On List, filter out messages with this label.
- **Setup requirements:** User needs Gmail MCP tools available (cloud-hosted Anthropic connectors). User should create a Gmail filter that auto-labels self-emails (or emails with a specific subject prefix) with the configured label. The setup wizard guides this.
- **Timestamp:** Use the message's `internalDate` for ordering.

- [ ] **Step 2: Commit**

```bash
git add productivity/skills/claudes-inbox/providers/gmail.md
git commit -m "feat(claudes-inbox): add Gmail provider"
```

---

## Task 5: Write Apple Ecosystem Providers (macOS only)

**Files:**
- Create: `productivity/skills/claudes-inbox/providers/apple-notes.md`
- Create: `productivity/skills/claudes-inbox/providers/apple-reminders.md`
- Create: `productivity/skills/claudes-inbox/providers/icloud-drive.md`

- [ ] **Step 1: Write apple-notes provider**

- **Platform:** macos
- **List:** Run `osascript -e 'tell application "Notes" to get {name, id, modification date} of notes of folder "<configured_folder>"'`. Parse output into item list. Filter out notes whose body starts with `[presented: YYYY-MM-DD]` where date is today.
- **Read:** Run `osascript` to get note body (returned as HTML). Convert HTML to plain text (strip tags). For embedded images: note as a complexity risk — attempt base64 extraction from HTML, save to temp dir for vision processing. If extraction fails, note "has embedded images (extraction failed)" and proceed with text only.
- **Mark Processed:** Move note to Trash via `osascript -e 'tell application "Notes" to delete note id "<note_id>" of folder "<configured_folder>"'`
- **Mark Presented:** Prepend `[presented: YYYY-MM-DD]` to note body via osascript. On List, filter these out.
- **Config:** Reads `folder` from `inbox_provider_config.apple-notes` (default "Claude")
- **Setup:** User creates a "Claude" folder in Apple Notes app

- [ ] **Step 2: Write apple-reminders provider**

- **Platform:** macos
- **List:** Run `osascript -e 'tell application "Reminders" to get {name, id, body, creation date} of reminders of list "<configured_list>" whose completed is false'`. Parse output.
- **Read:** Reminder name is the item content. Body/notes field provides additional detail. No attachments.
- **Mark Processed:** `osascript -e 'tell application "Reminders" to set completed of reminder id "<reminder_id>" of list "<configured_list>" to true'`
- **Mark Presented:** Write to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` keyed by reminder ID (Reminders API has no label/tag mechanism).
- **Config:** Reads `list` from `inbox_provider_config.apple-reminders` (default "Claude")
- **Setup:** User creates a "Claude" list in Apple Reminders app

- [ ] **Step 3: Write icloud-drive provider**

- **Platform:** macos
- **List:** `ls ~/Library/Mobile\ Documents/com~apple~CloudDocs/<configured_path>/`. Parse filenames and modification times. If directory doesn't exist, skip provider (user may not be signed into iCloud).
- **Read:** Same as Google Drive — copy to temp, vision for images, PDF reader, text for rest. No rclone needed — direct filesystem access.
- **Mark Processed:** `rm ~/Library/Mobile\ Documents/com~apple~CloudDocs/<configured_path>/<filename>`
- **Mark Presented:** Write to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` keyed by filename.
- **Config:** Reads `inbox_path` from `inbox_provider_config.icloud-drive` (default "Claude/Inbox")
- **Setup:** User creates the folder path in iCloud Drive / Files app

- [ ] **Step 4: Commit**

```bash
git add productivity/skills/claudes-inbox/providers/apple-notes.md
git add productivity/skills/claudes-inbox/providers/apple-reminders.md
git add productivity/skills/claudes-inbox/providers/icloud-drive.md
git commit -m "feat(claudes-inbox): add Apple ecosystem providers (macOS only)"
```

---

## Task 6: Write Core SKILL.md

**Files:**
- Create: `productivity/skills/claudes-inbox/SKILL.md`
- Reference: `productivity/skills/inbox-processor/SKILL.md` (current version for Phase 2-7 content)

This is the largest task. The core skill is rewritten with a provider-agnostic Phase 1 while preserving Phases 2-7 nearly verbatim.

- [ ] **Step 1: Write SKILL.md frontmatter and purpose**

```markdown
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
```

- [ ] **Step 2: Write Phase 1 — Provider-Agnostic Ingest**

New Phase 1 content:

1. Read `inbox_providers` array from `~/.claude/toolkit-state/config.json`
2. Detect current platform (check for `darwin` vs `win32`)
3. For each enabled provider:
   a. Check platform compatibility (skip macOS-only providers on Windows)
   b. Read the provider file at `providers/<provider-name>.md`
   c. Attempt the provider's **List** operation. If the provider's dependency is unavailable (command not found, MCP not responding), skip with a warning and continue to next provider.
   d. For each item returned, follow the provider's **Read** operation
   e. Normalize into the common item model: content, source, source_id, timestamp, attachments, metadata
4. The `local` provider is always checked (even if not in config — it's implicit)
5. Merge all items from all providers into a single list, sorted newest-to-oldest by timestamp
6. Record any skipped providers (with reason) for the Phase 5 summary
7. If no items found across all providers, report "Inbox is clear" and exit. Include count of parked items if any exist (check `~/.claude/inbox/parked/` and Todoist Claude Tasks section if Todoist is enabled).

Include the normalized item model table from the design doc.

- [ ] **Step 3: Copy Phases 2-4.5 from current skill**

Copy the following sections from `inbox-processor/SKILL.md` verbatim (find by section headers, not line numbers — the line numbers below are approximate):
- Phase 2 — Classify & Extract Meta-Feedback (~lines 84-91)
- Phase 3 — Apply Meta-Feedback (~lines 93-104)
- Phase 4 — Build Resolution Plan (~lines 106-142)
- Phase 4.5 — Triage Unresolvable Items (~lines 144-162)

Only change needed in Phase 4.5: Update the "Claude Tasks" routing option to say:
- If Todoist provider is enabled: create task in Claude Tasks section (existing behavior)
- If Todoist is not enabled: write to `~/.claude/inbox/parked/<timestamp>_<slug>.md`

- [ ] **Step 4: Write updated Phase 5 — Presentation**

Copy Phase 5 from current skill (lines 164-211) with these changes:
- Add `Source` column to the "Actions Ready to Execute" table
- Add a "Skipped Providers" note at the top if any providers were unavailable during Phase 1
- Example format update shown in design doc

- [ ] **Step 5: Write updated Phase 6 — Execute**

Copy Phase 6 from current skill (lines 213-249) with these changes:
- Mark Processed now dispatches to the item's source provider: "Read the provider file for the item's `source` field and follow its **Mark Processed** operation"
- Mark Presented for deferred items: "Read the provider file for the item's `source` field and follow its **Mark Presented** operation"
- Rant handling updated: write to `~/.claude/inbox/journal-queue/<timestamp>_rant.md` with YAML frontmatter (source, original_id, captured, queued date) instead of Todoist comment. Also add-comments on Todoist task if source is Todoist (dual-write during transition).
- Noise handling: call provider's Mark Processed (which is delete for most providers, `delete-object` for Todoist)
- Unresolvable → parked: route to active backend per Phase 4.5

- [ ] **Step 6: Copy Phase 7, Tone, Error Handling**

Copy from current skill:
- Phase 7 — Rant Handoff (lines 251-261): Update to reference `~/.claude/inbox/journal-queue/` as primary source
- Tone section (lines 263-268): Verbatim
- Error Handling section (lines 270-282): Verbatim
- System rules footer: Update skill name reference

- [ ] **Step 7: Verify completeness**

Read the completed SKILL.md and verify:
- All 7 phases present
- Phase 1 references provider files, not Todoist/Drive directly
- Phases 2-4 unchanged in logic
- Phase 4.5 has provider-agnostic parking
- Phase 5 has source column
- Phase 6 dispatches to provider-specific operations
- Classification categories table present (10 categories)
- Calendar mapping table present
- No references to "inbox-processor" (should all say "claudes-inbox" or "Claude's Inbox")

- [ ] **Step 8: Commit**

```bash
git add productivity/skills/claudes-inbox/SKILL.md
git commit -m "feat(claudes-inbox): write provider-agnostic core skill"
```

---

## Task 7: Rewrite /todo Hook

**Files:**
- Modify: `core/hooks/todo-capture.sh`

- [ ] **Step 1: Read current hook**

```bash
cat core/hooks/todo-capture.sh
```

Confirm it currently sends a systemMessage to use Todoist MCP.

- [ ] **Step 2: Rewrite hook to write local file**

Replace contents of `core/hooks/todo-capture.sh` with:

```bash
#!/bin/bash
# Hook: UserPromptSubmit — capture /todo notes to local inbox
set -euo pipefail

input=$(cat)
prompt=$(echo "$input" | jq -r '.user_prompt // ""')

if [[ ! "$prompt" =~ ^/todo[[:space:]] ]]; then
  exit 0
fi

note="${prompt#/todo }"
note=$(echo "$note" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [[ -z "$note" ]]; then
  echo '{"systemMessage": "The user typed /todo with no note. Ask what they want to capture."}'
  exit 0
fi

# Write to local inbox
inbox_dir="$HOME/.claude/inbox"
mkdir -p "$inbox_dir"
timestamp=$(date +%Y-%m-%dT%H-%M-%S)
filename="${timestamp}_todo.md"

cat > "$inbox_dir/$filename" << ENDOFFILE
---
source: local
captured: $(date -Iseconds 2>/dev/null || date +%Y-%m-%dT%H:%M:%S%z)
origin: todo
---
$note
ENDOFFILE

echo '{"systemMessage": "[Todo] Note captured to local inbox. Briefly confirm, then continue your previous task."}'
```

- [ ] **Step 3: Verify hook is executable**

```bash
chmod +x core/hooks/todo-capture.sh
```

- [ ] **Step 4: Test the hook manually**

```bash
echo '{"user_prompt": "/todo test note from plan verification"}' | bash core/hooks/todo-capture.sh
ls ~/.claude/inbox/
cat ~/.claude/inbox/*_todo.md
rm ~/.claude/inbox/*_todo.md  # cleanup
```

Expected: File created with correct frontmatter and content.

- [ ] **Step 5: Commit**

```bash
git add core/hooks/todo-capture.sh
git commit -m "feat(claudes-inbox): rewrite /todo hook to write local files"
```

---

## Task 8: Create check-inbox.sh Hook

**Files:**
- Create: `core/hooks/check-inbox.sh`

This is called by session-start.sh (which already has the conditional `if [[ -f "$CLAUDE_DIR/hooks/check-inbox.sh" ]]`).

- [ ] **Step 1: Write check-inbox.sh**

```bash
#!/bin/bash
# Hook: Called by session-start.sh to check for inbox items across all providers
# Outputs a systemMessage if items are found, silent otherwise
set -euo pipefail

CONFIG_FILE="$HOME/.claude/toolkit-state/config.json"
INBOX_DIR="$HOME/.claude/inbox"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
count=0

# Always check local inbox
if [[ -d "$INBOX_DIR" ]]; then
  local_count=$(find "$INBOX_DIR" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l)
  count=$((count + local_count))
fi

# Read config for additional providers
if [[ ! -f "$CONFIG_FILE" ]]; then
  # No config — only local provider
  if [[ $count -gt 0 ]]; then
    echo "{\"systemMessage\": \"[Inbox] You have $count note(s) in Claude's Inbox. Say 'check my inbox' to process.\"}"
  fi
  exit 0
fi

# Verify jq is available (required for JSON parsing)
if ! command -v jq &>/dev/null; then
  # Without jq, can only check local inbox
  if [[ $count -gt 0 ]]; then
    echo "{\"systemMessage\": \"[Inbox] You have $count note(s) in Claude's Inbox. Say 'check my inbox' to process.\"}"
  fi
  exit 0
fi

providers=$(cat "$CONFIG_FILE" | jq -r '.inbox_providers[]? // empty' 2>/dev/null)

for provider in $providers; do
  case "$provider" in
    local)
      # Already counted above
      ;;
    todoist)
      # Todoist check is handled by the skill itself (MCP call too heavy for session-start)
      # Just flag that Todoist is enabled so the skill knows to check
      ;;
    google-drive)
      if command -v rclone &>/dev/null; then
        drive_path=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["google-drive"].inbox_path // "Claude/Inbox"' 2>/dev/null)
        drive_count=$(timeout 5 rclone lsf "gdrive:$drive_path" 2>/dev/null | wc -l || echo 0)
        count=$((count + drive_count))
      fi
      ;;
    gmail)
      # Gmail MCP check too heavy for session-start — handled by skill
      ;;
    apple-notes)
      if [[ "$PLATFORM" == "darwin" ]]; then
        notes_folder=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["apple-notes"].folder // "Claude"' 2>/dev/null)
        notes_count=$(timeout 5 osascript -e "tell application \"Notes\" to count notes of folder \"$notes_folder\"" 2>/dev/null || echo 0)
        count=$((count + notes_count))
      fi
      ;;
    apple-reminders)
      if [[ "$PLATFORM" == "darwin" ]]; then
        reminders_list=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["apple-reminders"].list // "Claude"' 2>/dev/null)
        reminders_count=$(timeout 5 osascript -e "tell application \"Reminders\" to count (reminders of list \"$reminders_list\" whose completed is false)" 2>/dev/null || echo 0)
        count=$((count + reminders_count))
      fi
      ;;
    icloud-drive)
      if [[ "$PLATFORM" == "darwin" ]]; then
        icloud_path=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["icloud-drive"].inbox_path // "Claude/Inbox"' 2>/dev/null)
        icloud_dir="$HOME/Library/Mobile Documents/com~apple~CloudDocs/$icloud_path"
        if [[ -d "$icloud_dir" ]]; then
          icloud_count=$(ls "$icloud_dir" 2>/dev/null | wc -l)
          count=$((count + icloud_count))
        fi
      fi
      ;;
  esac
done

if [[ $count -gt 0 ]]; then
  echo "{\"systemMessage\": \"[Inbox] You have $count note(s) in Claude's Inbox. Say 'check my inbox' to process.\"}"
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x core/hooks/check-inbox.sh
```

- [ ] **Step 3: Verify session-start.sh will call it**

Read `core/hooks/session-start.sh` and confirm the existing conditional:
```bash
if [[ -f "$CLAUDE_DIR/hooks/check-inbox.sh" ]]; then
    bash "$CLAUDE_DIR/hooks/check-inbox.sh" 2>/dev/null || true
fi
```

The symlink from `~/.claude/hooks/check-inbox.sh` → this file will be created in Task 11 (setup wizard / migration).

- [ ] **Step 4: Commit**

```bash
git add core/hooks/check-inbox.sh
git commit -m "feat(claudes-inbox): create session-start inbox count checker"
```

---

## Task 9: Write v3.0 Spec

**Files:**
- Create: `productivity/skills/claudes-inbox/specs/claudes-inbox-spec.md`
- Reference: `productivity/skills/inbox-processor/specs/inbox-processor-spec.md` (current spec for mandates/decisions)

- [ ] **Step 1: Write the new spec**

Start from the existing spec (v2.4) and update:

- **Version:** 3.0
- **Purpose:** Update to describe provider-agnostic system
- **User Mandates:** Keep all 9, but scope #9 explicitly: "Todoist MCP only for Todoist operations — other providers use their own access methods"
- **Design Decisions:** Add new entries:
  - Provider instruction files over inline conditionals (rationale: modularity, maintainability)
  - Local staging for /todo over Todoist MCP (rationale: offline, no external dependency, faster)
  - Journal-queue directory over Todoist comments (rationale: works without Todoist, simpler cross-skill contract)
  - Mark Presented in provider contract (rationale: re-presentation guard is provider-specific)
  - Config-driven provider selection (rationale: users choose their own capture tools)
  - Gmail cloud-hosted MCP (rationale: always available, no local server needed)
  - Skip-and-warn for unavailable providers (rationale: one broken source shouldn't block all processing)
- **Dependencies:** Now conditional on enabled providers
- **Integration Points:** Update check-inbox.sh, journal-queue directory, add setup wizard
- **Fix duplicate step 8** in Phase 1 description
- **Move known bugs and planned updates** from old spec — update or close items as appropriate
- **Change Log:** Add v3.0 entry

- [ ] **Step 2: Verify spec completeness**

Read the spec and confirm:
- All user mandates preserved
- New design decisions include rationale and alternatives
- Dependencies list is conditional
- Integration points updated
- Change log includes v3.0

- [ ] **Step 3: Commit**

```bash
git add productivity/skills/claudes-inbox/specs/claudes-inbox-spec.md
git commit -m "feat(claudes-inbox): write v3.0 spec"
```

---

## Task 10: Update Journaling Assistant

**Files:**
- Modify: `life/skills/journaling-assistant/SKILL.md:65-84`
- Modify: `life/skills/journaling-assistant/specs/journaling-assistant-spec.md`

- [ ] **Step 1: Read current journaling rant check**

Read `life/skills/journaling-assistant/SKILL.md` lines 65-84 to see the current Todoist-only rant check.

- [ ] **Step 2: Update Step 1c to check both sources**

Replace the content of Step 1c (lines 65-84) with updated instructions that:

1. **Primary:** Check `~/.claude/inbox/journal-queue/` directory for `.md` files. Parse each file's content as the rant text.
2. **Legacy (if Todoist enabled):** Also check Todoist via MCP (same as current behavior — `find-projects` → `find-tasks` → `find-comments` looking for `[queued-for-journal]` marker).
3. Merge results from both sources.
4. After a rant is journaled, for journal-queue files: delete the file. For Todoist tasks: `complete-tasks`.
5. Update the `inbox-processor` reference to `claudes-inbox`.

- [ ] **Step 3: Update journaling spec**

Read the journaling-assistant spec and add an integration point noting:
- Primary rant source: `~/.claude/inbox/journal-queue/` directory
- Legacy source: Todoist `[queued-for-journal]` comments (transition period)
- Transition ends at next major journaling skill version bump

- [ ] **Step 4: Commit**

```bash
git add life/skills/journaling-assistant/SKILL.md
git add life/skills/journaling-assistant/specs/journaling-assistant-spec.md
git commit -m "feat(journaling): add journal-queue directory as primary rant source"
```

---

## Task 11: Update References Across Toolkit

**Files:**
- Modify: `core/skills/setup-wizard/SKILL.md` (4 locations + new capture source step)
- Modify: `core/specs/destinclaude-spec.md:93`
- Modify: `core/specs/INDEX.md:26`
- Modify: `core/specs/system-architecture-spec.md:95`
- Modify: `core/commands/toolkit.md:15,46`

- [ ] **Step 1: Update setup-wizard skill references**

In `core/skills/setup-wizard/SKILL.md`, find-and-replace `inbox-processor` → `claudes-inbox` at lines 365, 991, and 1412. Update the description at line 492.

- [ ] **Step 2: Add capture source selection to setup-wizard**

Add a new step in Phase 4 (Dependency Installation) under the Productivity layer section. After the Todoist setup step, add the capture source selection:

```markdown
### Step X: Configure Claude's Inbox Capture Sources

Ask:
```
How would you like to capture notes for Claude to process?
You can pick as many as you like — Claude checks all of them.

  1. Todoist (cross-platform — quick text capture via app/widget)
  2. Google Drive folder (cross-platform — screenshots, photos, files)
  3. Gmail (cross-platform — email yourself notes)
  4. Apple Notes (macOS/iPhone — Siri, share sheet, rich notes)    [macOS only]
  5. Apple Reminders (macOS/iPhone — "Hey Siri, remind me...")     [macOS only]
  6. iCloud Drive folder (macOS/iPhone — drop files from Files app) [macOS only]

Local capture (/todo in-session) is always available.
```

Options 4-6: Only show on macOS (check `platform` from config.json).

For each selected provider:
- Verify dependency (rclone for Drive, osascript for Apple, Gmail MCP accessible)
- Walk user through one-time setup:
  - Todoist: create "Claude's Inbox" project (or confirm it exists)
  - Google Drive: create `Claude/Inbox` folder
  - Gmail: create "Claude Inbox" label and a filter for self-emails
  - Apple Notes: create "Claude" folder
  - Apple Reminders: create "Claude" list
  - iCloud Drive: create `Claude/Inbox` folder in Files app
- Save to config.json: add to `inbox_providers` array and `inbox_provider_config`

Always add `"local"` to `inbox_providers` regardless of selection.
```

- [ ] **Step 3: Add check-inbox.sh symlink to setup-wizard Phase 5**

In the Phase 5 symlink registration section, add:
```
ln -sf "$TOOLKIT_ROOT/core/hooks/check-inbox.sh" "$HOME/.claude/hooks/check-inbox.sh"
```

- [ ] **Step 4: Update destinclaude-spec.md**

Line 93: Change `inbox-processor` to `claudes-inbox`.

- [ ] **Step 5: Update INDEX.md**

Line 26: Change path to `productivity/skills/claudes-inbox/specs/claudes-inbox-spec.md` and version to `3.0`.

- [ ] **Step 6: Update system-architecture-spec.md**

Line 95: Update description to: "`check-inbox.sh` → checks configured inbox providers for items, injects prompt for claudes-inbox skill"

- [ ] **Step 7: Update toolkit.md command**

Lines 15 and 46: Replace `inbox-processor` with `claudes-inbox` and update the trigger phrase.

- [ ] **Step 8: Commit**

```bash
git add core/skills/setup-wizard/SKILL.md
git add core/specs/destinclaude-spec.md
git add core/specs/INDEX.md
git add core/specs/system-architecture-spec.md
git add core/commands/toolkit.md
git commit -m "refactor: rename inbox-processor to claudes-inbox across toolkit"
```

---

## Task 12: Copy Historical Plans to New Directory

**Files:**
- Copy: `productivity/skills/inbox-processor/plans/*` → `productivity/skills/claudes-inbox/plans/`

- [ ] **Step 1: Copy plans and design docs**

```bash
cp productivity/skills/inbox-processor/plans/*.md productivity/skills/claudes-inbox/plans/
```

- [ ] **Step 2: Commit**

```bash
git add productivity/skills/claudes-inbox/plans/
git commit -m "docs: copy historical plans to claudes-inbox directory"
```

---

## Task 13: Symlink Update & Verification

**Files:**
- Update: `~/.claude/skills/inbox-processor` symlink → `~/.claude/skills/claudes-inbox`
- Create: `~/.claude/hooks/check-inbox.sh` symlink

This task is for the developer's own machine. For other users, the setup-wizard or update script handles this.

- [ ] **Step 1: Update skill symlink**

```bash
rm -f ~/.claude/skills/inbox-processor
ln -sf "$(pwd)/productivity/skills/claudes-inbox" ~/.claude/skills/claudes-inbox
```

On Windows without Developer Mode (symlinks fail):
```bash
rm -rf ~/.claude/skills/inbox-processor
cp -r productivity/skills/claudes-inbox ~/.claude/skills/claudes-inbox
```

- [ ] **Step 2: Create check-inbox.sh symlink**

```bash
ln -sf "$(pwd)/core/hooks/check-inbox.sh" ~/.claude/hooks/check-inbox.sh
```

- [ ] **Step 3: Create local inbox directory**

```bash
mkdir -p ~/.claude/inbox/journal-queue
mkdir -p ~/.claude/inbox/parked
mkdir -p ~/.claude/inbox/state
```

- [ ] **Step 4: Seed config if needed**

If `~/.claude/toolkit-state/config.json` exists but lacks `inbox_providers`:

```bash
# Read current config, add inbox keys, write back (uses node for consistency with toolkit)
node -e "
const fs = require('fs');
const path = require('os').homedir() + '/.claude/toolkit-state/config.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
if (!config.inbox_providers) {
  config.inbox_providers = ['todoist', 'local'];
  config.inbox_provider_config = {
    todoist: { project_name: \"Claude's Inbox\" }
  };
  fs.writeFileSync(path, JSON.stringify(config, null, 2));
}
"
```

- [ ] **Step 5: Verify**

```bash
ls -la ~/.claude/skills/claudes-inbox/SKILL.md
ls -la ~/.claude/hooks/check-inbox.sh
ls ~/.claude/inbox/
cat ~/.claude/toolkit-state/config.json | jq '.inbox_providers'
```

Expected: All paths exist, config shows `["todoist", "local"]`.

- [ ] **Step 6: Commit any remaining changes**

```bash
git status
# Only commit if there are toolkit-tree changes (not user-local symlinks)
```

---

## Task 14: Update CLAUDE.md References

**Files:**
- Modify: `~/.claude/CLAUDE.md` (user's global instructions)

- [ ] **Step 1: Update skill table**

In the Installed Skills table, change:
- `inbox-processor` → `claudes-inbox`
- Update the description to mention provider-agnostic capture

- [ ] **Step 2: Commit (if CLAUDE.md is in the toolkit repo)**

Note: CLAUDE.md may be a user file outside the repo. If it's templated by the toolkit, update the template. If it's user-managed, note it as a manual update step.

---

## Task 15: End-to-End Verification

No files changed — this is a verification task.

- [ ] **Step 1: Verify /todo capture**

```bash
# In a Claude Code session, type: /todo test note for verification
# Check that ~/.claude/inbox/ has the file
ls ~/.claude/inbox/
```

- [ ] **Step 2: Verify skill triggers**

In a Claude Code session, say "check my inbox" and verify the claudes-inbox skill activates (not the old inbox-processor).

- [ ] **Step 3: Verify provider loading**

During inbox processing, verify Claude reads the correct provider files and follows the List/Read operations for enabled providers.

- [ ] **Step 4: Verify source attribution**

Confirm the resolution summary table includes the Source column showing which provider each item came from.

- [ ] **Step 5: Clean up test items**

Remove any test notes created during verification.

---

## Dependency Graph

```
Task 1 (dir + local provider)
  ├── Tasks 2-5 (other providers) — parallel, all depend on Task 1
  ├── Task 7 (/todo hook) — parallel, depends on Task 1 only
  ├── Task 8 (check-inbox.sh) — parallel, depends on Task 1 only
  ├── Task 12 (copy plans) — parallel, depends on Task 1 only
  │
  └── Task 6 (core SKILL.md) — depends on Tasks 2-5 (all providers written)
       ├── Task 9 (spec) — depends on Task 6
       ├── Task 10 (journaling update) — depends on Task 6
       ├── Task 11 (references) — depends on Task 6
       │
       └── Task 13 (symlinks) — depends on Tasks 6-12
            └── Task 14 (CLAUDE.md) — depends on Task 13
                 └── Task 15 (verification) — depends on everything
```

**Parallel opportunities:**
- After Task 1: Tasks 2, 3, 4, 5, 7, 8, 12 can all run in parallel
- After Task 6: Tasks 9, 10, 11 can run in parallel
