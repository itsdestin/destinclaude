export type PermissionMode = 'normal' | 'auto-accept' | 'plan' | 'bypass';

export interface SessionInfo {
  id: string;
  name: string;
  cwd: string;
  permissionMode: PermissionMode;
  skipPermissions: boolean;
  status: 'active' | 'idle' | 'destroyed';
  createdAt: number;
}

export interface HookEvent {
  type: string;
  sessionId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// --- Chat view types ---

export type ToolCallStatus = 'running' | 'complete' | 'failed' | 'awaiting-approval';

export interface ToolCallState {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
  requestId?: string;
  permissionSuggestions?: unknown[];
  response?: string;
  error?: string;
}

export interface ToolGroupState {
  id: string;
  toolIds: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// --- Command drawer types ---

export interface SkillEntry {
  id: string;
  displayName: string;
  description: string;
  category: 'personal' | 'work' | 'development' | 'admin' | 'other';
  prompt: string;
  source: 'destinclaude' | 'self' | 'plugin';
  pluginName?: string;
}

// IPC channel names
export const IPC = {
  // Renderer -> Main
  SESSION_CREATE: 'session:create',
  SESSION_DESTROY: 'session:destroy',
  SESSION_INPUT: 'session:input',
  SESSION_RESIZE: 'session:resize',
  SESSION_LIST: 'session:list',
  SKILLS_LIST: 'skills:list',
  TERMINAL_READY: 'session:terminal-ready',
  // Main -> Renderer
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
  OPEN_CHANGELOG: 'shell:open-changelog',
  PERMISSION_RESPOND: 'permission:respond',
} as const;
