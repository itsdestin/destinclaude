import { app, BrowserWindow, ipcMain, Menu, nativeImage } from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SessionManager } from './session-manager';
import { HookRelay } from './hook-relay';
import { registerIpcHandlers } from './ipc-handlers';
import { RemoteServer } from './remote-server';
import { RemoteConfig } from './remote-config';
import { scanSkills } from './skill-scanner';
import { IPC } from '../shared/types';

// macOS Electron apps launched from Finder/Dock inherit a minimal PATH from
// launchd (just /usr/bin:/bin:/usr/sbin:/sbin). Homebrew and nvm paths are
// missing, so 'node' and 'claude' can't be found. Prepend common locations.
// NOTE: Linux desktop environments typically inherit the user's shell PATH,
// but some (Snap, Flatpak, certain DEs) may also strip it. If Linux users
// report 'command not found' errors, extend this block to include linux.
if (process.platform === 'darwin') {
  const home = os.homedir();
  const extraPaths = [
    '/opt/homebrew/bin',          // Homebrew (Apple Silicon)
    '/usr/local/bin',             // Homebrew (Intel) / system-wide installs
    `${home}/.nvm/current/bin`,   // nvm
    `${home}/.volta/bin`,         // Volta
    `${home}/.local/bin`,         // pipx, cargo, etc.
    `${home}/.npm-global/bin`,    // npm global installs
  ];
  process.env.PATH = `${extraPaths.join(path.delimiter)}${path.delimiter}${process.env.PATH}`;
}

const execFileAsync = promisify(execFile);
// Resolve 'gh' path for Windows where Electron's PATH may not include it
let ghPath = 'gh';
try { const w = require('which'); ghPath = w.sync('gh'); } catch { /* use bare 'gh' */ }

let mainWindow: BrowserWindow | null = null;
let cleanupIpcHandlers: (() => void) | null = null;
const sessionManager = new SessionManager();
// Unique pipe name per launch — avoids EADDRINUSE from stale Electron processes
const pipeName = process.platform === 'win32'
  ? `\\\\.\\pipe\\claude-desktop-hooks-${process.pid}`
  : path.join(os.tmpdir(), `claude-desktop-hooks-${process.pid}.sock`);
sessionManager.setPipeName(pipeName);
const hookRelay = new HookRelay(pipeName);
const remoteConfig = new RemoteConfig();
const remoteServer = new RemoteServer(sessionManager, hookRelay, remoteConfig, scanSkills);

// Dev server URL — configurable via env var, defaults to Vite's default
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

function createWindow() {
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  cleanupIpcHandlers = registerIpcHandlers(ipcMain, sessionManager, mainWindow, hookRelay, remoteConfig, remoteServer);

  // Forward hook events to renderer
  hookRelay.on('hook-event', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.HOOK_EVENT, event);
    }
  });

  // Notify renderer when a permission request socket closes (timeout/killed)
  hookRelay.on('permission-expired', (sessionId: string, requestId: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.HOOK_EVENT, {
        type: 'PermissionExpired',
        sessionId,
        payload: { _requestId: requestId },
        timestamp: Date.now(),
      });
    }
  });
}

app.whenReady().then(async () => {
  // Install hook relay entries in Claude Code settings
  try {
    const installScript = path.join(__dirname, '../../scripts/install-hooks.js');
    require(installScript);
  } catch (e) {
    console.error('Failed to install hooks:', e);
  }

  try {
    await hookRelay.start();
  } catch (e) {
    console.error('Failed to start hook relay:', e);
  }

  try {
    await remoteServer.start();
  } catch (e) {
    console.error('Failed to start remote server:', e);
  }

  const FAVORITES_PATH = path.join(os.homedir(), '.claude', 'destinclaude-favorites.json');

  ipcMain.handle('favorites:get', async () => {
    try {
      const data = JSON.parse(fs.readFileSync(FAVORITES_PATH, 'utf8'));
      return data.favorites ?? [];
    } catch {
      return [];
    }
  });

  ipcMain.handle('favorites:set', async (_event, favorites: string[]) => {
    try {
      fs.writeFileSync(FAVORITES_PATH, JSON.stringify({ favorites }, null, 2));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('github:auth', async () => {
    try {
      const { stdout: username } = await execFileAsync(ghPath, ['api', 'user', '--jq', '.login']);
      return { username: username.trim() };
    } catch (err: any) {
      // Log specific failure reason for debugging
      if (err.code === 'ENOENT') {
        console.warn('[GitHub Auth] gh CLI not found on PATH');
      } else if (err.stderr?.includes('not logged in')) {
        console.warn('[GitHub Auth] gh CLI not authenticated');
      } else {
        console.warn('[GitHub Auth] Failed:', err.message || err);
      }
      return null;
    }
  });

  // Expose the system home directory to the renderer (async to avoid blocking)
  ipcMain.handle('get-home-path', () => os.homedir());

  // Remove the default menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null);

  createWindow();
});

app.on('window-all-closed', () => {
  if (cleanupIpcHandlers) cleanupIpcHandlers();
  sessionManager.destroyAll();
  hookRelay.stop();
  remoteServer.stop();
  app.quit();
});
