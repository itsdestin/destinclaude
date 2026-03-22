import { IpcMain, BrowserWindow, dialog, clipboard, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionManager } from './session-manager';
import { HookRelay } from './hook-relay';
import { IPC } from '../shared/types';

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

  // Save clipboard image to temp file
  ipcMain.handle(IPC.CLIPBOARD_SAVE_IMAGE, async () => {
    const img = clipboard.readImage();
    if (img.isEmpty()) return null;
    const tmpDir = path.join(os.tmpdir(), 'claude-desktop-attachments');
    fs.mkdirSync(tmpDir, { recursive: true });
    const filename = `paste-${Date.now()}.png`;
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, img.toPNG());
    return filePath;
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

  // PTY input (fire-and-forget, not request-response)
  ipcMain.on(IPC.SESSION_INPUT, (_event, sessionId: string, text: string) => {
    sessionManager.sendInput(sessionId, text);
  });

  // PTY resize (fire-and-forget)
  ipcMain.on(IPC.SESSION_RESIZE, (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.resizeSession(sessionId, cols, rows);
  });

  // Forward PTY output to renderer
  sessionManager.on('pty-output', (sessionId: string, data: string) => {
    send(IPC.PTY_OUTPUT, sessionId, data);
  });

  // Forward session exit events
  sessionManager.on('session-exit', (sessionId: string) => {
    send(IPC.SESSION_DESTROYED, sessionId);
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

  // Push status data every 10s
  setInterval(() => {
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
  const topicWatchers = new Map<string, NodeJS.Timeout>();
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

    // Poll every 2s
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
    const interval = topicWatchers.get(sessionId);
    if (interval) {
      clearInterval(interval);
      topicWatchers.delete(sessionId);
      lastTopics.delete(sessionId);
      sessionIdMap.delete(sessionId);
    }
  });
}
