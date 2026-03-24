# Blocking Permission Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PTY screen-scraping permission approval with structured blocking PermissionRequest hooks in both the desktop (Electron) and mobile (Android) apps.

**Architecture:** A bidirectional relay script holds its socket connection open when Claude Code fires a `PermissionRequest` hook. The app shows a ToolCard with approval buttons; when the user responds, the decision is sent back through the socket as JSON. The relay wraps it in `hookSpecificOutput` and exits. Existing screen-scraping remains as a fallback for non-PermissionRequest prompts.

**Tech Stack:** TypeScript/Node.js (desktop), Kotlin/Android (mobile), node.js relay scripts (shared protocol)

**Spec:** `docs/superpowers/specs/2026-03-23-blocking-permission-hooks-design.md`

---

## Part 1: Desktop App (DestinClaude)

All files relative to `desktop/` in this repo.

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `hook-scripts/relay.js` | Keep | Fire-and-forget relay (unchanged for non-PermissionRequest events) |
| `hook-scripts/relay-blocking.js` | Modify | Bidirectional blocking relay for PermissionRequest |
| `src/main/hook-relay.ts` | Modify | Hold sockets for PermissionRequest, add `respond()` |
| `src/main/ipc-handlers.ts` | Modify | Add `permission:respond` IPC channel |
| `src/main/preload.ts` | Modify | Expose `respondToPermission` to renderer |
| `src/shared/types.ts` | Modify | Add `awaiting-approval` to `ToolCallStatus`, add IPC constant |
| `src/renderer/state/chat-types.ts` | Modify | Add `PERMISSION_REQUEST` action type |
| `src/renderer/state/hook-dispatcher.ts` | Modify | Handle `PermissionRequest` events |
| `src/renderer/state/chat-reducer.ts` | Modify | Handle `PERMISSION_REQUEST` action |
| `src/renderer/components/ToolCard.tsx` | Modify | Add approval buttons for `awaiting-approval` |
| `src/renderer/hooks/usePromptDetector.ts` | Modify | Skip detection when blocking approval active |
| `scripts/install-hooks.js` | Modify | Register PermissionRequest with blocking relay |

---

### Task 1: Update Blocking Relay Script

**Files:**
- Modify: `desktop/hook-scripts/relay-blocking.js`

`relay.js` stays as-is (fire-and-forget for PreToolUse, PostToolUse, etc.). `relay-blocking.js` is updated from the spike to match the design protocol. `install-hooks.js` (Task 7) will point PermissionRequest at this script.

- [ ] **Step 1: Update relay-blocking.js with correct protocol**

Changes from spike: timeout exits 2 (not 0), response schema uses `decision.behavior` (not `{"allow": bool}`), wraps output in `hookSpecificOutput`.

```javascript
#!/usr/bin/env node
const net = require('net');
const PIPE_NAME = process.env.CLAUDE_DESKTOP_PIPE || (process.platform === 'win32' ? '\\\\.\\pipe\\claude-desktop-hooks' : '/tmp/claude-desktop-hooks.sock');
const TIMEOUT_MS = parseInt(process.env.CLAUDE_RELAY_TIMEOUT || '60000', 10);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const desktopSessionId = process.env.CLAUDE_DESKTOP_SESSION_ID;
  if (desktopSessionId) {
    try {
      const parsed = JSON.parse(input);
      parsed._desktop_session_id = desktopSessionId;
      input = JSON.stringify(parsed);
    } catch {}
  }

  const client = net.createConnection(PIPE_NAME, () => {
    client.write(input + '\n');
  });

  let response = '';

  client.on('data', (chunk) => {
    response += chunk;
    const nlIndex = response.indexOf('\n');
    if (nlIndex >= 0) {
      const line = response.substring(0, nlIndex).trim();
      client.destroy();
      try {
        const appDecision = JSON.parse(line);
        const output = {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: appDecision.decision,
          },
        };
        process.stdout.write(JSON.stringify(output) + '\n');
        process.exit(0);
      } catch {
        process.exit(0);
      }
    }
  });

  client.on('end', () => {
    // Server closed without response — fire-and-forget mode
    process.exit(0);
  });

  client.setTimeout(TIMEOUT_MS, () => {
    // Timeout — fail-closed (deny)
    client.destroy();
    process.exit(2);
  });

  client.on('error', () => {
    // App not running — fall through to terminal prompt
    process.exit(0);
  });
});
```

