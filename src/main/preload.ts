import { contextBridge, ipcRenderer } from 'electron';

// IPC channel names inlined here because Electron's sandboxed preload
// cannot resolve relative imports to other modules
const IPC = {
  SESSION_CREATE: 'session:create',
  SESSION_DESTROY: 'session:destroy',
  SESSION_INPUT: 'session:input',
  SESSION_LIST: 'session:list',
  SESSION_CREATED: 'session:created',
  SESSION_DESTROYED: 'session:destroyed',
  PTY_OUTPUT: 'pty:output',
  HOOK_EVENT: 'hook:event',
} as const;

contextBridge.exposeInMainWorld('claude', {
  session: {
    create: (opts: { name: string; cwd: string; skipPermissions: boolean }) =>
      ipcRenderer.invoke(IPC.SESSION_CREATE, opts),
    destroy: (sessionId: string) =>
      ipcRenderer.invoke(IPC.SESSION_DESTROY, sessionId),
    list: () => ipcRenderer.invoke(IPC.SESSION_LIST),
    sendInput: (sessionId: string, text: string) =>
      ipcRenderer.send(IPC.SESSION_INPUT, sessionId, text),
  },
  on: {
    sessionCreated: (cb: (info: any) => void) =>
      ipcRenderer.on(IPC.SESSION_CREATED, (_e, info) => cb(info)),
    sessionDestroyed: (cb: (id: string) => void) =>
      ipcRenderer.on(IPC.SESSION_DESTROYED, (_e, id) => cb(id)),
    ptyOutput: (cb: (sessionId: string, data: string) => void) =>
      ipcRenderer.on(IPC.PTY_OUTPUT, (_e, sid, data) => cb(sid, data)),
    hookEvent: (cb: (event: any) => void) =>
      ipcRenderer.on(IPC.HOOK_EVENT, (_e, event) => cb(event)),
  },
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
});
