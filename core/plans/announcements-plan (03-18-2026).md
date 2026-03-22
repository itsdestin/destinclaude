# Announcements Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remote announcements system that displays a repo-owner-controlled message right-aligned on statusline line 1 for all DestinClaude users.

**Architecture:** A new `announcement-fetch.js` script fetches `announcements.txt` from the GitHub repo on session start (background, non-blocking) and caches the result to `~/.claude/.announcement-cache.json`. On every tool use, `statusline.sh` reads this cache and right-aligns a bold yellow announcement fragment on line 1 alongside the existing left-side content.

**Tech Stack:** Bash, Node.js 18+ (`fetch` built-in), `os`/`path`/`fs` Node builtins, Git Bash / macOS / Linux shell

**Design doc:** `core/plans/announcements-design (03-18-2026).md`

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `announcements.txt` | New empty file in repo root — Destin edits this to broadcast messages |
| Create | `core/hooks/announcement-fetch.js` | New Node.js script: fetch → parse → atomic cache write |
| Modify | `core/hooks/session-start.sh` | Add background announcement fetch at end of file (before `exit 0`) |
| Modify | `core/hooks/statusline.sh` | Restructure lines 39-60 to compute and display announcement fragment on line 1 |
| Modify | `core/specs/statusline-spec.md` | Document announcements subsystem |

---

## Task 1: Create `announcements.txt`

**Files:**
- Create: `announcements.txt` (repo root)

- [ ] **Step 1: Create the file**

```bash
# In the destinclaude repo root
touch /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
```

The file should be empty initially. Users will see no announcement until you add content.

Format reference (do NOT add this now — for future use):
```
# With expiry (auto-clears after date):
2026-03-25: New skill drop — update now!

# Without expiry (stays until file is emptied):
Hey friends — check the new journaling skill!
```

- [ ] **Step 2: Verify it exists and is empty**

```bash
ls -la /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
cat /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
# Expected: file exists, zero bytes
```

- [ ] **Step 3: Commit**

```bash
cd /c/Users/desti/.claude/plugins/destinclaude
git add announcements.txt
git commit -m "feat: add announcements.txt broadcast file"
```

---

## Task 2: Create `announcement-fetch.js`

**Files:**
- Create: `core/hooks/announcement-fetch.js`

This script is called by `session-start.sh` on every session start. It fetches the raw GitHub file, parses it, and writes a cache file atomically. It must be completely silent — no stdout/stderr output.

- [ ] **Step 1: Create the file**

```javascript
// core/hooks/announcement-fetch.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ANNOUNCEMENTS_URL =
  'https://raw.githubusercontent.com/itsdestin/destinclaude/main/announcements.txt';

const home = os.homedir();
const cachePath = path.join(home, '.claude', '.announcement-cache.json');
const tmpPath = cachePath + '.tmp';

async function run() {
  let response;
  try {
    response = await fetch(ANNOUNCEMENTS_URL);
  } catch (_) {
    return; // offline or DNS failure — leave existing cache intact
  }

  if (!response.ok) return; // non-200 — treat as offline

  const text = await response.text();
  const lines = text.split('\n');

  let message = '';
  let expires;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Validate zero-padded date prefix: YYYY-MM-DD: message
    const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2}): (.+)$/);
    if (dateMatch) {
      expires = dateMatch[1];
      message = dateMatch[2].trim();
    } else {
      message = trimmed;
    }
    break; // use only the first valid line
  }

  const cache = { message, fetched_at: new Date().toISOString() };
  if (expires) cache.expires = expires;

  // Atomic write: tmp → rename
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2), 'utf8');
    fs.renameSync(tmpPath, cachePath);
  } catch (_) {
    try { fs.unlinkSync(tmpPath); } catch (_) {} // clean up tmp; ignore errors
  }
}

run();
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x /c/Users/desti/.claude/plugins/destinclaude/core/hooks/announcement-fetch.js
```

- [ ] **Step 3: Manual test — offline / empty file behavior**

