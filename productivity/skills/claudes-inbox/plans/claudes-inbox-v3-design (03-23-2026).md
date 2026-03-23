# Claude's Inbox v3.0 Design

**Date:** 2026-03-23
**Status:** Approved
**Current skill:** `~/.claude/skills/inbox-processor/SKILL.md` (to be renamed `claudes-inbox`)
**Current spec:** `specs/inbox-processor-spec.md` (to be renamed `claudes-inbox-spec.md`)

## Summary

Major redesign of the inbox processor skill to support multiple capture sources beyond Todoist and Google Drive. Renames the skill from `inbox-processor` to `claudes-inbox` to avoid confusion with email/messaging inbox processing. Introduces a provider-based architecture where the processing engine (classify, resolve, present, execute) is source-agnostic, and each capture source is defined in a modular provider instruction file.

## Motivation

The current skill is hardcoded to two sources: Todoist (text notes) and Google Drive (screenshots/files). As a toolkit feature for both macOS and Windows users, it should support whatever capture tools the user already has — Todoist, Apple Notes, Gmail, Apple Reminders, etc. The processing logic is source-independent; only the ingest layer needs to change.

## Architectural Approach

**Provider Instruction Files** — the core skill's Phase 1 (Ingest) reads from a config to determine which providers are enabled, then reads and follows each provider's instruction file (`providers/<name>.md`). Items are normalized into a common model before Phase 2 begins. Phases 2–7 are untouched.

The `/todo` in-session capture is decoupled from Todoist and writes to a local staging directory (`~/.claude/inbox/`), eliminating the external service round-trip.

## Provider Feasibility

| Provider | Platform | Access Method | Verdict |
|---|---|---|---|
| Todoist | Cross-platform | MCP tools | Excellent — proven, fast |
| Google Drive folder | Cross-platform | rclone | Good — best for media |
| Gmail (self-email) | Cross-platform | Gmail MCP | Good — universal pattern |
| Local staging | Cross-platform | Filesystem | Good — powers /todo |
| Apple Notes | macOS + iPhone | osascript | Good on macOS — Siri, share sheet |
| Apple Reminders | macOS + iPhone | osascript | Good on macOS — voice-first via Siri |
| iCloud Drive folder | macOS + iPhone | Local filesystem | Decent on macOS — no rclone needed |

**Rejected:** Self-texts (gmessages/iMessage) — notes mixed with real conversations, awkward UX. Google Keep — no usable API.

## Provider Interface Contract

Each provider file defines four operations and one metadata declaration:

**Operations:**

| Operation | Purpose | Required |
|---|---|---|
| **List** | Return all unprocessed items | Yes |
| **Read** | Get full content (text, images, attachments) | Yes |
| **Mark Processed** | Signal item is handled (complete, delete, archive) | Yes |
| **Mark Presented** | Record that an item was shown but deferred (re-presentation guard) | Yes |

**Metadata:**

| Field | Purpose | Required |
|---|---|---|
| **Platform** | Which OS this provider works on (`all`, `macos`, `win32`) | Yes |

The core skill engine calls **Mark Presented** on deferred items during Phase 6. Each provider defines its own mechanism: Todoist uses `[presented: YYYY-MM-DD]` comments, Gmail applies a label, Apple Notes moves to a "Presented" folder, local files are deleted, etc. Providers that lack a native marker mechanism should write to `~/.claude/inbox/state/presented-<date>.json` as a fallback (the core skill checks this file during Phase 1 before passing items to provider List).

### Provider Availability at Runtime

If an enabled provider's dependency is unavailable at runtime (e.g., rclone not installed, Todoist MCP not responding, osascript not found), the skill **skips that provider with a warning** and continues processing remaining providers. The warning is included in the Phase 5 summary so the user knows a source was skipped. This is not a fatal error.

## Normalized Item Model

After ingest, every item is normalized into:

| Field | Type | Description |
|---|---|---|
| content | string | The note text |
| source | string | Provider name (todoist, gmail, apple-notes, etc.) |
| source_id | string | Provider-specific ID for mark-processed |
| timestamp | datetime | When the item was created/captured |
| attachments | list | Images/files, downloaded to platform temp dir (Unix: /tmp/, Windows: $TEMP or Git Bash /tmp/) |
| metadata | object | Provider-specific extras (due date, subject, title) |

## File Structure

```
productivity/skills/claudes-inbox/
  SKILL.md                    <- Core skill (provider-agnostic processing engine)
  providers/
    todoist.md                <- Todoist MCP ingest instructions
    google-drive.md           <- Google Drive folder via rclone
    gmail.md                  <- Gmail MCP self-email ingest
    apple-notes.md            <- Apple Notes via osascript (macOS)
    apple-reminders.md        <- Apple Reminders via osascript (macOS)
    icloud-drive.md           <- iCloud Drive local folder (macOS)
    local.md                  <- Local staging dir (~/.claude/inbox/)
  specs/
    claudes-inbox-spec.md     <- Updated spec (v3.0)
  plans/
    (existing plans preserved)
```

