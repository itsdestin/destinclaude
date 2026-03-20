export interface SessionInfo {
  id: string;
  name: string;
  cwd: string;
  permissionMode: string;
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

export type ToolCallStatus = 'running' | 'awaiting-approval' | 'complete' | 'failed';

export interface ToolCallState {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
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

// IPC channel names
export const IPC = {
  // Renderer -> Main
  SESSION_CREATE: 'session:create',
  SESSION_DESTROY: 'session:destroy',
  SESSION_INPUT: 'session:input',
  SESSION_RESIZE: 'session:resize',
  SESSION_LIST: 'session:list',
  SESSION_APPROVE: 'session:approve',
  // Main -> Renderer
  SESSION_CREATED: 'session:created',
  SESSION_DESTROYED: 'session:destroyed',
  PTY_OUTPUT: 'pty:output',
  HOOK_EVENT: 'hook:event',
} as const;