```bash
# Run directly (empty announcements.txt = should write message:"" to cache)
node /c/Users/desti/.claude/plugins/destinclaude/core/hooks/announcement-fetch.js

# Check cache was written
cat ~/.claude/.announcement-cache.json
# Expected: {"message":"","fetched_at":"<ISO timestamp>"}
```

- [ ] **Step 4: Manual test — with a message**

```bash
# Temporarily put a test message in announcements.txt
echo "2099-12-31: Test announcement from plan" > /c/Users/desti/.claude/plugins/destinclaude/announcements.txt

# Run fetch
node /c/Users/desti/.claude/plugins/destinclaude/core/hooks/announcement-fetch.js

# Check cache
cat ~/.claude/.announcement-cache.json
# Expected:
# {
#   "message": "Test announcement from plan",
#   "expires": "2099-12-31",
#   "fetched_at": "..."
# }

# Clean up test message
> /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
```

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/.claude/plugins/destinclaude
git add core/hooks/announcement-fetch.js
git commit -m "feat: add announcement-fetch.js — fetches and caches remote announcements"
```

---

## Task 3: Modify `session-start.sh`

**Files:**
- Modify: `core/hooks/session-start.sh`

Add a background announcement fetch near the end of the file, before the `exit 0`. The symlink resolution pattern already exists in the file (toolkit version check section) — use the same pattern.

- [ ] **Step 1: Read the current end of the file to find insertion point**

```bash
grep -n "Check inbox\|exit 0\|Periodic" /c/Users/desti/.claude/plugins/destinclaude/core/hooks/session-start.sh
```

The insertion point is **before** the `# --- Check inbox ---` block.

- [ ] **Step 2: Add the announcement fetch block**

In `core/hooks/session-start.sh`, insert the following block **before** the `# --- Check inbox ---` section:

```bash
# --- Announcement fetch (background) ---
if command -v node &>/dev/null; then
    ANNOUNCE_SCRIPT_REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null \
        || realpath "${BASH_SOURCE[0]}" 2>/dev/null \
        || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null \
        || echo "${BASH_SOURCE[0]}")"
    ANNOUNCEMENT_FETCH="$(dirname "$ANNOUNCE_SCRIPT_REAL")/announcement-fetch.js"
    if [[ -f "$ANNOUNCEMENT_FETCH" ]]; then
        nohup node "$ANNOUNCEMENT_FETCH" >/dev/null 2>&1 &
    fi
fi
```

- [ ] **Step 3: Verify the edit looks correct**

```bash
grep -A 12 "Announcement fetch" /c/Users/desti/.claude/plugins/destinclaude/core/hooks/session-start.sh
```

- [ ] **Step 4: Test by running session-start.sh directly**

```bash
# First put a test message back in announcements.txt
echo "2099-12-31: Test announcement" > /c/Users/desti/.claude/plugins/destinclaude/announcements.txt

# Delete existing cache to confirm it gets recreated
rm -f ~/.claude/.announcement-cache.json

# Run session-start (it will background the fetch; wait a moment)
bash /c/Users/desti/.claude/plugins/destinclaude/core/hooks/session-start.sh
sleep 3

# Check cache was created
cat ~/.claude/.announcement-cache.json
# Expected: JSON with message and fetched_at

# Clean up test message
> /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
```

- [ ] **Step 5: Commit**

```bash
cd /c/Users/desti/.claude/plugins/destinclaude
git add core/hooks/session-start.sh
git commit -m "feat: launch announcement-fetch.js on session start"
```

---

## Task 4: Modify `statusline.sh`

**Files:**
- Modify: `core/hooks/statusline.sh`

This is the most complex change. The current lines 39-60 print session name and sync status independently. We need to:
1. Move sync status computation before the session name output
2. Compute terminal width
3. Compute LEFT_PLAIN (ANSI-stripped left content)
4. Run a single `node -e` call to get the announcement fragment
5. Merge left content + fragment onto one line

**Current structure (lines 39-60):**
```
Line 39-42: Print session name (if present)
Line 44-60: Compute SYNC_DISPLAY + print it
```

