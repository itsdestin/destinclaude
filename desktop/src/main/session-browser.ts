import fs from 'fs';
import path from 'path';
import os from 'os';
import { PastSession, HistoryMessage } from '../shared/types';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const TOPICS_DIR = path.join(CLAUDE_DIR, 'topics');

const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Converts a project slug back to a display-friendly path.
 * e.g. 'C--Users-desti' → 'C:/Users/desti'
 *      'home-user-project' → '/home/user/project'
 */
function slugToDisplayPath(slug: string): string {
  if (/^[A-Z]--/.test(slug)) {
    return slug.replace(/^([A-Z])--/, '$1:/').replace(/-/g, '/');
  }
  return '/' + slug.replace(/-/g, '/');
}

function readTopic(sessionId: string): string {
  try {
    const content = fs.readFileSync(path.join(TOPICS_DIR, `topic-${sessionId}`), 'utf8').trim();
    return content || 'Untitled';
  } catch {
    return 'Untitled';
  }
}

/**
 * Scans all project directories for JSONL transcript files.
 * Returns sessions sorted by last modified (most recent first).
 * Excludes sessions that are currently active (matching activeSessionIds).
 */
export function listPastSessions(activeSessionIds?: Set<string>): PastSession[] {
  const sessions: PastSession[] = [];

  let slugs: string[];
  try {
    slugs = fs.readdirSync(PROJECTS_DIR).filter((f) => {
      try { return fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory(); } catch { return false; }
    });
  } catch {
    return [];
  }

  for (const slug of slugs) {
    const slugDir = path.join(PROJECTS_DIR, slug);
    let files: string[];
    try {
      files = fs.readdirSync(slugDir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      if (activeSessionIds?.has(sessionId)) continue;

      try {
        const stat = fs.statSync(path.join(slugDir, file));
        if (stat.size < 500) continue;

        sessions.push({
          sessionId,
          name: readTopic(sessionId),
          projectSlug: slug,
          projectPath: slugToDisplayPath(slug),
          lastModified: stat.mtimeMs,
          size: stat.size,
        });
      } catch {
        continue;
      }
    }
  }

  sessions.sort((a, b) => b.lastModified - a.lastModified);
  return sessions;
}

/**
 * Loads the last N conversational messages from a session's JSONL file.
 * "Conversational" = user prompts (with promptId, not meta) and assistant
 * end_turn responses (text content only, no tool calls).
 */
export function loadHistory(
  sessionId: string,
  projectSlug: string,
  count: number = 10,
  all: boolean = false,
): HistoryMessage[] {
  if (!SAFE_ID_RE.test(projectSlug) || !SAFE_ID_RE.test(sessionId)) return [];
  const jsonlPath = path.join(PROJECTS_DIR, projectSlug, `${sessionId}.jsonl`);

  let content: string;
  try {
    content = fs.readFileSync(jsonlPath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.trim().split('\n');
  const messages: HistoryMessage[] = [];

  // Track last occurrence per UUID to handle incremental writes
  const lastLineByUuid = new Map<string, string>();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.uuid && (parsed.type === 'user' || parsed.type === 'assistant')) {
        lastLineByUuid.set(parsed.uuid, line);
      }
    } catch {}
  }

  const seenUuids = new Set<string>();
  for (const line of lines) {
    let parsed: any;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (!parsed.uuid) continue;
    if (parsed.type !== 'user' && parsed.type !== 'assistant') continue;

    if (lastLineByUuid.get(parsed.uuid) !== line) continue;
    if (seenUuids.has(parsed.uuid)) continue;
    seenUuids.add(parsed.uuid);

    const message = parsed.message;
    if (!message) continue;

    if (parsed.type === 'user') {
      if (parsed.isMeta) continue;
      if (!parsed.promptId) continue;
      const c = message.content;
      const text = typeof c === 'string'
        ? c
        : Array.isArray(c)
          ? c.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
          : '';
      if (!text.trim()) continue;
      messages.push({ role: 'user', content: text.trim(), timestamp: parsed.timestamp || 0 });
    } else if (parsed.type === 'assistant' && message.stop_reason === 'end_turn') {
      const c = message.content;
      const texts = Array.isArray(c)
        ? c.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
        : typeof c === 'string' ? c : '';
      if (!texts.trim()) continue;
      messages.push({ role: 'assistant', content: texts.trim(), timestamp: parsed.timestamp || 0 });
    }
  }

  if (all) return messages;
  return messages.slice(-count);
}