- [ ] **Step 2: Verify syntax**

Run: `node -c desktop/hook-scripts/relay-blocking.js`
Expected: No output (valid syntax)

- [ ] **Step 3: Commit**

```bash
git add desktop/hook-scripts/relay-blocking.js
git commit -m "feat(desktop): update relay-blocking.js to match design protocol"
```

---

### Task 2: Add Socket Holding to HookRelay Server

**Files:**
- Modify: `desktop/src/main/hook-relay.ts`

- [ ] **Step 1: Add pending sockets map and respond method**

In `HookRelay` class, add:
- `private pendingSockets = new Map<string, net.Socket>();`
- Import `{ randomUUID } from 'crypto'`
- Modify `createServer` to conditionally hold socket for `PermissionRequest`
- Add `respond(requestId: string, decision: object)` method
- Add cleanup on socket close/error

```typescript
// In createServer(), replace the processPayload function:
const processPayload = (payload: string) => {
  if (processed) return;
  processed = true;
  try {
    const event = this.parseHookPayload(payload);

    if (event.type === 'PermissionRequest') {
      // Hold socket open — generate request ID, stash socket
      const requestId = randomUUID();
      this.pendingSockets.set(requestId, socket);
      socket.on('close', () => this.pendingSockets.delete(requestId));
      socket.on('error', () => this.pendingSockets.delete(requestId));
      // Attach requestId to the event payload
      event.payload._requestId = requestId;
      this.emit('hook-event', event);
    } else {
      this.emit('hook-event', event);
      socket.end();
    }
  } catch {
    socket.end();
  }
};
```

- [ ] **Step 2: Add respond method**

```typescript
respond(requestId: string, decision: object): boolean {
  const socket = this.pendingSockets.get(requestId);
  if (!socket || socket.destroyed) {
    this.pendingSockets.delete(requestId);
    return false;
  }
  try {
    socket.end(JSON.stringify(decision) + '\n');
  } catch {
    // Socket already gone
  }
  this.pendingSockets.delete(requestId);
  return true;
}
```

- [ ] **Step 3: Add cleanup in stop()**

```typescript
stop(): void {
  // Close all pending sockets
  for (const [id, socket] of this.pendingSockets) {
    try { socket.end(); } catch {}
  }
  this.pendingSockets.clear();
  if (this.server) {
    this.server.close();
    this.server = null;
    this.running = false;
  }
}
```

- [ ] **Step 4: Verify build**

Run: `cd desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/hook-relay.ts
git commit -m "feat(desktop): add socket holding and respond() to HookRelay"
```

---

### Task 3: Add IPC Channel and Preload Bridge

**Files:**
- Modify: `desktop/src/shared/types.ts`
- Modify: `desktop/src/main/ipc-handlers.ts`
- Modify: `desktop/src/main/preload.ts`

- [ ] **Step 1: Add IPC constant to types.ts**

In the `IPC` object, add under `// Renderer -> Main`:

```typescript
PERMISSION_RESPOND: 'permission:respond',
```

- [ ] **Step 2: Add `awaiting-approval` to ToolCallStatus**

```typescript
export type ToolCallStatus = 'running' | 'awaiting-approval' | 'complete' | 'failed';
```

- [ ] **Step 3: Add requestId and permissionSuggestions to ToolCallState**

```typescript
export interface ToolCallState {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  response?: string;
  error?: string;
  requestId?: string;
  permissionSuggestions?: Record<string, unknown>[];
}
```

- [ ] **Step 4: Add IPC handler in ipc-handlers.ts**

After the existing session handlers, add:

```typescript
ipcMain.handle(IPC.PERMISSION_RESPOND, async (_event, requestId: string, decision: object) => {
  if (hookRelay) {
    return hookRelay.respond(requestId, decision);
  }
  return false;
});
```

