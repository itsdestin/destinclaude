import fs from 'fs';
import path from 'path';
import os from 'os';
import type { BrowserWindow } from 'electron';

const THEMES_DIR = path.join(os.homedir(), '.claude', 'destinclaude-themes');

/** Ensures ~/.claude/destinclaude-themes/ exists, then watches it for JSON changes.
 *  Sends theme:reload to the renderer window whenever a .json file is written. */
export function startThemeWatcher(win: BrowserWindow): () => void {
  if (!fs.existsSync(THEMES_DIR)) {
    fs.mkdirSync(THEMES_DIR, { recursive: true });
  }

  let watcher: fs.FSWatcher | null = null;
  const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

  try {
    watcher = fs.watch(THEMES_DIR, (_eventType, filename) => {
      if (!filename || !filename.endsWith('.json')) return;
      const slug = filename.replace(/\.json$/, '');
      const existing = debounceMap.get(slug);
      if (existing) clearTimeout(existing);
      debounceMap.set(slug, setTimeout(() => {
        debounceMap.delete(slug);
        if (!win.isDestroyed()) {
          win.webContents.send('theme:reload', slug);
        }
      }, 50));
    });
  } catch (err) {
    console.warn('[theme-watcher] fs.watch failed, themes will not hot-reload:', err);
  }

  return () => {
    watcher?.close();
    for (const t of debounceMap.values()) clearTimeout(t);
    debounceMap.clear();
  };
}

/** Returns list of user theme slugs from ~/.claude/destinclaude-themes/. */
export function listUserThemes(): string[] {
  try {
    return fs.readdirSync(THEMES_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/** Returns path for a given user theme slug. */
export function userThemePath(slug: string): string {
  return path.join(THEMES_DIR, `${slug}.json`);
}

export { THEMES_DIR };
