import net from 'net';
import fs from 'fs';
import { EventEmitter } from 'events';
import { HookEvent } from '../shared/types';

const DEFAULT_PIPE_NAME = process.platform === 'win32'
  ? '\\\\.\\pipe\\claude-desktop-hooks'
  : '/tmp/claude-desktop-hooks.sock';

export class HookRelay extends EventEmitter {
  private server: net.Server | null = null;
  private running = false;
  private pipeName: string;

  constructor(pipeName?: string) {
    super();
    this.pipeName = pipeName || DEFAULT_PIPE_NAME;
  }

  private parseHookPayload(data: string): HookEvent {
    const parsed = JSON.parse(data);
    return {
      type: parsed.hook_event_name || 'unknown',
      // Prefer our injected desktop session ID over Claude Code's internal session_id
      sessionId: parsed._desktop_session_id || parsed.session_id || '',
      payload: parsed,
      timestamp: Date.now(),
    };
  }

  private createServer(): net.Server {
    return net.createServer((socket) => {
      let data = '';
      let processed = false;
      socket.setEncoding('utf8');

      socket.on('error', (err) => {
        // Log connection-level errors for debugging (ECONNRESET, EPIPE, etc.)
        console.warn('[HookRelay] Socket error:', err.message);
      });

      const processPayload = (payload: string) => {
        if (processed) return;
        processed = true;
        try {
          const event = this.parseHookPayload(payload);
          this.emit('hook-event', event);
        } catch (err: any) {
          console.warn('[HookRelay] Invalid hook payload:', err.message);
        }
        socket.end();
      };

      socket.on('data', (chunk) => {
        data += chunk;
        const nlIndex = data.indexOf('\n');
        if (nlIndex >= 0) {
          processPayload(data.substring(0, nlIndex));
        }
      });

      socket.on('end', () => {
        // Fallback: if no newline was found, parse whatever we have
        if (data.length > 0) {
          processPayload(data);
        }
      });
    });
  }

  async start(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.tryListen();
        return;
      } catch (err: any) {
        if (err.code === 'EADDRINUSE' && attempt < 2) {
          // Stale pipe from a previous process — try to release it
          await this.forceReleasePipe();
        } else {
          throw err;
        }
      }
    }
  }

  private tryListen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.createServer();
      this.server.listen(this.pipeName, () => {
        this.running = true;
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  private async forceReleasePipe(): Promise<void> {
    // On Unix, try unlinking the stale socket file directly — this is the
    // most reliable way to clear a dead socket from a crashed process.
    if (process.platform !== 'win32') {
      try { fs.unlinkSync(this.pipeName); } catch { /* may not exist */ }
      return;
    }

    // On Windows, named pipes held by dead processes can't be released by
    // client connection alone. We need to try connecting (which may error),
    // wait, and also try unlinking the pipe path as a filesystem entry.
    await new Promise<void>((resolve) => {
      const client = net.createConnection(this.pipeName, () => {
        client.end();
        setTimeout(resolve, 1000);
      });
      client.on('error', () => {
        setTimeout(resolve, 1000);
      });
      client.setTimeout(2000, () => {
        client.destroy();
        setTimeout(resolve, 1000);
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.running = false;
    }
    // Clean up Unix socket file
    if (process.platform !== 'win32') {
      try { fs.unlinkSync(this.pipeName); } catch { /* may already be gone */ }
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  async simulateEvent(jsonPayload: string): Promise<void> {
    const event = this.parseHookPayload(jsonPayload);
    this.emit('hook-event', event);
  }
}