- [ ] **Step 5: Add to preload.ts**

In the `session` object inside `contextBridge.exposeInMainWorld`, add:

```typescript
respondToPermission: (requestId: string, decision: object) =>
  ipcRenderer.invoke('permission:respond', requestId, decision),
```

Also add `'permission:respond'` to the inlined IPC constants at the top.

- [ ] **Step 6: Verify build**

Run: `cd desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add desktop/src/shared/types.ts desktop/src/main/ipc-handlers.ts desktop/src/main/preload.ts
git commit -m "feat(desktop): add permission:respond IPC channel and preload bridge"
```

---

### Task 4: Handle PermissionRequest in Dispatcher and Reducer

**Files:**
- Modify: `desktop/src/renderer/state/chat-types.ts`
- Modify: `desktop/src/renderer/state/hook-dispatcher.ts`
- Modify: `desktop/src/renderer/state/chat-reducer.ts`

- [ ] **Step 1: Add PERMISSION_REQUEST action to chat-types.ts**

Add to the `ChatAction` union:

```typescript
| {
    type: 'PERMISSION_REQUEST';
    sessionId: string;
    toolName: string;
    input: Record<string, unknown>;
    requestId: string;
    permissionSuggestions?: Record<string, unknown>[];
  }
```

Note: No `toolUseId` — PermissionRequest payloads don't include one. The reducer matches by finding the last `running` tool.

- [ ] **Step 2: Update hook-dispatcher.ts**

Replace the `PermissionRequest` case. **Important:** PermissionRequest payloads do NOT contain `tool_use_id` (verified from 15+ probe payloads). We must match by finding the last `running` tool in the reducer, not by ID.

```typescript
case 'PermissionRequest': {
  const toolName = (payload.tool_name as string) || 'Unknown';
  const input = (payload.tool_input as Record<string, unknown>) || {};
  const requestId = (payload._requestId as string) || '';
  const permissionSuggestions = (payload.permission_suggestions as Record<string, unknown>[] | undefined);
  if (!requestId) return null; // No requestId means socket wasn't held — skip
  return {
    type: 'PERMISSION_REQUEST',
    sessionId,
    toolName,
    input,
    requestId,
    permissionSuggestions: permissionSuggestions?.length ? permissionSuggestions : undefined,
  };
}
```

- [ ] **Step 3: Handle PERMISSION_REQUEST in chat-reducer.ts**

Add a new case after `PRE_TOOL_USE`:

```typescript
case 'PERMISSION_REQUEST': {
  const session = next.get(action.sessionId);
  if (!session) return state;

  // Find the last running tool — PermissionRequest has no tool_use_id,
  // so we match by finding the most recent tool in 'running' status.
  const toolCalls = new Map(session.toolCalls);
  let targetId: string | null = null;
  for (const [id, tc] of toolCalls) {
    if (tc.status === 'running') targetId = id;
  }

  if (targetId) {
    const existing = toolCalls.get(targetId)!;
    toolCalls.set(targetId, {
      ...existing,
      status: 'awaiting-approval',
      requestId: action.requestId,
      permissionSuggestions: action.permissionSuggestions,
    });
  }
  // If no running tool found, PermissionRequest arrived before PreToolUse —
  // this is unlikely but harmless; the PreToolUse will create the card and
  // a subsequent PermissionRequest (if re-fired) will catch it.

  next.set(action.sessionId, { ...session, toolCalls, lastActivityAt: Date.now() });
  return next;
}
```

- [ ] **Step 4: Verify build**

Run: `cd desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/state/chat-types.ts desktop/src/renderer/state/hook-dispatcher.ts desktop/src/renderer/state/chat-reducer.ts
git commit -m "feat(desktop): handle PermissionRequest in dispatcher and reducer"
```

---

### Task 5: Add Approval Buttons to ToolCard

**Files:**
- Modify: `desktop/src/renderer/components/ToolCard.tsx`

- [ ] **Step 1: Read the current ToolCard component**

Read `desktop/src/renderer/components/ToolCard.tsx` fully to understand the current rendering for each status.

