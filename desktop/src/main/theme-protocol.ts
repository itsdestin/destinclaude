import { protocol } from 'electron';
import path from 'path';
import os from 'os';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { appendFileSync } from 'fs';

const THEMES_DIR = path.join(os.homedir(), '.claude', 'destinclaude-themes');
const DEBUG_LOG = path.join(os.homedir(), 'theme-asset-debug.log');

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.css': 'text/css',
  '.json': 'application/json',
};

function debugLog(msg: string): void {
  try {
    appendFileSync(DEBUG_LOG, `${new Date().toISOString()} | ${msg}\n`);
  } catch { /* ignore */ }
}

/**
 * Registers the theme-asset:// custom protocol.
 * Resolves theme-asset://<slug>/<relative-path> to the file on disk.
 * Must be called before any BrowserWindow is created (in app.whenReady).
 */
export function registerThemeProtocol(): void {
  debugLog('registerThemeProtocol called');

  protocol.handle('theme-asset', async (request) => {
    const url = new URL(request.url);
    const slug = url.hostname;
    const assetPath = decodeURIComponent(url.pathname.replace(/^\//, ''));

    debugLog(`Request: ${request.url} → slug="${slug}" asset="${assetPath}"`);

    // Security: resolve and verify path is within the theme's directory
    const themePath = path.join(THEMES_DIR, slug);
    const resolvedPath = path.resolve(themePath, assetPath);

    if (!resolvedPath.startsWith(themePath + path.sep) && resolvedPath !== themePath) {
      debugLog(`BLOCKED (path traversal): ${resolvedPath}`);
      return new Response('Forbidden', { status: 403 });
    }

    debugLog(`Resolved: ${resolvedPath} | exists=${existsSync(resolvedPath)}`);

    try {
      const data = await readFile(resolvedPath);
      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      debugLog(`Serving ${data.length} bytes as ${contentType}`);
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': contentType },
      });
    } catch (err) {
      debugLog(`ERROR reading file: ${err}`);
      return new Response('Not Found', { status: 404 });
    }
  });
}
