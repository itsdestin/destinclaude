import { ChatMessage, ToolCallState, ToolGroupState } from '../../shared/types';

export interface InteractivePrompt {
  promptId: string;
  title: string;
  buttons: { label: string; input: string }[];
  completed?: string; // label of the selected option, if completed
}

export type TimelineEntry =
  | { kind: 'user'; message: ChatMessage }
  | { kind: 'assistant'; message: ChatMessage }
  | { kind: 'tool-group'; groupId: string }
  | { kind: 'prompt'; prompt: InteractivePrompt };

export interface SessionChatState {
  timeline: TimelineEntry[];
  toolCalls: Map<string, ToolCallState>;
  toolGroups: Map<string, ToolGroupState>;
  isThinking: boolean;
  streamingText: string;
  /** ID of the current tool group (tools are appended here until next message) */
  currentGroupId: string | null;
  /** Timestamp of last activity from Claude — used to reset the thinking timeout */
  lastActivityAt: number;
  /** UUIDs of transcript events already processed — prevents duplicate entries */
  seenUuids: Set<string>;
}

export function createSessionChatState(): SessionChatState {
  return {
    timeline: [],
    toolCalls: new Map(),
    toolGroups: new Map(),
    isThinking: false,
    streamingText: '',
    currentGroupId: null,
    lastActivityAt: 0,
    seenUuids: new Set(),
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
    }
  | {
      type: 'UPDATE_STREAMING';
      sessionId: string;
      text: string;
    }
  | {
      type: 'SHOW_PROMPT';
      sessionId: string;
      promptId: string;
      title: string;
      buttons: { label: string; input: string }[];
    }
  | {
      type: 'COMPLETE_PROMPT';
      sessionId: string;
      promptId: string;
      selection: string;
    }
  | {
      type: 'DISMISS_PROMPT';
      sessionId: string;
      promptId: string;
    }
  | {
      type: 'THINKING_TIMEOUT';
      sessionId: string;
    }
  | {
      type: 'PERMISSION_REQUEST';
      sessionId: string;
      toolName: string;
      input: Record<string, unknown>;
      requestId: string;
      permissionSuggestions?: string[];
    }
  | {
      type: 'PERMISSION_EXPIRED';
      sessionId: string;
      requestId: string;
    }
  | {
      type: 'PERMISSION_RESPONDED';
      sessionId: string;
      requestId: string;
    }
  | {
      type: 'TERMINAL_ACTIVITY';
      sessionId: string;
    }
  | {
      type: 'TRANSCRIPT_USER_MESSAGE';
      sessionId: string;
      uuid: string;
      text: string;
      timestamp: number;
    }
  | {
      type: 'TRANSCRIPT_ASSISTANT_TEXT';
      sessionId: string;
      uuid: string;
      text: string;
      timestamp: number;
    }
  | {
      type: 'TRANSCRIPT_TOOL_USE';
      sessionId: string;
      uuid: string;
      toolUseId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
    }
  | {
      type: 'TRANSCRIPT_TOOL_RESULT';
      sessionId: string;
      uuid: string;
      toolUseId: string;
      result: string;
      isError: boolean;
    }
  | {
      type: 'TRANSCRIPT_TURN_COMPLETE';
      sessionId: string;
      uuid: string;
      timestamp: number;
    };

export type ChatState = Map<string, SessionChatState>;
