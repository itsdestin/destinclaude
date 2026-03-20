import { IpcMain, BrowserWindow } from 'electron';
import { SessionManager } from './session-manager';
import { IPC } from '../shared/types';

export function registerIpcHandlers(
  ipcMain: IpcMain,
  sessionManager: SessionManager,
  mainWindow: BrowserWindow,
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
}
