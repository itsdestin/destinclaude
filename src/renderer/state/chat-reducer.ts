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

      const message = {
        id: nextMessageId(),
        role: 'user' as const,
        content: action.content,
        timestamp: action.timestamp,
      };

      next.set(action.sessionId, {
        ...session,
        timeline: [...session.timeline, { kind: 'user', message }],
        isThinking: true,
        currentGroupId: null, // Reset — next tools start a new group
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

      const toolGroups = new Map(session.toolGroups);
      let timeline = session.timeline;
      let currentGroupId = session.currentGroupId;

      if (currentGroupId && toolGroups.has(currentGroupId)) {
        // Add to existing group
        const group = toolGroups.get(currentGroupId)!;
        toolGroups.set(currentGroupId, {
          ...group,
          toolIds: [...group.toolIds, action.toolUseId],
        });
      } else {
        // Create new group and add to timeline
        currentGroupId = nextGroupId();
        toolGroups.set(currentGroupId, {
          id: currentGroupId,
          toolIds: [action.toolUseId],
        });
        timeline = [...timeline, { kind: 'tool-group', groupId: currentGroupId }];
      }

      next.set(action.sessionId, { ...session, toolCalls, toolGroups, timeline, currentGroupId });
      return next;
    }

    case 'POST_TOOL_USE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const toolCalls = new Map(session.toolCalls);
      const existing = toolCalls.get(action.toolUseId);
      if (existing) {
        toolCalls.set(action.toolUseId, {
          ...existing, status: 'complete', response: action.response,
        });
      }

      next.set(action.sessionId, { ...session, toolCalls });
      return next;
    }

    case 'POST_TOOL_USE_FAILURE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const toolCalls = new Map(session.toolCalls);
      const existing = toolCalls.get(action.toolUseId);
      if (existing) {
        toolCalls.set(action.toolUseId, {
          ...existing, status: 'failed', error: action.error,
        });
      }

      next.set(action.sessionId, { ...session, toolCalls });
      return next;
    }

    case 'STOP': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const message = {
        id: nextMessageId(),
        role: 'assistant' as const,
        content: action.lastAssistantMessage,
        timestamp: action.timestamp,
      };

      next.set(action.sessionId, {
        ...session,
        timeline: [...session.timeline, { kind: 'assistant', message }],
        isThinking: false,
        currentGroupId: null, // Next tools start a fresh group
      });
      return next;
    }

    case 'SHOW_PROMPT': {
      let session = next.get(action.sessionId);
      if (!session) {
        session = createSessionChatState();
        next.set(action.sessionId, session);
      }

      // Remove existing prompt with same ID to avoid duplicates
      const timeline = session.timeline.filter(
        (e) => !(e.kind === 'prompt' && e.prompt.promptId === action.promptId),
      );
      timeline.push({
        kind: 'prompt',
        prompt: {
          promptId: action.promptId,
          title: action.title,
          buttons: action.buttons,
        },
      });

      next.set(action.sessionId, { ...session, timeline });
      return next;
    }

    case 'COMPLETE_PROMPT': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const timeline = session.timeline.map((e) => {
        if (e.kind === 'prompt' && e.prompt.promptId === action.promptId) {
          return { ...e, prompt: { ...e.prompt, completed: action.selection } };
        }
        return e;
      });

      next.set(action.sessionId, { ...session, timeline });
      return next;
    }

    case 'DISMISS_PROMPT': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      const timeline = session.timeline.filter(
        (e) => !(e.kind === 'prompt' && e.prompt.promptId === action.promptId),
      );

      next.set(action.sessionId, { ...session, timeline });
      return next;
    }

    default:
      return state;
  }
}
