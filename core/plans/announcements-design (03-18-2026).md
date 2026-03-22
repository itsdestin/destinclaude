# Announcements Feature — Design

**Date:** 2026-03-18
**Status:** Implemented
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
  └─ calls announcement-fetch.js (nohup node ... >/dev/null 2>&1 &)
       ├─ fetches https://raw.githubusercontent.com/itsdestin/destinclaude/main/announcements.txt
       ├─ parses message + optional expiry date (validates date prefix format)
       └─ writes ~/.claude/.announcement-cache.json (atomically via tmp + rename)

[Every tool use] → statusline.sh
  └─ single node -e call: reads cache, checks staleness + expiry, outputs right-aligned fragment
       ├─ if message present + not expired + cache age < 7 days → bold yellow fragment appended to line 1
       └─ if empty / expired / stale / missing → empty fragment (line 1 unchanged)
```

**Fetch frequency:** Once per session start, unconditionally. No additional TTL or cooldown. The GitHub raw CDN handles the request volume; typical users do not restart sessions repeatedly.

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
- `YYYY-MM-DD: ` prefix sets an expiry date; stripped from displayed message. `announcement-fetch.js` must validate with `/^\d{4}-\d{2}-\d{2}: /`. If the prefix does not match exactly (e.g., `2026-3-5:` without zero-padding), treat the entire line as a message with no expiry — do not skip it.
- Blank/empty file → no announcement shown; to clear an announcement, **empty the file** (do not delete it — HTTP 404 is treated as offline, not as "no message")
- File containing only comment lines → treated identically to empty; cache written with `"message": ""`

### `~/.claude/.announcement-cache.json` (local, per-user)

```json
{
  "message": "New skill drop — update now!",
  "expires": "2026-03-25",
  "fetched_at": "2026-03-18T14:00:00.000Z"
}
```

- `expires` omitted when no date prefix in source
- `message: ""` written when source file is empty or comment-only
- Cache is always overwritten on every successful fetch, regardless of expiry state
- `fetched_at` **must** be written as ISO 8601 UTC: `new Date().toISOString()`. Parsed by `statusline.sh` as `new Date(fetched_at)` — any other format silently produces `NaN` and suppresses announcements permanently.
- **Atomic write:** use `os.homedir()` (not `~`; Node.js `fs` does not expand tilde). Construct paths:
  ```javascript
  const home = os.homedir();
  const cachePath = path.join(home, '.claude', '.announcement-cache.json');
  const tmpPath = cachePath + '.tmp';
  ```
  Write to `tmpPath`, then `fs.renameSync(tmpPath, cachePath)`. On failure: wrap in try/catch; attempt `fs.unlinkSync(tmpPath)` (also in try/catch — ignore if it throws); leave existing cache untouched; do not surface the error.

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
- **Prefix:** `★ ` (U+2605 + space = 2 display columns). Requires UTF-8 terminal locale. No ASCII fallback — UTF-8 is a DestinClaude prerequisite.
- **Terminal width:** read in shell as `COLS=${COLUMNS:-$(tput cols 2>/dev/null)}; COLS=${COLS:-80}`
- **`$LEFT_PLAIN` preparation (shell, before Node call):** strip ANSI from `$LEFT_ANSI_CONTENT` using a broad CSI pattern:
  ```bash
  LEFT_PLAIN=$(printf '%b' "$LEFT_ANSI_CONTENT" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g')
  ```
- **Invocation:**
  ```bash
  ANNOUNCEMENT_FRAGMENT=$(node -e "..." "$CACHE_FILE" "$COLS" "$LEFT_PLAIN" 2>/dev/null)
  ```
  `$CACHE_FILE` = absolute shell-expanded path to cache (not tilde). Node receives via `process.argv[2]`, `[3]`, `[4]`.
- **`$ANNOUNCEMENT_FRAGMENT`** is the right-side portion only — padding + ANSI prefix + message + reset. `statusline.sh` assembles line 1 as:
  ```bash
  printf '%b\n' "$LEFT_ANSI_CONTENT$ANNOUNCEMENT_FRAGMENT"
  ```
  If empty (no active announcement or Node unavailable), line 1 prints exactly as before.

### Right-Alignment Logic (single `node -e` call)

`$COLS` parsed: `const cols = parseInt(process.argv[3], 10) || 80`

**Staleness check:**
```javascript
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
if (!cache.message || (Date.now() - new Date(cache.fetched_at).getTime()) >= STALE_MS) process.exit(0);
```

**Expiry check** (manual date construction — no ICU dependency):
```javascript
const d = new Date();
const today = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
if (cache.expires && cache.expires < today) process.exit(0);
// Note: string comparison is correct only because expires is validated as zero-padded YYYY-MM-DD
```

**Layout:**
```
MIN_PAD = 2
PREFIX = '★ '   // PREFIX.length === 2; '…' assumed 1 display column (UTF-8 terminal prerequisite)
left_len = process.argv[4].length   // plain text after shell ANSI stripping
available = cols - left_len

if available < PREFIX.length + MIN_PAD + 1: process.exit(0)   // no room for even 1-char message

max_msg_len = available - PREFIX.length - MIN_PAD
if message.length > max_msg_len: message = message.slice(0, max_msg_len - 1) + '…'
// message.length <= max_msg_len, so pad = available - PREFIX.length - message.length >= MIN_PAD always
pad = available - PREFIX.length - message.length

output: ' '.repeat(pad) + BOLD_YELLOW + PREFIX + message + RESET
```

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Offline / GitHub unreachable | Show stale cache if age < 7 days and not expired; otherwise silent |
| Non-200 HTTP response (500, 403, etc.) | Treated as offline — no cache write, existing cache retained |
| Cache older than 7 days | Suppress display |
| Malformed / missing cache file | Silently skip announcement |
| Expired message (`expires < today`) | Nothing shown; suppressed on every render; may disappear mid-session at midnight. Accepted behavior. |
| Empty or comment-only `announcements.txt` | Cache written with `"message": ""`; nothing shown |
| HTTP 404 (file deleted from repo) | Treated as offline — stale cache shown up to 7 days. **Operational hazard:** always empty the file rather than deleting it. |
| `announcement-fetch.js` crash / Node unavailable | No cache written; existing cache used next render |
| Node unavailable at statusline render | `$ANNOUNCEMENT_FRAGMENT` empty; line 1 unaffected |

No errors are ever surfaced to the statusline. Announcements are purely additive.

**Post-expiry fetch:** Next successful fetch overwrites cache with current `announcements.txt` state — authoritative regardless of prior expiry.

---

## Background Invocation

`session-start.sh` launches the fetch script with:
```bash
nohup node "$ANNOUNCEMENT_FETCH_JS" >/dev/null 2>&1 &
```
- `nohup` prevents SIGHUP when parent shell exits
- `>/dev/null 2>&1` suppresses all output (POSIX-compatible; avoids bash-only `&>`)
- `$ANNOUNCEMENT_FETCH_JS` resolved via symlink chain:
  ```bash
  SCRIPT_REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null \
    || realpath "${BASH_SOURCE[0]}" 2>/dev/null \
    || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null \
    || echo "${BASH_SOURCE[0]}")"
  ANNOUNCEMENT_FETCH_JS="$(dirname "$SCRIPT_REAL")/announcement-fetch.js"
  ```

**Fetch implementation:** Use Node's built-in `fetch` (Node 18+, follows redirects automatically). Do not use `https.get` (does not follow redirects). No third-party HTTP libraries. Any non-200 response → treat as offline.

---

## Accepted Limitations

| Limitation | Impact | Decision |
|------------|--------|----------|
| Expiry uses local timezone | UTC+ users may see expiry up to ~24h early | Accepted — local date is intuitive for the operator |
| `LEFT_PLAIN.length` for column width | Non-ASCII session names cause ±1 char padding misalignment | Accepted — sync status strings are ASCII; session names rarely contain non-ASCII |
| `…` assumed 1 display column | Rare terminal environments may render it as 2 columns | Accepted — UTF-8 terminal required; standard behavior is 1 column |
| No HTTP request timeout | Slow CDN hangs background fetch briefly | Accepted — parent doesn't wait; worst case is a slow background process |
| All users see same announcement | No per-version/per-user targeting | Accepted by design |

---

## Implementation Checklist

- [ ] Create `announcements.txt` in repo root (empty initially)
- [ ] Create `core/hooks/announcement-fetch.js` (uses `fetch`, atomic write, `os.homedir()`)
- [ ] Modify `core/hooks/session-start.sh` to resolve and launch fetch script (`nohup ... >/dev/null 2>&1 &`)
- [ ] Modify `core/hooks/statusline.sh` to compute `$LEFT_PLAIN`, call single `node -e`, assemble line 1
- [ ] Update `core/specs/statusline-spec.md` (exists): add Announcements subsection to Data Flow, add cache file to File Locations table, add Dependencies row, add Design Decision for session-start-only fetch
- [ ] Check `docs/system-architecture.md`, `docs/index.html`, `README.md`, `core/specs/INDEX.md` for hook/file listings and update any that enumerate plugin hooks or cache files
- [ ] Commit and push
