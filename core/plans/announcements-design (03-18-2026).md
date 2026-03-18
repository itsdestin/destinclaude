# Announcements Feature — Design

**Date:** 2026-03-18
**Status:** Approved
**Feature:** Remote announcements broadcast from GitHub to all DestinClaude users' statuslines

---

## Purpose

Allow the DestinClaude repo owner to post messages that appear in the statuslines of all users who have the plugin installed. Messages are set by editing a single file on GitHub; they show up on next session start and clear automatically when expired or when the file is emptied.

---

## Components

### New Files
- **`announcements.txt`** — repo root; the file Destin edits on GitHub to broadcast a message
- **`core/hooks/announcement-fetch.js`** — Node.js script that fetches, parses, and caches the announcement

### Modified Files
- **`core/hooks/session-start.sh`** — calls `announcement-fetch.js` at session start (non-blocking)
- **`core/hooks/statusline.sh`** — reads cache and right-aligns announcement on line 1

---

## Data Flow

```
[Session Start] → session-start.sh
  └─ calls announcement-fetch.js in background (node announcement-fetch.js &>/dev/null &)
       ├─ fetches https://raw.githubusercontent.com/itsdestin/destinclaude/main/announcements.txt
       ├─ parses message + optional expiry date
       └─ writes ~/.claude/.announcement-cache.json

[Every tool use] → statusline.sh
  └─ reads ~/.claude/.announcement-cache.json via Node.js (process.argv path, no shell interpolation)
       ├─ if message present + not expired + cache age < 7 days → right-align on line 1 in bold yellow
       └─ if empty / expired / stale / missing → silent, no statusline change
```

**Fetch frequency:** Once per session start, unconditionally. No additional TTL or cooldown beyond that. The GitHub raw CDN handles the request volume; typical users do not restart sessions repeatedly.

---

## File Formats

### `announcements.txt` (repo root)

```
# With expiry date — auto-clears after date passes
2026-03-25: New skill drop — update now!

# Without expiry — stays until file is manually emptied
Hey friends — check out the new journaling skill!

# Empty file = no announcement
```

Rules:
- First non-empty, non-comment line is used as the announcement
- Lines starting with `#` are ignored
- `YYYY-MM-DD: ` prefix sets an expiry date; stripped from displayed message
- Blank/empty file → no announcement shown
- File containing only comment lines (`#`) → treated identically to an empty file; cache written with `"message": ""`

### `~/.claude/.announcement-cache.json` (local, per-user)

```json
{
  "message": "New skill drop — update now!",
  "expires": "2026-03-25",
  "fetched_at": "2026-03-18T14:00:00.000Z"
}
```

- `expires` omitted when no date prefix in source
- `message: ""` written when source file is empty (clears display)
- Cache is always overwritten on every successful fetch, regardless of expiry state

---

## Display Behavior

The announcement appears **right-aligned on statusline line 1**, sharing the row with the session name (left) or sync status (left) if no session name.

```
My Session Name          ★ New skill drop — update now!
```
```
OK: Changes Synced       ★ New skill drop — update now!
```

- **Color:** bold yellow (`\033[1;33m`)
- **Prefix:** `★ ` (2 characters: star + space). Requires UTF-8 terminal locale. No ASCII fallback — UTF-8 support is a prerequisite for DestinClaude consistent with other plugin features.
- **Alignment:** right-aligned. Terminal width read in shell as `COLS=${COLUMNS:-$(tput cols 2>/dev/null)}; COLS=${COLS:-80}`.
- **Invocation pattern:** `statusline.sh` calls:
  ```bash
  ANNOUNCEMENT_LINE=$(node -e "..." "$CACHE_FILE" "$COLS" "$LEFT_PLAIN" 2>/dev/null)
  ```
  where `$CACHE_FILE` is the absolute path to `~/.claude/.announcement-cache.json`, `$COLS` is the integer terminal width, and `$LEFT_PLAIN` is the ANSI-stripped plain-text content of line 1's left side (session name if present, sync status otherwise). All string manipulation — cache reading, truncation, padding, ANSI rendering — happens inside the Node.js call. Node receives these three values as `process.argv[2]`, `process.argv[3]`, `process.argv[4]`.
