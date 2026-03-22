import React from 'react';
import { ChatIcon, TerminalIcon, GamepadIcon } from './Icons';
import SessionSelector from './SessionSelector';
import type { PermissionMode } from '../../shared/types';

interface SessionEntry {
  id: string;
  name: string;
  cwd: string;
  permissionMode: PermissionMode;
}

const MODE_CONFIG: Record<PermissionMode, { label: string; color: string; bg: string; border: string }> = {
  normal:        { label: 'NORMAL',         color: '#9CA3AF', bg: 'rgba(156,163,175,0.15)', border: 'rgba(156,163,175,0.25)' },
  'auto-accept': { label: 'ACCEPT CHANGES', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.25)' },
  plan:          { label: 'PLAN MODE',      color: '#2DD4BF', bg: 'rgba(45,212,191,0.15)',  border: 'rgba(45,212,191,0.25)' },
  bypass:        { label: 'BYPASS PERMISSIONS', color: '#FA8072', bg: 'rgba(250,128,114,0.15)', border: 'rgba(250,128,114,0.25)' },
};

interface Props {
  sessions: SessionEntry[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: (cwd: string, dangerous: boolean) => void;
  onCloseSession: (id: string) => void;
  viewMode: 'chat' | 'terminal';
  onToggleView: (mode: 'chat' | 'terminal') => void;
  gamePanelOpen: boolean;
  onToggleGamePanel: () => void;
  gameConnected: boolean;
  permissionMode: PermissionMode;
  onCyclePermission: () => void;
  model: string | null;
  announcement: string | null;
}

export default function HeaderBar({
  sessions, activeSessionId, onSelectSession, onCreateSession, onCloseSession,
  viewMode, onToggleView,
  gamePanelOpen, onToggleGamePanel, gameConnected,
  permissionMode, onCyclePermission, model, announcement,
}: Props) {
  const cfg = MODE_CONFIG[permissionMode];

  return (
    <div className="flex items-center h-10 px-3 border-b border-gray-800 shrink-0">
      {/* Left — model + permission badge + announcement */}
      <div className="flex-1 flex items-center gap-2">
        {model && (
          <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
            {model}
          </span>
        )}
        <button
          onClick={onCyclePermission}
          className="text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors cursor-pointer hover:brightness-125"
          style={{
            backgroundColor: cfg.bg,
            color: cfg.color,
            borderColor: cfg.border,
          }}
          title="Click to cycle permission mode (Shift+Tab)"
        >
          {cfg.label}
        </button>
        {announcement && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#FF9800]/15 text-[#FF9800] border border-[#FF9800]/25 truncate max-w-[200px]" title={announcement}>
            ★ {announcement}
          </span>
        )}
      </div>

      {/* Center — session selector */}
      <SessionSelector
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={onSelectSession}
        onCreateSession={onCreateSession}
        onCloseSession={onCloseSession}
      />

      {/* Right — view toggles */}
      <div className="flex-1 flex items-center justify-end gap-2">
        <div className="flex bg-gray-800 rounded-md p-0.5 gap-0.5">
          <button
            onClick={() => onToggleView('chat')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              viewMode === 'chat'
                ? 'bg-gray-300 text-gray-950'
                : 'text-gray-400 hover:text-gray-300'
            }`}
            title="Chat"
          >
            <ChatIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Chat</span>
          </button>
          <button
            onClick={() => onToggleView('terminal')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
              viewMode === 'terminal'
                ? 'bg-gray-300 text-gray-950'
                : 'text-gray-400 hover:text-gray-300'
            }`}
            title="Terminal"
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Terminal</span>
          </button>
        </div>
        <div className="bg-gray-800 rounded-md p-0.5">
          <button
            onClick={onToggleGamePanel}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1 ${
              gamePanelOpen
                ? 'bg-gray-300 text-gray-950'
                : 'text-gray-400 hover:text-gray-300'
            }`}
            title="Connect 4"
          >
            <GamepadIcon className="w-4 h-4" />
          {gameConnected && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
          )}
          </button>
        </div>
      </div>
    </div>
  );
}
