# Statusline & Auto-Title — Spec

**Version:** 1.5
**Last updated:** 2026-03-18
**Feature location:** `core/hooks/statusline.sh`, `core/hooks/title-update.sh`, `core/hooks/usage-fetch.js`, `core/hooks/announcement-fetch.js`
(Installed via symlinks to `~/.claude/hooks/` and `~/.claude/statusline.sh`)

## Purpose

A real-time information display system for Claude Code sessions. Four components work together: (1) **statusline.sh** renders a multi-line status bar showing session topic, sync status, model/context info, rate limits, announcements, and toolkit version; (2) **title-update.sh** periodically prompts Claude to set a human-readable topic for the session; (3) **usage-fetch.js** retrieves and caches API usage/rate-limit data from the Anthropic OAuth endpoint; (4) **announcement-fetch.js** fetches broadcast announcements from the destinclaude GitHub repo.

## User Mandates

- All statusline items, chat names, sync statuses, and menu options must use Title Case (2026-03-15)
- Auto-Title reminders must use `~/.claude/topics/` paths for Bash echo commands (2026-03-18, updated from `/tmp/` per v1.1.1 security fix)
- Topic summaries must be 3–5 words in Title Case (2026-03-15)

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Per-session topic files in `~/.claude/topics/` | Prevents symlink attacks on world-writable `/tmp/` (v1.1.1 security fix). Multiple sessions don't clobber each other. Pruned after 7 days. Directory excluded from git via `.gitignore`. | `~/.claude/topics/` (rejected in v1.1.1: symlink attack vector on multi-user systems), `~/.claude/` root (rejected: triggers backup hooks on every topic write) |
| Adaptive throttle on Auto-Title reminders | 2-minute interval while topic is still "New Session" (aggressive nag), 10-minute interval once titled (gentle refresh). Solves 37% miss rate from v1.0 where untitled sessions stayed untitled forever. | Fixed 10-minute for all (rejected: too patient with untitled sessions), every tool use (rejected: too noisy once titled), manual only (rejected: topics would never get set) |
| Bash echo instead of Write tool | Topic files are trivial one-liners. Write tool requires a Read-first step that adds friction and errors ("Error writing file" if skipped). Bash echo is atomic, single-step, no preconditions. | Write tool (rejected: requires Read first, causes user-visible errors, adds 2 tool calls for 1 line) |
| Usage data cached with 5-minute TTL | Keeps statusline snappy while limiting API calls; stale cache served on failure for resilience | No cache (rejected: API call on every statusline render would be slow), longer TTL (rejected: usage data becomes misleading near rate limits) |
| Node.js for JSON parsing in statusline | Already available in the environment; avoids Python startup overhead for a latency-sensitive path | Python (rejected: slower startup), jq (rejected: not reliably installed on Windows/Git Bash), pure bash (rejected: fragile JSON parsing) |
| Color thresholds: green/yellow/red at standard breakpoints | Context remaining: <50% yellow, <20% red. Usage: ≥50% yellow, ≥80% red. Intuitive traffic-light pattern. | Single color (rejected: loses at-a-glance urgency signal) |
| `printf '%b\n'` for all ANSI output | POSIX-portable escape handling. `echo -e` is non-standard and fails in some shells (dash, sh). | `echo -e` (rejected: non-portable), `$'\033[...'` ANSI-C quoting (rejected: less readable) |
| Cross-platform symlink resolution | Scripts are symlinked from `~/.claude/hooks/` but need to find sibling files at their real location (e.g., `usage-fetch.js`). Uses `readlink -f || realpath || python3` fallback chain. | Bare `BASH_SOURCE[0]` (rejected: returns symlink path, not real path — breaks toolkit-root discovery and sibling file lookup) |
| macOS Keychain fallback for credentials | Claude Max subscribers on macOS store OAuth tokens in Keychain, not `.credentials.json`. Uses `execFileSync('security', ...)` (safe, no shell injection). | `execSync` with string interpolation (rejected: shell injection surface), file-only (rejected: breaks for all macOS Max subscribers) |
| Prune topic/marker files older than 7 days, at most once per day | Prevents `~/.claude/topics/` from accumulating stale files across sessions without running cleanup on every invocation | No cleanup (rejected: unbounded growth), cleanup on every invocation (rejected: unnecessary filesystem churn) |
| `hookSpecificOutput` JSON for Auto-Title delivery | Ensures the reminder appears in Claude's context as a system-reminder, not as plain hook output that might be ignored | Plain stdout (rejected: not reliably surfaced to Claude), file-based signaling (rejected: Claude doesn't poll files) |
| Fetch announcements only on session start (no per-render TTL) | Keeps statusline render latency at zero; announcements are not time-critical enough to justify per-render fetching. Cache age of 7 days used as stale threshold to handle offline users. | Per-render fetch (rejected: adds network latency to every tool use), 30-min TTL (rejected: unnecessary complexity for a broadcast-only system) |