- [ ] **Step 2: Add approval button rendering for `awaiting-approval` status**

When `status === 'awaiting-approval'`, render three buttons: Yes (green), Always Allow (blue, only if `permissionSuggestions` exists), No (red). On click, call `window.claude.session.respondToPermission(requestId, decision)` and transition tool status back to `running` (it will go to `complete` or `failed` when PostToolUse/PostToolUseFailure arrives).

The exact JSX depends on the current ToolCard structure — read the file first, then add the approval section following existing patterns.

The decision payloads:
- Yes: `{ decision: { behavior: 'allow' } }`
- Always Allow: `{ decision: { behavior: 'allow', updatedPermissions: [permissionSuggestions[0]] } }`
- No: `{ decision: { behavior: 'deny' } }`

- [ ] **Step 3: Verify build**

Run: `cd desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/ToolCard.tsx
git commit -m "feat(desktop): add approval buttons to ToolCard for awaiting-approval state"
```

---

### Task 6: Add Collision Guard to Prompt Detector

**Files:**
- Modify: `desktop/src/renderer/hooks/usePromptDetector.ts`

- [ ] **Step 1: Read usePromptDetector.ts**

Understand how the prompt detector currently works — it fires on xterm.js write callbacks and parses the screen buffer.

- [ ] **Step 2: Add guard to skip detection when awaiting-approval**

The detector should check whether any tool in the current session's `toolCalls` has `status === 'awaiting-approval'`. If so, skip the Ink menu parse — the PermissionRequest-based ToolCard is already handling it.

The exact integration depends on how the detector accesses chat state — read the file first.

- [ ] **Step 3: Verify build**

Run: `cd desktop && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/hooks/usePromptDetector.ts
git commit -m "feat(desktop): skip prompt detection when blocking approval is active"
```

---

### Task 7: Update Hook Installation Script

**Files:**
- Modify: `desktop/scripts/install-hooks.js`

**Critical:** The current script registers ALL hooks with `timeout: 10` (10 seconds). The blocking relay needs up to 60s (desktop) or 120s (mobile) to wait for the user. Claude Code will kill the relay after 10s, making the entire blocking protocol useless.

- [ ] **Step 1: Separate PermissionRequest from the main hook loop**

`PermissionRequest` needs:
- A different relay script (`relay-blocking.js` instead of `relay.js`)
- A much higher timeout (300s to be safe — the relay has its own internal 60s timeout)

Modify the script to register PermissionRequest separately after the loop:

```javascript
// After the existing for-loop that registers fire-and-forget hooks:
const BLOCKING_RELAY_PATH = path.resolve(__dirname, '..', 'hook-scripts', 'relay-blocking.js')
  .replace('app.asar', 'app.asar.unpacked');

// PermissionRequest uses the blocking relay with a high timeout
const prEvent = 'PermissionRequest';
if (!settings.hooks[prEvent]) settings.hooks[prEvent] = [];
const hasPrRelay = settings.hooks[prEvent].some((matcher) =>
  matcher.hooks?.some((h) => h.command?.includes('relay-blocking.js'))
);
if (!hasPrRelay) {
  settings.hooks[prEvent].push({
    matcher: '',
    hooks: [{
      type: 'command',
      command: 'node "' + BLOCKING_RELAY_PATH + '"',
      timeout: 300,
    }],
  });
}
```

Also remove `PermissionRequest` from the main `HOOK_EVENTS` array so it doesn't get registered twice with the fire-and-forget relay.

- [ ] **Step 2: Verify the script runs without errors**

Run: `node desktop/scripts/install-hooks.js`
Expected: "Hooks installed for N events"

- [ ] **Step 3: Commit**

```bash
git add desktop/scripts/install-hooks.js
git commit -m "feat(desktop): register PermissionRequest with blocking relay and 300s timeout"
```

---

### Task 8: Desktop End-to-End Verification

- [ ] **Step 1: Build the desktop app**

Run: `cd desktop && npm run build`
Expected: Build succeeds

- [ ] **Step 2: Manual test — trigger a permission prompt**

