import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChatState, useChatDispatch } from '../state/chat-context';
import { onBufferReady } from '../hooks/terminal-registry';
import UserMessage from './UserMessage';
import AssistantTurnBubble from './AssistantTurnBubble';
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

  // Reset the thinking timer when the terminal buffer receives output.
  // During extended thinking, Claude's CLI renders a spinner/timer in the PTY
  // but fires no hook events, so lastActivityAt goes stale.  Listening to
  // buffer writes keeps the timeout from triggering prematurely.
  const isThinkingRef = useRef(state.isThinking);
  isThinkingRef.current = state.isThinking;

  // Throttle TERMINAL_ACTIVITY dispatches — the thinking timeout only needs
  // a heartbeat every few seconds, not a dispatch on every PTY write.
  const lastActivityDispatchRef = useRef(0);
  useEffect(() => {
    return onBufferReady((sid) => {
      if (sid === sessionId && isThinkingRef.current) {
        const now = Date.now();
        if (now - lastActivityDispatchRef.current > 5000) {
          lastActivityDispatchRef.current = now;
          dispatch({ type: 'TERMINAL_ACTIVITY', sessionId });
        }
      }
    });
  }, [sessionId, dispatch]);

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
            {state.timeline.map((entry) => {
              switch (entry.kind) {
                case 'user':
                  return <UserMessage key={entry.message.id} message={entry.message} />;
                case 'assistant-turn': {
                  const turn = state.assistantTurns.get(entry.turnId);
                  if (!turn || turn.segments.length === 0) return null;
                  return (
                    <AssistantTurnBubble
                      key={entry.turnId}
                      turn={turn}
                      toolGroups={state.toolGroups}
                      toolCalls={state.toolCalls}
                      sessionId={sessionId}
                    />
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
            {/* Awaiting-approval tools pop out as standalone bubbles at the bottom */}
            {[...state.toolCalls.values()]
              .filter((t) => t.status === 'awaiting-approval')
              .map((tool) => (
                <div key={tool.toolUseId} className="flex justify-start px-4 py-1">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-800 px-2 py-1">
                    <ToolCard tool={tool} sessionId={sessionId} />
                  </div>
                </div>
              ))}
            {/* Only show thinking when Claude is between tool completion and next text —
                not when tools are still running or awaiting approval */}
            {state.isThinking
              && !hasAwaitingApproval
              && ![...state.toolCalls.values()].some((t) => t.status === 'running')
              && <ThinkingIndicator />}
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
