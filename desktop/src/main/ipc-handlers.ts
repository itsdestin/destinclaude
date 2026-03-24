import { IpcMain, BrowserWindow, dialog, clipboard, nativeImage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionManager } from './session-manager';
import { HookRelay } from './hook-relay';
import { IPC, SkillEntry } from '../shared/types';

// Max age for clipboard paste images (1 hour)
const CLIPBOARD_MAX_AGE_MS = 60 * 60 * 1000;

export function registerIpcHandlers(
  ipcMain: IpcMain,
  sessionManager: SessionManager,
  mainWindow: BrowserWindow,
  hookRelay?: HookRelay,
) {
  const send = (channel: string, ...args: any[]) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  };

  // Session CRUD
  ipcMain.handle(IPC.SESSION_CREATE, async (_event, opts) => {
    const info = sessionManager.createSession(opts);
    send(IPC.SESSION_CREATED, info);
    return info;
  });

  ipcMain.handle(IPC.SESSION_DESTROY, async (_event, sessionId: string) => {
    const result = sessionManager.destroySession(sessionId);
    if (result) {
      send(IPC.SESSION_DESTROYED, sessionId);
    }
    return result;
  });

  ipcMain.handle(IPC.SESSION_LIST, async () => {
    return sessionManager.listSessions();
  });

  // File picker dialog
  ipcMain.handle(IPC.DIALOG_OPEN_FILE, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  // Folder picker dialog
  ipcMain.handle(IPC.DIALOG_OPEN_FOLDER, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Save clipboard image to temp file (with cleanup of stale files)
  ipcMain.handle(IPC.CLIPBOARD_SAVE_IMAGE, async () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const tmpDir = path.join(os.tmpdir(), 'claude-desktop-attachments');
    fs.mkdirSync(tmpDir, { recursive: true });

    // Clean up stale paste files older than 1 hour
    try {
      const now = Date.now();
      for (const file of fs.readdirSync(tmpDir)) {
        if (!file.startsWith('paste-')) continue;
        const filePath = path.join(tmpDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > CLIPBOARD_MAX_AGE_MS) {
            fs.unlinkSync(filePath);
          }
        } catch { /* ignore individual file errors */ }
      }
    } catch { /* ignore cleanup errors */ }

    const filename = `paste-${Date.now()}.png`;
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, img.toPNG());
    return filePath;
  });

  // Open the DestinClaude CHANGELOG on GitHub in the default browser
  ipcMain.handle(IPC.OPEN_CHANGELOG, async () => {
    await shell.openExternal('https://github.com/itsdestin/destinclaude/blob/master/CHANGELOG.md');
  });

  // Read model + context from a transcript JSONL file
  ipcMain.handle(IPC.READ_TRANSCRIPT_META, async (_event, transcriptPath: string) => {
    try {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      const lines = content.trim().split('\n');
      let model = 'unknown';
      let contextPercent = 100;
      // Scan lines for model info — typically in the first few entries
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.model) {
            model = obj.model.display_name || obj.model.id || obj.model;
          }
          if (obj.costInfo?.contextRemaining != null) {
            contextPercent = Math.round(obj.costInfo.contextRemaining * 100);
          }
          if (obj.context_window?.remaining_percentage != null) {
            contextPercent = Math.round(obj.context_window.remaining_percentage);
          }
        } catch {}
      }
      return { model, contextPercent };
    } catch {
      return null;
    }
  });

  // --- Skills discovery ---
  ipcMain.handle(IPC.SKILLS_LIST, async () => {
    // Load curated registry (bundled with the app)
    let registry: Record<string, Omit<SkillEntry, 'id'>> = {};
    try {
      const registryPath = path.join(__dirname, '..', 'renderer', 'data', 'skill-registry.json');
      registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    } catch {
      // In dev mode, try the src path
      try {
        const devPath = path.join(__dirname, '..', '..', 'src', 'renderer', 'data', 'skill-registry.json');
        registry = JSON.parse(fs.readFileSync(devPath, 'utf8'));
      } catch {
        console.warn('[IPC] skill-registry.json not found in prod or dev paths');
      }
    }

    const discoveredIds = new Set<string>();
    const skills: SkillEntry[] = [];

    // Helper: infer source from filesystem path
    function inferSource(skillPath: string): 'destinclaude' | 'self' | 'plugin' {
      const normalized = skillPath.replace(/\\/g, '/');
      if (normalized.includes('/plugins/destinclaude/')) return 'destinclaude';
      if (normalized.includes('/skills/') && !normalized.includes('/plugins/cache/')) return 'self';
      return 'plugin';
    }

    // Helper: add a discovered skill (curated metadata wins)
    function addSkill(id: string, fallbackName: string, fallbackDesc: string, inferredSource: 'destinclaude' | 'self' | 'plugin', pluginName?: string) {
      if (discoveredIds.has(id)) return;
      discoveredIds.add(id);

      const curated = registry[id];
      if (curated) {
        skills.push({ id, ...curated, pluginName } as SkillEntry);
      } else {
        skills.push({
          id,
          displayName: fallbackName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          description: fallbackDesc || `Run the ${fallbackName} skill`,
          category: 'other',
          prompt: `/${id}`,
          source: inferredSource,
          pluginName,
        });
      }
    }

    const pluginsDir = path.join(os.homedir(), '.claude', 'plugins');

    // 1. Scan DestinClaude skills (direct children of destinclaude/skills/)
    const dcSkillsDir = path.join(pluginsDir, 'destinclaude', 'skills');
    try {
      const entries = fs.readdirSync(dcSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          addSkill(entry.name, entry.name, '', 'destinclaude');
        }
      }
    } catch {}

    // 2. Scan installed cache plugins via installed_plugins.json
    try {
      const installedPath = path.join(pluginsDir, 'installed_plugins.json');
      const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
      const plugins = installed.plugins || {};

      for (const [pluginKey, versions] of Object.entries(plugins) as Array<[string, any[]]>) {
        const latest = versions[0];
        if (!latest?.installPath) continue;
        const installPath = latest.installPath;
        const pluginSlug = pluginKey.split('@')[0]; // e.g. "code-review" from "code-review@claude-plugins-official"

        // Check for skills/ directory
        const skillsDir = path.join(installPath, 'skills');
        try {
          const skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
          for (const entry of skillEntries) {
            if (entry.isDirectory()) {
              const skillId = `${pluginSlug}:${entry.name}`;
              addSkill(skillId, entry.name, '', 'plugin', pluginSlug);
            }
          }
        } catch {}

        // Check for commands/ directory (slash commands)
        const commandsDir = path.join(installPath, 'commands');
        try {
          const cmdEntries = fs.readdirSync(commandsDir, { withFileTypes: true });
          for (const entry of cmdEntries) {
            if (entry.isDirectory()) {
              const cmdId = `${pluginSlug}:${entry.name}`;
              addSkill(cmdId, entry.name, '', 'plugin', pluginSlug);
            }
          }
        } catch {}
      }
    } catch {}

    // 3. Add curated-only entries (skills that exist in registry but weren't discovered on disk)
    for (const [id, meta] of Object.entries(registry)) {
      if (!discoveredIds.has(id)) {
        skills.push({ id, ...meta } as SkillEntry);
      }
    }

    return skills;
  });

  // PTY input (fire-and-forget, not request-response)
  ipcMain.on(IPC.SESSION_INPUT, (_event, sessionId: string, text: string) => {
    sessionManager.sendInput(sessionId, text);
  });

  // PTY resize (fire-and-forget)
  ipcMain.on(IPC.SESSION_RESIZE, (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.resizeSession(sessionId, cols, rows);
  });

  // --- PTY output buffering ---
  // Buffer output per-session until the renderer signals its terminal is mounted.
  // This prevents losing the initial trust prompt on slow systems where
  // PTY output arrives before TerminalView mounts and registers its listener.
  const pendingOutput = new Map<string, string[]>();
  const readySessions = new Set<string>();

  sessionManager.on('pty-output', (sessionId: string, data: string) => {
    if (readySessions.has(sessionId)) {
      send(IPC.PTY_OUTPUT, sessionId, data);
    } else {
      let buf = pendingOutput.get(sessionId);
      if (!buf) {
        buf = [];
        pendingOutput.set(sessionId, buf);
      }
      buf.push(data);
    }
  });

  // Renderer signals terminal is mounted and listening
  ipcMain.on(IPC.TERMINAL_READY, (_event, sessionId: string) => {
    readySessions.add(sessionId);
    const buffered = pendingOutput.get(sessionId);
    if (buffered) {
      for (const data of buffered) {
        send(IPC.PTY_OUTPUT, sessionId, data);
      }
      pendingOutput.delete(sessionId);
    }
  });

  // Forward session exit events
  sessionManager.on('session-exit', (sessionId: string) => {
    send(IPC.SESSION_DESTROYED, sessionId);
    pendingOutput.delete(sessionId);
    readySessions.delete(sessionId);
  });

  // --- Status data poller ---
  // Reads DestinClaude cache files and pushes status updates to the renderer
  const usageCachePath = path.join(os.homedir(), '.claude', '.usage-cache.json');
  const announcementCachePath = path.join(os.homedir(), '.claude', '.announcement-cache.json');
  const updateStatusPath = path.join(os.homedir(), '.claude', 'toolkit-state', 'update-status.json');

  function readJsonFile(filePath: string): any {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  const syncStatusPath = path.join(os.homedir(), '.claude', '.sync-status');
  const syncWarningsPath = path.join(os.homedir(), '.claude', '.sync-warnings');

  function readTextFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, 'utf8').trim() || null;
    } catch {
      return null;
    }
  }

  function buildStatusData() {
    const usage = readJsonFile(usageCachePath);
    const announcement = readJsonFile(announcementCachePath);
    const updateStatus = readJsonFile(updateStatusPath);
    const syncStatus = readTextFile(syncStatusPath);
    const syncWarnings = readTextFile(syncWarningsPath);
    return { usage, announcement, updateStatus, syncStatus, syncWarnings };
  }

  // Push status data every 10s — store handle so it can be cleared on shutdown
  const statusInterval = setInterval(() => {
    send(IPC.STATUS_DATA, buildStatusData());
  }, 10000);

  // Also push immediately on first hook event (session is active)
  let sentInitialStatus = false;
  if (hookRelay) {
    hookRelay.on('hook-event', () => {
      if (!sentInitialStatus) {
        sentInitialStatus = true;
        send(IPC.STATUS_DATA, buildStatusData());
      }
    });
  }

  // --- Topic file watcher (auto-title) ---
  // The auto-title hook writes topics to ~/.claude/topics/topic-{CLAUDE_CODE_SESSION_ID}.
  // But our desktop session IDs differ from Claude Code's internal IDs.
  // We discover the mapping from hook events (which contain both IDs)
  // and watch the correct file.
  const topicDir = path.join(os.homedir(), '.claude', 'topics');
  // Maps desktop session ID → Claude Code session ID
  const sessionIdMap = new Map<string, string>();
  const topicWatchers = new Map<string, fs.FSWatcher | NodeJS.Timeout>();
  const lastTopics = new Map<string, string>();

  function readTopicFile(claudeSessionId: string): string | null {
    try {
      const content = fs.readFileSync(path.join(topicDir, `topic-${claudeSessionId}`), 'utf8').trim();
      return content || null;
    } catch {
      return null;
    }
  }

  function startWatching(desktopId: string, claudeId: string) {
    if (topicWatchers.has(desktopId)) return;

    // Read initial value
    const initial = readTopicFile(claudeId);
    if (initial && initial !== 'New Session') {
      lastTopics.set(desktopId, initial);
      send(IPC.SESSION_RENAMED, desktopId, initial);
    }

    const topicFilePath = path.join(topicDir, `topic-${claudeId}`);

    // Prefer fs.watch for efficiency; fall back to polling if watch fails
    // (e.g., on network filesystems or platforms with limited inotify)
    try {
      const watcher = fs.watch(topicFilePath, { persistent: false }, () => {
        const topic = readTopicFile(claudeId);
        if (topic && topic !== 'New Session' && topic !== lastTopics.get(desktopId)) {
          lastTopics.set(desktopId, topic);
          send(IPC.SESSION_RENAMED, desktopId, topic);
        }
      });
      watcher.on('error', () => {
        // File may not exist yet — fall back to polling
        watcher.close();
        startPolling(desktopId, claudeId);
      });
      topicWatchers.set(desktopId, watcher);
    } catch {
      // fs.watch not available or file doesn't exist yet — poll instead
      startPolling(desktopId, claudeId);
    }
  }

  function startPolling(desktopId: string, claudeId: string) {
    if (topicWatchers.has(desktopId)) return;
    const interval = setInterval(() => {
      const topic = readTopicFile(claudeId);
      if (topic && topic !== 'New Session' && topic !== lastTopics.get(desktopId)) {
        lastTopics.set(desktopId, topic);
        send(IPC.SESSION_RENAMED, desktopId, topic);
      }
    }, 2000);
    topicWatchers.set(desktopId, interval);
  }

  // Listen for hook events to extract the desktop→claude session ID mapping
  if (hookRelay) {
    hookRelay.on('hook-event', (event: { sessionId: string; payload: Record<string, unknown> }) => {
      const desktopId = event.sessionId; // _desktop_session_id (set by parseHookPayload)
      const claudeId = event.payload?.session_id as string;
      if (!desktopId || !claudeId) return;
      if (sessionIdMap.has(desktopId)) return;
      sessionIdMap.set(desktopId, claudeId);
      startWatching(desktopId, claudeId);
    });
  }

  // Stop watching when a session is destroyed
  sessionManager.on('session-exit', (sessionId: string) => {
    const watcher = topicWatchers.get(sessionId);
    if (watcher) {
      if (typeof (watcher as fs.FSWatcher).close === 'function') {
        (watcher as fs.FSWatcher).close();
      } else {
        clearInterval(watcher as NodeJS.Timeout);
      }
      topicWatchers.delete(sessionId);
      lastTopics.delete(sessionId);
      sessionIdMap.delete(sessionId);
    }
  });

  // --- Permission response (blocking hooks) ---
  if (hookRelay) {
    ipcMain.handle(IPC.PERMISSION_RESPOND, async (_event, requestId: string, decision: object) => {
      return hookRelay.respond(requestId, decision);
    });
  }

  // Return cleanup function for use during app shutdown
  return function cleanup() {
    clearInterval(statusInterval);
    for (const [id, watcher] of topicWatchers) {
      if (typeof (watcher as fs.FSWatcher).close === 'function') {
        (watcher as fs.FSWatcher).close();
      } else {
        clearInterval(watcher as NodeJS.Timeout);
      }
    }
    topicWatchers.clear();
    lastTopics.clear();
    sessionIdMap.clear();
  };
}