## Provider Details

### Cross-Platform

**Todoist:**
- List: `find-projects` for "Claude's Inbox" -> `find-tasks` -> `find-comments` for re-presentation guard
- Read: Task content + description + comments. Attachments noted as inaccessible.
- Mark Processed: `complete-tasks`, `delete-object`, or `add-comments` for markers
- Claude Tasks section logic remains Todoist-specific for parking unresolvable items

**Google Drive:**
- List: `rclone lsf "gdrive:<configured_path>"`
- Read: `rclone copy` to /tmp/, vision for images, PDF reader, text for rest
- Mark Processed: `rclone deletefile`

**Gmail:**
- List: `gmail_search_messages` with user-configured label (e.g., "Claude Inbox")
- Read: `gmail_read_message` for body + attachments
- Mark Processed: Archive or apply "processed" label
- Mark Presented: Apply "presented" label
- Setup: User creates a Gmail filter to auto-label self-emails (wizard guides this)
- Dependency: Gmail MCP tools (`mcp__claude_ai_Gmail__*`) — these are cloud-hosted Anthropic MCP connectors, always available when enabled in Claude Code settings. The setup wizard verifies they're accessible.

**Local Staging:**
- List: Read all files in `~/.claude/inbox/`
- Read: Parse markdown with YAML frontmatter
- Mark Processed: Delete the file

### macOS Only

**Apple Notes:**
- List: `osascript` to get notes from "Claude" folder
- Read: `osascript` to extract title, body (HTML -> text), embedded images (complexity note: Notes API returns HTML; embedded images may be base64-encoded or cid: URIs — the provider file must handle conversion and save images to temp dir for vision processing)
- Mark Processed: Move to Trash or "Processed" folder
- Mark Presented: Move to "Presented" folder (or add a text marker to note body)

**Apple Reminders:**
- List: `osascript` to get reminders from "Claude" list
- Read: Reminder name + notes field
- Mark Processed: Mark as completed

**iCloud Drive:**
- List: `ls ~/Library/Mobile Documents/com~apple~CloudDocs/<configured_path>/`
- Read: Same as Google Drive (vision, PDF, text)
- Mark Processed: Delete the file

## Configuration

Stored in `~/.claude/toolkit-state/config.json`:

```json
{
  "inbox_providers": ["todoist", "local"],
  "inbox_provider_config": {
    "todoist": { "project_name": "Claude's Inbox" },
    "google-drive": { "inbox_path": "Claude/Inbox" },
    "gmail": { "label": "Claude Inbox" },
    "apple-notes": { "folder": "Claude" },
    "apple-reminders": { "list": "Claude" },
    "icloud-drive": { "inbox_path": "Claude/Inbox" }
  }
}
```

`local` is always enabled by default (zero-config, powers /todo).

**Naming convention:** Top-level config keys use underscores (`inbox_providers`, `inbox_provider_config`) per standard JSON convention. Provider identifiers within values use hyphens (`google-drive`, `apple-notes`) to match provider filenames.

## Core Skill Changes

### Phase 1 — Ingest (Rewritten)

1. Read `inbox_providers` from config.json
2. Detect platform to filter incompatible providers
3. For each enabled provider, read its provider file and follow List + Read operations
4. Merge all items into single list, sorted newest-to-oldest by timestamp
5. Apply source attribution to each item
6. Check for empty inbox across all providers

### Phase 5 — Presentation (Minor)

Source column added to resolution table:

```
| # | Entry | Source | Action |
|---|---|---|---|
| 1 | "Concert Saturday 8pm" | Apple Reminders | Create event |
```

### Phase 6 — Execute (Mark Processed)

Calls provider-specific Mark Processed operation based on item's `source` field.

### Phases 2, 3, 4, 4.5, 7 — Unchanged

Classification, meta-feedback, resolution plan building, unresolvable triage, rant handoff — all identical in logic.

## Todoist-Decoupled Features

| Feature | Old (Todoist-only) | New (Provider-agnostic) |
|---|---|---|
| Claude Tasks (parking) | Todoist section | If Todoist enabled: same. Otherwise: `~/.claude/inbox/parked/<item>.md`. Phase 1 counts parked items from whichever backend is active. Phase 4.5 routes to the active backend. |
| Rant handoff | `[queued-for-journal]` Todoist comment | `~/.claude/inbox/journal-queue/<item>.md` — journaling skill reads this directory (see Journaling Transition below) |
| Re-presentation guard | `[presented: YYYY-MM-DD]` Todoist comment | Each provider defines its own Mark Presented operation (part of provider contract). Fallback: `~/.claude/inbox/state/presented-<date>.json` |

### Journaling Skill Transition Plan

The journaling-assistant skill currently checks Todoist for `[queued-for-journal]` comments. Under v3:

1. **Primary source:** `~/.claude/inbox/journal-queue/` directory (new)
2. **Legacy source:** Todoist `[queued-for-journal]` comments (if Todoist provider is enabled)
3. **Transition period:** The journaling skill checks both sources. This continues until the next major journaling skill version bump, at which point the Todoist comment check is removed and any remaining Todoist-queued rants are migrated to the journal-queue directory.
4. **Implementation:** The journaling skill spec needs a corresponding update noting the new journal-queue directory as its primary rant source. This is a dependency of the v3 implementation plan.

