import { useEffect, useRef } from 'react';
import { parseInkSelect, menuToButtons } from '../parser/ink-select-parser';
import { useChatDispatch } from '../state/chat-context';
import { getScreenText } from './terminal-registry';

/**
 * Monitors PTY output events as a trigger, then reads the xterm.js screen
 * buffer (which has properly rendered all cursor movement and ANSI codes)
 * to detect Ink select menus.
 */
export function usePromptDetector() {
  const dispatch = useChatDispatch();
  const lastMenuRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const handler = window.claude.on.ptyOutput((sid: string, _data: string) => {
      // Read the rendered screen from xterm's buffer
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

    return () => {
      window.claude.off('pty:output', handler);
    };
  }, [dispatch]);
}
