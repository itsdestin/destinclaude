import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// IPC channel names inlined here because Electron's sandboxed preload
// cannot resolve relative imports to other modules
const IPC = {
  SESSION_CREATE: 'session:create',
  SESSION_DESTROY: 'session:destroy',
  SESSION_INPUT: 'session:input',
  SESSION_RESIZE: 'session:resize',
  SESSION_LIST: 'session:list',
  SESSION_CREATED: 'session:created',
  SESSION_DESTROYED: 'session:destroyed',
  PTY_OUTPUT: 'pty:output',
  HOOK_EVENT: 'hook:event',
} as const;

contextBridge.exposeInMainWorld('claude', {
  session: {
    create: (opts: { name: string; cwd: string; skipPermissions: boolean; cols?: number; rows?: number }) =>
      ipcRenderer.invoke(IPC.SESSION_CREATE, opts),
    destroy: (sessionId: string) =>
      ipcRenderer.invoke(IPC.SESSION_DESTROY, sessionId),
    list: () => ipcRenderer.invoke(IPC.SESSION_LIST),
    sendInput: (sessionId: string, text: string) =>
      ipcRenderer.send(IPC.SESSION_INPUT, sessionId, text),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.SESSION_RESIZE, sessionId, cols, rows),
  },
  on: {
    sessionCreated: (cb: (info: any) => void) => {
      const handler = (_e: IpcRendererEvent, info: any) => cb(info);
      ipcRenderer.on(IPC.SESSION_CREATED, handler);
      return handler;
    },
    sessionDestroyed: (cb: (id: string) => void) => {
      const handler = (_e: IpcRendererEvent, id: string) => cb(id);
      ipcRenderer.on(IPC.SESSION_DESTROYED, handler);
      return handler;
    },
    ptyOutput: (cb: (sessionId: string, data: string) => void) => {
      const handler = (_e: IpcRendererEvent, sid: string, data: string) => cb(sid, data);
      ipcRenderer.on(IPC.PTY_OUTPUT, handler);
      return handler;
    },
    hookEvent: (cb: (event: any) => void) => {
      const handler = (_e: IpcRendererEvent, event: any) => cb(event);
      ipcRenderer.on(IPC.HOOK_EVENT, handler);
      return handler;
    },
  },
  off: (channel: string, handler: (...args: any[]) => void) =>
    ipcRenderer.removeListener(channel, handler),
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
});