## /todo Hook Changes

Rewrites from Todoist MCP systemMessage to direct file write:

- Writes `~/.claude/inbox/<timestamp>_todo.md` with YAML frontmatter
- No Claude involvement needed — hook handles everything
- Works offline, no external service dependency
- Returns confirmation systemMessage

## Local Staging Format

```markdown
---
source: local
captured: 2026-03-23T14:30:00-07:00
origin: todo
---
Pick up milk on the way home
```

The `source` field is always the provider name (matching the provider filename stem and config key, using hyphens: `local`, `todoist`, `gmail`, `google-drive`, `apple-notes`, `apple-reminders`, `icloud-drive`). The optional `origin` field captures sub-type information (e.g., `todo` for /todo captures, `manual` for files manually placed in the directory).

Journal-queue and parked items use same format with additional metadata (original_id, queued date).

## Directory Layout

```
~/.claude/inbox/
  <timestamp>_todo.md              <- pending items from /todo
  journal-queue/
    <timestamp>_rant.md            <- rants waiting for journaling
  parked/
    <timestamp>_big-project.md     <- unresolvable items
  state/
    presented-<date>.json          <- re-presentation guard fallback (JSON object keyed by source_id, append-safe across multiple runs per day)
```

## Setup Wizard Integration

New step in Phase 4 (Dependency Installation) under Productivity layer:

- Presents capture source options (platform-gated: Apple options only on macOS)
- Verifies dependencies for each selected provider
- Walks user through one-time setup (create folders, Gmail filters, etc.)
- Saves selection to config.json
- `local` always enabled, not shown as an option

## Session-Start Hook Changes

The current `session-start.sh` has a conditional call to `check-inbox.sh` which does not exist yet. This design **creates** `check-inbox.sh` as a new file in `productivity/hooks/check-inbox.sh`, symlinked to `~/.claude/hooks/check-inbox.sh`. The existing session-start.sh conditional (`if [[ -f "$CLAUDE_DIR/hooks/check-inbox.sh" ]]`) works without modification.

The new `check-inbox.sh`:
- Reads `inbox_providers` from `~/.claude/toolkit-state/config.json`
- Lightweight count check per enabled provider (limit=1 queries, ls, etc.)
- Each check has a timeout (5s) to prevent slow providers blocking session start
- If items found: outputs a systemMessage "You have X notes in Claude's Inbox. Say 'check my inbox' to process."
- Skips unavailable providers silently (session-start should not warn about provider issues)

**Error handling note:** Session-start skips unavailable providers silently (speed matters, don't alarm the user). The full skill run (Phase 1) skips with a warning shown in Phase 5 summary (the user should know a source was missed). These are intentionally different policies.

## Migration (v2.4 -> v3.0)

**Existing users (update):**

Migration runs atomically in a single update script pass — all steps complete before the session resumes. Order matters:

1. Create `~/.claude/inbox/` directory
2. Seed config.json with `["todoist", "local"]` to match current behavior
3. Replace /todo hook with local-write version
4. Replace `inbox-processor` symlink with `claudes-inbox`
5. Update session-start hook references
6. One-time message: upgrade notice with pointer to /setup-wizard for adding sources

**New users:** Get the new setup wizard flow. No migration.

**What breaks:**
- Old symlink name (update script handles)
- /todo no longer appears in Todoist app (acceptable — it's in-session, not phone capture)
- Journaling skill needs to check both journal-queue dir AND Todoist comments during transition

**Deprecation:** Clean break on the name. No aliases or shims.

## Spec Updates Required

The v3.0 spec (`claudes-inbox-spec.md`) must address:

1. **User Mandate #9** ("Todoist MCP only") — scope explicitly to Todoist provider operations. Other providers use their own access methods (osascript, rclone, Gmail MCP, filesystem). The mandate means "when interacting with Todoist, use MCP tools, not curl/REST" — it does not require all providers to use MCP.
2. **New design decisions** — provider architecture, local staging for /todo, journal-queue directory, provider contract with 5 operations.
3. **Updated dependencies** — now conditional on enabled providers rather than always requiring Todoist + rclone.
4. **Journaling skill integration point** — updated to reference journal-queue directory.
5. **Fix duplicate step 8** numbering in Phase 1 (pre-existing issue from v2).

## Implementation Notes

- Apple Notes image extraction via osascript is a known complexity risk. The provider file should handle HTML-to-text conversion and base64 image extraction. If this proves too fragile, the Apple Notes provider can launch as text-only with a note that image support is experimental.
- iCloud Drive provider should verify the iCloud Drive folder exists during setup and at runtime (user may not be signed into iCloud).
- The `~/.claude/skills/` path in documentation refers to the symlink target, not the toolkit source. The toolkit-relative path is `productivity/skills/claudes-inbox/`.
