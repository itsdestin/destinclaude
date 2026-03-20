import React, { useState, useRef, useCallback } from 'react';

interface Props {
  sessionId: string;
  disabled?: boolean;
}

export default function InputBar({ sessionId, disabled }: Props) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    window.claude.session.sendInput(sessionId, trimmed + '\n');
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, sessionId, disabled]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-expand up to ~6 lines
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 144) + 'px';
  };

  return (
    <div className="border-t border-gray-800 p-3 shrink-0">
      <div className="flex items-end gap-2 bg-gray-800 rounded-xl px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Waiting for approval...' : 'Message Claude...'}
          disabled={disabled}
          rows={1}
          className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 resize-none outline-none min-h-[24px] max-h-[144px] disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={disabled || !text.trim()}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 transition-colors"
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
