import React, { useState, useEffect, useRef, useCallback } from 'react';
import TerminalView from './components/TerminalView';
import ChatView from './components/ChatView';
import HeaderBar from './components/HeaderBar';
import InputBar from './components/InputBar';
import StatusBar from './components/StatusBar';
import ErrorBoundary from './components/ErrorBoundary';
import GamePanel from './components/game/GamePanel';
import { ChatProvider, useChatDispatch, useChatState, useChatStateMap } from './state/chat-context';
import { GameProvider, useGameState, useGameDispatch } from './state/game-context';
import { hookEventToAction } from './state/hook-dispatcher';
import { usePromptDetector } from './hooks/usePromptDetector';
import { usePartyLobby } from './hooks/usePartyLobby';
import { usePartyGame } from './hooks/usePartyGame';
import { AppIcon, WelcomeAppIcon } from './components/Icons';
import CommandDrawer from './components/CommandDrawer';
import TrustGate, { useTrustGateActive } from './components/TrustGate';
import SettingsPanel from './components/SettingsPanel';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBadge, setSettingsBadge] = useState(false);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  // Track which sessions the user has "seen" (switched to after activity completed)
  const [viewedSessions, setViewedSessions] = useState<Set<string>>(new Set());

  usePromptDetector();
  const dispatch = useChatDispatch();
  const chatStateMap = useChatStateMap();
  const gameState = useGameState();
  const gameDispatch = useGameDispatch();
  const lobby = usePartyLobby();
  const game = usePartyGame(lobby.updateStatus, lobby.challengePlayer);

  const gameConnection = {
    createGame: game.createGame,
    joinGame: game.joinGame,
    makeMove: game.makeMove,
    sendChat: game.sendChat,
    requestRematch: game.requestRematch,
    leaveGame: game.leaveGame,
    challengePlayer: game.challengePlayer,
    respondToChallenge: lobby.respondToChallenge,
  };

  // Derive session status colors for status dots
  const sessionStatuses = React.useMemo(() => {
    const statuses = new Map<string, 'green' | 'red' | 'blue' | 'gray'>();
    for (const s of sessions) {
      const chatState = chatStateMap.get(s.id);
      if (!chatState) { statuses.set(s.id, 'gray'); continue; }

      const hasAwaiting = [...chatState.toolCalls.values()].some(t => t.status === 'awaiting-approval');
      const hasRunning = [...chatState.toolCalls.values()].some(t => t.status === 'running');

      if (hasAwaiting) {
        statuses.set(s.id, 'red');
      } else if (chatState.isThinking || hasRunning) {
        statuses.set(s.id, 'green');
      } else if (chatState.timeline.length > 0 && !viewedSessions.has(s.id)) {
        statuses.set(s.id, 'blue');
      } else {
        statuses.set(s.id, 'gray');
      }
    }
    return statuses;
  }, [sessions, chatStateMap, viewedSessions]);

  useEffect(() => {
    const createdHandler = window.claude.on.sessionCreated((info) => {
      setSessions((prev) => {
        // Deduplicate — replay buffers resend session:created for existing sessions
        if (prev.some((s) => s.id === info.id)) return prev;
        dispatch({ type: 'SESSION_INIT', sessionId: info.id });
        return [...prev, info];
      });
      setSessionId((prev) => prev ?? info.id);
      setViewModes((prev) => prev.has(info.id) ? prev : new Map(prev).set(info.id, 'chat'));
      setPermissionModes((prev) => prev.has(info.id) ? prev : new Map(prev).set(info.id, info.permissionMode || 'normal'));
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
          // Broadcast so other devices transition out of Initializing too
          (window as any).claude?.remote?.broadcastAction({ type: '_SESSION_INITIALIZED', sessionId: event.sessionId });
          return next;
        });
      }
    });

    const transcriptHandler = (window.claude.on as any).transcriptEvent?.((event: any) => {
      if (!event?.type || !event?.sessionId) return;

      switch (event.type) {
        case 'user-message':
          dispatch({
            type: 'TRANSCRIPT_USER_MESSAGE',
            sessionId: event.sessionId,
            uuid: event.uuid,
            text: event.data.text,
            timestamp: event.timestamp,
          });
          break;
        case 'assistant-text':
          dispatch({
            type: 'TRANSCRIPT_ASSISTANT_TEXT',
            sessionId: event.sessionId,
            uuid: event.uuid,
            text: event.data.text,
            timestamp: event.timestamp,
          });
          break;
        case 'tool-use':
          dispatch({
            type: 'TRANSCRIPT_TOOL_USE',
            sessionId: event.sessionId,
            uuid: event.uuid,
            toolUseId: event.data.toolUseId,
            toolName: event.data.toolName,
            toolInput: event.data.toolInput || {},
          });
          break;
        case 'tool-result':
          dispatch({
            type: 'TRANSCRIPT_TOOL_RESULT',
            sessionId: event.sessionId,
            uuid: event.uuid,
            toolUseId: event.data.toolUseId,
            result: event.data.toolResult || '',
            isError: event.data.isError || false,
          });
          break;
        case 'turn-complete':
          dispatch({
            type: 'TRANSCRIPT_TURN_COMPLETE',
            sessionId: event.sessionId,
            uuid: event.uuid,
            timestamp: event.timestamp,
          });
          break;
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

    // UI action sync — receive actions broadcast from other devices
    const uiActionHandler = (window.claude.on as any).uiAction?.((action: any) => {
      if (!action?.type) return;
      // Handle session initialization sync (not a chat reducer action)
      if (action.type === '_SESSION_INITIALIZED' && action.sessionId) {
        setInitializedSessions((prev) => {
          if (prev.has(action.sessionId)) return prev;
          const next = new Set(prev);
          next.add(action.sessionId);
          return next;
        });
        return;
      }
      dispatch(action);
    });

    return () => {
      window.claude.off('session:created', createdHandler);
      window.claude.off('session:destroyed', destroyedHandler);
      window.claude.off('hook:event', hookHandler);
      window.claude.off('session:renamed', renamedHandler);
      window.claude.off('pty:output', ptyModeHandler);
      window.claude.off('status:data', statusHandler);
      if (transcriptHandler) window.claude.off('transcript:event', transcriptHandler);
      if (uiActionHandler) window.claude.off('ui:action:received', uiActionHandler);
    };
  }, [dispatch]);

  // Fetch session list on mount — catches sessions that existed before event handlers were registered
  // (e.g., remote browser reconnecting after the replay buffer events already fired)
  useEffect(() => {
    window.claude.session.list().then((list: any[]) => {
      if (!list || list.length === 0) return;
      setSessions((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const newSessions = list.filter((s) => !existingIds.has(s.id));
        if (newSessions.length === 0) return prev;
        for (const s of newSessions) {
          dispatch({ type: 'SESSION_INIT', sessionId: s.id });
          setViewModes((vm) => vm.has(s.id) ? vm : new Map(vm).set(s.id, 'chat'));
          setPermissionModes((pm) => pm.has(s.id) ? pm : new Map(pm).set(s.id, s.permissionMode || 'normal'));
        }
        return [...prev, ...newSessions];
      });
      setSessionId((prev) => prev ?? list[0].id);
      // Mark all existing sessions as initialized — they're already running,
      // so skip the "Initializing" overlay (which waits for first hook event)
      setInitializedSessions((prev) => {
        const next = new Set(prev);
        for (const s of list) next.add(s.id);
        return next;
      });
    }).catch(() => {});
  }, [dispatch]);

  // Load skills once on mount
  useEffect(() => {
    window.claude.skills.list().then(setSkills).catch(console.error);
  }, []);

  // Mark session as viewed when the user switches to it
  useEffect(() => {
    if (sessionId) {
      setViewedSessions((prev) => {
        if (prev.has(sessionId)) return prev;
        const next = new Set(prev);
        next.add(sessionId);
        return next;
      });
    }
  }, [sessionId]);

  // Clear viewed status when a session starts thinking (user sent a new message)
  useEffect(() => {
    for (const s of sessions) {
      const chatState = chatStateMap.get(s.id);
      if (chatState?.isThinking) {
        setViewedSessions((prev) => {
          if (!prev.has(s.id)) return prev;
          const next = new Set(prev);
          next.delete(s.id);
          return next;
        });
      }
    }
  }, [sessions, chatStateMap]);

  // Check if remote setup banner is active (show badge on gear icon)
  // Badge shows whenever the blue "Set Up Remote Access" banner would be visible
  // in the settings panel — i.e., no remote clients are connected
  useEffect(() => {
    const claude = (window as any).claude;
    if (!claude?.remote) return;
    const check = () => {
      claude.remote.getClientCount().then((count: number) => {
        setSettingsBadge(count === 0);
      }).catch(() => {});
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
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
        (window as any).claude?.remote?.broadcastAction({ type: '_SESSION_INITIALIZED', sessionId });
        return next;
      });
    }
  }, [trustGateActive, sessionId]);

  const sessionInitialized = sessionId ? initializedSessions.has(sessionId) : true;

  // Parse announcement
  const announcementText = statusData.announcement?.message || null;

  return (
    <div className="flex w-screen h-full bg-gray-950 text-gray-200">
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
              settingsOpen={settingsOpen}
              onToggleSettings={() => setSettingsOpen(prev => !prev)}
              settingsBadge={settingsBadge}
              sessionStatuses={sessionStatuses}
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
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-xl text-gray-500">No Active Session</p>
            <WelcomeAppIcon className="w-36 h-36 text-gray-400" />
            <div className="flex flex-col items-center gap-2 mt-1">
              <button
                onClick={() => createSession('', false)}
                className="px-8 py-2 text-base font-medium rounded-lg bg-gray-300 text-gray-950 hover:bg-gray-200 transition-colors"
              >
                New Session
              </button>
              <button
                onClick={() => createSession('', true)}
                className="px-6 py-1 rounded-lg bg-red-600/40 hover:bg-red-600/60 text-red-200 transition-colors flex flex-col items-center"
              >
                <span className="text-sm font-medium leading-none">New Session</span>
                <span className="text-[10px] text-red-300/70 font-normal leading-tight">Dangerous Mode</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Game panel (conditional) */}
      {gameState.panelOpen && (
        <ErrorBoundary name="Game">
          <GamePanel connection={gameConnection} />
        </ErrorBoundary>
      )}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSendInput={(text) => {
          if (sessionId) {
            const claude = (window as any).claude;
            claude.session.sendInput(sessionId, text + '\r');
          }
        }}
        hasActiveSession={!!sessionId}
      />
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