- **`left_content_length`:** the visible character length of `$LEFT_PLAIN` after ANSI escape codes are stripped. If the left side is empty, `left_content_length = 0`. ANSI stripping: remove all sequences matching `/\x1b\[[0-9;]*m/g` before measuring.
- **If Node.js is unavailable during statusline render:** the `node -e` call will fail; `$ANNOUNCEMENT_LINE` will be empty; the announcement line is silently suppressed. No error output is shown.
- **Overflow:** truncate message with `…` to fit on one line. If left content leaves fewer than `prefix_length + 3` chars of right-side space, skip announcement entirely for that render.

**Right-alignment logic (implemented inside the `node -e` call):**
```
PREFIX = '★ '  // prefix_length = 2
available = terminal_width - left_content_length
if available < PREFIX.length + 3: output nothing, exit
max_msg_len = available - PREFIX.length - 2   // 2 = minimum pad
if message.length > max_msg_len: message = message.slice(0, max_msg_len - 1) + '…'
pad = Math.max(2, available - PREFIX.length - message.length)  // enforce minimum pad=2
output: left_plain + ' '.repeat(pad) + BOLD_YELLOW + PREFIX + message + RESET
```

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Offline / GitHub unreachable | Show stale cache if `Date.now() - new Date(fetched_at).getTime() < 7 * 24 * 60 * 60 * 1000` (UTC milliseconds) and message is not expired; otherwise silent. Staleness is evaluated in `statusline.sh`'s Node.js call on every render. |
| Cache older than 7 days | Suppress display even if message has no expiry date |
| Malformed / missing cache file | Silently skip announcement line |
| Expired message (`expires` date < today) | Nothing shown; cache not deleted but display suppressed. Expiry is compared using the user's local date: `expires < new Date().toLocaleDateString('en-CA')`. **Intentional:** expiry uses local timezone for a lenient, user-friendly cutoff (message may show up to ~24h past the UTC expiry date for users west of UTC). Staleness uses UTC milliseconds — these two checks intentionally use different representations. |
| Empty `announcements.txt` | Cache written with `"message": ""`; nothing shown |
| `announcement-fetch.js` crash / Node unavailable (fetch) | Silently skipped; no cache written; existing cache (if any) used on next statusline render |
| Node.js unavailable during statusline render | `node -e` invocation produces no output; `$ANNOUNCEMENT_LINE` is empty; announcement silently suppressed |

No errors are ever surfaced to the user's statusline. Announcements are purely additive and must never break the existing display.

**Post-expiry fetch behavior:** On the next successful session-start fetch after a message has expired, the cache is overwritten with whatever is currently in `announcements.txt` (which may be empty, a new message, or the same expired message — in all cases the new cache state is authoritative).

---

## Background Invocation

`session-start.sh` launches the fetch script with:
```bash
node "$ANNOUNCEMENT_FETCH_JS" &>/dev/null &
```
- `&>/dev/null` suppresses all stdout/stderr so no output contaminates the session
- Trailing `&` detaches the process; session-start does not wait for it
- `$ANNOUNCEMENT_FETCH_JS` is resolved by finding the real path of the calling script, then looking for `announcement-fetch.js` as a sibling. Symlink resolution chain (same as used for `usage-fetch.js` in `statusline.sh`):
  ```bash
  SCRIPT_REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null \
    || realpath "${BASH_SOURCE[0]}" 2>/dev/null \
    || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null \
    || echo "${BASH_SOURCE[0]}")"
  ANNOUNCEMENT_FETCH_JS="$(dirname "$SCRIPT_REAL")/announcement-fetch.js"
  ```

---

## Implementation Checklist

- [ ] Create `announcements.txt` in repo root (empty initially)
- [ ] Create `core/hooks/announcement-fetch.js`
- [ ] Modify `core/hooks/session-start.sh` to call fetch script (background, output suppressed)
- [ ] Modify `core/hooks/statusline.sh` to read cache via Node.js and display right-aligned
- [ ] Update `core/specs/statusline-spec.md` (file exists): add an "Announcements" subsection under **Current Implementation → Data Flow**, add a row to the **File Locations** table for `~/.claude/.announcement-cache.json`, add a row to **Dependencies**, and add a **Design Decision** entry explaining the session-start-only fetch frequency choice
- [ ] Commit and push
