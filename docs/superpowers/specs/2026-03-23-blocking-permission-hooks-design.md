# Blocking Permission Hooks Design

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Both DestinCode (mobile, separate repo) and DestinClaude (desktop, this repo)
**Branch:** `feature/blocking-permission-hooks` (in both repos)

## Problem

Both the mobile and desktop apps need to present permission approval prompts when Claude Code requests tool access. The current implementations have several issues:

1. **Duplicate prompts (mobile):** Two independent detection systems — hook-based Notification events and PTY screen scraping — both fire for the same permission prompt, creating overlapping UI.
2. **Split button text (mobile):** The InkSelectParser misreads wrapped terminal text, splitting one option into multiple buttons.
3. **Fragile detection (both):** Screen scraping depends on terminal rendering, regex patterns, and specific keywords ("always") that don't match all prompt variants.
4. **Missed "Always Allow" (mobile):** The `hasAlwaysAllowOption()` method searches screen text for "always", but some prompts use "allow all edits" — causing the Always Allow button to disappear.
5. **Indirect control (both):** Approvals are sent as simulated keystrokes into the PTY rather than structured responses.

## Solution: Approach A — Blocking PermissionRequest as Primary, Existing Systems as Fallback

Use Claude Code's `PermissionRequest` hook event with a bidirectional blocking relay. The app receives structured JSON, shows an approval UI, and sends a structured decision back — no screen scraping or keystroke injection needed. Existing detection systems remain as a fallback for prompts that don't fire `PermissionRequest`.

## Repository Boundary

- **Desktop (DestinClaude):** This repo. Relay scripts, HookRelay server, IPC, ToolCard changes.
- **Mobile (DestinCode):** Separate repo at `github.com/itsdestin/destincode`. Bootstrap, EventBridge, ManagedSession, ToolCard changes. Branch name matches.

## Verified Assumptions

Confirmed via probe testing on 2026-03-23 (15 real payloads captured):

- `PermissionRequest` hook fires for Claude Code's native permission prompts
- Payload includes `tool_name`, `tool_input`, and optionally `permission_suggestions`
- `permission_suggestions` was non-empty in 13 of 15 captured payloads (3-option prompts)
- `permission_suggestions` was **completely absent** (not empty array — missing from JSON) in 2 of 15 payloads (2-option prompts)
- 2-option prompts confirmed for: "compound commands with cd and git require approval to prevent bare repository attacks" — these DO fire `PermissionRequest`, just without suggestions
- Three suggestion types observed: `addDirectories`, `addRules`, `setMode`
- Two destination types observed: `session` (temporary) and `localSettings` (persistent)
- Multiple suggestions per prompt are common (5 of 15 payloads had 2 suggestions)
- Additional fields appear for subagent tool calls: `agent_id` and `agent_type` (e.g., `"Explore"`)
- Detection logic for 2-option vs 3-option must be null-safe: `suggestions?.length() > 0`, not just `isNotEmpty()`

## Protocol Layer

### Relay Script (Bidirectional)

When Claude Code fires a `PermissionRequest` hook:

1. Relay reads JSON from stdin, connects to app's socket, writes payload + newline
2. Relay **holds the connection open** and waits for a response
3. App shows approval UI, user makes a choice
4. App writes JSON decision back through the socket (see App-to-Relay Response Format below)
5. Relay wraps the decision in `hookSpecificOutput` and prints to stdout (see Relay stdout Format below), exits 0
6. **Timeout** (configurable via `CLAUDE_RELAY_TIMEOUT` env var): relay exits **2** (deny — fail-closed)
7. **Connection error** (app not running): relay exits **0** (fall through to normal CLI prompt — graceful degradation)

**Note:** The existing `relay-blocking.js` spike exits 0 on timeout and uses a different response schema (`{"allow": false}`). Both must be updated to match this design before implementation.

### App-to-Relay Response Format

The app writes one of these JSON objects back through the held socket, followed by a newline:

```json
// Yes (allow once)
{"decision": {"behavior": "allow"}}

// Always Allow (allow + apply first suggestion)
{"decision": {"behavior": "allow", "updatedPermissions": [<suggestion from payload>]}}

// No (deny)
{"decision": {"behavior": "deny"}}
```

### Relay stdout Format (hookSpecificOutput)

The relay wraps the app's decision for Claude Code's hook system and prints to stdout:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow"
    }
  }
}
```

For "Always Allow" with a suggestion applied:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedPermissions": [
        {
          "type": "addDirectories",
          "directories": ["/tmp"],
          "destination": "session"
        }
      ]
    }
  }
}
```

