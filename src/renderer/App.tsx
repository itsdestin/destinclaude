import React, { useState, useEffect, useRef, useCallback } from 'react';
import TerminalView from './components/TerminalView';
import ChatView from './components/ChatView';
import HeaderBar from './components/HeaderBar';
import InputBar from './components/InputBar';
import { ChatProvider, useChatDispatch, useChatState } from './state/chat-context';
import { hookEventToAction } from './state/hook-dispatcher';

type ViewMode = 'chat' | 'terminal';

function AppInner() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [viewModes, setViewModes] = useState<Map<string, ViewMode>>(new Map());
  const sessionCounter = useRef(0);
  const dispatch = useChatDispatch();

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

    return () => {
      window.claude.off('session:created', createdHandler);
      window.claude.off('session:destroyed', destroyedHandler);
      window.claude.off('hook:event', hookHandler);
    };
  }, [dispatch]);

  const createSession = async () => {
    sessionCounter.current += 1;
    await window.claude.session.create({
      name: 'session-' + sessionCounter.current,
      cwd: 'C:\\Users\\desti',
      skipPermissions: false,
    });
  };

  const currentViewMode = sessionId ? (viewModes.get(sessionId) || 'chat') : 'chat';

  const handleToggleView = useCallback(
    (mode: ViewMode) => {
      if (!sessionId) return;
      setViewModes((prev) => new Map(prev).set(sessionId, mode));
    },
    [sessionId],
  );

  const currentSession = sessions.find((s) => s.id === sessionId);

  return (
    <div className="flex w-screen h-screen bg-gray-950 text-gray-200">
      {/* Sidebar */}
      <div className="w-14 bg-gray-900 flex flex-col items-center py-3 gap-3 border-r border-gray-800 shrink-0">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setSessionId(s.id)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold border-none cursor-pointer transition-colors ${
              sessionId === s.id
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            title={s.name}
          >
            {s.name.charAt(0).toUpperCase()}
          </button>
        ))}
        <button
          onClick={createSession}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl border-none cursor-pointer bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
          title="New Session"
        >
          +
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {sessions.length > 0 && sessionId && currentSession ? (
          <>
            <HeaderBar
              sessionName={currentSession.name}
              cwd={currentSession.cwd}
              viewMode={currentViewMode}
              onToggleView={handleToggleView}
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
              <ChatInputBar sessionId={sessionId} />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Click + to start a new Claude session
          </div>
        )}
      </div>
    </div>
  );
}

/** Wrapper that reads chat state to determine if input should be disabled */
function ChatInputBar({ sessionId }: { sessionId: string }) {
  const state = useChatState(sessionId);
  return <InputBar sessionId={sessionId} disabled={state.pendingApproval !== null} />;
}

export default function App() {
  return (
    <ChatProvider>
      <AppInner />
    </ChatProvider>
  );
}
