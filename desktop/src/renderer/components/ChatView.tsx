import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChatState, useChatDispatch } from '../state/chat-context';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import ToolGroup from './ToolGroup';
import ToolCard from './ToolCard';
import PromptCard from './PromptCard';
import ThinkingIndicator from './ThinkingIndicator';

interface Props {
  sessionId: string;
  visible: boolean;
}

export default function ChatView({ sessionId, visible }: Props) {
  const state = useChatState(sessionId);
  const dispatch = useChatDispatch();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Thinking timeout — if isThinking stays true with no activity for 60s, auto-clear.
  // lastActivityAt resets the clock whenever hook events or streaming updates arrive,
  // so the warning only fires after 60s of complete silence from Claude.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const hasAwaitingApproval = [...state.toolCalls.values()].some(
    (t) => t.status === 'awaiting-approval',
  );

  useEffect(() => {
    // Don't start the timeout when a tool is awaiting permission approval —
    // Claude is waiting for the user, not the other way around.
    if (state.isThinking && !hasAwaitingApproval) {
      thinkingTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          dispatch({ type: 'THINKING_TIMEOUT', sessionId });
        }
      }, 60000);
    } else {
      if (thinkingTimerRef.current) {
        clearTimeout(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }
    }
    return () => {
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    };
  }, [state.isThinking, state.lastActivityAt, hasAwaitingApproval, sessionId, dispatch]);

  // Track whether user is scrolled to bottom
  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => setAtBottom(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll when new content arrives and user is at bottom
  useEffect(() => {
    if (atBottom && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.timeline.length, state.isThinking, atBottom]);

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handlePromptSelect = useCallback(
    (promptId: string, input: string, label: string) => {
      // Send keystrokes to PTY to navigate the Ink menu
      window.claude.session.sendInput(sessionId, input);
      // Mark the prompt as completed in the UI
      dispatch({
        type: 'COMPLETE_PROMPT',
        sessionId,
        promptId,
        selection: label,
      });
    },
    [sessionId, dispatch],
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: visible ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      <div className="flex-1 overflow-y-auto py-4">
        {state.timeline.length === 0 && !state.isThinking ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Start a conversation with Claude
          </div>
        ) : (
          <>
            {state.timeline.map((entry, i) => {
              switch (entry.kind) {
                case 'user':
                  return <UserMessage key={entry.message.id} message={entry.message} />;
                case 'assistant':
                  return <AssistantMessage key={entry.message.id} message={entry.message} />;
                case 'tool-group': {
                  const group = state.toolGroups.get(entry.groupId);
                  if (!group || group.toolIds.length === 0) return null;

                  // Pull awaiting-approval tools out of the group and render
                  // them as standalone cards so they're always visible — not
                  // hidden inside a collapsed tool group.
                  const pendingIds = group.toolIds.filter((id) => {
                    const t = state.toolCalls.get(id);
                    return t?.status === 'awaiting-approval';
                  });
                  const restIds = group.toolIds.filter((id) => !pendingIds.includes(id));

                  const restGroup = restIds.length > 0
                    ? { ...group, toolIds: restIds }
                    : null;

                  return (
                    <React.Fragment key={entry.groupId}>
                      {restGroup && (
                        <ToolGroup
                          group={restGroup}
                          toolCalls={state.toolCalls}
                        />
                      )}
                      {pendingIds.map((id) => {
                        const tool = state.toolCalls.get(id);
                        if (!tool) return null;
                        return (
                          <div key={id} className="px-4 py-1">
                            <ToolCard tool={tool} />
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                }
                case 'prompt':
                  return (
                    <PromptCard
                      key={entry.prompt.promptId}
                      prompt={entry.prompt}
                      sessionId={sessionId}
                      onSelect={(input, label) => handlePromptSelect(entry.prompt.promptId, input, label)}
                    />
                  );
              }
            })}
            {state.isThinking && <ThinkingIndicator />}
          </>
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Jump to bottom button */}
      {!atBottom && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-full shadow-lg transition-colors"
        >
          Jump to bottom
        </button>
      )}
    </div>
  );
}
