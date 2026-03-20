import net from 'net';
import { EventEmitter } from 'events';
import { HookEvent } from '../shared/types';

const DEFAULT_PIPE_NAME = '\\\\.\\pipe\\claude-desktop-hooks';

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

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let data = '';
        let processed = false;
        socket.setEncoding('utf8');

        socket.on('error', () => {});

        const processPayload = (payload: string) => {
          if (processed) return;
          processed = true;
          try {
            const event = this.parseHookPayload(payload);
            this.emit('hook-event', event);
          } catch {
            // Invalid JSON — ignore
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

      this.server.listen(this.pipeName, () => {
        this.running = true;
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.running = false;
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