Launch the app, start a session, ask Claude to run a bash command that requires permission. Verify:
- ToolCard shows `awaiting-approval` with Yes / Always Allow / No buttons
- Clicking Yes allows the tool and ToolCard transitions to `running` then `complete`
- Clicking No denies the tool
- Always Allow applies the first suggestion

- [ ] **Step 3: Manual test — fallback prompts still work**

Trigger a setup prompt (theme selection or trust folder). Verify the PromptCard still renders via the screen-scraping path.

- [ ] **Step 4: Commit any fixes**

---

## Part 2: Mobile App (DestinCode)

All files relative to `app/src/main/kotlin/com/destin/code/` in the DestinCode repo at `/data/data/com.destin.code/files/home/destincode`, branch `feature/blocking-permission-hooks`.

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `~/.claude-mobile/hook-relay-blocking.js` | Create | Blocking relay for PermissionRequest |
| `runtime/Bootstrap.kt` | Modify | Register PermissionRequest with blocking relay |
| `parser/EventBridge.kt` | Modify | Hold sockets, add respond() |
| `parser/HookEvent.kt` | Modify | Add PermissionRequest event type |
| `runtime/ManagedSession.kt` | Modify | Route PermissionRequest to ToolCard |
| `ui/ChatState.kt` | Modify | Add requestId/suggestions to ToolAwaitingApproval |
| `ui/ChatScreen.kt` | Modify | Wire approval buttons to EventBridge.respond() |

---

### Task 9: Create Mobile Blocking Relay Script

**Files:**
- Create: `app/src/main/assets/hook-relay-blocking.js` (deployed to `~/.claude-mobile/` by Bootstrap.kt, same as existing `hook-relay.js`)

- [ ] **Step 1: Write the blocking relay**

Same protocol as desktop but uses abstract-namespace Unix socket (Android). Key differences: socket path from `CLAUDE_MOBILE_SOCKET` env var, prefixed with `\0` for abstract namespace, default timeout 120s. Uses streaming stdin (like the desktop relay) for robustness.

```javascript
const net = require('net');
const socket = process.env.CLAUDE_MOBILE_SOCKET;
if (!socket) process.exit(0);
const TIMEOUT_MS = parseInt(process.env.CLAUDE_RELAY_TIMEOUT || '120000', 10);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function(chunk) { input += chunk; });
process.stdin.on('end', function() {
  if (!input.trim()) process.exit(0);

  const conn = net.connect({ path: '\0' + socket });
  let response = '';

  conn.on('connect', function() {
    conn.write(input + '\n');
  });

  conn.on('data', function(chunk) {
    response += chunk;
    const nlIndex = response.indexOf('\n');
    if (nlIndex >= 0) {
      const line = response.substring(0, nlIndex).trim();
      conn.destroy();
      try {
        const appDecision = JSON.parse(line);
        const output = {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: appDecision.decision,
          },
        };
        process.stdout.write(JSON.stringify(output) + '\n');
        process.exit(0);
      } catch (e) {
        process.exit(0);
      }
    }
  });

  conn.on('end', function() {
    process.exit(0);
  });

  conn.setTimeout(TIMEOUT_MS, function() {
    conn.destroy();
    process.exit(2);
  });

  conn.on('error', function() {
    process.exit(0);
  });
});
```

- [ ] **Step 2: Verify syntax**

Run: `node -c app/src/main/assets/hook-relay-blocking.js`
Expected: No output

- [ ] **Step 3: Commit**

```bash
cd ~/destincode
git add app/src/main/assets/hook-relay-blocking.js
git commit -m "feat(mobile): add blocking relay script for PermissionRequest"
```

---

### Task 10: Update Bootstrap Hook Registration

**Files:**
- Modify: `runtime/Bootstrap.kt`

- [ ] **Step 1: Read Bootstrap.kt hook installation code**

Read lines 762-835 of `Bootstrap.kt` to understand the current hook registration.

- [ ] **Step 2: Add PermissionRequest to hook events with blocking relay**

The hook events list at line 784 currently has: `"PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop", "Notification"`.

Add `"PermissionRequest"` to the list. For this event only, use the blocking relay script path instead of the fire-and-forget `hook-relay.js`. This requires modifying the registration loop to use a different command for PermissionRequest.

