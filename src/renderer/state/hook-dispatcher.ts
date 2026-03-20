import { HookEvent } from '../../shared/types';
import { ChatAction } from './chat-types';

/**
 * Maps a HookEvent from the named pipe relay into a ChatAction for the reducer.
 * Returns null for events that don't affect chat state.
 */
export function hookEventToAction(event: HookEvent): ChatAction | null {
  const { type, sessionId, payload, timestamp } = event;

  switch (type) {
    case 'UserPromptSubmit': {
      const content =
        typeof payload.prompt === 'string'
          ? payload.prompt
          : typeof payload.message === 'string'
            ? payload.message
            : '';
      return { type: 'USER_PROMPT', sessionId, content, timestamp };
    }

    case 'PreToolUse': {
      const toolUseId =
        (payload.tool_use_id as string) || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toolName = (payload.tool_name as string) || 'Unknown';
      const input = (payload.tool_input as Record<string, unknown>) || {};
      return { type: 'PRE_TOOL_USE', sessionId, toolUseId, toolName, input };
    }

    case 'PermissionRequest': {
      const toolUseId = (payload._toolUseId as string) || (payload.tool_use_id as string) || `perm-${Date.now()}`;
      const toolName = (payload.tool_name as string) || 'Unknown';
      const input = (payload.tool_input as Record<string, unknown>) || {};
      return { type: 'PERMISSION_REQUEST', sessionId, toolUseId, toolName, input };
    }

    case 'PostToolUse': {
      const toolUseId = (payload.tool_use_id as string) || '';
      const response =
        typeof payload.tool_result === 'string'
          ? payload.tool_result
          : payload.tool_result
            ? JSON.stringify(payload.tool_result)
            : undefined;
      return { type: 'POST_TOOL_USE', sessionId, toolUseId, response };
    }

    case 'PostToolUseFailure': {
      const toolUseId = (payload.tool_use_id as string) || '';
      const error =
        typeof payload.error === 'string'
          ? payload.error
          : payload.error
            ? JSON.stringify(payload.error)
            : undefined;
      return { type: 'POST_TOOL_USE_FAILURE', sessionId, toolUseId, error };
    }

    case 'Stop': {
      // last_assistant_message may be a string or a content blocks array
      let lastAssistantMessage = '';
      const raw = payload.last_assistant_message;
      if (typeof raw === 'string') {
        lastAssistantMessage = raw;
      } else if (Array.isArray(raw)) {
        // Content blocks: extract text from text blocks
        lastAssistantMessage = raw
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n\n');
      }
      return { type: 'STOP', sessionId, lastAssistantMessage, timestamp };
    }

    // SessionStart, Notification, etc. — don't affect chat state
    default:
      return null;
  }
}
