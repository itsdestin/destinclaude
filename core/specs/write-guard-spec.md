# Write Guard — Design Spec

**Version:** 1.2
**Date:** 2026-03-15
**Status:** Approved
**Related spec:** `backup-system-spec.md`
**Feature location:** `~/.claude/hooks/write-guard.sh`, registry update in `~/.claude/hooks/git-sync.sh`

## Problem

When two Claude Code sessions run simultaneously on the same machine and both edit the same tracked file, the second Write silently overwrites the first's changes. The existing backup system protects against cross-device conflicts (pull-before-push, content-aware conflict detection, session heartbeat) but has no protection for same-machine, same-time edits.

## Solution

Optimistic concurrency control via a centralized write registry and a PreToolUse hook that blocks writes when another active session last modified the target file.

## User Mandates

- (2026-03-14) Conflicting writes MUST be blocked (not just warned) — the session must re-read the file before retrying.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| Centralized write registry (single JSON file) | Simple, one file, easy to inspect and debug. No cleanup needed — stale entries are harmless and the registry converges to the set of actively edited tracked files. | Per-session content tracking (catches manual edits too, but adds cleanup burden and requires hooking Read operations), filesystem watcher (robust but adds a persistent background daemon — overkill). |
| `$PPID` as session identifier | Both PreToolUse and PostToolUse hooks are spawned by the same parent process (the Claude Code session), so `$PPID` is consistent across hook invocations for the same session. Simple and reliable for same-machine detection. | Session ID from `~/.claude/sessions/*.json` (more robust but adds file parsing overhead per hook invocation), environment variable injection (not supported by Claude Code hook system). |
| SHA-256 truncated to 16 hex chars | Enough to detect changes with negligible collision risk (64 bits), fast to compute via `sha256sum`. | Full SHA-256 (unnecessary — 16 chars is sufficient for change detection), MD5 (weaker but same practical outcome), file size + mtime (not reliable across platforms). |
| Registry not backed up to Drive | PIDs are machine-local ephemeral state — meaningless across devices. Same category as `.backup-lock/` and `.session-heartbeat`. | Back up registry (would cause spurious conflicts on other machines with different PIDs). |
| Registry update placed early in `git-sync.sh` (before commit/push) | If session A starts a slow push and session B writes the same file during that push, B's PreToolUse check needs to see A's registry entry immediately. | Update after push (creates a window where concurrent writes are undetected). |
| Registry update in `git-sync.sh` rather than separate PostToolUse hook | Avoids a second hook script firing on every write (two hooks = two JSON parses, two process spawns). The existing mutex lock serializes writes, protecting the registry from concurrent updates. | Separate PostToolUse hook (cleaner separation but doubles per-write overhead). |
| Protect all tracked files | Negligible overhead (one JSON lookup per write) and simpler than maintaining a separate "protected files" list. | Skills/specs only (most likely conflict targets, but leaves other files unprotected), configurable exclusion list (premature complexity). |

## Architecture

Two components:

1. **`write-guard.sh`** — A PreToolUse hook (fires before Write/Edit) that checks the registry and blocks conflicting writes.
2. **Registry updates in `git-sync.sh`** — The existing PostToolUse hook updates the registry after each successful tracked write.

### Write Registry

**File:** `~/.claude/.write-registry.json`

```json
{
  "~/.claude/skills/journaling-assistant/SKILL.md": {
    "pid": 12345,
    "ts": 1773540000,
    "hash": "a1b2c3d4e5f67890"
  }
}
```

- One entry per tracked file path, recording the last writer's PID, timestamp, and content hash.
- Hash: SHA-256 truncated to 16 hex characters.
- No cleanup needed — stale entries are harmless and the registry converges to the set of actively edited tracked files.
- Not backed up to Drive — PIDs are machine-local ephemeral state.

### PreToolUse Hook (`write-guard.sh`)

**Trigger:** PreToolUse for Write and Edit tools.

**Logic (in order):**

