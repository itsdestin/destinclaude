---
name: Transcript Watcher
description: Real-time JSONL transcript file watcher that provides structured chat state for the desktop app's Chat View
version: 1.0
created: 2026-03-27
---

# Transcript Watcher — Feature Spec

## Overview

The Transcript Watcher is a main-process service that monitors Claude Code's JSONL transcript files in real-time, parses them into structured events, and feeds the Chat View's timeline. It replaced the previous hook-based chat reconstruction, which could only capture the final assistant message and missed all intermediate text between tool calls.

## Problem Statement

Claude Code's hook system fires events for tool calls (`PreToolUse`, `PostToolUse`) and turn completion (`Stop`), but has no event for intermediate assistant text — the conversational messages Claude emits between tool calls (e.g., "Let me check that file..." or "Now let me look at the other approach..."). The `Stop` hook only delivers the final assistant message of a turn, so all intermediate text was invisible in the Chat View.

## Architecture

### Data Flow

```
Claude Code CLI
  │
  ├─→ Writes JSONL transcript to ~/.claude/projects/{slug}/{sessionId}.jsonl
  │     │
  │     └─→ TranscriptWatcher (fs.watch + byte-offset reading)
  │           │
  │           ├─→ IPC: transcript:event → Electron renderer → chat reducer
  │           └─→ WebSocket: transcript:event → remote browser clients
  │
  ├─→ Hook scripts (relay.js / relay-blocking.js)
  │     │
  │     └─→ HookRelay (named pipe) — PermissionRequest events only
  │           │
  │           └─→ IPC: hook:event → Electron renderer → chat reducer
  │
  └─→ PTY output → TerminalView (xterm.js) + prompt detection
```

### Responsibility Split

| System | Responsibility |
|--------|---------------|
| **TranscriptWatcher** | All chat timeline state: user messages, assistant text (intermediate AND final), tool calls, tool results |
| **HookRelay** | Permission flow only: `PermissionRequest` (blocking approval) and `PermissionExpired` (socket timeout). Also used for session initialization detection (first hook event marks session as ready) |
| **PTY / TerminalView** | Raw terminal rendering, Ink menu detection for non-hook prompts (trust gate, theme selection), permission mode cycling |

### Why Not Hooks for Everything?

Hooks cannot provide intermediate assistant text — there is no hook event for "Claude emitted text." The transcript file is the only source that captures every message in order. Hooks remain essential for the permission flow because `PermissionRequest` is a blocking event: the hook relay holds a socket open while the user decides, and the response determines whether Claude proceeds.

## Components

### TranscriptWatcher (`src/main/transcript-watcher.ts`)

An `EventEmitter` in the main process that manages watching one transcript file per session.

**Key functions:**

- `parseTranscriptLine(line, sessionId)` — Parses a single JSONL line into zero or more `TranscriptEvent` objects. Handles content block types: `text`, `tool_use`, `tool_result`. Skips `thinking`, `image`, and non-message lines (`file-history-snapshot`, `queue-operation`). Only emits `user-message` for lines with a `promptId` (user-typed prompts, not tool-result wrappers).

- `cwdToProjectSlug(cwd)` — Converts a filesystem path to Claude Code's project directory slug (e.g., `C:\Users\desti` → `C--Users-desti`).

- `startWatching(desktopSessionId, claudeSessionId, cwd)` — Computes the transcript path, reads existing content (catch-up), then attaches `fs.watch`. Falls back to 1-second polling if the file doesn't exist yet.

- `readNewLines(session)` — Reads new bytes from the file starting at the stored byte offset. Splits on newlines, handles partial lines across reads, parses complete lines, deduplicates by UUID (per-line, not per-event), and emits `transcript-event` for each new event.

**Deduplication:** Claude Code writes incremental updates to the transcript — the same message UUID appears in multiple JSONL lines as content blocks stream in. The watcher deduplicates at the line level: once a UUID is seen, all subsequent lines with that UUID are skipped. This is the only dedup layer — the reducer does not duplicate this logic.

**Lifecycle:** Started when the first hook event for a session arrives (which provides the Claude session ID needed to locate the transcript file). Stopped when the session exits.

### TranscriptEvent Types (`src/shared/types.ts`)

```typescript
type TranscriptEventType =
  | 'user-message'      // User-typed prompt
  | 'assistant-text'    // Claude's text output (intermediate or final)
  | 'tool-use'          // Tool call with name and input
  | 'tool-result'       // Tool completion with result
  | 'thinking'          // Extended thinking (reserved, not currently emitted)
  | 'turn-complete';    // Claude's turn ended (stop_reason: end_turn)
```

### Chat Reducer Actions (`src/renderer/state/chat-types.ts`)

Five new actions replace the old hook-based actions:

