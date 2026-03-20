import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useChatDispatch } from '../state/chat-context';

interface Props {
  sessionId: string;
  disabled?: boolean;
}

export default function InputBar({ sessionId, disabled }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useChatDispatch();

  // Auto-focus input when mounted
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    // Optimistic: show user bubble immediately (don't wait for hook)
    dispatch({
      type: 'USER_PROMPT',
      sessionId,
      content: trimmed,
      timestamp: Date.now(),
    });

    // Send to PTY
    window.claude.session.sendInput(sessionId, trimmed + '\r');
    setText('');
  }, [text, sessionId, disabled, dispatch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  return (
    <div className="border-t border-gray-800 p-3 shrink-0">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ? 'Waiting for approval...' : 'Message Claude...'}
          disabled={disabled}
          autoFocus
          className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 transition-colors"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </form>
    </div>
  );
}
