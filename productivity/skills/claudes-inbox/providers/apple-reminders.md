# Apple Reminders Provider

**Platform:** macos

Reads incomplete reminders from a configured Reminders list. Intended for quick voice-captured or Siri-created reminders on iPhone or Mac.

Requires macOS with Apple Reminders installed. Uses AppleScript (`osascript`) for all operations.

## Configuration

Reads `inbox_provider_config.apple-reminders.list` from `~/.claude/toolkit-state/config.json`. Default list: `"Claude"`.

## List

1. Run AppleScript to get all incomplete reminders in the configured list:
   ```bash
   osascript -e 'tell application "Reminders" to get {name, id, body, creation date} of reminders of list "<list>" whose completed is false'
   ```
   If the list does not exist, skip this provider.

2. Check `~/.claude/inbox/state/presented-<today's date>.json` — skip any reminders whose ID appears as a key in this file (re-presentation guard).

3. Return remaining reminders sorted by creation date, newest first.

## Read

1. **Content:** The reminder `name` field is the primary content (voice dictations and quick captures land here).
2. **Detail:** The `body` (notes field) provides additional context. May be empty.
3. There are no attachments for Reminders items.

## Mark Processed

Mark the reminder as completed:

```bash
osascript -e 'tell application "Reminders" to set completed of reminder id "<id>" of list "<list>" to true'
```

## Mark Presented

Write the reminder ID as a key to `~/.claude/inbox/state/presented-<YYYY-MM-DD>.json` (create the file if it doesn't exist; merge into an existing JSON object if it does).

The reminder is NOT marked complete — it remains in the list until resolved. The state file prevents re-presentation on subsequent same-day runs.

Example state entry:
```json
{
  "x-apple-reminder://ABC123": { "presented": "2026-03-23" }
}
```
