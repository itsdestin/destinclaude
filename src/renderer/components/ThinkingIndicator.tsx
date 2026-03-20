import React from 'react';

export default function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="flex items-center gap-1.5 bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5">
        <span className="text-sm text-gray-400">Claude is thinking</span>
        <span className="flex gap-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    </div>
  );
}
