import React, { useState, useEffect, useRef, useCallback } from 'react';
import TerminalView from './components/TerminalView';
import ChatView from './components/ChatView';
import HeaderBar from './components/HeaderBar';
import InputBar from './components/InputBar';
import StatusBar from './components/StatusBar';
import ErrorBoundary from './components/ErrorBoundary';
import GamePanel from './components/game/GamePanel';
import { ChatProvider, useChatDispatch, useChatState } from './state/chat-context';
import { GameProvider, useGameState, useGameDispatch } from './state/game-context';
import { hookEventToAction } from './state/hook-dispatcher';
import { usePromptDetector } from './hooks/usePromptDetector';
import { useGitHubGame } from './hooks/useGitHubGame';
import { AppIcon } from './components/Icons';
import CommandDrawer from './components/CommandDrawer';
import TrustGate, { useTrustGateActive } from './components/TrustGate';
import type { SkillEntry, PermissionMode } from '../shared/types';

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

  const [permissionModes, setPermissionModes] = useState<Map<string, PermissionMode>>(new Map());
  // Sessions that have received their first hook event (Claude is initialized).
  // Until this fires, show an "Initializing" overlay to prevent premature input.
  const [initializedSessions, setInitializedSessions] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSearchMode, setDrawerSearchMode] = useState(false);
  const [skills, setSkills] = useState<SkillEntry[]>([]);

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
      setPermissionModes((prev) => new Map(prev).set(info.id, info.permissionMode || 'normal'));
      dispatch({ type: 'SESSION_INIT', sessionId: info.id });
    });

    const destroyedHandler = window.claude.on.sessionDestroyed((id) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        // Auto-switch to another session when closing the active one
        setSessionId((curr) => {
          if (curr !== id) return curr;
          return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        });
        return remaining;
      });
      setViewModes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setPermissionModes((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      dispatch({ type: 'SESSION_REMOVE', sessionId: id });
      setInitializedSessions((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });

    const hookHandler = window.claude.on.hookEvent((event) => {
      const action = hookEventToAction(event);
      if (action) {
        dispatch(action);
      }
      // First hook event for a session = Claude is initialized
      if (event.sessionId) {
        setInitializedSessions((prev) => {
          if (prev.has(event.sessionId)) return prev;
          const next = new Set(prev);
          next.add(event.sessionId);
          return next;
        });
      }
    });

    const renamedHandler = window.claude.on.sessionRenamed((sid, name) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === sid ? { ...s, name } : s)),
      );
    });

    // Sync permission mode by reading Claude Code's mode indicator from PTY output.
    // Same approach as the mobile app — just check for mode text in the output.
    const ptyModeHandler = window.claude.on.ptyOutput((sid: string, data: string) => {
      const lower = data.toLowerCase();
      let mode: PermissionMode | null = null;
      if (lower.includes('bypass permissions on')) mode = 'bypass';
      else if (lower.includes('accept edits on')) mode = 'auto-accept';
      else if (lower.includes('plan mode on')) mode = 'plan';
      else if (lower.includes('bypass permissions off')
            || lower.includes('accept edits off')
            || lower.includes('plan mode off')) mode = 'normal';
      if (mode) {
        setPermissionModes((prev) => {
          if (prev.get(sid) === mode) return prev;
          return new Map(prev).set(sid, mode!);
        });
      }
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
      window.claude.off('pty:output', ptyModeHandler);
      window.claude.off('status:data', statusHandler);
    };
  }, [dispatch]);

  // Load skills once on mount
  useEffect(() => {
    window.claude.skills.list().then(setSkills).catch(console.error);
  }, []);

  const handleOpenDrawer = useCallback((searchMode: boolean) => {
    setDrawerSearchMode(searchMode);
    setDrawerOpen(true);
  }, []);

  const handleSelectSkill = useCallback(
    (skill: SkillEntry) => {
      if (!sessionId) return;
      setDrawerOpen(false);
      dispatch({
        type: 'USER_PROMPT',
        sessionId,
        content: skill.prompt,
        timestamp: Date.now(),
      });
      window.claude.session.sendInput(sessionId, skill.prompt + '\r');
    },
    [sessionId, dispatch],
  );

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
  const canBypass = currentSession?.skipPermissions ?? false;
  const currentPermissionMode = sessionId ? (permissionModes.get(sessionId) || 'normal') : 'normal';

  const cyclePermission = useCallback(() => {
    if (!sessionId) return;
    const cycle: PermissionMode[] = canBypass
      ? ['normal', 'auto-accept', 'plan', 'bypass']
      : ['normal', 'auto-accept', 'plan'];
    const idx = cycle.indexOf(currentPermissionMode);
    const next = cycle[(idx + 1) % cycle.length];
    setPermissionModes((prev) => new Map(prev).set(sessionId, next));
    // Send Shift+Tab to the PTY to cycle Claude Code's permission mode
    window.claude.session.sendInput(sessionId, '\x1b[Z');
  }, [sessionId, canBypass, currentPermissionMode]);

  const trustGateActive = useTrustGateActive(sessionId);

  // Once trust gate activates, permanently mark the session as initialized
  // so the "Initializing" overlay doesn't reappear after trust is completed
  // (there's a gap between trust completion and the first hook event).
  useEffect(() => {
    if (trustGateActive && sessionId) {
      setInitializedSessions((prev) => {
        if (prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
    }
  }, [trustGateActive, sessionId]);

  const sessionInitialized = sessionId ? initializedSessions.has(sessionId) : true;

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
              permissionMode={currentPermissionMode}
              onCyclePermission={cyclePermission}
              model={statusData.model}
              announcement={announcementText}
            />
            <div className="flex-1 overflow-hidden relative">
              {sessions.map((s) => (
                <React.Fragment key={s.id}>
                  <ErrorBoundary name="Chat">
                    <ChatView
                      sessionId={s.id}
                      visible={s.id === sessionId && (viewModes.get(s.id) || 'chat') === 'chat'}
                    />
                  </ErrorBoundary>
                  <ErrorBoundary name="Terminal">
                    <TerminalView
                      sessionId={s.id}
                      visible={s.id === sessionId && (viewModes.get(s.id) || 'chat') === 'terminal'}
                    />
                  </ErrorBoundary>
                </React.Fragment>
              ))}
              {/* Initializing overlay — shown before Claude is ready */}
              {!sessionInitialized && sessionId && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gray-950">
                  <AppIcon className="w-16 h-16 text-gray-400 mb-6 animate-pulse" />
                  <p className="text-sm text-gray-400 font-medium">Initializing session...</p>
                </div>
              )}
              {trustGateActive && sessionId && <TrustGate sessionId={sessionId} />}
            </div>
            {currentViewMode === 'chat' && (
              <>
                <ChatInputBar sessionId={sessionId} onOpenDrawer={handleOpenDrawer} disabled={trustGateActive || !sessionInitialized} />
                <CommandDrawer
                  open={drawerOpen}
                  searchMode={drawerSearchMode}
                  skills={skills}
                  onSelect={handleSelectSkill}
                  onClose={() => setDrawerOpen(false)}
                />
                <StatusBar
                  statusData={{
                    usage: statusData.usage,
                    updateStatus: statusData.updateStatus,
                    contextPercent: statusData.contextPercent,
                    syncStatus: statusData.syncStatus,
                    syncWarnings: statusData.syncWarnings,
                  }}
                  onRunSync={!trustGateActive && sessionId ? () => {
                    dispatch({ type: 'USER_PROMPT', sessionId, content: '/sync', timestamp: Date.now() });
                    window.claude.session.sendInput(sessionId, '/sync\r');
                  } : undefined}
                />
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-sm text-gray-500">No active session</p>
            <AppIcon className="w-16 h-16 text-gray-400" />
            <button
              onClick={() => createSession('', false)}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-gray-300 text-gray-950 hover:bg-gray-200 transition-colors"
            >
              Click here to create one
            </button>
          </div>
        )}
      </div>

      {/* Game panel (conditional) */}
      {gameState.panelOpen && (
        <ErrorBoundary name="Game">
          <GamePanel connection={gameConnection} />
        </ErrorBoundary>
      )}
    </div>
  );
}

function ChatInputBar({ sessionId, onOpenDrawer, disabled }: { sessionId: string; onOpenDrawer: (searchMode: boolean) => void; disabled?: boolean }) {
  return <InputBar sessionId={sessionId} onOpenDrawer={onOpenDrawer} disabled={disabled} />;
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