For deny:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny"
    }
  }
}
```

### Timeout vs Connection Error Distinction

| Scenario | Relay behavior | Exit code | Rationale |
|----------|---------------|-----------|-----------|
| App responds: allow | Print hookSpecificOutput JSON | 0 | Normal approval |
| App responds: deny | Print hookSpecificOutput JSON | 0 | Normal denial (via JSON `behavior: "deny"`) |
| Timeout (app connected but no response) | No output | 2 | Fail-closed — user didn't respond |
| Connection error (app not running) | No output | 0 | Fall through to terminal prompt |

### Default Timeouts

- Mobile: 120 seconds (user may be away from phone). Set via `CLAUDE_RELAY_TIMEOUT` env var in `PtyBridge` when spawning Claude Code.
- Desktop: 60 seconds (user is at computer). Set via `CLAUDE_RELAY_TIMEOUT` env var in `pty-worker.js` when spawning Claude Code.

### Request ID Generation

Both platforms generate a UUID server-side when holding a socket open for a `PermissionRequest` event. The request ID is:
- Created by the socket server (EventBridge on mobile, HookRelay on desktop) when it decides to hold the connection
- Passed through the event system to the UI alongside the payload
- Used by the `respond()` method to look up the correct held socket
- NOT derived from the hook payload (Claude Code doesn't provide one)

## Mobile App Changes (DestinCode)

*Files in separate repo: `github.com/itsdestin/destincode`, branch `feature/blocking-permission-hooks`*

### Hook Registration (Bootstrap.kt)

- Add `PermissionRequest` to hook events list (line 784)
- Use a new `hook-relay-blocking.js` for `PermissionRequest` only
- Other events (PreToolUse, PostToolUse, Stop, Notification) continue using fire-and-forget `hook-relay.js`

### EventBridge (EventBridge.kt)

- For `PermissionRequest` events: hold socket open in `Map<String, LocalSocket>` keyed by request ID (UUID generated server-side)
- New method: `respond(requestId: String, decision: JSONObject)` — writes JSON response + newline, closes socket
- Cleanup: if socket disconnects (relay timeout), remove from map silently
- All other events: close socket immediately after reading (unchanged)

### HookEvent (HookEvent.kt)

New event type:

```kotlin
data class PermissionRequest(
    override val sessionId: String,
    override val hookEventName: String,
    val toolName: String,
    val toolInput: JSONObject,
    val permissionSuggestions: JSONArray?,  // null for 2-option prompts
    val requestId: String,  // UUID generated by EventBridge when holding socket
) : HookEvent()
```

### ManagedSession (routeHookEvent)

- When `PermissionRequest` received: transition last `ToolRunning` to `ToolAwaitingApproval`
- Store `requestId` and `permissionSuggestions` on the `ToolAwaitingApproval` content
- `hasAlwaysOption` derived from `permissionSuggestions != null && permissionSuggestions.length() > 0` instead of screen scraping

### ToolCard Approval Actions

- Yes → `EventBridge.respond(requestId, {"decision": {"behavior": "allow"}})`
- Always Allow → `EventBridge.respond(requestId, {"decision": {"behavior": "allow", "updatedPermissions": [suggestions[0]]}})`
- No → `EventBridge.respond(requestId, {"decision": {"behavior": "deny"}})`
- No keystroke injection for PermissionRequest-handled prompts

### ChatState (MessageContent)

Update `ToolAwaitingApproval`:

```kotlin
data class ToolAwaitingApproval(
    val cardId: String,
    val toolUseId: String,
    val tool: String,
    val args: String,
    val hasAlwaysOption: Boolean = true,
    val requestId: String? = null,           // null = fallback (Notification path)
    val permissionSuggestions: JSONArray? = null,
) : MessageContent()
```

When `requestId` is non-null, the ToolCard uses the structured response path. When null, it falls back to keystroke injection (existing behavior).

### Fallback Coordination

- Existing Notification + screen-scraping path remains for prompts that don't fire `PermissionRequest`
- Guard already merged to master: screen scraper skips when `ToolAwaitingApproval` is active
- If both `PermissionRequest` and `Notification` fire for the same prompt, `PermissionRequest` arrives first and transitions the tool card; the Notification handler sees approval is already active and does nothing
- **Cross-path cleanup:** If the user somehow responds via the fallback path (keystroke injection) while a PermissionRequest socket is held, the socket must be cleaned up. When `ToolAwaitingApproval` transitions to `ToolComplete` or `ToolFailed` (via PostToolUse/PostToolUseFailure hooks), any held socket for that request ID should be closed without sending a response — the relay will see `end` event and exit 0 (fire-and-forget mode).

## Desktop App Changes (DestinClaude)

*Files in this repo, branch `feature/blocking-permission-hooks`*

### Relay Script

- Replace `hook-scripts/relay.js` with updated `hook-scripts/relay-blocking.js`
- **Must update from spike:** Change timeout exit code from 0 to 2 (fail-closed). Change response parsing from `{"allow": bool}` to `{"decision": {"behavior": "allow"|"deny", ...}}`. Add `hookSpecificOutput` wrapping on stdout.
- Update `scripts/install-hooks.js` to reference blocking relay

### HookRelay Server (hook-relay.ts)

- Currently calls `socket.end()` unconditionally in `processPayload` — must be refactored to conditionally hold the socket open based on `hook_event_name`
- For `PermissionRequest` events: generate UUID request ID, hold socket in `Map<string, net.Socket>`, emit event with request ID
- New method: `respond(requestId: string, decision: object)` — writes JSON + newline, closes socket
- Cleanup on socket disconnect (relay timeout) — remove from map
- All other events: close immediately (fire-and-forget, unchanged)

### Hook Dispatcher (hook-dispatcher.ts)

- Change `PermissionRequest` case from `return null` to creating a `PERMISSION_REQUEST` action
- Action carries: `toolName`, `toolInput`, `permissionSuggestions` (nullable), `requestId`

### Chat Reducer / State

- New `awaiting-approval` status for tool cards (add to `ToolCallStatus` type union in `types.ts`)
- Stores `requestId` and `permissionSuggestions`
- Status ripples through: reducer switch statements, ToolCard component, any status-dependent rendering

### ToolCard (ToolCard.tsx)

- Add approval buttons for `awaiting-approval` state: Yes / Always Allow / No
- Button actions call new IPC: `window.claude.session.respondToPermission(requestId, decision)`

### IPC + Preload

- New IPC channel in `ipc-handlers.ts`: receives `(requestId, decision)`, calls `hookRelay.respond()`
- Expose `respondToPermission` in `preload.ts` via `contextBridge.exposeInMainWorld` (sandboxed — no require() or imports)

### Fallback

- `usePromptDetector` + `InkSelectParser` + `PromptCard` remain for non-PermissionRequest prompts
- Collision guard: skip prompt detection when a PermissionRequest-based approval is active
- **Cross-path cleanup:** Same as mobile — if a tool completes while a socket is held, close the socket without responding

## Multiple Suggestions Handling

When `permission_suggestions` has multiple entries, the "Always Allow" button applies `suggestions[0]`. This matches Claude Code's CLI behavior where only one "always allow" option is shown in the Ink menu. In observed payloads, the first suggestion was typically the most specific (e.g., allow a specific directory), while subsequent suggestions were broader (e.g., change permission mode entirely). Other suggestions are not exposed in the UI.

## Security

- `tool_input` can contain sensitive data (API tokens observed in probe payloads)
- Full payloads must NOT be logged to disk in production
- Relay sockets use abstract namespace (mobile) or filesystem with restricted permissions (desktop) — not network-accessible
- Probe script and logs to be removed before shipping

## Testing Strategy

- **Relay integration tests:** Send mock payloads through the relay, verify hookSpecificOutput format and exit codes for all 4 scenarios (allow, deny, timeout, connection error). Update existing spike tests (`test-blocking-relay.js`) to validate the new protocol.
- **EventBridge / HookRelay unit tests:** Verify socket holding, respond(), and cleanup on disconnect.
- **End-to-end:** Manually trigger permission prompts and verify the ToolCard shows structured approval, the decision is sent back correctly, and Claude Code proceeds/denies as expected.

## Cleanup

After this feature ships:
- Remove `permission-request-probe.sh` and `~/.claude-mobile/probe-logs/`
- Remove probe hook entry from `settings.json`
- `PtyBridge.hasAlwaysAllowOption()` can be deprecated (kept for fallback path but no longer primary)

## What Stays Unchanged

- Screen scraper + InkSelectParser for setup menus (theme, trust, login)
- Notification hooks for non-permission notifications
- PreToolUse/PostToolUse/Stop hooks for chat timeline
- Collision guard merged to master (commit 29d27e1)
