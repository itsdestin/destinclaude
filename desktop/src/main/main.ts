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
import { log, rotateLog } from './logger';

// macOS and Linux Electron apps may inherit a minimal PATH that's missing
// common tool locations (Homebrew, nvm, Volta, pipx, cargo). macOS Finder/Dock
// only provides /usr/bin:/bin:/usr/sbin:/sbin. Linux Snap/Flatpak/some DEs may
// also strip user paths. Prepend common locations on both platforms.
// Windows is not affected — which.sync() resolves executables independently.
if (process.platform === 'darwin' || process.platform === 'linux') {
  const home = os.homedir();
  const extraPaths = [
    `${home}/.local/bin`,         // pipx, cargo, etc.
    `${home}/.nvm/current/bin`,   // nvm
    `${home}/.volta/bin`,         // Volta
    `${home}/.npm-global/bin`,    // npm global installs
    '/usr/local/bin',             // system-wide installs / Homebrew (Intel)
  ];
  if (process.platform === 'darwin') {
    extraPaths.unshift('/opt/homebrew/bin');  // Homebrew (Apple Silicon)
  }
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
    // Auto-approve permission requests for skip-permissions (dangerous mode) sessions
    if (event.type === 'PermissionRequest') {
      const sessionInfo = sessionManager.getSession(event.sessionId);
      if (sessionInfo?.skipPermissions) {
        const requestId = event.payload?._requestId as string;
        if (requestId) {
          hookRelay.respond(requestId, { decision: { behavior: 'allow' } });
          return;
        }
      }
    }

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
  await rotateLog();

  // Install hook relay entries in Claude Code settings
  try {
    const installScript = path.join(__dirname, '../../scripts/install-hooks.js');
    require(installScript);
  } catch (e) {
    log('ERROR', 'Main', 'Failed to install hooks', { error: String(e) });
  }

  try {
    await hookRelay.start();
  } catch (e) {
    log('ERROR', 'Main', 'Failed to start hook relay', { error: String(e) });
  }

  try {
    await remoteServer.start();
  } catch (e) {
    log('ERROR', 'Main', 'Failed to start remote server', { error: String(e) });
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
        log('WARN', 'GitHubAuth', 'gh CLI not found on PATH');
      } else if (err.stderr?.includes('not logged in')) {
        log('WARN', 'GitHubAuth', 'gh CLI not authenticated');
      } else {
        log('WARN', 'GitHubAuth', 'Failed', { error: String(err.message || err) });
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
