# Apple Notes Provider

**Platform:** macos

Reads notes from a configured Apple Notes folder. Intended for notes captured on iPhone or iPad via Siri, the Notes app, or share-sheet actions.

Requires macOS with Apple Notes installed. Uses AppleScript (`osascript`) for all operations.

## Configuration

Reads `inbox_provider_config.apple-notes.folder` from `~/.claude/toolkit-state/config.json`. Default folder: `"Claude"`.

## List

1. Run AppleScript to get all notes in the configured folder:
   ```bash
   osascript -e 'tell application "Notes" to get {name, id, modification date} of notes of folder "<folder>"'
   ```
   If the folder does not exist, skip this provider.

2. For each note, fetch a preview of the body to check the re-presentation guard:
   ```bash
   osascript -e 'tell application "Notes" to get body of note id "<id>" of folder "<folder>"'
   ```
   Skip any note whose body starts with `[presented: YYYY-MM-DD]` where the date is today.

3. Return remaining notes sorted by modification date, newest first.

## Read

1. Fetch the full note body via AppleScript. The body is returned as HTML.
2. Convert HTML to plain text: strip all HTML tags, decode HTML entities, preserve paragraph structure as newlines.
3. **Embedded images:** Attempt base64 extraction from `<img>` tags in the HTML source. Save extracted images to a temp directory and read with Claude's vision capability. If extraction fails for any image, note `"has embedded images (extraction failed)"` and proceed with text-only content.
4. There are no file attachments — only embedded images within the HTML body.

## Mark Processed

Delete the note:

```bash
osascript -e 'tell application "Notes" to delete note id "<id>" of folder "<folder>"'
```

## Mark Presented

Prepend `[presented: YYYY-MM-DD]\n\n` to the note body (using today's date). This modifies the note in place so the re-presentation guard catches it on the next run.

```bash
osascript -e 'tell application "Notes"
  set theNote to note id "<id>" of folder "<folder>"
  set oldBody to body of theNote
  set body of theNote to "[presented: <YYYY-MM-DD>]" & return & return & oldBody
end tell'
```

The note is NOT deleted — it stays in the folder until resolved or cleared.
