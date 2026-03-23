# iCloud Drive Provider

**Platform:** macos

Reads files dropped into a configured iCloud Drive folder. No rclone needed — direct filesystem access via the iCloud Drive mount point.

Requires macOS with iCloud Drive enabled and the configured folder synced locally.

## Configuration

Reads `inbox_provider_config.icloud-drive.path` from `~/.claude/toolkit-state/config.json`. Default path: `"Claude/Inbox"`.

The full filesystem path is `~/Library/Mobile Documents/com~apple~CloudDocs/<path>` (e.g. `~/Library/Mobile Documents/com~apple~CloudDocs/Claude/Inbox`).

## List

1. Check if the directory exists:
   ```bash
   ls ~/Library/Mobile\ Documents/com~apple~CloudDocs/<path>/
   ```
   If the directory does not exist, skip this provider.

2. List all files in the directory (non-recursive — do not descend into subdirectories).

3. Check `~/.claude/inbox/state/presented-<today's date>.json` — skip any filenames that appear as keys in this file (re-presentation guard).

4. Return remaining filenames sorted by modification time, newest first.

## Read

Read based on file type:

- **Images** (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) — read with Claude's vision capability to extract text, facts, dates, and any relevant content.
- **PDFs** (`.pdf`) — read with Claude's native PDF capability.
- **All other types** — attempt to read as plain text.

Files are accessed directly from the local filesystem path — no download step needed.

## Mark Processed

Delete the file from the local iCloud Drive folder:

```bash
rm ~/Library/Mobile\ Documents/com~apple~CloudDocs/<path>/<filename>
```

iCloud will sync the deletion to other devices.

## Mark Presented

Write the filename as a key to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` (create the file if it doesn't exist; merge into an existing JSON object if it does).

The file is NOT deleted — deferred items remain in the folder. The re-presentation guard prevents them from appearing in subsequent same-day runs.

Example state entry:
```json
{
  "note-20260323.txt": { "presented": "2026-03-23" }
}
```
