import React from 'react';

interface Props {
  sessionName: string;
  cwd: string;
  viewMode: 'chat' | 'terminal';
  onToggleView: (mode: 'chat' | 'terminal') => void;
}

export default function HeaderBar({ sessionName, cwd, viewMode, onToggleView }: Props) {
  return (
    <div className="flex items-center h-10 px-3 border-b border-gray-800 shrink-0">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-400 font-medium">{sessionName}</span>
        <span className="text-xs text-gray-600 ml-2 truncate">{cwd}</span>
      </div>
      <div className="flex bg-gray-800 rounded-md p-0.5 gap-0.5">
        <button
          onClick={() => onToggleView('chat')}
          className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
            viewMode === 'chat'
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => onToggleView('terminal')}
          className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
            viewMode === 'terminal'
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Terminal
        </button>
      </div>
    </div>
  );
}