| New Action | Replaces | Key Behavior |
|---|---|---|
| `TRANSCRIPT_USER_MESSAGE` | `USER_PROMPT` (from hooks) | Deduplicates against InputBar's optimistic dispatch |
| `TRANSCRIPT_ASSISTANT_TEXT` | Nothing (was missing!) | **Sets `currentGroupId = null`** — forces next tool into a new group, creating the interleaved layout |
| `TRANSCRIPT_TOOL_USE` | `PRE_TOOL_USE` | Creates/extends tool groups |
| `TRANSCRIPT_TOOL_RESULT` | `POST_TOOL_USE` / `POST_TOOL_USE_FAILURE` | Marks tools complete or failed |
| `TRANSCRIPT_TURN_COMPLETE` | `STOP` | Clears `isThinking` |

**Removed actions:** `PRE_TOOL_USE`, `POST_TOOL_USE`, `POST_TOOL_USE_FAILURE`, `STOP`, `UPDATE_STREAMING`.

**Preserved actions:** `USER_PROMPT` (InputBar optimistic dispatch), `PERMISSION_REQUEST`/`PERMISSION_EXPIRED`/`PERMISSION_RESPONDED` (hook-based permission flow), `SHOW_PROMPT`/`COMPLETE_PROMPT`/`DISMISS_PROMPT` (PTY prompt detection), `THINKING_TIMEOUT`, `TERMINAL_ACTIVITY`, `SESSION_INIT`/`SESSION_REMOVE`.

### Permission Race Handling

The `PermissionRequest` hook event (delivered via named pipe) can arrive before the `TRANSCRIPT_TOOL_USE` event (delivered via file watcher) because the hook relay is direct IPC while the watcher has file I/O latency. The reducer handles this by creating a synthetic tool entry from the permission payload if no running tool is found:

```
PermissionRequest arrives → no matching running tool in toolCalls?
  → Create tool with id=perm-{requestId}, status=awaiting-approval
  → Create tool group, add to timeline
  → ToolCard renders with approval buttons
```

## IPC Contract

### New Channel

| Channel | Direction | Payload |
|---------|-----------|---------|
| `transcript:event` | Main → Renderer | `TranscriptEvent` object |

Exposed in:
- `src/main/preload.ts` — `window.claude.on.transcriptEvent(cb)`
- `src/renderer/remote-shim.ts` — WebSocket push event

### Remote Client Replay

The `RemoteServer` maintains a rolling buffer of transcript events per session (capped at 10,000 entries). When a new browser client connects, transcript events are replayed after hook events during the buffer replay phase.

## JSONL Transcript Format (External Dependency)

The watcher depends on Claude Code's internal JSONL transcript format. Key assumptions:

- Files live at `~/.claude/projects/{slug}/{sessionId}.jsonl`
- Each line is a JSON object with `type`, `uuid`, `message` fields
- `type` is `"user"` or `"assistant"` for conversation messages
- `message.content` is a string (user prompts) or array of content blocks
- `message.stop_reason` is `null` (streaming), `"tool_use"` (mid-turn), or `"end_turn"` (final)
- User-typed prompts have a `promptId` field; tool-result wrapper messages do not
- The file is append-only and written synchronously as Claude streams

**Risk:** This format is undocumented and could change. If it does, `parseTranscriptLine` is the only function that needs updating. The terminal view always works as a fallback.

## User Mandates

1. The Terminal View must always remain functional regardless of transcript watcher state.
2. Permission approval must continue to use the hook relay's blocking socket protocol — never attempt to handle permissions via the transcript file.
3. The PTY-based Ink menu detection (usePromptDetector, PromptCard, TrustGate) must remain as the fallback for non-hook interactive prompts.

## Design Decisions

1. **File watching over hook enhancement.** We chose to read Claude Code's existing transcript files rather than requesting new hook events from Anthropic. Rationale: the transcript already contains all the data we need, the approach works today without upstream changes, and it's more complete (full tool results, correct ordering, user messages with images).

2. **Watcher-level dedup only.** Deduplication by UUID happens in the TranscriptWatcher, not the reducer. Rationale: a single JSONL line can produce multiple events (e.g., `assistant-text` + `turn-complete`), and reducer-level UUID dedup would drop sibling events. The watcher deduplicates at the line level, which is the correct granularity.

3. **Hooks preserved for permissions only.** Rather than replacing the entire hook system, we kept it for `PermissionRequest`/`PermissionExpired`. Rationale: the blocking socket protocol is essential for permissions and cannot be replicated via file watching.

4. **Synthetic tool entries for early permissions.** When a permission request arrives before the corresponding transcript tool_use event, the reducer creates a synthetic tool entry. Rationale: the hook relay is faster than the file watcher, so this race is common. Silently dropping the permission request would break the approval flow.