- [ ] **Step 3: Deploy blocking relay script**

Add code to copy `hook-relay-blocking.js` from assets to `~/.claude-mobile/` (same pattern as existing `hook-relay.js` deployment).

- [ ] **Step 4: Commit**

```bash
git add app/src/main/kotlin/com/destin/code/runtime/Bootstrap.kt
git commit -m "feat(mobile): register PermissionRequest hook with blocking relay"
```

---

### Task 11: Add Socket Holding to EventBridge

**Files:**
- Modify: `parser/EventBridge.kt`

- [ ] **Step 1: Read EventBridge.kt**

Understand the current socket server implementation — how it accepts connections, reads payloads, emits events, and closes sockets.

- [ ] **Step 2: Add pending sockets map**

```kotlin
private val pendingSockets = ConcurrentHashMap<String, LocalSocket>()
```

- [ ] **Step 3: Modify connection handler for PermissionRequest**

When the parsed event has `hook_event_name == "PermissionRequest"`:
- Generate a UUID request ID
- Store the socket in `pendingSockets` keyed by request ID
- Inject `_requestId` into the event JSON
- Emit the event but do NOT close the socket

For all other events: close the socket immediately (existing behavior).

- [ ] **Step 4: Add respond method**

```kotlin
fun respond(requestId: String, decision: JSONObject) {
    val socket = pendingSockets.remove(requestId) ?: return
    try {
        socket.outputStream.write((decision.toString() + "\n").toByteArray())
        socket.outputStream.flush()
        socket.close()
    } catch (e: Exception) {
        // Socket already gone (relay timeout)
    }
}
```

- [ ] **Step 5: Add cleanup in shutdown**

Close all pending sockets when the EventBridge stops.

- [ ] **Step 6: Commit**

```bash
git add app/src/main/kotlin/com/destin/code/parser/EventBridge.kt
git commit -m "feat(mobile): add socket holding and respond() to EventBridge"
```

---

### Task 12: Add PermissionRequest Event Type

**Files:**
- Modify: `parser/HookEvent.kt`

- [ ] **Step 1: Add PermissionRequest data class**

```kotlin
data class PermissionRequest(
    override val sessionId: String,
    override val hookEventName: String,
    val toolName: String,
    val toolInput: JSONObject,
    val permissionSuggestions: JSONArray?,
    val requestId: String,
) : HookEvent()
```

- [ ] **Step 2: Add parsing in fromJson companion**

Add a `"PermissionRequest"` case to the `when (eventName)` block:

```kotlin
"PermissionRequest" -> PermissionRequest(
    sessionId = sessionId,
    hookEventName = eventName,
    toolName = obj.optString("tool_name", ""),
    toolInput = obj.optJSONObject("tool_input") ?: JSONObject(),
    permissionSuggestions = if (obj.has("permission_suggestions"))
        obj.optJSONArray("permission_suggestions") else null,
    requestId = obj.optString("_requestId", ""),
)
```

- [ ] **Step 3: Commit**

```bash
git add app/src/main/kotlin/com/destin/code/parser/HookEvent.kt
git commit -m "feat(mobile): add PermissionRequest event type to HookEvent"
```

---

### Task 13: Update ChatState and ManagedSession

**Files:**
- Modify: `ui/ChatState.kt`
- Modify: `runtime/ManagedSession.kt`

- [ ] **Step 1: Add requestId and permissionSuggestions to ToolAwaitingApproval**

In `ChatState.kt`, update the data class:

```kotlin
data class ToolAwaitingApproval(
    val cardId: String,
    val toolUseId: String,
    val tool: String,
    val args: String,
    val hasAlwaysOption: Boolean = true,
    val requestId: String? = null,
    val permissionSuggestions: JSONArray? = null,
) : MessageContent()
```

- [ ] **Step 2: Add updateToolToApproval overload that accepts requestId**

Add a new method or modify the existing `updateToolToApproval` to accept optional `requestId` and `permissionSuggestions` parameters:

