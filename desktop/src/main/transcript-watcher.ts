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
 * e.g. `C:\Users\alice` → `C--Users-alice`
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
        case 'text': {
          const cleaned = stripSystemTags(block.text);
          if (!cleaned) break; // Skip blocks that were entirely system tags
          events.push({
            type: 'assistant-text',
            sessionId,
            uuid,
            timestamp,
            data: { text: cleaned },
          });
          break;
        }

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
    const cleaned = stripSystemTags(content);
    if (cleaned) {
      events.push({
        type: 'assistant-text',
        sessionId,
        uuid,
        timestamp,
        data: { text: cleaned },
      });
    }
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

/**
 * Strips system XML tags that should never appear in the chat timeline.
 * These are injected by Claude Code's harness and aren't part of the
 * assistant's actual response.
 */
const SYSTEM_TAG_RE = /<(task-notification|system-reminder|antml_thinking|command-name)>[\s\S]*?<\/\1>/g;

function stripSystemTags(text: string): string {
  return text.replace(SYSTEM_TAG_RE, '').trim();
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
      // Safety-net poll alongside fs.watch — on Windows, fs.watch can
      // silently miss change notifications. A 2s poll catches stragglers
      // without adding meaningful overhead (readNewLines is a no-op when
      // the file hasn't grown).
      this.startPolling(session);
    } catch {
      // fs.watch can throw on some platforms — fall back to polling
      this.startPolling(session);
    }
  }

  private startPolling(session: WatchedSession): void {
    if (session.pollTimer) return;
    session.pollTimer = setInterval(() => {
      if (fs.existsSync(session.jsonlPath)) {
        this.readNewLines(session);
        // If fs.watch isn't attached yet, upgrade from poll-only to watch+poll
        if (!session.watcher) {
          this.stopPolling(session);
          this.attachFsWatch(session);
        }
      }
    }, session.watcher ? 2000 : 1000);
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

  private async readNewLines(session: WatchedSession): Promise<void> {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(session.jsonlPath);
    } catch {
      return; // File doesn't exist (yet)
    }

    const fileSize = stat.size;
    if (fileSize <= session.offset) return; // No new data

    const bytesToRead = fileSize - session.offset;
    const buffer = Buffer.alloc(bytesToRead);

    let handle: fs.promises.FileHandle;
    try {
      handle = await fs.promises.open(session.jsonlPath, 'r');
    } catch {
      return;
    }

    try {
      await handle.read(buffer, 0, bytesToRead, session.offset);
    } finally {
      await handle.close();
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

      // Deduplicate by uuid — Claude writes incremental updates with the
      // same uuid as the assistant message grows. For repeated UUIDs:
      //
      // - assistant-text: SKIP (would create duplicate text segments;
      //   the first write's text is already in the timeline)
      // - tool-use: EMIT (may be new; reducer Map.set deduplicates by
      //   toolUseId so re-emitting an existing one is harmless)
      // - tool-result: EMIT (reducer Map.set deduplicates by toolUseId)
      // - turn-complete: EMIT (only appears on the final write;
      //   critical for clearing the "thinking" state)
      // - user-message: EMIT (reducer has its own text-based dedup)
      const lineUuid = events[0].uuid;
      const isRepeat = lineUuid && session.seenUuids.has(lineUuid);
      if (lineUuid) session.seenUuids.add(lineUuid);

      for (const event of events) {
        if (isRepeat && event.type === 'assistant-text') continue;
        this.emit('transcript-event', event);
      }
    }
  }
}
