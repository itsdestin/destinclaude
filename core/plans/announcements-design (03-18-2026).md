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
- Blank/empty file → no announcement shown; to clear an announcement, empty the file (do not delete it — HTTP 404 is treated as offline, not as "no message")
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
- `message: ""` written when source file is empty or comment-only (clears display)
- Cache is always overwritten on every successful fetch, regardless of expiry state
- `fetched_at` **must** be written as an ISO 8601 UTC string: `new Date().toISOString()`. `statusline.sh` parses it with `new Date(fetched_at)` — any other format will silently produce `NaN` and suppress the announcement permanently.
- `announcement-fetch.js` **must** write atomically: write to a temp file (e.g., `~/.claude/.announcement-cache.json.tmp`), then rename to final path. This prevents `statusline.sh` from reading a partially-written file. If rename fails, the malformed-cache fallback in `statusline.sh` handles it silently.

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
  ANNOUNCEMENT_FRAGMENT=$(node -e "..." "$CACHE_FILE" "$COLS" "$LEFT_PLAIN" 2>/dev/null)
  ```
  where `$CACHE_FILE` is the absolute path to `~/.claude/.announcement-cache.json`, `$COLS` is the integer terminal width, and `$LEFT_PLAIN` is the ANSI-stripped plain-text content of line 1's left side (session name if present, sync status otherwise). Node receives these three values as `process.argv[2]`, `process.argv[3]`, `process.argv[4]`.
- **`$ANNOUNCEMENT_FRAGMENT` is the right-side portion only** — it contains the padding spaces + ANSI-formatted prefix + message + reset. It does NOT include the left content. `statusline.sh` assembles line 1 as `printf '%b\n' "$LEFT_ANSI_CONTENT$ANNOUNCEMENT_FRAGMENT"`, where `$LEFT_ANSI_CONTENT` is the already-ANSI-formatted left side. If `$ANNOUNCEMENT_FRAGMENT` is empty (no active announcement or Node unavailable), `statusline.sh` prints line 1 exactly as before: `printf '%b\n' "$LEFT_ANSI_CONTENT"`.
- All string manipulation — cache reading, truncation, padding, ANSI rendering — for the right-side fragment happens inside the Node.js call.
- **`$LEFT_PLAIN` preparation (done in shell before the Node call):** strip ANSI codes from `$LEFT_ANSI_CONTENT` using `sed`: `LEFT_PLAIN=$(printf '%b' "$LEFT_ANSI_CONTENT" | sed 's/\x1b\[[0-9;]*m//g')`. This produces a plain ASCII string with no escape sequences. `$LEFT_PLAIN` is what gets passed to Node as `process.argv[4]`. `left_content_length` inside Node is simply `process.argv[4].length`.
- **If Node.js is unavailable during statusline render:** the `node -e` call will fail; `$ANNOUNCEMENT_LINE` will be empty; the announcement line is silently suppressed. No error output is shown.
- **Overflow:** truncate message with `…` to fit on one line. If left content leaves fewer than `prefix_length + 3` chars of right-side space, skip announcement entirely for that render.

**Right-alignment logic (implemented inside the `node -e` call; outputs fragment only):**
```
MIN_PAD = 2
PREFIX = '★ '   // PREFIX.length === 2 (U+2605 is a BMP code point, .length === 1; plus space = 2)
left_len = LEFT_PLAIN.length   // plain text, no ANSI, measured directly
available = terminal_width - left_len

// Skip if no room for even a 1-char message
if available < PREFIX.length + MIN_PAD + 1: output nothing, exit

// Truncate message to fit, guaranteeing MIN_PAD spaces of padding
max_msg_len = available - PREFIX.length - MIN_PAD
if message.length > max_msg_len: message = message.slice(0, max_msg_len - 1) + '…'

// Pad is always >= MIN_PAD because message.length <= max_msg_len = available - PREFIX.length - MIN_PAD
pad = available - PREFIX.length - message.length   // no Math.max needed; invariant holds by construction

output: ' '.repeat(pad) + BOLD_YELLOW + PREFIX + message + RESET   // fragment only, no left content
```

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Offline / GitHub unreachable | Show stale cache if `Date.now() - new Date(fetched_at).getTime() < 7 * 24 * 60 * 60 * 1000` (UTC milliseconds) and message is not expired; otherwise silent. Staleness is evaluated in `statusline.sh`'s Node.js call on every render. |
| Cache older than 7 days | Suppress display even if message has no expiry date |
| Malformed / missing cache file | Silently skip announcement line |
| Expired message (`expires` date < today) | Nothing shown; cache not deleted but display suppressed. Expiry is re-evaluated on every statusline render — if a session runs past midnight past the expiry date, the message stops showing mid-session without a fetch. This is acceptable; no special handling required. Expiry is compared using the user's local date: `expires < new Date().toLocaleDateString('en-CA')`. **Intentional:** expiry uses local timezone for a lenient, user-friendly cutoff (message may show up to ~24h past UTC expiry for users west of UTC). This is best-effort leniency — on UTC-forced systems (some servers/WSL instances), the leniency does not apply. Staleness uses UTC milliseconds — the two checks intentionally use different time representations. |
| Empty or comment-only `announcements.txt` | Cache written with `"message": ""`; nothing shown |
| HTTP 404 (file deleted from repo) | Treated as offline/unreachable — stale cache shown for up to 7 days, then suppressed. **Operational hazard:** deleting the file leaves users seeing the last message for up to 7 days with no remote way to suppress it. **Always empty the file instead of deleting it to clear an announcement immediately.** |
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
- [ ] Update `core/specs/statusline-spec.md` (file exists): add an "Announcements" subsection under **Current Implementation → Data Flow** (create the subsection if it does not exist), add a row to the **File Locations** table for `~/.claude/.announcement-cache.json`, add a row to **Dependencies**, and add a **Design Decision** entry explaining the session-start-only fetch frequency choice
- [ ] Confirm whether any plugin-level file manifest or user-facing docs listing hook files need updating; add those files if so
- [ ] Commit and push
