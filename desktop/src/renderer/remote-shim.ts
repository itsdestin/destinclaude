/**
 * WebSocket-backed implementation of window.claude for browser (non-Electron) access.
 * Provides the same API surface as the Electron preload bridge.
 */

type Callback = (...args: any[]) => void;

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: ReturnType<typeof setTimeout>;
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

/** Override WebSocket target — set by connectToHost(), cleared by disconnectFromHost() */
let targetUrl: string | null = null;
/** Whether to preserve __PLATFORM__ on next auth:ok (prevents desktop overwriting 'android') */
let preservePlatform = false;

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
  // If a remote host override is set, use it (connectToHost sets this)
  if (targetUrl) return targetUrl;
  // Android WebView loads from file:// — connect to local bridge server
  if (location.protocol === 'file:') {
    return 'ws://localhost:9901';
  }
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
    const timeout = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Request ${type} timed out`));
      }
    }, 30_000);
    pending.set(id, { resolve, reject, timeout });
    send({ type, id, payload });
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
    const entry = pending.get(id)!;
    clearTimeout(entry.timeout);
    pending.delete(id);
    entry.resolve(payload);
    return;
  }

  // Push events — dispatch to registered listeners
  switch (type) {
    case 'pty:output':
      dispatchEvent('pty:output', payload.sessionId, payload.data);              // global (App.tsx mode detection)
      dispatchEvent(`pty:output:${payload.sessionId}`, payload.data);            // per-session (TerminalView)
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
      dispatchEvent('ui:action:received', payload);
      break;
    case 'transcript:event':
      dispatchEvent('transcript:event', payload);
      break;
    case 'prompt:show':
      dispatchEvent('prompt:show', payload);
      break;
    case 'prompt:dismiss':
      dispatchEvent('prompt:dismiss', payload);
      break;
    case 'prompt:complete':
      dispatchEvent('prompt:complete', payload);
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
          // Preserve __PLATFORM__ when connecting to a remote desktop from Android —
          // the desktop server responds with platform:"electron" but we're still on a phone
          if (!preservePlatform) {
            const platform = msg.platform || 'browser';
            (window as any).__PLATFORM__ = platform;
          }
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

/**
 * Connect to a remote desktop server. Disconnects from the current server first.
 * __PLATFORM__ is preserved as 'android' so touch adaptations stay active.
 */
export async function connectToHost(host: string, port: number, password: string): Promise<void> {
  const { setConnectionMode } = await import('./platform');

  // Disconnect from current server (local bridge or previous remote)
  disconnect();

  // Reject any pending requests from the old server
  for (const [id, entry] of pending) {
    clearTimeout(entry.timeout);
    entry.reject(new Error('Server switched'));
  }
  pending.clear();

  // Point at the desktop server
  targetUrl = `ws://${host}:${port}/ws`;
  localStorage.setItem('destincode-remote-target', targetUrl);
  preservePlatform = true;

  // Connect with password auth
  await connect(password, false);

  preservePlatform = false;
  setConnectionMode('remote');
}

/**
 * Disconnect from a remote desktop and reconnect to the local bridge server.
 */
export async function disconnectFromHost(): Promise<void> {
  const { setConnectionMode } = await import('./platform');

  disconnect();

  for (const [id, entry] of pending) {
    clearTimeout(entry.timeout);
    entry.reject(new Error('Server switched'));
  }
  pending.clear();

  // Clear remote target — getWsUrl() falls back to localhost:9901
  targetUrl = null;
  localStorage.removeItem('destincode-remote-target');
  preservePlatform = false;

  // Reconnect to local bridge
  await connect('android-local', false);

  setConnectionMode('local');
}

/** Install the window.claude shim. Call once on app startup in browser mode. */
export function installShim(): void {
  // Restore remote target from previous session (e.g., page reload while in remote mode)
  const savedTarget = localStorage.getItem('destincode-remote-target');
  if (savedTarget) {
    targetUrl = savedTarget;
    preservePlatform = true; // Will be set on next auth:ok
    // Restore connection mode synchronously so components render correctly on first paint
    import('./platform').then(({ setConnectionMode }) => setConnectionMode('remote'));
  }

  (window as any).claude = {
    session: {
      create: (opts: any) => invoke('session:create', opts),
      destroy: (sessionId: string) => invoke('session:destroy', { sessionId }),
      list: () => invoke('session:list'),
      browse: () => invoke('session:browse'),
      loadHistory: (sessionId: string, count?: number, all?: boolean) =>
        invoke('session:history', { sessionId, count, all }),
      switch: (sessionId: string) => invoke('session:switch', { sessionId }),
      sendInput: (sessionId: string, text: string) => fire('session:input', { sessionId, text }),
      resize: (sessionId: string, cols: number, rows: number) => fire('session:resize', { sessionId, cols, rows }),
      signalReady: (sessionId: string) => fire('session:terminal-ready', { sessionId }),
      respondToPermission: (requestId: string, decision: object) => invoke('permission:respond', { requestId, decision }),
    },
    on: {
      sessionCreated: (cb: Callback) => addListener('session:created', cb),
      sessionDestroyed: (cb: Callback) => addListener('session:destroyed', cb),
      ptyOutput: (cb: Callback) => addListener('pty:output', cb),
      ptyOutputForSession: (sessionId: string, cb: (data: string) => void) => {
        const channel = `pty:output:${sessionId}`;
        const handler = addListener(channel, cb);
        return () => removeListener(channel, handler);
      },
      hookEvent: (cb: Callback) => addListener('hook:event', cb),
      statusData: (cb: Callback) => addListener('status:data', cb),
      sessionRenamed: (cb: Callback) => addListener('session:renamed', cb),
      uiAction: (cb: Callback) => addListener('ui:action:received', cb),
      transcriptEvent: (cb: Callback) => addListener('transcript:event', cb),
      promptShow: (cb: Callback) => addListener('prompt:show', cb),
      promptDismiss: (cb: Callback) => addListener('prompt:dismiss', cb),
      promptComplete: (cb: Callback) => addListener('prompt:complete', cb),
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
    // Android-only bridge methods — only called when isAndroid() is true
    android: {
      getTier: () => invoke('android:get-tier'),
      setTier: (tier: string) => invoke('android:set-tier', { tier }),
      getDirectories: () => invoke('android:get-directories'),
      addDirectory: (path: string, label: string) => invoke('android:add-directory', { path, label }),
      removeDirectory: (path: string) => invoke('android:remove-directory', { path }),
      getAbout: () => invoke('android:get-about'),
      getPairedDevices: () => invoke('android:get-paired-devices'),
      savePairedDevice: (device: { name: string; host: string; port: number; password: string }) =>
        invoke('android:save-paired-device', device),
      removePairedDevice: (host: string, port: number) =>
        invoke('android:remove-paired-device', { host, port }),
      scanQr: () => invoke('android:scan-qr'),
    },
    off: (channel: string, handler: Callback) => removeListener(channel, handler),
    removeAllListeners: (channel: string) => removeAllListeners(channel),
    getGitHubAuth: () => invoke('github:auth'),
    getHomePath: () => invoke('get-home-path'),
    getFavorites: () => invoke('favorites:get'),
    setFavorites: (favorites: string[]) => invoke('favorites:set', favorites),
    getIncognito: () => invoke('game:getIncognito'),
    setIncognito: (incognito: boolean) => invoke('game:setIncognito', incognito),
  };
}
