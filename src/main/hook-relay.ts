import net from 'net';
import { EventEmitter } from 'events';
import { HookEvent } from '../shared/types';

const PIPE_NAME = '\\\\.\\pipe\\claude-desktop-hooks';

export class HookRelay extends EventEmitter {
  private server: net.Server | null = null;
  private running = false;

  private parseHookPayload(data: string): HookEvent {
    const parsed = JSON.parse(data);
    return {
      type: parsed.hook_event_name || 'unknown',
      sessionId: parsed.session_id || '',
      payload: parsed,
      timestamp: Date.now(),
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let data = '';
        socket.setEncoding('utf8');

        socket.on('data', (chunk) => { data += chunk; });

        socket.on('end', () => {
          try {
            const event = this.parseHookPayload(data);

            this.emit('hook-event', event);

            // For non-blocking hooks, respond with empty (proceed)
            // For blocking hooks, the response determines the action
            socket.end(JSON.stringify({ decision: 'allow' }));
          } catch {
            socket.end();
          }
        });
      });

      this.server.listen(PIPE_NAME, () => {
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

  // For testing: simulate a hook event without a real pipe connection
  async simulateEvent(jsonPayload: string): Promise<void> {
    const event = this.parseHookPayload(jsonPayload);
    this.emit('hook-event', event);
  }
}
