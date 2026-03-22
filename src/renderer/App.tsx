import React, { useState, useEffect, useRef, useCallback } from 'react';
import TerminalView from './components/TerminalView';
import ChatView from './components/ChatView';
import HeaderBar from './components/HeaderBar';
import InputBar from './components/InputBar';
import StatusBar from './components/StatusBar';
import GamePanel from './components/game/GamePanel';
import { ChatProvider, useChatDispatch, useChatState } from './state/chat-context';
import { GameProvider, useGameState, useGameDispatch } from './state/game-context';
import { hookEventToAction } from './state/hook-dispatcher';
import { usePromptDetector } from './hooks/usePromptDetector';
import { useGitHubGame } from './hooks/useGitHubGame';
import { AppIcon } from './components/Icons';

type ViewMode = 'chat' | 'terminal';

interface StatusDataState {
  usage: any;
  announcement: any;
  updateStatus: any;
  model: string | null;
  contextPercent: number | null;
  syncStatus: string | null;
  syncWarnings: string | null;
}

function AppInner() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [viewModes, setViewModes] = useState<Map<string, ViewMode>>(new Map());
  const [statusData, setStatusData] = useState<StatusDataState>({
    usage: null, announcement: null, updateStatus: null,
    model: null, contextPercent: null,
    syncStatus: null, syncWarnings: null,
  });

  usePromptDetector();
  const dispatch = useChatDispatch();
  const gameState = useGameState();
  const gameDispatch = useGameDispatch();
  const gameConnection = useGitHubGame();

  useEffect(() => {
    const createdHandler = window.claude.on.sessionCreated((info) => {
      setSessions((prev) => [...prev, info]);
      setSessionId(info.id);
      setViewModes((prev) => new Map(prev).set(info.id, 'chat'));
      dispatch({ type: 'SESSION_INIT', sessionId: info.id });
    });

    const destroyedHandler = window.claude.on.sessionDestroyed((id) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSessionId((curr) => (curr === id ? null : curr));
      setViewModes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      dispatch({ type: 'SESSION_REMOVE', sessionId: id });
    });

    const hookHandler = window.claude.on.hookEvent((event) => {
      const action = hookEventToAction(event);
      if (action) {
        dispatch(action);
      }
    });

    const renamedHandler = window.claude.on.sessionRenamed((sid, name) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sid ? { ...s, name } : s)),
      );
    });

    const statusHandler = window.claude.on.statusData((data) => {
      setStatusData((prev) => ({
        ...prev,
        usage: data.usage,
        announcement: data.announcement,
        updateStatus: data.updateStatus,
        syncStatus: data.syncStatus,
        syncWarnings: data.syncWarnings,
      }));
    });

    return () => {
      window.claude.off('session:created', createdHandler);
      window.claude.off('session:destroyed', destroyedHandler);
      window.claude.off('hook:event', hookHandler);
      window.claude.off('session:renamed', renamedHandler);
      window.claude.off('status:data', statusHandler);
    };
  }, [dispatch]);

  const createSession = useCallback(async (cwd: string, dangerous: boolean) => {
    await window.claude.session.create({
      name: 'New Session',
      cwd,
      skipPermissions: dangerous,
    });
  }, []);

  const currentViewMode = sessionId ? (viewModes.get(sessionId) || 'chat') : 'chat';

  const handleToggleView = useCallback(
    (mode: ViewMode) => {
      if (!sessionId) return;
      setViewModes((prev) => new Map(prev).set(sessionId, mode));
    },
    [sessionId],
  );

  const currentSession = sessions.find((s) => s.id === sessionId);

  // Parse announcement
  const announcementText = statusData.announcement?.message || null;

  return (
    <div className="flex w-screen h-screen bg-gray-950 text-gray-200">
      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {sessions.length > 0 && sessionId && currentSession ? (
          <>
            <HeaderBar
              sessions={sessions}
              activeSessionId={sessionId}
              onSelectSession={setSessionId}
              onCreateSession={createSession}
              onCloseSession={(id) => window.claude.session.destroy(id)}
              viewMode={currentViewMode}
              onToggleView={handleToggleView}
              gamePanelOpen={gameState.panelOpen}
              onToggleGamePanel={() => gameDispatch({ type: 'TOGGLE_PANEL' })}
              gameConnected={gameState.connected}
              permissionMode={currentSession.permissionMode || 'default'}
              model={statusData.model}
              announcement={announcementText}
            />
            <div className="flex-1 overflow-hidden relative">
              {sessions.map((s) => (
                <React.Fragment key={s.id}>
                  <ChatView
                    sessionId={s.id}
                    visible={s.id === sessionId && (viewModes.get(s.id) || 'chat') === 'chat'}
                  />
                  <TerminalView
                    sessionId={s.id}
                    visible={s.id === sessionId && (viewModes.get(s.id) || 'chat') === 'terminal'}
                  />
                </React.Fragment>
              ))}
            </div>
            {currentViewMode === 'chat' && (
              <>
                <ChatInputBar sessionId={sessionId} />
                <StatusBar statusData={{
                  usage: statusData.usage,
                  updateStatus: statusData.updateStatus,
                  contextPercent: statusData.contextPercent,
                  syncStatus: statusData.syncStatus,
                  syncWarnings: statusData.syncWarnings,
                }} />
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-sm text-gray-500">No active session</p>
            <AppIcon className="w-16 h-16 text-gray-400" />
            <button
              onClick={() => createSession('C:\\Users\\desti', false)}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-gray-300 text-gray-950 hover:bg-gray-200 transition-colors"
            >
              Click here to create one
            </button>
          </div>
        )}
      </div>

      {/* Game panel (conditional) */}
      {gameState.panelOpen && <GamePanel connection={gameConnection} />}
    </div>
  );
}

function ChatInputBar({ sessionId }: { sessionId: string }) {
  return <InputBar sessionId={sessionId} />;
}

export default function App() {
  return (
    <GameProvider>
      <ChatProvider>
        <AppInner />
      </ChatProvider>
    </GameProvider>
  );
}