**New structure:**
```
Compute SYNC_DISPLAY (moved up)
Compute COLS
Compute LEFT_ANSI_CONTENT and LEFT_PLAIN
Compute ANNOUNCEMENT_FRAGMENT via node -e
Print line 1: LEFT_ANSI_CONTENT + ANNOUNCEMENT_FRAGMENT
If session name was present, also print sync status on its own line
```

- [ ] **Step 1: Replace lines 39-60 in `statusline.sh`**

Replace this block:
```bash
# --- Line 1: Session name (only if named) ---
if [[ -n "$SESSION_NAME" ]]; then
    printf '%b\n' "${BOLD}${WHITE}${SESSION_NAME}${RESET}"
fi

# --- Line 2: Sync status ---
SYNC=""
if [ -f "$STATUS_FILE" ]; then
    SYNC=$(cat "$STATUS_FILE" 2>/dev/null)
fi

if [[ "$SYNC" == OK:* ]] || [[ "$SYNC" == "Changes Synced"* ]]; then
    SYNC_DISPLAY="${GREEN}${SYNC}${RESET}"
elif [[ "$SYNC" == WARN:* ]]; then
    SYNC_DISPLAY="${YELLOW}${SYNC}${RESET}"
elif [[ "$SYNC" == ERR:* ]]; then
    SYNC_DISPLAY="${RED}${SYNC}${RESET}"
else
    SYNC_DISPLAY="${DIM}No Sync Status${RESET}"
fi

printf '%b\n' "$SYNC_DISPLAY"
```

With this new block:
```bash
# --- Sync status (computed first, used for both display and announcement alignment) ---
SYNC=""
if [ -f "$STATUS_FILE" ]; then
    SYNC=$(cat "$STATUS_FILE" 2>/dev/null)
fi

if [[ "$SYNC" == OK:* ]] || [[ "$SYNC" == "Changes Synced"* ]]; then
    SYNC_DISPLAY="${GREEN}${SYNC}${RESET}"
elif [[ "$SYNC" == WARN:* ]]; then
    SYNC_DISPLAY="${YELLOW}${SYNC}${RESET}"
elif [[ "$SYNC" == ERR:* ]]; then
    SYNC_DISPLAY="${RED}${SYNC}${RESET}"
else
    SYNC_DISPLAY="${DIM}No Sync Status${RESET}"
fi

# --- Announcement fragment (right-aligned on line 1) ---
COLS=${COLUMNS:-$(tput cols 2>/dev/null)}
COLS=${COLS:-80}
CACHE_FILE="$HOME/.claude/.announcement-cache.json"

if [[ -n "$SESSION_NAME" ]]; then
    LEFT_ANSI_CONTENT="${BOLD}${WHITE}${SESSION_NAME}${RESET}"
    LEFT_PLAIN="$SESSION_NAME"
else
    LEFT_ANSI_CONTENT="$SYNC_DISPLAY"
    LEFT_PLAIN=$(printf '%b' "$SYNC_DISPLAY" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g')
fi

ANNOUNCEMENT_FRAGMENT=""
if [[ -f "$CACHE_FILE" ]] && command -v node &>/dev/null; then
    ANNOUNCEMENT_FRAGMENT=$(node -e "
const fs = require('fs');
const cols = parseInt(process.argv[3], 10) || 80;
const leftPlain = process.argv[4] || '';
try {
    const cache = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    if (!cache.message) process.exit(0);
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;
    if ((Date.now() - new Date(cache.fetched_at).getTime()) >= STALE_MS) process.exit(0);
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (cache.expires && cache.expires < today) process.exit(0);
    const PREFIX = '\u2605 ';
    const MIN_PAD = 2;
    const available = cols - leftPlain.length;
    if (available < PREFIX.length + MIN_PAD + 1) process.exit(0);
    const maxMsgLen = available - PREFIX.length - MIN_PAD;
    let msg = cache.message;
    if (msg.length > maxMsgLen) msg = msg.slice(0, maxMsgLen - 1) + '\u2026';
    const pad = available - PREFIX.length - msg.length;
    process.stdout.write(' '.repeat(pad) + '\x1b[1;33m' + PREFIX + msg + '\x1b[0m');
} catch (_) {}
" "$CACHE_FILE" "$COLS" "$LEFT_PLAIN" 2>/dev/null) || ANNOUNCEMENT_FRAGMENT=""
fi

# --- Lines 1-2: Session name / sync status + announcement ---
printf '%b\n' "${LEFT_ANSI_CONTENT}${ANNOUNCEMENT_FRAGMENT}"
if [[ -n "$SESSION_NAME" ]]; then
    printf '%b\n' "$SYNC_DISPLAY"
fi
```

