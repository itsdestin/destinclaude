import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import type { SessionManager } from './session-manager';
import type { HookRelay } from './hook-relay';
import type { RemoteConfig } from './remote-config';

const PTY_BUFFER_SIZE = 4 * 1024 * 1024; // 4MB per session — enough for full conversation replay
const HOOK_BUFFER_SIZE = 10_000; // ~10MB max, covers full conversations without excessive memory
const AUTH_TIMEOUT_MS = 5000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_FAILURES = 5;

interface AuthenticatedClient {
  id: string;
  ws: WebSocket;
  token: string;
  ip: string;
  connectedAt: number;
}

export interface ClientInfo {
  id: string;
  ip: string;
  connectedAt: number;
}

export class RemoteServer {
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<AuthenticatedClient>();
  private tokens = new Map<string, boolean>(); // token → valid
  private tokensPath: string;
  private ptyBuffers = new Map<string, string>(); // sessionId → rolling PTY output
  private hookBuffers = new Map<string, any[]>(); // sessionId → rolling hook events
  private transcriptBuffers = new Map<string, any[]>();
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private failedAttempts = new Map<string, { count: number; resetAt: number }>();
  // Topic file watcher for session:renamed events
  private sessionIdMap = new Map<string, string>(); // desktopId → claudeId
  private lastTopics = new Map<string, string>();
  private topicInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private sessionManager: SessionManager,
    private hookRelay: HookRelay,
    private config: RemoteConfig,
    private skillScanner?: () => any[],
  ) {
    this.tokensPath = path.join(os.homedir(), '.claude', '.remote-tokens.json');
    this.loadTokens();
  }

  private loadTokens(): void {
    try {
      const data = JSON.parse(fs.readFileSync(this.tokensPath, 'utf8'));
      if (Array.isArray(data)) {
        for (const t of data) this.tokens.set(t, true);
      }
    } catch { /* no persisted tokens yet */ }
  }

  private saveTokens(): void {
    try {
      fs.mkdirSync(path.dirname(this.tokensPath), { recursive: true });
      fs.writeFileSync(this.tokensPath, JSON.stringify(Array.from(this.tokens.keys())));
    } catch { /* best effort */ }
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[RemoteServer] Disabled in config, not starting');
      return;
    }

    // Subscribe to events for buffering and broadcasting
    this.sessionManager.on('pty-output', this.onPtyOutput);
    this.hookRelay.on('hook-event', this.onHookEvent);
    this.sessionManager.on('session-exit', this.onSessionExit);
    this.sessionManager.on('session-created', this.onSessionCreated);

    // Determine static file directory (production) or Vite dev server URL (development)
    const staticDir = path.join(__dirname, '..', 'renderer');
    const viteDevUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    // In dev mode, dist/renderer/index.html doesn't exist — proxy to Vite
    const hasStaticBuild = fs.existsSync(path.join(staticDir, 'index.html'));

    this.httpServer = http.createServer((req, res) => {
      if (hasStaticBuild) {
        this.handleHttpRequest(req, res, staticDir);
      } else {
        this.proxyToVite(req, res, viteDevUrl);
      }
    });

    this.wss = new WebSocketServer({ server: this.httpServer, path: '/ws' });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    // Dev mode: proxy WebSocket upgrades (non-/ws) to Vite for HMR
    if (!hasStaticBuild) {
      this.httpServer.on('upgrade', (req, socket, head) => {
        if (req.url === '/ws') return; // handled by our WebSocketServer
        // Use http:// URL — WebSocket upgrade is an HTTP request with Upgrade header
        const proxyUrl = new URL(req.url || '/', viteDevUrl);
        const proxyReq = http.request(proxyUrl, {
          method: 'GET',
          headers: req.headers,
        });
        proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
          socket.write(
            `HTTP/1.1 101 Switching Protocols\r\n` +
            Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
            '\r\n\r\n'
          );
          if (proxyHead.length) socket.write(proxyHead);
          proxySocket.pipe(socket);
          socket.pipe(proxySocket);
        });
        proxyReq.on('error', () => socket.destroy());
        proxyReq.end();
      });
    }

    // Status data polling — independent of ipc-handlers.ts
    const usageCachePath = path.join(os.homedir(), '.claude', '.usage-cache.json');
    const announcementCachePath = path.join(os.homedir(), '.claude', '.announcement-cache.json');
    const updateStatusPath = path.join(os.homedir(), '.claude', 'toolkit-state', 'update-status.json');
    const syncStatusPath = path.join(os.homedir(), '.claude', '.sync-status');
    const syncWarningsPath = path.join(os.homedir(), '.claude', '.sync-warnings');

    this.statusInterval = setInterval(() => {
      const data = {
        usage: readJsonFile(usageCachePath),
        announcement: readJsonFile(announcementCachePath),
        updateStatus: readJsonFile(updateStatusPath),
        syncStatus: readTextFile(syncStatusPath),
        syncWarnings: readTextFile(syncWarningsPath),
      };
      this.broadcast({ type: 'status:data', payload: data });
    }, 10_000);

    // Topic file watcher — discover desktop→claude session ID mapping from hook events
    // and poll topic files for session:renamed events
    const topicDir = path.join(os.homedir(), '.claude', 'topics');
    this.hookRelay.on('hook-event', (event: any) => {
      const desktopId = event.sessionId;
      const claudeId = event.payload?.session_id as string;
      if (!desktopId || !claudeId || this.sessionIdMap.has(desktopId)) return;
      this.sessionIdMap.set(desktopId, claudeId);
    });

    this.topicInterval = setInterval(() => {
      for (const [desktopId, claudeId] of this.sessionIdMap) {
        try {
          const content = fs.readFileSync(path.join(topicDir, `topic-${claudeId}`), 'utf8').trim();
          if (content && content !== 'New Session' && content !== this.lastTopics.get(desktopId)) {
            this.lastTopics.set(desktopId, content);
            this.broadcast({ type: 'session:renamed', payload: { sessionId: desktopId, name: content } });
          }
        } catch { /* file may not exist yet */ }
      }
    }, 2000);

    // Clean up topic tracking when sessions exit
    this.sessionManager.on('session-exit', (sessionId: string) => {
      this.sessionIdMap.delete(sessionId);
      this.lastTopics.delete(sessionId);
    });

    return new Promise<void>((resolve) => {
      this.httpServer!.listen(this.config.port, () => {
        console.log(`[RemoteServer] Listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    if (this.statusInterval) clearInterval(this.statusInterval);
    if (this.topicInterval) clearInterval(this.topicInterval);
    this.sessionIdMap.clear();
    this.lastTopics.clear();
    this.transcriptBuffers.clear();
    this.sessionManager.off('pty-output', this.onPtyOutput);
    this.hookRelay.off('hook-event', this.onHookEvent);
    this.sessionManager.off('session-exit', this.onSessionExit);
    this.sessionManager.off('session-created', this.onSessionCreated);

    for (const client of this.clients) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();
    this.tokens.clear();

    if (this.wss) { this.wss.close(); this.wss = null; }
    if (this.httpServer) { this.httpServer.close(); this.httpServer = null; }
  }

  /** Invalidate all session tokens (e.g., after password change). */
  invalidateTokens(): void {
    this.tokens.clear();
    this.saveTokens();
    for (const client of this.clients) {
      client.ws.close(4001, 'Password changed');
    }
    this.clients.clear();
  }

  /** Number of currently connected remote clients. */
  getClientCount(): number {
    return this.clients.size;
  }

  /** List all connected remote clients. */
  getClientList(): ClientInfo[] {
    return Array.from(this.clients).map(c => ({
      id: c.id,
      ip: c.ip,
      connectedAt: c.connectedAt,
    }));
  }

  /** Disconnect a specific client by ID. */
  disconnectClient(clientId: string): boolean {
    for (const client of this.clients) {
      if (client.id === clientId) {
        client.ws.close(4002, 'Disconnected by admin');
        this.clients.delete(client);
        return true;
      }
    }
    return false;
  }

  // --- Event handlers for buffering ---

  private onPtyOutput = (sessionId: string, data: string) => {
    // Append to rolling buffer
    let buf = this.ptyBuffers.get(sessionId) || '';
    buf += data;
    if (buf.length > PTY_BUFFER_SIZE) {
      buf = buf.slice(buf.length - PTY_BUFFER_SIZE);
    }
    this.ptyBuffers.set(sessionId, buf);

    // Broadcast live
    this.broadcast({ type: 'pty:output', payload: { sessionId, data } });
  };

  private onHookEvent = (event: any) => {
    const sessionId = event.sessionId || '';

    // Append to rolling buffer
    let buf = this.hookBuffers.get(sessionId) || [];
    buf.push(event);
    if (buf.length > HOOK_BUFFER_SIZE) {
      buf = buf.slice(buf.length - HOOK_BUFFER_SIZE);
    }
    this.hookBuffers.set(sessionId, buf);

    // Broadcast live
    this.broadcast({ type: 'hook:event', payload: event });
  };

  private onSessionCreated = (info: any) => {
    this.broadcast({ type: 'session:created', payload: info });
  };

  private onSessionExit = (sessionId: string) => {
    this.ptyBuffers.delete(sessionId);
    this.hookBuffers.delete(sessionId);
    this.transcriptBuffers.delete(sessionId);
    this.broadcast({ type: 'session:destroyed', payload: { sessionId } });
  };

  bufferTranscriptEvent(event: any): void {
    const sessionId = event.sessionId || '';
    let buf = this.transcriptBuffers.get(sessionId) || [];
    buf.push(event);
    if (buf.length > HOOK_BUFFER_SIZE) {
      buf = buf.slice(buf.length - HOOK_BUFFER_SIZE);
    }
    this.transcriptBuffers.set(sessionId, buf);
  }

  // --- HTTP static file serving ---

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse, staticDir: string): void {
    const url = req.url || '/';
    let filePath: string;

    if (url === '/' || url === '/index.html') {
      filePath = path.join(staticDir, 'index.html');
    } else {
      // Prevent directory traversal — decode percent-encoding first
      const decoded = decodeURIComponent(url);
      const safePath = path.normalize(decoded).replace(/^(\.\.[\/\\])+/, '');
      filePath = path.join(staticDir, safePath);
    }

    // Verify the resolved path is within staticDir
    if (!filePath.startsWith(staticDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback — serve index.html for non-file routes
        fs.readFile(path.join(staticDir, 'index.html'), (err2, html) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          }
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }

  // --- Dev mode: proxy HTTP requests to Vite dev server ---

  private proxyToVite(req: http.IncomingMessage, res: http.ServerResponse, viteUrl: string): void {
    const url = new URL(req.url || '/', viteUrl);
    const proxyReq = http.request(url, {
      method: req.method,
      headers: req.headers,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.writeHead(502);
      res.end('Vite dev server not available');
    });
    req.pipe(proxyReq);
  }

  // --- WebSocket connection handling ---

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const ip = req.socket.remoteAddress || '';

    // Check rate limiting
    if (this.isRateLimited(ip)) {
      ws.close(4029, 'Too many failed attempts');
      return;
    }

    // Auto-accept Tailscale-trusted connections
    if (this.config.trustTailscale && this.config.isTailscaleIp(ip)) {
      const token = randomUUID();
      this.tokens.set(token, true);
      this.saveTokens();
      this.addClient(ws, token, ip);
      ws.send(JSON.stringify({ type: 'auth:ok', token }));
      this.replayBuffers(ws);
      return;
    }

    // Auth timeout
    const timeout = setTimeout(() => {
      ws.close(4000, 'Auth timeout');
    }, AUTH_TIMEOUT_MS);

    // Wait for auth message
    const authHandler = async (raw: Buffer | string) => {
      clearTimeout(timeout);
      ws.off('message', authHandler);

      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== 'auth') {
          ws.send(JSON.stringify({ type: 'auth:failed', reason: 'expected-auth' }));
          ws.close(4000, 'Expected auth');
          return;
        }

        // No password configured
        if (!this.config.passwordHash) {
          ws.send(JSON.stringify({ type: 'auth:failed', reason: 'no-password-configured' }));
          ws.close(4000, 'No password configured');
          return;
        }

        let authenticated = false;

        if (msg.token && this.tokens.has(msg.token)) {
          authenticated = true;
        } else if (msg.password) {
          authenticated = await this.config.verifyPassword(msg.password);
        }

        if (authenticated) {
          this.clearFailedAttempts(ip);
          const token = msg.token && this.tokens.has(msg.token) ? msg.token : randomUUID();
          this.tokens.set(token, true);
          this.saveTokens();
          this.addClient(ws, token, ip);
          ws.send(JSON.stringify({ type: 'auth:ok', token }));
          this.replayBuffers(ws);
        } else {
          this.recordFailedAttempt(ip);
          ws.send(JSON.stringify({ type: 'auth:failed', reason: 'invalid-credentials' }));
          ws.close(4001, 'Auth failed');
        }
      } catch {
        ws.send(JSON.stringify({ type: 'auth:failed', reason: 'invalid-message' }));
        ws.close(4000, 'Invalid auth message');
      }
    };

    ws.on('message', authHandler);
  }

  private addClient(ws: WebSocket, token: string, ip: string): void {
    const client: AuthenticatedClient = { id: randomUUID(), ws, token, ip, connectedAt: Date.now() };
    this.clients.add(client);

    ws.on('message', (raw) => this.handleMessage(client, raw as Buffer | string));
    ws.on('close', () => this.clients.delete(client));
    ws.on('error', () => this.clients.delete(client));
  }

  // --- Replay buffers on new connection ---

  private replayBuffers(ws: WebSocket): void {
    // Session list — sent immediately so client can initialize chat state
    const sessions = this.sessionManager.listSessions();
    ws.send(JSON.stringify({
      type: 'session:list:response',
      id: '_replay',
      payload: sessions,
    }));

    for (const session of sessions) {
      ws.send(JSON.stringify({ type: 'session:created', payload: session }));
    }

    // Delay PTY + hook replay to give the client time to process SESSION_INIT.
    // Without this delay, hook events arrive before the chat reducer has
    // initialized the session state, and all events are silently dropped.
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) return;

      // PTY buffers
      for (const [sessionId, buf] of this.ptyBuffers) {
        if (buf.length > 0) {
          ws.send(JSON.stringify({ type: 'pty:output', payload: { sessionId, data: buf } }));
        }
      }

      // Hook event buffers
      for (const [_sessionId, events] of this.hookBuffers) {
        for (const event of events) {
          ws.send(JSON.stringify({ type: 'hook:event', payload: event }));
        }
      }

      // Transcript event buffers
      for (const [_sessionId, events] of this.transcriptBuffers) {
        for (const event of events) {
          ws.send(JSON.stringify({ type: 'transcript:event', payload: event }));
        }
      }
    }, 500); // 500ms gives React time to render App and register SESSION_INIT
  }

  // --- Message routing ---

  private async handleMessage(client: AuthenticatedClient, raw: Buffer | string): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { type, id, payload } = msg;

    switch (type) {
      // --- Request/response ---
      case 'session:create': {
        const info = this.sessionManager.createSession(payload);
        this.respond(client.ws, type, id, info);
        // session:created broadcast is handled by the onSessionCreated event listener
        break;
      }
      case 'session:destroy': {
        const result = this.sessionManager.destroySession(payload.sessionId || payload);
        this.respond(client.ws, type, id, result);
        if (result) {
          this.broadcast({ type: 'session:destroyed', payload: { sessionId: payload.sessionId || payload } });
        }
        break;
      }
      case 'session:list': {
        const sessions = this.sessionManager.listSessions();
        this.respond(client.ws, type, id, sessions);
        break;
      }
      case 'permission:respond': {
        const { requestId, decision } = payload;
        const result = this.hookRelay.respond(requestId, decision);
        this.respond(client.ws, type, id, result);
        break;
      }
      case 'skills:list': {
        const skills = this.skillScanner ? this.skillScanner() : [];
        this.respond(client.ws, type, id, skills);
        break;
      }
      case 'get-home-path': {
        this.respond(client.ws, type, id, os.homedir());
        break;
      }
      case 'transcript:read-meta': {
        const transcriptPath = payload.path || payload;
        // Validate path is within ~/.claude/projects/ to prevent arbitrary file reads
        const claudeProjects = path.join(os.homedir(), '.claude', 'projects');
        const resolvedPath = path.resolve(transcriptPath);
        if (!resolvedPath.startsWith(claudeProjects)) {
          this.respond(client.ws, type, id, null);
          break;
        }
        try {
          const content = fs.readFileSync(transcriptPath, 'utf8');
          const lines = content.trim().split('\n');
          let model = 'unknown';
          let contextPercent = 100;
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj.model) model = obj.model.display_name || obj.model.id || obj.model;
              if (obj.costInfo?.contextRemaining != null) contextPercent = Math.round(obj.costInfo.contextRemaining * 100);
              if (obj.context_window?.remaining_percentage != null) contextPercent = Math.round(obj.context_window.remaining_percentage);
            } catch { /* skip non-JSON lines */ }
          }
          this.respond(client.ws, type, id, { model, contextPercent });
        } catch {
          this.respond(client.ws, type, id, null);
        }
        break;
      }
      case 'github:auth': {
        try {
          const { execFile } = require('child_process');
          const { promisify } = require('util');
          const execFileAsync = promisify(execFile);
          let ghPath = 'gh';
          try { const w = require('which'); ghPath = w.sync('gh'); } catch { /* use bare 'gh' */ }
          const { stdout: username } = await execFileAsync(ghPath, ['api', 'user', '--jq', '.login']);
          console.log(`[remote] github:auth — username '${username.trim()}' requested by ${(client.ws as any)._socket?.remoteAddress || 'unknown'}`);
          // Return username only — raw token is not forwarded to remote clients
          this.respond(client.ws, type, id, { username: username.trim() });
        } catch {
          this.respond(client.ws, type, id, null);
        }
        break;
      }
      case 'remote:get-config': {
        const config = {
          ...this.config.toSafeObject(),
          clientCount: this.getClientCount(),
        };
        this.respond(client.ws, type, id, config);
        break;
      }
      case 'remote:set-password': {
        await this.config.setPassword(payload);
        this.invalidateTokens();
        this.respond(client.ws, type, id, true);
        break;
      }
      case 'remote:set-config': {
        if (typeof payload.enabled === 'boolean') this.config.enabled = payload.enabled;
        if (typeof payload.trustTailscale === 'boolean') this.config.trustTailscale = payload.trustTailscale;
        if (typeof payload.keepAwakeHours === 'number') this.config.keepAwakeHours = payload.keepAwakeHours;
        this.config.save();
        this.respond(client.ws, type, id, this.config.toSafeObject());
        break;
      }
      case 'remote:detect-tailscale': {
        const { RemoteConfig } = require('./remote-config');
        const result = await RemoteConfig.detectTailscale(this.config.port);
        this.respond(client.ws, type, id, result);
        break;
      }
      case 'remote:get-client-count': {
        this.respond(client.ws, type, id, this.getClientCount());
        break;
      }
      case 'remote:get-client-list': {
        this.respond(client.ws, type, id, this.getClientList());
        break;
      }
      case 'remote:disconnect-client': {
        const result = this.disconnectClient(payload.clientId || payload);
        this.respond(client.ws, type, id, result);
        break;
      }

      // --- UI state sync: broadcast actions to all OTHER clients ---
      case 'ui:action': {
        const data = JSON.stringify({ type: 'ui:action', payload });
        for (const c of this.clients) {
          if (c !== client && c.ws.readyState === WebSocket.OPEN) {
            c.ws.send(data);
          }
        }
        // Also forward to Electron window via IPC if this came from a remote client
        this.sessionManager.emit('ui-action', payload);
        break;
      }

      // --- Fire-and-forget ---
      case 'session:input': {
        this.sessionManager.sendInput(payload.sessionId, payload.text);
        break;
      }
      case 'session:resize': {
        this.sessionManager.resizeSession(payload.sessionId, payload.cols, payload.rows);
        break;
      }
      case 'session:terminal-ready': {
        // Remote clients don't need the buffering gate that ipc-handlers uses,
        // because we replay the PTY buffer on connect instead.
        break;
      }
    }
  }

  // --- Helpers ---

  private respond(ws: WebSocket, type: string, id: string, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: `${type}:response`, id, payload }));
    }
  }

  broadcast(msg: { type: string; payload: any }): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  // --- Rate limiting ---

  private isRateLimited(ip: string): boolean {
    const entry = this.failedAttempts.get(ip);
    if (!entry) return false;
    if (Date.now() > entry.resetAt) {
      this.failedAttempts.delete(ip);
      return false;
    }
    return entry.count >= RATE_LIMIT_MAX_FAILURES;
  }

  private recordFailedAttempt(ip: string): void {
    const entry = this.failedAttempts.get(ip);
    if (entry && Date.now() < entry.resetAt) {
      entry.count++;
    } else {
      this.failedAttempts.set(ip, { count: 1, resetAt: Date.now() + RATE_LIMIT_WINDOW_MS });
    }
  }

  private clearFailedAttempts(ip: string): void {
    this.failedAttempts.delete(ip);
  }
}

// --- File reading helpers (same pattern as ipc-handlers.ts) ---

function readJsonFile(filePath: string): any {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function readTextFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf8').trim() || null; } catch { return null; }
}
