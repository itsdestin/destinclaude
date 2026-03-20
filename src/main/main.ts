import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { SessionManager } from './session-manager';
import { HookRelay } from './hook-relay';
import { registerIpcHandlers } from './ipc-handlers';
import { IPC } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
const sessionManager = new SessionManager();
const hookRelay = new HookRelay();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

  registerIpcHandlers(ipcMain, sessionManager, hookRelay, mainWindow);

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

  createWindow();
});

app.on('window-all-closed', () => {
  sessionManager.destroyAll();
  hookRelay.stop();
  app.quit();
});