- [ ] **Step 2: Verify the edit is correct**

```bash
# Check no syntax errors
bash -n /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh
# Expected: no output (no errors)
```

- [ ] **Step 3: Manual test — no announcement (empty cache)**

```bash
# Ensure cache has empty message
echo '{"message":"","fetched_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > ~/.claude/.announcement-cache.json

# Run statusline with mock session JSON (no session name)
echo '{"model":{"display_name":"claude-sonnet-4-6"},"context_window":{"remaining_percentage":85}}' \
  | bash /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh
# Expected: normal statusline output, no announcement on any line
```

- [ ] **Step 4: Manual test — with announcement, no session name**

```bash
# Write a test announcement cache
echo '{"message":"Test: no session name","fetched_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
  > ~/.claude/.announcement-cache.json

echo '{"model":{"display_name":"claude-sonnet-4-6"},"context_window":{"remaining_percentage":85}}' \
  | bash /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh
# Expected: first line shows "[sync status]    ★ Test: no session name" (right-aligned, yellow)
```

- [ ] **Step 5: Manual test — with announcement and session name**

```bash
echo '{"session_name":"My Session","model":{"display_name":"claude-sonnet-4-6"},"context_window":{"remaining_percentage":85}}' \
  | bash /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh
# Expected:
#   Line 1: "My Session    ★ Test: no session name" (right-aligned, yellow)
#   Line 2: sync status (separate line)
#   Line 3: model + context
```

- [ ] **Step 6: Manual test — expired announcement**

```bash
echo '{"message":"Expired message","expires":"2020-01-01","fetched_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' \
  > ~/.claude/.announcement-cache.json

echo '{"model":{"display_name":"claude-sonnet-4-6"},"context_window":{"remaining_percentage":85}}' \
  | bash /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh
# Expected: no announcement shown (expired)
```

- [ ] **Step 7: Clean up test cache**

```bash
rm -f ~/.claude/.announcement-cache.json
```

- [ ] **Step 8: Commit**

```bash
cd /c/Users/desti/.claude/plugins/destinclaude
git add core/hooks/statusline.sh
git commit -m "feat: display remote announcement right-aligned on statusline line 1"
```

---

## Task 5: Update `statusline-spec.md`

**Files:**
- Modify: `core/specs/statusline-spec.md`

- [ ] **Step 1: Add Announcements subsection to Data Flow**

In the **Current Implementation → Data Flow** section, add after the existing statusline.sh flow:

```markdown
**Announcements subsystem:**
- `session-start.sh` launches `announcement-fetch.js` in the background on every session start
- `announcement-fetch.js` fetches `https://raw.githubusercontent.com/itsdestin/destinclaude/main/announcements.txt`, parses message + optional expiry, writes `~/.claude/.announcement-cache.json` atomically
- `statusline.sh` reads the cache on every render via a single `node -e` call; displays a bold yellow `★ message` fragment right-aligned on line 1 if the message is present, not expired, and cache is < 7 days old
```

- [ ] **Step 2: Add row to File Locations table**

```markdown
| `~/.claude/.announcement-cache.json` | Written by announcement-fetch.js; read by statusline.sh on every render | Updated on each session start |
```

- [ ] **Step 3: Add Design Decision entry**

```markdown
| Fetch only on session start (no per-render TTL) | Keeps statusline render latency at zero; announcements are not time-critical enough to justify per-render fetching. Cache age of 7 days used as stale threshold to handle offline users. | Per-render fetch (rejected: adds network latency to every tool use), 30-min TTL (rejected: unnecessary complexity for a broadcast-only system) |
```

- [ ] **Step 4: Add Dependencies row**

In the Dependencies section, add:
```
- Depends on: announcement-fetch.js (writes `.announcement-cache.json`), Node.js 18+ (`fetch` built-in required)
```

- [ ] **Step 5: Bump spec version and add change log entry**

Bump version from `1.3` → `1.4`. Add to change log:
```markdown
| 2026-03-18 | 1.4 | Announcements subsystem: session-start fetch + statusline right-aligned display | Update | — | |
```

- [ ] **Step 6: Verify the spec reads cleanly**

```bash
# Quick sanity check — no garbled content
grep -n "Announcements\|announcement" /c/Users/desti/.claude/plugins/destinclaude/core/specs/statusline-spec.md
```

- [ ] **Step 7: Commit**

```bash
cd /c/Users/desti/.claude/plugins/destinclaude
git add core/specs/statusline-spec.md
git commit -m "docs: update statusline-spec.md for announcements subsystem (v1.4)"
```

---

## Task 6: End-to-End Test and Push

- [ ] **Step 1: Put a real test announcement in `announcements.txt`**

```bash
echo "2099-12-31: DestinClaude announcements working!" \
  > /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
