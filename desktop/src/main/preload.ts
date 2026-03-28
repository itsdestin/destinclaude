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
  SESSION_RENAMED: 'session:renamed',
  DIALOG_OPEN_FILE: 'dialog:open-file',
  DIALOG_OPEN_FOLDER: 'dialog:open-folder',
  CLIPBOARD_SAVE_IMAGE: 'clipboard:save-image',
  STATUS_DATA: 'status:data',
  READ_TRANSCRIPT_META: 'transcript:read-meta',
  SKILLS_LIST: 'skills:list',
  OPEN_CHANGELOG: 'shell:open-changelog',
  TERMINAL_READY: 'session:terminal-ready',
  PERMISSION_RESPOND: 'permission:respond',
  REMOTE_GET_CONFIG: 'remote:get-config',
  REMOTE_SET_PASSWORD: 'remote:set-password',
  REMOTE_SET_CONFIG: 'remote:set-config',
  REMOTE_DETECT_TAILSCALE: 'remote:detect-tailscale',
  REMOTE_GET_CLIENT_COUNT: 'remote:get-client-count',
  REMOTE_GET_CLIENT_LIST: 'remote:get-client-list',
  REMOTE_DISCONNECT_CLIENT: 'remote:disconnect-client',
  UI_ACTION_BROADCAST: 'ui:action:broadcast',
  UI_ACTION_RECEIVED: 'ui:action:received',
  TRANSCRIPT_EVENT: 'transcript:event',
  SESSION_BROWSE: 'session:browse',
  SESSION_HISTORY: 'session:history',
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
    signalReady: (sessionId: string) =>
      ipcRenderer.send(IPC.TERMINAL_READY, sessionId),
    respondToPermission: (requestId: string, decision: object) =>
      ipcRenderer.invoke(IPC.PERMISSION_RESPOND, requestId, decision),
    browse: (): Promise<any[]> =>
      ipcRenderer.invoke(IPC.SESSION_BROWSE),
    loadHistory: (sessionId: string, projectSlug: string, count?: number, all?: boolean): Promise<any[]> =>
      ipcRenderer.invoke(IPC.SESSION_HISTORY, sessionId, projectSlug, count || 10, all || false),
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
    statusData: (cb: (data: any) => void) => {
      const handler = (_e: IpcRendererEvent, data: any) => cb(data);
      ipcRenderer.on(IPC.STATUS_DATA, handler);
      return handler;
    },
    sessionRenamed: (cb: (sessionId: string, name: string) => void) => {
      const handler = (_e: IpcRendererEvent, sid: string, name: string) => cb(sid, name);
      ipcRenderer.on(IPC.SESSION_RENAMED, handler);
      return handler;
    },
    uiAction: (cb: (action: any) => void) => {
      const handler = (_e: IpcRendererEvent, action: any) => cb(action);
      ipcRenderer.on(IPC.UI_ACTION_RECEIVED, handler);
      return handler;
    },
    transcriptEvent: (cb: (event: any) => void) => {
      const handler = (_e: IpcRendererEvent, event: any) => cb(event);
      ipcRenderer.on(IPC.TRANSCRIPT_EVENT, handler);
      return handler;
    },
  },
  skills: {
    list: (): Promise<any[]> => ipcRenderer.invoke(IPC.SKILLS_LIST),
  },
  dialog: {
    openFile: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE),
    openFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.DIALOG_OPEN_FOLDER),
    readTranscriptMeta: (transcriptPath: string): Promise<{ model: string; contextPercent: number } | null> =>
      ipcRenderer.invoke(IPC.READ_TRANSCRIPT_META, transcriptPath),
    saveClipboardImage: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.CLIPBOARD_SAVE_IMAGE),
  },
  shell: {
    openChangelog: (): Promise<void> =>
      ipcRenderer.invoke(IPC.OPEN_CHANGELOG),
  },
  remote: {
    getConfig: () => ipcRenderer.invoke(IPC.REMOTE_GET_CONFIG),
    setPassword: (password: string) => ipcRenderer.invoke(IPC.REMOTE_SET_PASSWORD, password),
    setConfig: (updates: { enabled?: boolean; trustTailscale?: boolean }) =>
      ipcRenderer.invoke(IPC.REMOTE_SET_CONFIG, updates),
    detectTailscale: () => ipcRenderer.invoke(IPC.REMOTE_DETECT_TAILSCALE),
    getClientCount: () => ipcRenderer.invoke(IPC.REMOTE_GET_CLIENT_COUNT),
    getClientList: () => ipcRenderer.invoke(IPC.REMOTE_GET_CLIENT_LIST),
    disconnectClient: (clientId: string) => ipcRenderer.invoke(IPC.REMOTE_DISCONNECT_CLIENT, clientId),
    broadcastAction: (action: any) => ipcRenderer.send(IPC.UI_ACTION_BROADCAST, action),
  },
  off: (channel: string, handler: (...args: any[]) => void) =>
    ipcRenderer.removeListener(channel, handler),
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),
  getFavorites: () => ipcRenderer.invoke('favorites:get'),
  setFavorites: (favorites: string[]) => ipcRenderer.invoke('favorites:set', favorites),
  getGitHubAuth: () => ipcRenderer.invoke('github:auth'),
  // Async IPC — renderer must await this (was sendSync before v2.2.0)
  getHomePath: (): Promise<string> => ipcRenderer.invoke('get-home-path'),
});