```kotlin
fun updateToolToApproval(
    toolUseId: String,
    hasAlwaysOption: Boolean = true,
    requestId: String? = null,
    permissionSuggestions: JSONArray? = null,
) {
    // ... existing logic, but pass requestId and permissionSuggestions
    // to the ToolAwaitingApproval constructor
}
```

- [ ] **Step 3: Route PermissionRequest in ManagedSession**

In `routeHookEvent()`, add a case for `HookEvent.PermissionRequest`:

```kotlin
is HookEvent.PermissionRequest -> {
    val lastRunning = chatState.messages.lastOrNull {
        it.content is MessageContent.ToolRunning
    }
    val toolUseId = (lastRunning?.content as? MessageContent.ToolRunning)?.toolUseId
    if (toolUseId != null) {
        val hasAlways = event.permissionSuggestions != null &&
            event.permissionSuggestions.length() > 0
        chatState.updateToolToApproval(
            toolUseId,
            hasAlways,
            event.requestId,
            event.permissionSuggestions,
        )
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/src/main/kotlin/com/destin/code/ui/ChatState.kt app/src/main/kotlin/com/destin/code/runtime/ManagedSession.kt
git commit -m "feat(mobile): route PermissionRequest to ToolCard with structured data"
```

---

### Task 14: Wire ToolCard Buttons to EventBridge.respond()

**Files:**
- Modify: `ui/ChatScreen.kt` (or wherever approval button handlers are wired)
- Modify: `ui/cards/ToolCard.kt` (if button wiring happens here)

- [ ] **Step 1: Read ChatScreen.kt approval button wiring**

Find where `onAccept`, `onAcceptAlways`, `onReject` are defined and passed to ToolCard. Currently these call `PtyBridge.sendApproval()`.

- [ ] **Step 2: Branch on requestId**

When `requestId` is non-null (PermissionRequest path), call `EventBridge.respond()` instead of `PtyBridge.sendApproval()`:

```kotlin
onAcceptApproval = {
    val content = chatState.messages.lastOrNull {
        (it.content as? MessageContent.ToolAwaitingApproval)?.toolUseId == toolUseId
    }?.content as? MessageContent.ToolAwaitingApproval

    if (content?.requestId != null) {
        // Structured path — respond via EventBridge
        val decision = JSONObject().put("decision",
            JSONObject().put("behavior", "allow"))
        bridge?.eventBridge?.respond(content.requestId, decision)
    } else {
        // Fallback path — keystroke injection
        bridge?.sendApproval(PtyBridge.ApprovalOption.Yes)
    }
    chatState.revertApprovalToRunning(toolUseId)
}
```

