import { ChatAction, ChatState, createSessionChatState } from './chat-types';

let messageCounter = 0;
function nextMessageId(): string {
  return `msg-${++messageCounter}`;
}

let groupCounter = 0;
function nextGroupId(): string {
  return `group-${++groupCounter}`;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const next = new Map(state);

  switch (action.type) {
    case 'SESSION_INIT': {
      if (!next.has(action.sessionId)) {
        next.set(action.sessionId, createSessionChatState());
      }
      return next;
    }

    case 'SESSION_REMOVE': {
      next.delete(action.sessionId);
      return next;
    }

    case 'USER_PROMPT': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      next.set(action.sessionId, {
        ...session,
        messages: [
          ...session.messages,
          {
            id: nextMessageId(),
            role: 'user',
            content: action.content,
            timestamp: action.timestamp,
          },
        ],
        isThinking: true,
      });
      return next;
    }

    case 'PRE_TOOL_USE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const toolCalls = new Map(session.toolCalls);
      toolCalls.set(action.toolUseId, {
        toolUseId: action.toolUseId,
        toolName: action.toolName,
        input: action.input,
        status: 'running',
      });

      // Add to current tool group, or create a new one
      const toolGroups = [...session.toolGroups];
      const lastGroup = toolGroups[toolGroups.length - 1];
      if (lastGroup) {
        toolGroups[toolGroups.length - 1] = {
          ...lastGroup,
          toolIds: [...lastGroup.toolIds, action.toolUseId],
        };
      } else {
        toolGroups.push({
          id: nextGroupId(),
          toolIds: [action.toolUseId],
        });
      }

      next.set(action.sessionId, { ...session, toolCalls, toolGroups });
      return next;
    }

    case 'PERMISSION_REQUEST': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const toolCalls = new Map(session.toolCalls);
      const existing = toolCalls.get(action.toolUseId);

      if (existing) {
        // Update existing tool call (PreToolUse arrived first)
        toolCalls.set(action.toolUseId, {
          ...existing,
          status: 'awaiting-approval',
        });
      } else {
        // PermissionRequest arrived without PreToolUse
        toolCalls.set(action.toolUseId, {
          toolUseId: action.toolUseId,
          toolName: action.toolName,
          input: action.input,
          status: 'awaiting-approval',
        });

        // Also add to tool group
        const toolGroups = [...session.toolGroups];
        const lastGroup = toolGroups[toolGroups.length - 1];
        if (lastGroup) {
          toolGroups[toolGroups.length - 1] = {
            ...lastGroup,
            toolIds: [...lastGroup.toolIds, action.toolUseId],
          };
        } else {
          toolGroups.push({
            id: nextGroupId(),
            toolIds: [action.toolUseId],
          });
        }

        next.set(action.sessionId, {
          ...session,
          toolCalls,
          toolGroups,
          pendingApproval: action.toolUseId,
        });
        return next;
      }

      next.set(action.sessionId, {
        ...session,
        toolCalls,
        pendingApproval: action.toolUseId,
      });
      return next;
    }

    case 'POST_TOOL_USE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const toolCalls = new Map(session.toolCalls);
      const existing = toolCalls.get(action.toolUseId);
      if (existing) {
        toolCalls.set(action.toolUseId, {
          ...existing,
          status: 'complete',
          response: action.response,
        });
      }

      const pendingApproval =
        session.pendingApproval === action.toolUseId
          ? null
          : session.pendingApproval;

      next.set(action.sessionId, { ...session, toolCalls, pendingApproval });
      return next;
    }

    case 'POST_TOOL_USE_FAILURE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const toolCalls = new Map(session.toolCalls);
      const existing = toolCalls.get(action.toolUseId);
      if (existing) {
        toolCalls.set(action.toolUseId, {
          ...existing,
          status: 'failed',
          error: action.error,
        });
      }

      const pendingApproval =
        session.pendingApproval === action.toolUseId
          ? null
          : session.pendingApproval;

      next.set(action.sessionId, { ...session, toolCalls, pendingApproval });
      return next;
    }

    case 'STOP': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      next.set(action.sessionId, {
        ...session,
        messages: [
          ...session.messages,
          {
            id: nextMessageId(),
            role: 'assistant',
            content: action.lastAssistantMessage,
            timestamp: action.timestamp,
          },
        ],
        isThinking: false,
        // Close current tool group — next tools start a new group
        toolGroups: [...session.toolGroups, { id: nextGroupId(), toolIds: [] }],
      });
      return next;
    }

    default:
      return state;
  }
}
