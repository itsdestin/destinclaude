import { Terminal } from '@xterm/xterm';

const terminals = new Map<string, Terminal>();

// Pub/sub for write-completion notifications
type BufferReadyCallback = (sessionId: string) => void;
const bufferReadyListeners = new Set<BufferReadyCallback>();

export function onBufferReady(cb: BufferReadyCallback): () => void {
  bufferReadyListeners.add(cb);
  // Fire immediately for all existing terminals so the new subscriber can
  // read any content already in the buffer. This handles the race where
  // TerminalView's signalReady flushes buffered PTY output (triggering
  // notifyBufferReady) before the prompt detector subscribes — React runs
  // child effects before parent effects, so the child's flush fires with
  // zero listeners. This catch-up ensures nothing is missed.
  if (terminals.size > 0) {
    queueMicrotask(() => {
      for (const sessionId of terminals.keys()) {
        cb(sessionId);
      }
    });
  }
  return () => bufferReadyListeners.delete(cb);
}

export function notifyBufferReady(sessionId: string) {
  bufferReadyListeners.forEach((cb) => cb(sessionId));
}

export function registerTerminal(sessionId: string, terminal: Terminal) {
  terminals.set(sessionId, terminal);
}

export function unregisterTerminal(sessionId: string) {
  terminals.delete(sessionId);
}

export function getScreenText(sessionId: string): string | null {
  const terminal = terminals.get(sessionId);
  if (!terminal) return null;

  // Guard against accessing a disposed terminal's buffer
  let buf;
  try {
    buf = terminal.buffer.active;
  } catch {
    return null;
  }
  const lines: string[] = [];
  let current = '';

  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) continue;

    const text = line.translateToString(true);
    if (line.isWrapped) {
      // Continuation of previous line — append without newline
      current += text;
    } else {
      if (current) lines.push(current);
      current = text;
    }
  }
  if (current) lines.push(current);

  return lines.join('\n');
}
