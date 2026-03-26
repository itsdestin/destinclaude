import { IpcMain, BrowserWindow, dialog, clipboard, nativeImage, shell, powerSaveBlocker } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionManager } from './session-manager';
import { HookRelay } from './hook-relay';
import { IPC, SkillEntry } from '../shared/types';
import { scanSkills } from './skill-scanner';
import { RemoteConfig } from './remote-config';
import { RemoteServer } from './remote-server';

// Max age for clipboard paste images (1 hour)
const CLIPBOARD_MAX_AGE_MS = 60 * 60 * 1000;

export function registerIpcHandlers(
  ipcMain: IpcMain,
  sessionManager: SessionManager,
  mainWindow: BrowserWindow,
  hookRelay?: HookRelay,
  remoteConfig?: RemoteConfig,
  remoteServer?: RemoteServer,
) {
  const send = (channel: string, ...args: any[]) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  };

  // Broadcast session-created events from SessionManager (covers both IPC and remote-created sessions)
  sessionManager.on('session-created', (info) => {
    send(IPC.SESSION_CREATED, info);
  });

  // Session CRUD
  ipcMain.handle(IPC.SESSION_CREATE, async (_event, opts) => {
    const info = sessionManager.createSession(opts);
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

  // --- Skills discovery (shared with RemoteServer) ---
  ipcMain.handle(IPC.SKILLS_LIST, async () => {
    return scanSkills();
  });

  // --- Remote access settings ---
  let keepAwakeBlockerId: number | null = null;
  let keepAwakeTimeout: ReturnType<typeof setTimeout> | null = null;

  function applyKeepAwake(hours: number) {
    // Clear existing blocker
    if (keepAwakeBlockerId !== null) {
      powerSaveBlocker.stop(keepAwakeBlockerId);
      keepAwakeBlockerId = null;
    }
    if (keepAwakeTimeout) {
      clearTimeout(keepAwakeTimeout);
      keepAwakeTimeout = null;
    }
    // Start new blocker if hours > 0
    if (hours > 0) {
      keepAwakeBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      keepAwakeTimeout = setTimeout(() => {
        if (keepAwakeBlockerId !== null) {
          powerSaveBlocker.stop(keepAwakeBlockerId);
          keepAwakeBlockerId = null;
        }
        if (remoteConfig) {
          remoteConfig.keepAwakeHours = 0;
          remoteConfig.save();
        }
      }, hours * 60 * 60 * 1000);
    }
  }

  if (remoteConfig) {
    // Apply saved keep-awake on startup
    if (remoteConfig.keepAwakeHours > 0) applyKeepAwake(remoteConfig.keepAwakeHours);
    ipcMain.handle(IPC.REMOTE_GET_CONFIG, async () => {
      return {
        ...remoteConfig.toSafeObject(),
        clientCount: remoteServer?.getClientCount() ?? 0,
      };
    });

    ipcMain.handle(IPC.REMOTE_SET_PASSWORD, async (_event, password: string) => {
      await remoteConfig.setPassword(password);
      remoteServer?.invalidateTokens();
      return true;
    });

    ipcMain.handle(IPC.REMOTE_SET_CONFIG, async (_event, updates: { enabled?: boolean; trustTailscale?: boolean; keepAwakeHours?: number }) => {
      if (typeof updates.enabled === 'boolean') remoteConfig.enabled = updates.enabled;
      if (typeof updates.trustTailscale === 'boolean') remoteConfig.trustTailscale = updates.trustTailscale;
      if (typeof updates.keepAwakeHours === 'number') {
        remoteConfig.keepAwakeHours = updates.keepAwakeHours;
        applyKeepAwake(updates.keepAwakeHours);
      }
      remoteConfig.save();
      return remoteConfig.toSafeObject();
    });

    ipcMain.handle(IPC.REMOTE_DETECT_TAILSCALE, async () => {
      return RemoteConfig.detectTailscale(remoteConfig.port);
    });

    ipcMain.handle(IPC.REMOTE_GET_CLIENT_COUNT, async () => {
      return remoteServer?.getClientCount() ?? 0;
    });

    ipcMain.handle(IPC.REMOTE_GET_CLIENT_LIST, async () => {
      return remoteServer?.getClientList() ?? [];
    });

    ipcMain.handle(IPC.REMOTE_DISCONNECT_CLIENT, async (_event, clientId: string) => {
      return remoteServer?.disconnectClient(clientId) ?? false;
    });

    // UI action sync: Electron window broadcasts an action → forward to all remote clients
    ipcMain.on(IPC.UI_ACTION_BROADCAST, (_event, action: any) => {
      remoteServer?.broadcast({ type: 'ui:action', payload: action });
    });

    // UI action sync: Remote client broadcasts an action → forward to Electron window
    sessionManager.on('ui-action', (action: any) => {
      send(IPC.UI_ACTION_RECEIVED, action);
    });
  }

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

  const pendingWatchers = new Set<string>();

  function startWatching(desktopId: string, claudeId: string) {
    if (topicWatchers.has(desktopId) || pendingWatchers.has(desktopId)) return;
    pendingWatchers.add(desktopId);

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
      pendingWatchers.delete(desktopId);
    } catch {
      // fs.watch not available or file doesn't exist yet — poll instead
      pendingWatchers.delete(desktopId);
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
