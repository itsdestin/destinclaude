/**
 * WebSocket-backed implementation of window.claude for browser (non-Electron) access.
 * Provides the same API surface as the Electron preload bridge.
 */

type Callback = (...args: any[]) => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export type RemoteConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

let ws: WebSocket | null = null;
let messageId = 0;
const pending = new Map<string, PendingRequest>();
const listeners = new Map<string, Set<Callback>>();
let connectionState: RemoteConnectionState = 'disconnected';
let stateChangeCallback: ((state: RemoteConnectionState) => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30_000;

function setConnectionState(state: RemoteConnectionState) {
  connectionState = state;
  stateChangeCallback?.(state);
}

export function getConnectionState(): RemoteConnectionState {
  return connectionState;
}

export function onConnectionStateChange(cb: (state: RemoteConnectionState) => void) {
  stateChangeCallback = cb;
}

function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function send(msg: any): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function invoke(type: string, payload?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `msg-${++messageId}`;
    pending.set(id, { resolve, reject });
    send({ type, id, payload });
    // Timeout after 30 seconds
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Request ${type} timed out`));
      }
    }, 30_000);
  });
}

function fire(type: string, payload: any): void {
  send({ type, payload });
}

function addListener(channel: string, cb: Callback): Callback {
  let set = listeners.get(channel);
  if (!set) {
    set = new Set();
    listeners.set(channel, set);
  }
  set.add(cb);
  return cb;
}

function removeListener(channel: string, handler: Callback): void {
  const set = listeners.get(channel);
  if (set) {
    set.delete(handler);
    if (set.size === 0) listeners.delete(channel);
  }
}

function removeAllListeners(channel: string): void {
  listeners.delete(channel);
}

function dispatchEvent(type: string, ...args: any[]): void {
  const set = listeners.get(type);
  if (set) {
    for (const cb of set) {
      try { cb(...args); } catch (e) { console.error(`[remote-shim] listener error on ${type}:`, e); }
    }
  }
}

function handleMessage(data: string): void {
  let msg: any;
  try { msg = JSON.parse(data); } catch { return; }

  const { type, id, payload } = msg;

  // Auth responses are handled separately
  if (type === 'auth:ok' || type === 'auth:failed') return;

  // Response to a pending request
  if (type?.endsWith(':response') && id && pending.has(id)) {
    const { resolve } = pending.get(id)!;
    pending.delete(id);
    resolve(payload);
    return;
  }

  // Push events — dispatch to registered listeners
  switch (type) {
    case 'pty:output':
      dispatchEvent('pty:output', payload.sessionId, payload.data);
      break;
    case 'hook:event':
      dispatchEvent('hook:event', payload);
      break;
    case 'session:created':
      dispatchEvent('session:created', payload);
      break;
    case 'session:destroyed':
      dispatchEvent('session:destroyed', payload.sessionId || payload);
      break;
    case 'session:renamed':
      dispatchEvent('session:renamed', payload.sessionId, payload.name);
      break;
    case 'status:data':
      dispatchEvent('status:data', payload);
      break;
    case 'ui:action':
      dispatchEvent('ui:action', payload);
      break;
  }
}

export function connect(passwordOrToken: string, isToken = false): Promise<string> {
  return new Promise((resolve, reject) => {
    setConnectionState('connecting');
    ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      setConnectionState('authenticating');
      const authMsg = isToken
        ? { type: 'auth', token: passwordOrToken }
        : { type: 'auth', password: passwordOrToken };
      ws!.send(JSON.stringify(authMsg));
    };

    let authResolved = false;

    ws.onmessage = (event) => {
      if (!authResolved) {
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'auth:ok') {
          authResolved = true;
          reconnectDelay = 1000; // Reset backoff on success
          setConnectionState('connected');
          // Store token for reconnection
          const token = msg.token;
          localStorage.setItem('destincode-remote-token', token);
          resolve(token);
          // Switch to normal message handling
          ws!.onmessage = (e) => handleMessage(e.data as string);
        } else if (msg.type === 'auth:failed') {
          authResolved = true;
          setConnectionState('disconnected');
          reject(new Error(msg.reason || 'Authentication failed'));
          ws!.close();
        }
        return;
      }

      handleMessage(event.data as string);
    };

    ws.onclose = () => {
      if (!authResolved) {
        setConnectionState('disconnected');
        reject(new Error('Connection closed before auth'));
        return;
      }

      setConnectionState('disconnected');
      // Attempt reconnection with stored token
      const storedToken = localStorage.getItem('destincode-remote-token');
      if (storedToken) {
        scheduleReconnect(storedToken);
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  });
}

function scheduleReconnect(token: string): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connect(token, true);
    } catch {
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      scheduleReconnect(token);
    }
  }, reconnectDelay);
}

export function disconnect(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
  setConnectionState('disconnected');
  localStorage.removeItem('destincode-remote-token');
}

/** Install the window.claude shim. Call once on app startup in browser mode. */
export function installShim(): void {
  (window as any).claude = {
    session: {
      create: (opts: any) => invoke('session:create', opts),
      destroy: (sessionId: string) => invoke('session:destroy', { sessionId }),
      list: () => invoke('session:list'),
      sendInput: (sessionId: string, text: string) => fire('session:input', { sessionId, text }),
      resize: (sessionId: string, cols: number, rows: number) => fire('session:resize', { sessionId, cols, rows }),
      signalReady: (sessionId: string) => fire('session:terminal-ready', { sessionId }),
      respondToPermission: (requestId: string, decision: object) => invoke('permission:respond', { requestId, decision }),
    },
    on: {
      sessionCreated: (cb: Callback) => addListener('session:created', cb),
      sessionDestroyed: (cb: Callback) => addListener('session:destroyed', cb),
      ptyOutput: (cb: Callback) => addListener('pty:output', cb),
      hookEvent: (cb: Callback) => addListener('hook:event', cb),
      statusData: (cb: Callback) => addListener('status:data', cb),
      sessionRenamed: (cb: Callback) => addListener('session:renamed', cb),
      uiAction: (cb: Callback) => addListener('ui:action', cb),
    },
    skills: {
      list: () => invoke('skills:list'),
    },
    dialog: {
      openFile: async () => [],
      openFolder: async () => null,
      readTranscriptMeta: (p: string) => invoke('transcript:read-meta', { path: p }),
      saveClipboardImage: async () => null,
    },
    shell: {
      openChangelog: async () => {},
    },
    remote: {
      getConfig: () => invoke('remote:get-config'),
      setPassword: (password: string) => invoke('remote:set-password', password),
      setConfig: (updates: { enabled?: boolean; trustTailscale?: boolean }) =>
        invoke('remote:set-config', updates),
      detectTailscale: () => invoke('remote:detect-tailscale'),
      getClientCount: () => invoke('remote:get-client-count'),
      getClientList: () => invoke('remote:get-client-list'),
      disconnectClient: (clientId: string) => invoke('remote:disconnect-client', clientId),
      broadcastAction: (action: any) => fire('ui:action', action),
    },
    off: (channel: string, handler: Callback) => removeListener(channel, handler),
    removeAllListeners: (channel: string) => removeAllListeners(channel),
    getGitHubAuth: () => invoke('github:auth'),
    getHomePath: () => invoke('get-home-path'),
  };
}