## Current Implementation

### Data Flow

```
[Every tool use] → title-update.sh
  ├─ Reads session_id from stdin JSON
  ├─ Checks marker file for adaptive throttle (2-min/10-min)
  ├─ If due: emits hookSpecificOutput with [Auto-Title] reminder
  └─ Claude writes topic to ~/.claude/topics/topic-{session_id}

[Statusline render] → statusline.sh
  ├─ Parses session JSON (model, context %, session_id)
  ├─ Reads ~/.claude/topics/topic-{session_id} for topic
  ├─ Reads ~/.claude/.sync-status for sync display
  ├─ Resolves symlinks to find real script location
  ├─ Calls usage-fetch.js (sibling file) for rate-limit data
  ├─ Reads toolkit-state/update-status.json for version
  └─ Outputs 2-5 lines with ANSI coloring via printf %b

[Usage fetch] → usage-fetch.js
  ├─ Checks ~/.claude/.usage-cache.json (5-min TTL)
  ├─ If stale: reads OAuth token from ~/.claude/.credentials.json
  │   └─ macOS fallback: reads from Keychain via `security` CLI
  ├─ Fetches https://api.anthropic.com/api/oauth/usage
  └─ Writes cache, outputs JSON

[Session start] → session-start.sh
  └─ Launches announcement-fetch.js in the background (nohup, non-blocking)

[Announcement fetch] → announcement-fetch.js
  ├─ Fetches https://raw.githubusercontent.com/itsdestin/destinclaude/master/announcements.txt
  ├─ Parses message + optional YYYY-MM-DD expiry prefix (zero-padded only)
  └─ Writes ~/.claude/.announcement-cache.json atomically (tmp → rename)
```

**Announcements subsystem:**
- `session-start.sh` launches `announcement-fetch.js` in the background on every session start
- `announcement-fetch.js` fetches the raw GitHub file, parses message + optional expiry, writes `~/.claude/.announcement-cache.json` atomically
- `statusline.sh` reads the cache on every render via a single `node -e` call; displays a bold yellow `★ message` fragment right-aligned on line 1 if the message is present, not expired, and cache is < 7 days old

### Output Format (up to 5 lines)

1. **Session name / sync status** (bold white / colored) + optional right-aligned **announcement** (bold yellow `★ message`) — announcement only shown if cache is present, not expired, and not stale (< 7 days)
2. **Sync status** — colored green/yellow/red based on prefix (OK/WARN/ERR)
3. **Model + Context** — dim model name, colored context remaining percentage
4. **Rate limits** — 5h and 7d utilization with reset times, colored by severity (only if data available)
5. **Toolkit version** — dim when current, yellow when update available

### File Locations

