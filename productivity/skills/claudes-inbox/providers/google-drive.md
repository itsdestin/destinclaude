# Google Drive Provider

**Platform:** all

Reads files dropped into a Google Drive inbox folder. Designed for screenshots and documents captured from mobile or desktop and saved to Drive.

Requires `rclone` with a configured `gdrive:` remote. If `rclone` is not available or the remote is not configured, this provider is skipped per the runtime availability policy.

## Configuration

Reads `inbox_provider_config.google-drive.inbox_path` from `~/.claude/toolkit-state/config.json`. Default: `"Claude/Inbox"`.

The full rclone path is `gdrive:<inbox_path>` (e.g. `gdrive:Claude/Inbox`).

## List

1. Run:
   ```bash
   rclone lsf "gdrive:<inbox_path>"
   ```
   If the command fails (rclone not installed, remote not configured, network error), skip this provider and report it as unavailable.

2. Parse the output for filenames. Each line is one file.

3. Check `~/.claude/inbox/state/presented-<today's date>.json` — skip any filenames that appear as keys in this file (re-presentation guard).

4. Return remaining filenames sorted by modification time, newest first (use `rclone lsf --format "tp" "gdrive:<inbox_path>"` to get modification timestamps if ordering matters).

## Read

For each file, download it to a temp directory:

```bash
# Unix/macOS
rclone copy "gdrive:<inbox_path>/<filename>" /tmp/

# Windows (use TEMP env variable)
rclone copy "gdrive:<inbox_path>/<filename>" "$TEMP/"
```

Then read based on file type:

- **Images** (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) — read with Claude's vision capability to extract text, facts, dates, and any relevant content.
- **PDFs** (`.pdf`) — read with Claude's native PDF capability.
- **All other types** — attempt to read as plain text.

If a file clearly corresponds to an existing Todoist inbox task (e.g., a screenshot whose name matches a task title), associate them as a single inbox entry rather than treating them separately.

## Mark Processed

Delete the file from Drive:

```bash
rclone deletefile "gdrive:<inbox_path>/<filename>"
```

Delete immediately after successful processing — do not batch. If deletion fails, report the error but continue processing other items.

## Mark Presented

Write the filename as a key to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` (create the file if it doesn't exist; merge into an existing JSON object if it does).

The file is NOT deleted from Drive — deferred items remain in the Drive inbox. The re-presentation guard prevents them from appearing in subsequent same-day runs.

Example state entry:
```json
{
  "screenshot-20260323.png": { "presented": "2026-03-23" }
}
```
