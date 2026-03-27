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

      // Deduplicate — if the last timeline entry is a user message with the
      // same content (InputBar optimistic + hook event arriving later), skip
      const lastEntry = session.timeline[session.timeline.length - 1];
      if (
        lastEntry &&
        lastEntry.kind === 'user' &&
        lastEntry.message.content === action.content
      ) {
        // Already showing this message — just ensure isThinking is set
        if (!session.isThinking) {
          next.set(action.sessionId, { ...session, isThinking: true, currentGroupId: null });
          return next;
        }
        return state;
      }

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
        currentGroupId: null,
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

      next.set(action.sessionId, {
        ...session, toolCalls, toolGroups, timeline, currentGroupId,
        lastActivityAt: Date.now(),
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
          ...existing, status: 'complete', response: action.response,
        });
      }

      // Clean up any orphaned permission socket
      if (existing?.requestId && typeof window !== 'undefined' && (window as any).claude?.session?.respondToPermission) {
        (window as any).claude.session.respondToPermission(existing.requestId, {});
      }

      next.set(action.sessionId, { ...session, toolCalls, lastActivityAt: Date.now() });
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

      // Clean up any orphaned permission socket
      if (existing?.requestId && typeof window !== 'undefined' && (window as any).claude?.session?.respondToPermission) {
        (window as any).claude.session.respondToPermission(existing.requestId, {});
      }

      next.set(action.sessionId, { ...session, toolCalls, lastActivityAt: Date.now() });
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
        streamingText: '',
        currentGroupId: null,
      });
      return next;
    }

    case 'UPDATE_STREAMING': {
      const session = next.get(action.sessionId);
      if (!session || !session.isThinking) return state;
      // Only update if text actually changed
      if (session.streamingText === action.text) return state;
      next.set(action.sessionId, { ...session, streamingText: action.text, lastActivityAt: Date.now() });
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
        (e) => !(e.kind === 'prompt' && e.prompt.promptId === action.promptId && !e.prompt.completed),
      );

      next.set(action.sessionId, { ...session, timeline });
      return next;
    }

    case 'THINKING_TIMEOUT': {
      const session = next.get(action.sessionId);
      if (!session || !session.isThinking) return state;

      const message = {
        id: nextMessageId(),
        role: 'assistant' as const,
        content: '_Response may have arrived — check the Terminal view._',
        timestamp: Date.now(),
      };

      next.set(action.sessionId, {
        ...session,
        timeline: [...session.timeline, { kind: 'assistant', message }],
        isThinking: false,
        streamingText: '',
        currentGroupId: null,
      });
      return next;
    }

    case 'TERMINAL_ACTIVITY': {
      const session = next.get(action.sessionId);
      if (!session || !session.isThinking) return state;
      next.set(action.sessionId, { ...session, lastActivityAt: Date.now() });
      return next;
    }

    // --- Transcript watcher actions ---

    case 'TRANSCRIPT_USER_MESSAGE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Dedup by uuid
      if (session.seenUuids.has(action.uuid)) return state;
      const seenUuids = new Set(session.seenUuids);
      seenUuids.add(action.uuid);

      // Dedup against last timeline entry (optimistic USER_PROMPT)
      const lastEntry = session.timeline[session.timeline.length - 1];
      if (
        lastEntry &&
        lastEntry.kind === 'user' &&
        lastEntry.message.content === action.text
      ) {
        // Already showing this message — just ensure isThinking is set
        if (!session.isThinking) {
          next.set(action.sessionId, { ...session, isThinking: true, currentGroupId: null, seenUuids });
          return next;
        }
        next.set(action.sessionId, { ...session, seenUuids });
        return next;
      }

      const message = {
        id: nextMessageId(),
        role: 'user' as const,
        content: action.text,
        timestamp: action.timestamp,
      };

      next.set(action.sessionId, {
        ...session,
        timeline: [...session.timeline, { kind: 'user', message }],
        isThinking: true,
        currentGroupId: null,
        seenUuids,
      });
      return next;
    }

    case 'TRANSCRIPT_ASSISTANT_TEXT': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Dedup by uuid
      if (session.seenUuids.has(action.uuid)) return state;
      const seenUuids = new Set(session.seenUuids);
      seenUuids.add(action.uuid);

      const message = {
        id: nextMessageId(),
        role: 'assistant' as const,
        content: action.text,
        timestamp: action.timestamp,
      };

      next.set(action.sessionId, {
        ...session,
        timeline: [...session.timeline, { kind: 'assistant', message }],
        currentGroupId: null, // Critical: next tool_use creates a new group
        seenUuids,
      });
      return next;
    }

    case 'TRANSCRIPT_TOOL_USE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Dedup by uuid
      if (session.seenUuids.has(action.uuid)) return state;
      const seenUuids = new Set(session.seenUuids);
      seenUuids.add(action.uuid);

      const toolCalls = new Map(session.toolCalls);
      toolCalls.set(action.toolUseId, {
        toolUseId: action.toolUseId,
        toolName: action.toolName,
        input: action.toolInput,
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

      next.set(action.sessionId, {
        ...session, toolCalls, toolGroups, timeline, currentGroupId,
        lastActivityAt: Date.now(),
        seenUuids,
      });
      return next;
    }

    case 'TRANSCRIPT_TOOL_RESULT': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Dedup by uuid
      if (session.seenUuids.has(action.uuid)) return state;
      const seenUuids = new Set(session.seenUuids);
      seenUuids.add(action.uuid);

      const toolCalls = new Map(session.toolCalls);
      const existing = toolCalls.get(action.toolUseId);
      if (existing) {
        if (action.isError) {
          toolCalls.set(action.toolUseId, {
            ...existing, status: 'failed', error: action.result,
          });
        } else {
          toolCalls.set(action.toolUseId, {
            ...existing, status: 'complete', response: action.result,
          });
        }
      }

      next.set(action.sessionId, {
        ...session, toolCalls, lastActivityAt: Date.now(), seenUuids,
      });
      return next;
    }

    case 'TRANSCRIPT_TURN_COMPLETE': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Dedup by uuid
      if (session.seenUuids.has(action.uuid)) return state;
      const seenUuids = new Set(session.seenUuids);
      seenUuids.add(action.uuid);

      next.set(action.sessionId, {
        ...session,
        isThinking: false,
        streamingText: '',
        currentGroupId: null,
        seenUuids,
      });
      return next;
    }

    case 'PERMISSION_REQUEST': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Find the last running tool and transition to awaiting-approval
      const toolCalls = new Map(session.toolCalls);
      let found = false;
      for (const [id, tool] of toolCalls) {
        if (tool.status === 'running') {
          toolCalls.set(id, {
            ...tool,
            status: 'awaiting-approval',
            requestId: action.requestId,
            permissionSuggestions: action.permissionSuggestions,
          });
          found = true;
          break;
        }
      }

      if (!found) return state;

      // Dismiss any parser-detected PromptCards for this session — the hook-based
      // ToolCard is now handling the permission flow. This prevents duplicate
      // prompts when the parser fires before the hook event arrives.
      const timeline = session.timeline.filter(
        (e) => !(e.kind === 'prompt' && !e.prompt.completed),
      );

      next.set(action.sessionId, { ...session, toolCalls, timeline });
      return next;
    }

    case 'PERMISSION_RESPONDED':
    case 'PERMISSION_EXPIRED': {
      const session = next.get(action.sessionId);
      if (!session) return state;

      // Transition the tool from awaiting-approval back to running.
      // PERMISSION_RESPONDED: user clicked Yes/Always Allow/No — merge
      //   the tool back into its group immediately.
      // PERMISSION_EXPIRED: relay socket closed (timeout) — clear dead buttons.
      const toolCalls = new Map(session.toolCalls);
      for (const [id, tool] of toolCalls) {
        if (tool.status === 'awaiting-approval' && tool.requestId === action.requestId) {
          toolCalls.set(id, { ...tool, status: 'running', requestId: undefined });
          break;
        }
      }

      next.set(action.sessionId, { ...session, toolCalls });
      return next;
    }

    default:
      return state;
  }
}