git -C /c/Users/desti/.claude/plugins/destinclaude add announcements.txt
git -C /c/Users/desti/.claude/plugins/destinclaude commit -m "test: add test announcement"
git -C /c/Users/desti/.claude/plugins/destinclaude push
```

- [ ] **Step 2: Trigger a fetch manually**

```bash
rm -f ~/.claude/.announcement-cache.json
node /c/Users/desti/.claude/plugins/destinclaude/core/hooks/announcement-fetch.js
cat ~/.claude/.announcement-cache.json
# Expected: {"message":"DestinClaude announcements working!","expires":"2099-12-31","fetched_at":"..."}
```

- [ ] **Step 3: Verify statusline shows the announcement**

```bash
echo '{"session_name":"Test Session","model":{"display_name":"claude-sonnet-4-6"},"context_window":{"remaining_percentage":85}}' \
  | bash /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh
# Expected: Line 1 = "Test Session    ★ DestinClaude announcements working!" (yellow, right-aligned)
```

- [ ] **Step 4: Clear the announcement**

```bash
> /c/Users/desti/.claude/plugins/destinclaude/announcements.txt
git -C /c/Users/desti/.claude/plugins/destinclaude add announcements.txt
git -C /c/Users/desti/.claude/plugins/destinclaude commit -m "chore: clear test announcement"
git -C /c/Users/desti/.claude/plugins/destinclaude push
```

- [ ] **Step 5: Verify announcement clears after next fetch**

```bash
node /c/Users/desti/.claude/plugins/destinclaude/core/hooks/announcement-fetch.js
echo '{"session_name":"Test Session","model":{"display_name":"claude-sonnet-4-6"},"context_window":{"remaining_percentage":85}}' \
  | bash /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh
# Expected: Line 1 = "Test Session" only — no announcement
```

- [ ] **Step 6: Check `docs/system-architecture.md`, `docs/index.html`, `README.md`, `core/specs/INDEX.md` for listings to update**

```bash
grep -l "statusline\|session-start\|hooks" \
  /c/Users/desti/.claude/plugins/destinclaude/docs/system-architecture.md \
  /c/Users/desti/.claude/plugins/destinclaude/docs/index.html \
  /c/Users/desti/.claude/plugins/destinclaude/README.md \
  /c/Users/desti/.claude/plugins/destinclaude/core/specs/INDEX.md 2>/dev/null
# Update any files that enumerate hook components or cache files
```

- [ ] **Step 7: Push all commits**

```bash
cd /c/Users/desti/.claude/plugins/destinclaude
git push
```

---

## Rollback

If something breaks the statusline:

```bash
# Restore statusline.sh from git
git -C /c/Users/desti/.claude/plugins/destinclaude checkout HEAD~1 -- core/hooks/statusline.sh

# Rebuild symlink
ln -sf /c/Users/desti/.claude/plugins/destinclaude/core/hooks/statusline.sh ~/.claude/statusline.sh
```
