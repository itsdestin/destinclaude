import { useEffect, useRef } from 'react';
import { parseInkSelect, menuToButtons } from '../parser/ink-select-parser';
import { useChatDispatch, useChatStateMap } from '../state/chat-context';
import { getScreenText, onBufferReady } from './terminal-registry';

// How long to wait before showing a parser-detected prompt, giving the hook
// system time to deliver a PermissionRequest via the named pipe relay.
// Hook events typically arrive 100-200ms after the Ink menu renders.
const PROMPT_DEBOUNCE_MS = 350;

/**
 * Monitors xterm.js write completions (via terminal-registry) to detect
 * Ink select menus in the screen buffer.
 *
 * To avoid showing duplicate prompts (parser PromptCard + hook-based ToolCard),
 * new menu detections are debounced. If the hook system delivers a
 * PERMISSION_REQUEST during the debounce window, the pending prompt is
 * cancelled — the ToolCard handles it instead.  If the debounce expires
 * without a hook event (e.g., trust folder prompt, or hooks are down),
 * the PromptCard is shown as a fallback.
 */
export function usePromptDetector() {
  const dispatch = useChatDispatch();
  const chatState = useChatStateMap();
  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;
  const lastMenuRef = useRef<Map<string, string>>(new Map());
  const pendingTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const unsub = onBufferReady((sid: string) => {
      // Skip prompt detection when a PermissionRequest approval is active
      // (the hook-based UI is handling the permission flow)
      const sessionState = chatStateRef.current.get(sid);
      if (sessionState) {
        for (const [, tool] of sessionState.toolCalls) {
          if (tool.status === 'awaiting-approval') return;
        }
      }

      const screen = getScreenText(sid);
      if (!screen) return;

      const menu = parseInkSelect(screen);
      const lastMenuId = lastMenuRef.current.get(sid) || null;

      if (menu) {
        if (menu.id !== lastMenuId) {
          lastMenuRef.current.set(sid, menu.id);

          // Cancel any previous pending prompt for this session
          const existingTimer = pendingTimerRef.current.get(sid);
          if (existingTimer) clearTimeout(existingTimer);

          // Debounce: wait before showing, giving hook system time to arrive
          const timer = setTimeout(() => {
            pendingTimerRef.current.delete(sid);

            // Re-check: if a PermissionRequest arrived during the debounce,
            // a tool will be in awaiting-approval — don't show the prompt
            const currentSession = chatStateRef.current.get(sid);
            if (currentSession) {
              for (const [, tool] of currentSession.toolCalls) {
                if (tool.status === 'awaiting-approval') return;
              }
            }

            const buttons = menuToButtons(menu);
            dispatch({
              type: 'SHOW_PROMPT',
              sessionId: sid,
              promptId: menu.id,
              title: menu.title,
              buttons: buttons.map((b) => ({ label: b.label, input: b.input })),
            });
          }, PROMPT_DEBOUNCE_MS);

          pendingTimerRef.current.set(sid, timer);
        }
      } else if (lastMenuId) {
        // Menu disappeared — cancel any pending prompt and dismiss
        const existingTimer = pendingTimerRef.current.get(sid);
        if (existingTimer) {
          clearTimeout(existingTimer);
          pendingTimerRef.current.delete(sid);
        }
        dispatch({
          type: 'DISMISS_PROMPT',
          sessionId: sid,
          promptId: lastMenuId,
        });
        lastMenuRef.current.delete(sid);
      }
    });

    return () => {
      unsub();
      // Clean up any pending timers
      for (const timer of pendingTimerRef.current.values()) {
        clearTimeout(timer);
      }
      pendingTimerRef.current.clear();
    };
  }, [dispatch]);
}
