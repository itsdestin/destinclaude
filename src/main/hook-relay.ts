import net from 'net';
import { EventEmitter } from 'events';
import { HookEvent } from '../shared/types';

const DEFAULT_PIPE_NAME = '\\\\.\\pipe\\claude-desktop-hooks';
const APPROVAL_TIMEOUT_MS = 120_000;

export class HookRelay extends EventEmitter {
  private server: net.Server | null = null;
  private running = false;
  private pipeName: string;
  private pendingSockets: Map<string, net.Socket> = new Map();
  private pendingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(pipeName?: string) {
    super();
    this.pipeName = pipeName || DEFAULT_PIPE_NAME;
  }

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

        // Ignore socket errors (client may disconnect before we respond)
        socket.on('error', () => {});

        socket.on('data', (chunk) => { data += chunk; });

        socket.on('end', () => {
          try {
            const event = this.parseHookPayload(data);

            if (event.type === 'PermissionRequest') {
              // Extract tool_use_id for keying; fall back to timestamp-based key
              const toolUseId = (event.payload.tool_use_id as string)
                || `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              event.payload._toolUseId = toolUseId;

              // Hold socket open — do NOT respond yet
              this.pendingSockets.set(toolUseId, socket);

              // Auto-reject after timeout
              const timer = setTimeout(() => {
                this.resolvePermission(toolUseId, false);
              }, APPROVAL_TIMEOUT_MS);
              this.pendingTimers.set(toolUseId, timer);

              this.emit('hook-event', event);
            } else {
              // Non-blocking: emit event, respond immediately
              this.emit('hook-event', event);
              socket.end(JSON.stringify({ decision: 'allow' }));
            }
          } catch {
            socket.end();
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

  resolvePermission(toolUseId: string, approved: boolean): boolean {
    const socket = this.pendingSockets.get(toolUseId);
    if (!socket) return false;

    // Clear timeout
    const timer = this.pendingTimers.get(toolUseId);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(toolUseId);
    }

    // Send decision and close
    try {
      const decision = approved ? 'allow' : 'deny';
      socket.end(JSON.stringify({ decision }));
    } catch {
      // Socket may already be closed
    }

    this.pendingSockets.delete(toolUseId);
    return true;
  }

  stop(): void {
    // Reject all pending approval sockets
    for (const [toolUseId] of this.pendingSockets) {
      this.resolvePermission(toolUseId, false);
    }

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
