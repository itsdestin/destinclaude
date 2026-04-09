# Write Guard — Design Spec

**Version:** 1.4
**Date:** 2026-04-09
**Status:** Approved
**Related spec:** `backup-system-spec.md`
**Feature location:** `~/.claude/hooks/write-guard.sh`, registry update in `~/.claude/hooks/write-registry.sh`

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
| Registry update in standalone PostToolUse hook (`write-registry.sh`) | After sync decoupling (April 2026), `sync.sh` no longer exists. The registry update lives in its own lightweight hook so `write-guard.sh` always has fresh data, regardless of whether the DestinCode app or `/sync` skill is running. | Coupling to a sync hook (couples concurrency protection to backup orchestration), no per-write hook (race window between writes). |
| Protect all tracked files | Negligible overhead (one JSON lookup per write) and simpler than maintaining a separate "protected files" list. | Skills/specs only (most likely conflict targets, but leaves other files unprotected), configurable exclusion list (premature complexity). |

## Architecture

Two components:

1. **`write-guard.sh`** — A PreToolUse hook (fires before Write/Edit) that checks the registry and blocks conflicting writes.
2. **`write-registry.sh`** — A PostToolUse hook that records `{pid, timestamp, content_hash}` for every tracked write into `~/.claude/.write-registry.json`. Tiny — no network, no debounce, no backend logic.

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

1. **Parse stdin JSON** — extract `tool_name` and `tool_input.file_path`. Normalize backslashes to forward slashes.
2. **Tracked file filter** — built-in whitelist of file categories worth protecting (memory, CLAUDE.md, settings, mcp.json, skills, hooks, plans, specs, etc.). Non-tracked files pass through (exit 0).
3. **Read registry** — parse `~/.claude/.write-registry.json`. If no entry for this file, allow (exit 0 — first write ever).
4. **Same-session check** — if registry PID matches `$PPID`, allow (exit 0 — we're the last writer). Assumption: both PreToolUse and PostToolUse hooks are spawned by the same parent process (the Claude Code session), so `$PPID` is consistent.
5. **Liveness check** — `tasklist //FI "PID eq $PID"` (Windows-compatible; `kill -0` doesn't work for Windows PIDs in Git Bash). If the other session is dead, allow (exit 0 — stale entry, no conflict).
6. **Staleness check** — compute SHA-256 (truncated to 16 hex) of the current file on disk. Compare against the registry's stored hash. If the on-disk hash differs from the registry hash, a third party (manual edit, another tool) modified the file after the registry entry was written — block regardless, since this session's view of the file is stale.
7. **Block** — exit non-zero with message: `"WRITE BLOCKED: This file was last modified by another active Claude session (PID {pid}) at {time}. Re-read the file to see the current version, then retry your edit."`

**Note:** Steps 6-7 both result in blocking when a different active session owns the registry entry. Step 6 catches additional third-party modifications; step 7 catches the primary case where the other session's version is still on disk but this session hasn't seen it.

**Performance:** ~50ms estimated overhead per write (JSON parse + sha256sum + kill -0). To be validated during implementation.

### PostToolUse Registry Update (`write-registry.sh`)

A standalone PostToolUse hook fires on every Write|Edit:

1. Parse stdin JSON to extract `file_path`.
2. Compute SHA-256 of written file, truncate to 16 hex chars.
3. Read existing registry JSON (or start with `{}`).
4. Upsert the entry: `{filepath: {pid: $PPID, ts: $(date +%s), hash: $HASH}}`.
5. Write atomically via `atomic_write` from `lib/hook-preamble.sh` (`.tmp.$$` + `mv`).

**Error handling:** If the registry read or write fails, the hook exits silently — registry failure must not block tool execution. The DestinCode app's SyncService also updates the registry on its own pushes for symmetric coverage.

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

- Protects all files matching the built-in tracked-files whitelist (memory, CLAUDE.md, settings, mcp.json, skills, hooks, plans, specs, etc.).
- Same-machine protection only (cross-device sync conflicts are handled by the DestinCode app's "newer wins" semantics).
- Blocks conflicting writes — does not auto-resolve conflicts.

## Dependencies

- **Depends on:**
  - `sha256sum` — available in Git Bash on Windows as `sha256sum.exe`
  - `node` (Node.js) — for parsing stdin JSON
  - `tasklist` — for PID liveness check (Windows; `kill -0` doesn't work for Windows PIDs in Git Bash)
  - Claude Code hook system — PreToolUse hook invocation with JSON on stdin; non-zero exit blocks the tool call

- **Depended on by:**
  - All tracked files — any file matching the backup whitelist is protected by the write guard

## State Files

| File | Purpose | Backed up? |
|------|---------|------------|
| `~/.claude/.write-registry.json` | Last-writer info per tracked file | No (machine-local) |
| `~/.claude/hooks/write-guard.sh` | The PreToolUse hook script | Yes (tracked as hook) |

## Integration Checklist

- [x] Created `~/.claude/hooks/write-guard.sh`
- [x] Registry update lives in standalone `~/.claude/hooks/write-registry.sh` (PostToolUse Write|Edit)
- [x] PreToolUse hook entry in `~/.claude/settings.json` (registered via `hooks-manifest.json`)
- [x] `write-guard.sh` in its own tracked-files whitelist (via `*/hooks/*` pattern)
- [x] `backup-system-spec.md` updated

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type | Approved by |
|------|---------|-------------|------|-------------|
| 2026-03-14 | 1.0 | Initial spec | New | — |
| 2026-04-09 | 1.4 | Sync decoupling: `sync.sh` was removed. Registry update moved from `sync.sh` into a new standalone `write-registry.sh` PostToolUse hook so write-guard keeps working independently of the DestinCode app. The app's SyncService also updates the registry on its own pushes for symmetric coverage. | Update | owner |
| 2026-04-05 | 1.3 | Registry update moved from `git-sync.sh` to `sync.sh` as part of sync consolidation. Updated all spec references from git-sync.sh → sync.sh. | Update | owner |
| 2026-03-15 | 1.2 | Registry update moved from `sync-to-drive.sh` to `git-sync.sh` as part of Git + Drive hybrid migration | Update | — |
| 2026-03-15 | 1.1 | Windows platform fixes: hardcode registry path (Git Bash `$HOME` → `/c/...` breaks Node.js `readFileSync`), replace `kill -0` with `tasklist` for PID liveness (Git Bash `kill` can't signal Windows PIDs) | Implementation | — |
