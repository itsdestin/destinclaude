import { useEffect, useRef } from 'react';
import { parseInkSelect, menuToButtons } from '../parser/ink-select-parser';
import { useChatDispatch } from '../state/chat-context';
import { getScreenText, onBufferReady } from './terminal-registry';

/**
 * Monitors xterm.js write completions (via terminal-registry) to detect
 * Ink select menus in the screen buffer.  Previously listened to raw
 * pty:output events, but reading the buffer before xterm.js finished
 * processing the write caused a race condition where permission prompts
 * were silently missed.
 */
export function usePromptDetector() {
  const dispatch = useChatDispatch();
  const lastMenuRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const unsub = onBufferReady((sid: string) => {
      const screen = getScreenText(sid);
      if (!screen) return;

      const menu = parseInkSelect(screen);
      const lastMenuId = lastMenuRef.current.get(sid) || null;

      if (menu) {
        if (menu.id !== lastMenuId) {
          lastMenuRef.current.set(sid, menu.id);
          const buttons = menuToButtons(menu);
          dispatch({
            type: 'SHOW_PROMPT',
            sessionId: sid,
            promptId: menu.id,
            title: menu.title,
            buttons: buttons.map((b) => ({ label: b.label, input: b.input })),
          });
        }
      } else if (lastMenuId) {
        dispatch({
          type: 'DISMISS_PROMPT',
          sessionId: sid,
          promptId: lastMenuId,
        });
        lastMenuRef.current.delete(sid);
      }
    });

    return unsub;
  }, [dispatch]);
}
