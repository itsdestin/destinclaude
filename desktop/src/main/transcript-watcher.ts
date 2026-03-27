import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { TranscriptEvent } from '../shared/types';

// ---------------------------------------------------------------------------
// cwdToProjectSlug
// ---------------------------------------------------------------------------

/**
 * Converts a filesystem path to Claude Code's project directory slug.
 * e.g. `C:\Users\desti` → `C--Users-desti`
 *      `/home/user/project` → `home-user-project`
 */
export function cwdToProjectSlug(cwd: string): string {
  return cwd
    .replace(/\\/g, '/')   // backslash → forward slash
    .replace(/:/g, '-')    // colon → dash
    .replace(/\//g, '-')   // slash → dash
    .replace(/^-/, '');     // remove leading dash
}

// ---------------------------------------------------------------------------
// parseTranscriptLine
// ---------------------------------------------------------------------------

/**
 * Parses a single JSONL line from a Claude Code transcript file.
 * Returns zero or more TranscriptEvents.
 */
export function parseTranscriptLine(line: string, sessionId: string): TranscriptEvent[] {
  let parsed: any;
  try {
    parsed = JSON.parse(line);
  } catch {
    return [];
  }

  // Only process user / assistant message lines
  if (parsed.type !== 'user' && parsed.type !== 'assistant') {
    return [];
  }
  if (!parsed.message) {
    return [];
  }

  const uuid: string = parsed.uuid || '';
  const timestamp = Date.now();
  const message = parsed.message;
  const events: TranscriptEvent[] = [];

  // --- User messages ---
  if (parsed.type === 'user') {
    const content = message.content;

    // Skip system-injected content (skills, CLAUDE.md, system reminders).
    // These have isMeta: true and should never appear in the chat timeline.
    if (parsed.isMeta) {
      return [];
    }

    // Tool results are wrapped in user messages and also carry a promptId,
    // so check for tool_result blocks BEFORE the user-text branch.
    if (Array.isArray(content)) {
      const hasToolResult = content.some((b: any) => b.type === 'tool_result');
      if (hasToolResult) {
        for (const block of content) {
          if (block.type === 'tool_result') {
            events.push({
              type: 'tool-result',
              sessionId,
              uuid,
              timestamp,
              data: {
                toolUseId: block.tool_use_id,
                toolResult: extractToolResultContent(block.content),
                isError: block.is_error ?? false,
              },
            });
          }
        }
        return events;
      }
    }

    // User-typed prompt: has a promptId and text content (not tool results)
    if (parsed.promptId) {
      const text = typeof content === 'string'
        ? content
        : extractTextFromBlocks(content);
      // Skip empty messages (e.g. interrupted tool use placeholders)
      if (!text.trim()) return [];
      events.push({
        type: 'user-message',
        sessionId,
        uuid,
        timestamp,
        data: { text },
      });
      return events;
    }

    return events;
  }

  // --- Assistant messages ---
  const content = message.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      switch (block.type) {
        case 'text':
          events.push({
            type: 'assistant-text',
            sessionId,
            uuid,
            timestamp,
            data: { text: block.text },
          });
          break;

        case 'tool_use':
          events.push({
            type: 'tool-use',
            sessionId,
            uuid,
            timestamp,
            data: {
              toolUseId: block.id,
              toolName: block.name,
              toolInput: block.input,
            },
          });
          break;

        // Skip thinking, images, etc.
        default:
          break;
      }
    }
  } else if (typeof content === 'string') {
    events.push({
      type: 'assistant-text',
      sessionId,
      uuid,
      timestamp,
      data: { text: content },
    });
  }

  // Emit turn-complete if stop_reason is end_turn
  if (message.stop_reason === 'end_turn') {
    events.push({
      type: 'turn-complete',
      sessionId,
      uuid,
      timestamp,
      data: { stopReason: 'end_turn' },
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextFromBlocks(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
}

function extractToolResultContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }
  return String(content ?? '');
}

// ---------------------------------------------------------------------------
// TranscriptWatcher
// ---------------------------------------------------------------------------

interface WatchedSession {
  desktopSessionId: string;
  claudeSessionId: string;
  cwd: string;
  jsonlPath: string;
  offset: number;
  partialLine: string;
  seenUuids: Set<string>;
  watcher: fs.FSWatcher | null;
  pollTimer: ReturnType<typeof setInterval> | null;
}

/**
 * Watches Claude Code JSONL transcript files and emits structured events.
 *
 * @param claudeConfigDir  Override for `~/.claude` — used in tests to
 *                         point at a temp directory instead of the real home.
 */
export class TranscriptWatcher extends EventEmitter {
  private sessions = new Map<string, WatchedSession>();
  private claudeConfigDir: string;

  constructor(claudeConfigDir?: string) {
    super();
    this.claudeConfigDir = claudeConfigDir || path.join(os.homedir(), '.claude', 'projects');
  }

  /**
   * Start watching the transcript for a session.
   */
  startWatching(desktopSessionId: string, claudeSessionId: string, cwd: string): void {
    // Don't double-watch
    if (this.sessions.has(desktopSessionId)) {
      this.stopWatching(desktopSessionId);
    }

    const slug = cwdToProjectSlug(cwd);
    const jsonlPath = path.join(this.claudeConfigDir, slug, `${claudeSessionId}.jsonl`);

    const session: WatchedSession = {
      desktopSessionId,
      claudeSessionId,
      cwd,
      jsonlPath,
      offset: 0,
      partialLine: '',
      seenUuids: new Set(),
      watcher: null,
      pollTimer: null,
    };

    this.sessions.set(desktopSessionId, session);

    // Try to start an fs.watch; fall back to polling if file doesn't exist yet
    if (fs.existsSync(jsonlPath)) {
      this.readNewLines(session);
      this.attachFsWatch(session);
    } else {
      this.startPolling(session);
    }
  }

  /**
   * Stop watching a specific session.
   */
  stopWatching(desktopSessionId: string): void {
    const session = this.sessions.get(desktopSessionId);
    if (!session) return;
    this.cleanupSession(session);
    this.sessions.delete(desktopSessionId);
  }

  /**
   * Stop all watchers.
   */
  stopAll(): void {
    for (const session of this.sessions.values()) {
      this.cleanupSession(session);
    }
    this.sessions.clear();
  }

  /**
   * Manually trigger a read for a session — useful in tests and as a
   * fallback when fs.watch misses a notification.
   */
  readNewLinesForSession(desktopSessionId: string): void {
    const session = this.sessions.get(desktopSessionId);
    if (session) {
      this.readNewLines(session);
    }
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private attachFsWatch(session: WatchedSession): void {
    try {
      session.watcher = fs.watch(session.jsonlPath, () => {
        this.readNewLines(session);
      });
      session.watcher.on('error', () => {
        // If the watcher errors, fall back to polling
        if (session.watcher) {
          session.watcher.close();
          session.watcher = null;
        }
        this.startPolling(session);
      });
    } catch {
      // fs.watch can throw on some platforms — fall back to polling
      this.startPolling(session);
    }
  }

  private startPolling(session: WatchedSession): void {
    if (session.pollTimer) return;
    session.pollTimer = setInterval(() => {
      // If file now exists, read it and upgrade to fs.watch
      if (fs.existsSync(session.jsonlPath)) {
        this.readNewLines(session);
        if (!session.watcher) {
          this.stopPolling(session);
          this.attachFsWatch(session);
        }
      }
    }, 1000);
  }

  private stopPolling(session: WatchedSession): void {
    if (session.pollTimer) {
      clearInterval(session.pollTimer);
      session.pollTimer = null;
    }
  }

  private cleanupSession(session: WatchedSession): void {
    if (session.watcher) {
      session.watcher.close();
      session.watcher = null;
    }
    this.stopPolling(session);
  }

  private readNewLines(session: WatchedSession): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(session.jsonlPath);
    } catch {
      return; // File doesn't exist (yet)
    }

    const fileSize = stat.size;
    if (fileSize <= session.offset) return; // No new data

    const bytesToRead = fileSize - session.offset;
    const buffer = Buffer.alloc(bytesToRead);

    let fd: number;
    try {
      fd = fs.openSync(session.jsonlPath, 'r');
    } catch {
      return;
    }

    try {
      fs.readSync(fd, buffer, 0, bytesToRead, session.offset);
    } finally {
      fs.closeSync(fd);
    }

    session.offset = fileSize;

    const text = buffer.toString('utf8');
    const chunks = text.split('\n');

    // Prepend any leftover partial line from previous read
    chunks[0] = session.partialLine + chunks[0];
    // Last element is either empty (if text ended with \n) or a partial line
    session.partialLine = chunks.pop() || '';

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;

      const events = parseTranscriptLine(trimmed, session.desktopSessionId);
      if (events.length === 0) continue;

      // Deduplicate by uuid at the line level — Claude writes incremental
      // updates with the same uuid, so skip all events from a repeated uuid.
      const lineUuid = events[0].uuid;
      if (lineUuid && session.seenUuids.has(lineUuid)) continue;
      if (lineUuid) session.seenUuids.add(lineUuid);

      for (const event of events) {
        this.emit('transcript-event', event);
      }
    }
  }
}