| File | Purpose | Lifetime |
|------|---------|----------|
| `~/.claude/topics/topic-{sid}` | Session topic text | Pruned after 7 days |
| `~/.claude/topics/marker-{sid}` | Throttle timestamp | Pruned after 7 days |
| `~/.claude/topics/.prune-marker` | Last-prune timestamp | Persistent |
| `~/.claude/.usage-cache.json` | Cached API usage response | Overwritten every 5 min |
| `~/.claude/.announcement-cache.json` | Written by announcement-fetch.js; read by statusline.sh on every render | Overwritten on each session start |
| `~/.claude/.sync-status` | Written by git-sync.sh | Updated on each backup |
| `~/.claude/toolkit-state/update-status.json` | Toolkit version check result | Written by session-start.sh |
| `~/.claude/statusline.log` | Stderr from statusline Node.js calls | Appended; for debugging |

### Cross-Platform Notes

- All ANSI output uses `printf '%b\n'` (not `echo -e`)
- Symlink resolution uses `readlink -f || realpath || python3` chain
- File paths passed to Node.js via `process.argv`, never string interpolation
- Hash computation uses `sha256sum || shasum -a 256` for macOS compatibility
- Credential resolution: file-based primary, macOS Keychain fallback via `execFileSync`

## Dependencies

- Depends on: git-sync.sh (writes `.sync-status`), session-start.sh (writes `update-status.json`), Node.js, Anthropic OAuth credentials (`~/.claude/.credentials.json` or macOS Keychain), Claude Code session JSON (stdin), announcement-fetch.js (writes `.announcement-cache.json`), Node.js 18+ (`fetch` built-in required for announcement-fetch.js)
- Depended on by: CLAUDE.md Auto-Title instructions (define Claude's behavior when it sees the reminder)

## Known Bugs / Issues

- (Fixed in v1.2) **37% miss rate:** Claude ignored Auto-Title reminders during complex tasks. Fixed by switching to Bash (eliminates Read-first friction) and adaptive throttle (2-min nag while untitled, 10-min once titled).
- (Fixed in v1.2) **"Error writing file":** Write tool requires Read first; Claude frequently skipped the Read step. Fixed by switching to Bash echo.
- (Fixed in v1.3) **Version never displayed:** Symlinked scripts resolved `BASH_SOURCE[0]` to `~/.claude/hooks/`, not the real file location. Upward walk for `VERSION` never reached the toolkit root. Fixed with cross-platform symlink resolution.
- (Fixed in v1.3) **Colors not rendering on some shells:** `echo -e` is non-portable. Fixed by switching to `printf '%b\n'`.
- (Fixed in v1.3) **macOS credential failure:** OAuth tokens stored in Keychain were inaccessible. Fixed with `execFileSync('security', ...)` fallback.
- (Fixed in v1.5) **Spec-code mismatch on topic path:** Spec said `/tmp/claude-topics/` but code used `~/.claude/topics/` since v1.1.1 security fix. Spec now aligned with code.

## Planned Updates

- **Session cost display:** The session JSON may contain cost data — could be added as a 6th statusline row if available
- **Configurable throttle interval:** Currently hardcoded to 10 minutes; could be made configurable if sessions vary in pace

## Change Log

| Date | Version | What changed | Type | Approved by | Session |
|------|---------|-------------|------|-------------|---------|
| 2026-03-15 | 1.0 | Initial spec | New | — | 118c52ce-0a35-4287-a452-77984243491f |
| 2026-03-15 | 1.1 | Fixed stale sync-to-drive.sh references to git-sync.sh | Revised | — | |
| 2026-03-16 | 1.2 | Fixed 37% miss rate and Write tool errors: switched to Bash echo, added adaptive throttle | Update | — | |
| 2026-03-17 | 1.3 | Session name display, rate limit display, printf %b, symlink resolution, macOS Keychain fallback, sha256sum cross-platform, process.argv for Node paths | Update | — | |
| 2026-03-18 | 1.5 | Aligned spec with v1.1.1 security fix: all `/tmp/claude-topics/` references updated to `~/.claude/topics/`. Updated mandate, design decision rationale, data flow, and file locations table. Updated component count to four (added announcement-fetch.js). | Update | Destin | |
| 2026-03-18 | 1.4 | Announcements subsystem: session-start background fetch + statusline right-aligned display | Update | — | |
