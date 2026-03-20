import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChatState } from '../state/chat-context';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';
import ToolGroup from './ToolGroup';
import ThinkingIndicator from './ThinkingIndicator';

interface Props {
  sessionId: string;
  visible: boolean;
}

export default function ChatView({ sessionId, visible }: Props) {
  const state = useChatState(sessionId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

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
  }, [state.messages.length, state.toolGroups.length, state.isThinking, atBottom]);

  const jumpToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleApprove = useCallback(
    (toolUseId: string) => {
      window.claude.session.approve(sessionId, toolUseId, true);
    },
    [sessionId],
  );

  const handleReject = useCallback(
    (toolUseId: string) => {
      window.claude.session.approve(sessionId, toolUseId, false);
    },
    [sessionId],
  );

  // Build timeline: interleave messages with tool groups
  // Tool groups are placed before the assistant message that follows them
  const timeline: React.ReactNode[] = [];
  let groupCursor = 0;

  for (const msg of state.messages) {
    if (msg.role === 'assistant') {
      // Render any tool groups that accumulated before this assistant message
      while (groupCursor < state.toolGroups.length) {
        const group = state.toolGroups[groupCursor];
        if (group.toolIds.length === 0) {
          groupCursor++;
          continue;
        }
        // Stop if we've reached the sentinel group that was created when STOP fired
        // (it will have an empty toolIds and was already skipped above)
        groupCursor++;
        timeline.push(
          <ToolGroup
            key={group.id}
            group={group}
            toolCalls={state.toolCalls}
            onApprove={handleApprove}
            onReject={handleReject}
          />,
        );
      }
      timeline.push(<AssistantMessage key={msg.id} message={msg} />);
    } else {
      timeline.push(<UserMessage key={msg.id} message={msg} />);
    }
  }

  // Render remaining tool groups (ones after the last assistant message, still in progress)
  while (groupCursor < state.toolGroups.length) {
    const group = state.toolGroups[groupCursor];
    groupCursor++;
    if (group.toolIds.length === 0) continue;
    timeline.push(
      <ToolGroup
        key={group.id}
        group={group}
        toolCalls={state.toolCalls}
        onApprove={handleApprove}
        onReject={handleReject}
      />,
    );
  }

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {state.messages.length === 0 && !state.isThinking ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Start a conversation with Claude
          </div>
        ) : (
          <>
            {timeline}
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
