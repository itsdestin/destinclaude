import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SessionStatusColor } from './StatusDot';

function formatRelativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString();
}

interface SessionEntry {
  id: string;
  name: string;
  cwd: string;
  permissionMode: string;
}

interface Props {
  sessions: SessionEntry[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: (cwd: string, dangerous: boolean) => void;
  onCloseSession: (id: string) => void;
  sessionStatuses?: Map<string, SessionStatusColor>;
  onResumeSession: (sessionId: string, projectSlug: string) => void;
}

const DOT_COLORS: Record<SessionStatusColor, string> = {
  green: 'bg-green-400',
  red: 'bg-red-400',
  blue: 'bg-blue-400',
  gray: 'bg-gray-500',
};

function SessionDot({ color, isActive }: { color: SessionStatusColor; isActive: boolean }) {
  const breathing = color !== 'gray';
  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 shrink-0">
      <span
        className={`relative w-2 h-2 rounded-full ${DOT_COLORS[color]}`}
        style={breathing ? { animation: 'breathe 2s ease-in-out infinite' } : { opacity: isActive ? 1 : 0.5 }}
      />
    </span>
  );
}

export default function SessionStrip({
  sessions, activeSessionId, onSelectSession,
  onCreateSession, onCloseSession, sessionStatuses, onResumeSession,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCwd, setNewCwd] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const [pastSessions, setPastSessions] = useState<any[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Resolve home path on mount
  useEffect(() => {
    (window as any).claude?.getHomePath?.()
      .then((home: string) => { if (home) setNewCwd(home); })
      .catch(() => {});
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setShowNewForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleEnter = useCallback((id: string) => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    setHoveredId(id);
  }, []);

  const handleLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHoveredId(null), 80);
  }, []);

  const handleBrowse = useCallback(async () => {
    try {
      const folder = await (window as any).claude.dialog.openFolder();
      if (folder) setNewCwd(folder);
    } catch {}
  }, []);

  const handleMenuToggle = useCallback(() => {
    const opening = !menuOpen;
    setMenuOpen(opening);
    setShowNewForm(false);
    if (opening) {
      setBrowseLoading(true);
      (window as any).claude.session.browse()
        .then((list: any[]) => setPastSessions(list.slice(0, 20)))
        .catch(() => setPastSessions([]))
        .finally(() => setBrowseLoading(false));
    }
  }, [menuOpen]);

  const handleCreate = useCallback(() => {
    onCreateSession(newCwd, dangerous);
    setMenuOpen(false);
    setShowNewForm(false);
    setDangerous(false);
  }, [newCwd, dangerous, onCreateSession]);

  if (sessions.length === 0) return null;

  // With 3 or fewer sessions, all names are always visible
  const allExpanded = sessions.length <= 3;

  return (
    <div className="flex items-center gap-0.5 bg-gray-800 rounded-full px-1.5 py-0.5">
      {/* Session dots / pills */}
      {sessions.map((s) => {
        const color = sessionStatuses?.get(s.id) || 'gray';
        const isActive = s.id === activeSessionId;
        const isHovered = hoveredId === s.id;
        const anotherHovered = hoveredId !== null && hoveredId !== s.id;
        const showName = allExpanded || isHovered || (isActive && !anotherHovered);

        return (
          <button
            key={s.id}
            onClick={() => onSelectSession(s.id)}
            onMouseEnter={allExpanded ? undefined : () => handleEnter(s.id)}
            onMouseLeave={allExpanded ? undefined : handleLeave}
            className={`
              relative flex items-center gap-1 rounded-full px-1.5 py-px
              transition-all duration-150 ease-out border
              ${showName && (isActive || !allExpanded)
                ? 'border-gray-600 bg-gray-850'
                : 'border-transparent'
              }
            `}
            title={s.name}
          >
            <SessionDot color={color} isActive={isActive} />

            <span
              className="text-xs font-medium text-gray-300 whitespace-nowrap truncate overflow-hidden"
              style={{
                maxWidth: showName ? 120 : 0,
                opacity: showName ? 1 : 0,
                transition: allExpanded ? 'none' : 'max-width 200ms ease, opacity 150ms ease',
              }}
            >
              {s.name}
            </span>
          </button>
        );
      })}

      {/* Dropdown trigger */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={handleMenuToggle}
          className="flex items-center justify-center w-5 h-5 ml-1 rounded hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-300"
          title="All Sessions"
        >
          <svg className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="fixed top-auto mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden z-50" style={{ left: '50%', transform: 'translateX(-50%)' }}>
            {sessions.length > 0 && (
              <div className="py-1">
                {sessions.map((s) => {
                  const color = sessionStatuses?.get(s.id) || 'gray';
                  return (
                    <div
                      key={s.id}
                      className={`flex items-center gap-2 pr-1 transition-colors group/row ${
                        s.id === activeSessionId
                          ? 'bg-gray-800 text-gray-200'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => { onSelectSession(s.id); setMenuOpen(false); }}
                        className="flex-1 text-left px-3 py-2 flex items-center gap-2 min-w-0"
                      >
                        <SessionDot color={color} isActive={s.id === activeSessionId} />
                        <span className="text-sm truncate flex-1">{s.name}</span>
                        {s.permissionMode === 'bypass' && (
                          <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-[#DD4444]/20 text-[#DD4444]">
                            DANGER
                          </span>
                        )}
                        <span className="text-[10px] text-gray-600 truncate max-w-[100px]">
                          {s.cwd.replace(/\\/g, '/').split('/').pop()}
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onCloseSession(s.id); }}
                        className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-[#DD4444] hover:bg-gray-700 opacity-0 group-hover/row:opacity-100 transition-all"
                        title="Close Session"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t border-gray-700" />

            {/* Past sessions — resume */}
            {pastSessions.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">Resume</span>
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {pastSessions.map((ps) => (
                    <button
                      key={ps.sessionId}
                      onClick={() => {
                        onResumeSession(ps.sessionId, ps.projectSlug);
                        setMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors min-w-0"
                    >
                      <span className="text-sm truncate flex-1">{ps.name}</span>
                      <span className="text-[10px] text-gray-600 shrink-0">
                        {formatRelativeTime(ps.lastModified)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-700" />
              </>
            )}
            {browseLoading && pastSessions.length === 0 && (
              <>
                <div className="px-3 py-2 text-xs text-gray-500">Loading sessions...</div>
                <div className="border-t border-gray-700" />
              </>
            )}

            {showNewForm ? (
              <div className="p-3 flex flex-col gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Project Folder</label>
                  <button
                    onClick={handleBrowse}
                    className="w-full text-left px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-300 hover:border-gray-600 transition-colors truncate"
                  >
                    {newCwd || 'Select folder...'}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wider text-gray-500">Skip Permissions</label>
                  <button
                    onClick={() => setDangerous(!dangerous)}
                    className={`w-8 h-4.5 rounded-full relative transition-colors ${dangerous ? 'bg-[#DD4444]' : 'bg-gray-700'}`}
                  >
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${dangerous ? 'left-[calc(100%-16px)]' : 'left-0.5'}`} />
                  </button>
                </div>
                {dangerous && (
                  <p className="text-[10px] text-[#DD4444]">Claude will execute tools without asking for approval.</p>
                )}
                <button
                  onClick={handleCreate}
                  className={`w-full text-sm font-medium rounded-md py-1.5 transition-colors ${
                    dangerous
                      ? 'bg-[#DD4444] hover:bg-[#E55555] text-white'
                      : 'bg-gray-300 hover:bg-gray-200 text-gray-950'
                  }`}
                >
                  {dangerous ? 'Create (Dangerous)' : 'Create Session'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewForm(true)}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors flex items-center gap-2"
              >
                <span className="text-base leading-none">+</span>
                <span>New Session</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
