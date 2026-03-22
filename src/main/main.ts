import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SessionManager } from './session-manager';
import { HookRelay } from './hook-relay';
import { registerIpcHandlers } from './ipc-handlers';
import { IPC } from '../shared/types';

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | null = null;
const sessionManager = new SessionManager();
// Unique pipe name per launch — avoids EADDRINUSE from stale Electron processes
const pipeName = `\\\\.\\pipe\\claude-desktop-hooks-${process.pid}`;
sessionManager.setPipeName(pipeName);
const hookRelay = new HookRelay(pipeName);

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
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  registerIpcHandlers(ipcMain, sessionManager, mainWindow, hookRelay);

  // Forward hook events to renderer
  hookRelay.on('hook-event', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.HOOK_EVENT, event);
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

  ipcMain.handle('github:auth', async () => {
    try {
      const { stdout: token } = await execFileAsync('gh', ['auth', 'token']);
      const { stdout: username } = await execFileAsync('gh', ['api', 'user', '--jq', '.login']);
      return { token: token.trim(), username: username.trim() };
    } catch {
      return null;
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  sessionManager.destroyAll();
  hookRelay.stop();
  app.quit();
});