Similarly for Always Allow (include `updatedPermissions` from `permissionSuggestions[0]`) and No (behavior `"deny"`).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/kotlin/com/destin/code/ui/ChatScreen.kt
git commit -m "feat(mobile): wire approval buttons to EventBridge.respond()"
```

---

### Task 15: Cross-Path Cleanup

**Files:**
- Modify: `ui/ChatState.kt` or `runtime/ManagedSession.kt`

- [ ] **Step 1: Clean up orphaned sockets on tool completion**

When `updateToolToComplete` or `updateToolToFailed` is called and the tool had a `requestId`, close the held socket without sending a response:

```kotlin
fun updateToolToComplete(toolUseId: String, result: JSONObject) {
    val idx = messages.indexOfLast { ... }
    if (idx >= 0) {
        val existing = messages[idx].content
        // Clean up any held socket
        if (existing is MessageContent.ToolAwaitingApproval && existing.requestId != null) {
            // Don't respond — just close. Relay will see 'end' and exit 0.
            eventBridge?.closeSocket(existing.requestId)
        }
        // ... existing completion logic
    }
}
```

Add a `closeSocket(requestId)` method to EventBridge that removes and closes the socket without writing a response.

- [ ] **Step 2: Commit**

```bash
git add app/src/main/kotlin/com/destin/code/ui/ChatState.kt app/src/main/kotlin/com/destin/code/parser/EventBridge.kt
git commit -m "feat(mobile): clean up orphaned sockets on tool completion"
```

---

### Task 16: Mobile End-to-End Verification

- [ ] **Step 1: Install updated hooks**

Rebuild and run the app. Verify Bootstrap installs `PermissionRequest` with the blocking relay.

- [ ] **Step 2: Manual test — trigger a 3-option permission prompt**

Ask Claude to run a bash command. Verify:
- ToolCard shows Yes / Always Allow / No
- Clicking Yes allows (no keystroke injection in logs)
- Always Allow works and applies the suggestion

- [ ] **Step 3: Manual test — trigger a 2-option permission prompt**

Run a compound `cd && git` command. Verify:
- ToolCard shows Yes / No only (no Always Allow)
- Both buttons work

- [ ] **Step 4: Manual test — fallback still works**

Trigger a setup prompt (theme, login). Verify InkSelectParser still renders PromptCards.

- [ ] **Step 5: Commit any fixes**

---

### Task 17: Desktop Cross-Path Cleanup

**Files:**
- Modify: `desktop/src/renderer/state/chat-reducer.ts`

The spec requires that if a tool completes (PostToolUse/PostToolUseFailure) while a PermissionRequest socket is held, the socket must be cleaned up.

- [ ] **Step 1: Add cleanup in POST_TOOL_USE and POST_TOOL_USE_FAILURE cases**

In both cases, after updating the tool status, check if the tool had a `requestId` and call cleanup via IPC:

```typescript
case 'POST_TOOL_USE': {
  // ... existing logic ...
  if (existing?.requestId) {
    // Orphaned socket — tool completed via another path (e.g., keystroke fallback)
    // Close the socket without responding. The relay sees 'end' and exits 0.
    window.claude.session.respondToPermission(existing.requestId, {});
  }
  // ... rest of existing logic ...
}
```

Note: Sending an empty object `{}` as the decision means the relay's JSON parse will succeed but `appDecision.decision` will be undefined, causing the `hookSpecificOutput` to have an undefined decision. Alternatively, add a dedicated `closePermissionSocket` IPC that closes without writing. Read the exact reducer structure first to determine the cleanest approach.

- [ ] **Step 2: Commit**

```bash
git add desktop/src/renderer/state/chat-reducer.ts
git commit -m "feat(desktop): clean up orphaned permission sockets on tool completion"
```

---

### Task 18: Relay Integration Tests

**Files:**
- Modify: `desktop/docs/test-blocking-relay.js`

- [ ] **Step 1: Update the existing spike test to validate the new protocol**

The 4 test scenarios remain the same, but update expected behavior:
- Fire-and-forget: server closes immediately → exit 0 (unchanged)
- Blocking allow: server sends `{"decision": {"behavior": "allow"}}` → relay prints `hookSpecificOutput` to stdout, exits 0
- Blocking deny: server sends `{"decision": {"behavior": "deny"}}` → relay prints `hookSpecificOutput` to stdout, exits 0 (deny is expressed in JSON, not exit code)
- Timeout: server holds → exit 2 (changed from exit 0)

Also add a new test: verify the stdout output format matches `hookSpecificOutput` spec.

- [ ] **Step 2: Run tests**

Run: `node desktop/docs/test-blocking-relay.js`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add desktop/docs/test-blocking-relay.js
git commit -m "test(desktop): update relay integration tests for new protocol"
```

---

### Task 19: Cleanup Probe Artifacts

**Files:**
- Delete: `~/.claude-mobile/permission-request-probe.sh`
- Delete: `~/.claude-mobile/probe-logs/` directory
- Modify: `~/.claude/settings.json` — remove the probe hook entry

- [ ] **Step 1: Remove probe script and logs**

```bash
rm ~/.claude-mobile/permission-request-probe.sh
rm -rf ~/.claude-mobile/probe-logs/
```

- [ ] **Step 2: Remove probe hook from settings.json**

Remove the `PermissionRequest` entry that references `permission-request-probe.sh` from `~/.claude/settings.json`. The real blocking relay hook (installed by Bootstrap) replaces it.

- [ ] **Step 3: Commit (in mobile repo)**

```bash
git commit -m "chore: remove permission request probe artifacts"
```
