# Local Staging Provider

**Platform:** all

Reads items from the local staging directory (`~/.claude/inbox/`). This provider is always enabled — it requires no external services and powers the `/todo` in-session capture hook.

## List

1. Check if `~/.claude/inbox/` exists. If not, return no items.
2. List all `.md` files in `~/.claude/inbox/` (not subdirectories — `journal-queue/`, `parked/`, and `state/` are managed by the core skill, not this provider).
3. For each file, parse the YAML frontmatter to extract `source`, `captured`, and `origin` fields.
4. Check `~/.claude/inbox/state/presented-<today's date>.json` — skip any items whose filename appears as a key in this file (re-presentation guard).
5. Return remaining items sorted by `captured` timestamp, newest first.

## Read

1. Read the full file content (everything after the YAML frontmatter `---` closing delimiter).
2. The content is plain text — the note body.
3. There are no attachments for local items (text only).

## Mark Processed

Delete the file:

```bash
rm ~/.claude/inbox/<filename>
```

## Mark Presented

Write the item's filename as a key to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` (create the file if it doesn't exist; merge into existing JSON object if it does). The original file is NOT deleted — deferred items stay in the inbox until the next day or until they are resolved.

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
