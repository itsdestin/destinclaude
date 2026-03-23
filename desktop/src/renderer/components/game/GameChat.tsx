import React, { useState, useRef, useEffect } from 'react';
import { useGameState } from '../../state/game-context';

interface Props {
  connection: {
    register: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    authenticate: (username: string, password: string) => void;
    createGame: () => void;
    joinGame: (code: string) => void;
    makeMove: (column: number) => void;
    sendChat: (text: string) => void;
    requestRematch: () => void;
    leaveGame: () => void;
    challengePlayer: (target: string) => void;
    respondToChallenge: (from: string, accept: boolean) => void;
  };
}

export default function GameChat({ connection }: Props) {
  const state = useGameState();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chatMessages]);

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    connection.sendChat(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  const colorForSender = (from: string): string => {
    if (from === state.username) {
      return state.myColor === 'red' ? 'text-red-400' : 'text-yellow-400';
    }
    // Opponent
    const opponentColor = state.myColor === 'red' ? 'yellow' : 'red';
    return opponentColor === 'red' ? 'text-red-400' : 'text-yellow-400';
  };

  return (
    <div className="border-t border-gray-800 flex flex-col" style={{ maxHeight: '160px', minHeight: '120px' }}>
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-gray-800 shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">Game Chat</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-1.5 flex flex-col gap-1">
        {state.chatMessages.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No messages yet</p>
        ) : (
          state.chatMessages.map((msg, i) => (
            <div key={i} className="flex gap-1.5 text-xs">
              <span className={`font-medium shrink-0 ${colorForSender(msg.from)}`}>
                {msg.from}:
              </span>
              <span className="text-gray-300 break-words min-w-0">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-gray-800 shrink-0">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something..."
          maxLength={200}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-gray-400 transition-colors"
        />
      </div>
    </div>
  );
}