1. **Parse stdin JSON** — extract `tool_name` and `tool_input.file_path`. Normalize backslashes to forward slashes (same normalization as `git-sync.sh`).
2. **Tracked file filter** — same whitelist as `git-sync.sh`. Non-tracked files pass through (exit 0).
3. **Read registry** — parse `~/.claude/.write-registry.json`. If no entry for this file, allow (exit 0 — first write ever).
4. **Same-session check** — if registry PID matches `$PPID`, allow (exit 0 — we're the last writer). Assumption: both PreToolUse and PostToolUse hooks are spawned by the same parent process (the Claude Code session), so `$PPID` is consistent.
5. **Liveness check** — `tasklist //FI "PID eq $PID"` (Windows-compatible; `kill -0` doesn't work for Windows PIDs in Git Bash). If the other session is dead, allow (exit 0 — stale entry, no conflict).
6. **Staleness check** — compute SHA-256 (truncated to 16 hex) of the current file on disk. Compare against the registry's stored hash. If the on-disk hash differs from the registry hash, a third party (manual edit, another tool) modified the file after the registry entry was written — block regardless, since this session's view of the file is stale.
7. **Block** — exit non-zero with message: `"WRITE BLOCKED: This file was last modified by another active Claude session (PID {pid}) at {time}. Re-read the file to see the current version, then retry your edit."`

**Note:** Steps 6-7 both result in blocking when a different active session owns the registry entry. Step 6 catches additional third-party modifications; step 7 catches the primary case where the other session's version is still on disk but this session hasn't seen it.

**Performance:** ~50ms estimated overhead per write (JSON parse + sha256sum + kill -0). To be validated during implementation.

### PostToolUse Registry Update (in `git-sync.sh`)

Placed early in the script, right after the tracked-file filter passes (before the dedup window check):

1. Compute SHA-256 of written file, truncate to 16 hex chars.
2. Read existing registry JSON (or start with `{}`).
3. Upsert the entry: `{filepath: {pid: $PPID, ts: $(date +%s), hash: $HASH}}`.
4. Write atomically (`.write-registry.json.tmp` + `mv`).

**Error handling:** If the registry read fails (corrupted JSON, missing file), log to `~/.claude/backup.log` and proceed with the backup — registry failure must not block backups. If the write fails (permissions), log and continue.

### Hook Configuration

Added to `~/.claude/settings.json` (user-level settings, same file as existing hook configurations):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "bash ~/.claude/hooks/write-guard.sh"
      }
    ]
  }
}
```

## Scope

- Protects all files matching the `git-sync.sh` tracked-files whitelist.
- Same-machine protection only (cross-device is handled by the backup system).
- Blocks conflicting writes — does not auto-resolve conflicts.

## Dependencies

- **Depends on:**
  - `sha256sum` — available in Git Bash on Windows as `sha256sum.exe`
  - `node` (Node.js) — for parsing stdin JSON (same as `git-sync.sh`)
  - `tasklist` — for PID liveness check (Windows; `kill -0` doesn't work for Windows PIDs in Git Bash)
  - `~/.claude/.backup-lock/` — shared mutex with backup system to serialize registry access
  - Claude Code hook system — PreToolUse hook invocation with JSON on stdin; non-zero exit blocks the tool call

- **Depended on by:**
  - All tracked files — any file matching the backup whitelist is protected by the write guard

## State Files

| File | Purpose | Backed up? |
|------|---------|------------|
| `~/.claude/.write-registry.json` | Last-writer info per tracked file | No (machine-local) |
| `~/.claude/hooks/write-guard.sh` | The PreToolUse hook script | Yes (tracked as hook) |

## Integration Checklist

- [ ] Create `~/.claude/hooks/write-guard.sh`
- [ ] Add registry update logic to `git-sync.sh` (after filter, before commit)
- [ ] Add PreToolUse hook entry to `~/.claude/settings.json`
- [ ] Add `write-guard.sh` to tracked files in `git-sync.sh` filter
- [ ] Update `backup-system-spec.md` spec — new section + design decision + tracked file + changelog
- [ ] Update `CLAUDE.md` — hooks section
- [ ] Update `git-sync.sh` — restore path for new hook file

## Known Bugs / Issues

*None currently tracked.*

## Planned Updates

*(None currently)*

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-14 | 1.0 | Initial spec | New | — |
| 2026-03-15 | 1.2 | Registry update moved from `sync-to-drive.sh` to `git-sync.sh` as part of Git + Drive hybrid migration | Update | — |
| 2026-03-15 | 1.1 | Windows platform fixes: hardcode registry path (Git Bash `$HOME` → `/c/...` breaks Node.js `readFileSync`), replace `kill -0` with `tasklist` for PID liveness (Git Bash `kill` can't signal Windows PIDs) | Implementation | — |
