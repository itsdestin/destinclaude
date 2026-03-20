import { ChatMessage, ToolCallState, ToolGroupState } from '../../shared/types';

export interface SessionChatState {
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCallState>;
  toolGroups: ToolGroupState[];
  isThinking: boolean;
  pendingApproval: string | null; // toolUseId awaiting approval
}

export function createSessionChatState(): SessionChatState {
  return {
    messages: [],
    toolCalls: new Map(),
    toolGroups: [],
    isThinking: false,
    pendingApproval: null,
  };
}

export type ChatAction =
  | { type: 'SESSION_INIT'; sessionId: string }
  | { type: 'SESSION_REMOVE'; sessionId: string }
  | {
      type: 'USER_PROMPT';
      sessionId: string;
      content: string;
      timestamp: number;
    }
  | {
      type: 'PRE_TOOL_USE';
      sessionId: string;
      toolUseId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'PERMISSION_REQUEST';
      sessionId: string;
      toolUseId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'POST_TOOL_USE';
      sessionId: string;
      toolUseId: string;
      response?: string;
    }
  | {
      type: 'POST_TOOL_USE_FAILURE';
      sessionId: string;
      toolUseId: string;
      error?: string;
    }
  | {
      type: 'STOP';
      sessionId: string;
      lastAssistantMessage: string;
      timestamp: number;
    };

// Global state: one SessionChatState per session
export type ChatState = Map<string, SessionChatState>;
