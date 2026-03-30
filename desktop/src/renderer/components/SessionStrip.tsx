import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SessionStatusColor } from './StatusDot';

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
  onOpenResumeBrowser: () => void;
  onReorderSessions?: (fromIndex: number, toIndex: number) => void;
}

/* ── Status dot color maps ───────────────────────────────── */

const DOT_BG: Record<SessionStatusColor, string> = {
  green: 'bg-green-400',
  red: 'bg-red-400',
  blue: 'bg-blue-400',
  gray: 'bg-gray-500',
};

const GLOW_SHADOW: Record<SessionStatusColor, string> = {
  green: '0 0 6px rgba(76,175,80,0.35)',
  red: '0 0 6px rgba(221,68,68,0.35)',
  blue: '0 0 6px rgba(96,165,250,0.35)',
  gray: 'none',
};

const INDICATOR_COLOR: Record<SessionStatusColor, string> = {
  green: '#4CAF50',
  red: '#DD4444',
  blue: '#60A5FA',
  gray: '#666666',
};

function SessionDot({ color, isActive }: { color: SessionStatusColor; isActive: boolean }) {
  const breathing = color !== 'gray';
  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5 shrink-0">
      <span
        className={`relative w-2 h-2 rounded-full ${DOT_BG[color]}`}
        style={breathing ? { animation: 'breathe 2s ease-in-out infinite' } : { opacity: isActive ? 1 : 0.5 }}
      />
    </span>
  );
}

/* ── Drag grip icon (6-dot braille pattern) ──────────────── */

function DragGrip() {
  return (
    <svg className="w-3 h-3 text-gray-600" viewBox="0 0 12 16" fill="currentColor">
      <circle cx="3.5" cy="2" r="1.2" />
      <circle cx="8.5" cy="2" r="1.2" />
      <circle cx="3.5" cy="8" r="1.2" />
      <circle cx="8.5" cy="8" r="1.2" />
      <circle cx="3.5" cy="14" r="1.2" />
      <circle cx="8.5" cy="14" r="1.2" />
    </svg>
  );
}

/* ── Main component ──────────────────────────────────────── */

export default function SessionStrip({
  sessions, activeSessionId, onSelectSession,
  onCreateSession, onCloseSession, sessionStatuses, onResumeSession,
  onOpenResumeBrowser, onReorderSessions,
}: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCwd, setNewCwd] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* ── Pointer-event drag state ──────────────────────────── */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragLabel, setDragLabel] = useState<string>('');
  const [dragColor, setDragColor] = useState<SessionStatusColor>('gray');
  // Track whether pointer moved enough to distinguish drag from click
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  // Suppress the click that fires after a drag release
  const suppressClick = useRef(false);

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
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
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
    setMenuOpen(prev => !prev);
    setShowNewForm(false);
  }, []);

  const handleCreate = useCallback(() => {
    onCreateSession(newCwd, dangerous);
    setMenuOpen(false);
    setShowNewForm(false);
    setDangerous(false);
  }, [newCwd, dangerous, onCreateSession]);

  /* ── Pointer-event drag handlers ───────────────────────── */

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    // Only primary button
    if (e.button !== 0) return;
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;

    const s = sessions[idx];
    // Capture label + color eagerly so pointermove can start immediately
    setDragIdx(idx);
    setDragLabel(s.name);
    setDragColor(sessionStatuses?.get(s.id) || 'gray');

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [sessions, sessionStatuses]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx === null || !dragOrigin.current) return;

    // Require 5px movement to start drag (prevents accidental drags on click)
    if (!isDragging.current) {
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      isDragging.current = true;
      suppressClick.current = true;
    }

    setDragPos({ x: e.clientX, y: e.clientY });

    // Hit-test: find which session element the pointer is over
    const els = document.querySelectorAll('[data-session-idx]');
    let closest: number | null = null;
    els.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        closest = parseInt((el as HTMLElement).dataset.sessionIdx!, 10);
      }
    });
    setOverIdx(closest !== dragIdx ? closest : null);
  }, [dragIdx]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragIdx !== null && isDragging.current && overIdx !== null && onReorderSessions) {
      onReorderSessions(dragIdx, overIdx);
    }
    // Reset all drag state
    setDragIdx(null);
    setOverIdx(null);
    setDragPos(null);
    dragOrigin.current = null;
    isDragging.current = false;

    // Allow the suppressClick flag to clear after the click event fires
    setTimeout(() => { suppressClick.current = false; }, 0);
  }, [dragIdx, overIdx, onReorderSessions]);

  const handleClick = useCallback((id: string) => {
    if (suppressClick.current) return;
    onSelectSession(id);
  }, [onSelectSession]);

  if (sessions.length === 0) return null;

  const allExpanded = sessions.length <= 3;
  const dragging = dragIdx !== null && isDragging.current && dragPos !== null;

  return (
    <>
      <div className="flex items-center gap-0.5 bg-gray-800 rounded-full px-1.5 py-0.5">
        {/* ── Session pills ──────────────────────────────── */}
        {sessions.map((s, idx) => {
          const color = sessionStatuses?.get(s.id) || 'gray';
          const isActive = s.id === activeSessionId;
          const isHovered = hoveredId === s.id;
          const anotherHovered = hoveredId !== null && hoveredId !== s.id;
          const showName = allExpanded || isHovered || (isActive && !anotherHovered);
          const isBeingDragged = dragIdx === idx && isDragging.current;
          const isOver = overIdx === idx;

          return (
            <React.Fragment key={s.id}>
              {/* Insertion line — rendered before the pill when this is the drop target */}
              {isOver && dragIdx !== null && idx <= dragIdx && (
                <div className="w-0.5 h-4 rounded-full bg-blue-400 shrink-0 transition-all duration-150" />
              )}
              <button
                data-session-idx={idx}
                onPointerDown={(e) => handlePointerDown(e, idx)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={() => handleClick(s.id)}
                onMouseEnter={allExpanded ? undefined : () => handleEnter(s.id)}
                onMouseLeave={allExpanded ? undefined : handleLeave}
                className={`
                  relative flex items-center gap-1 rounded-full px-1.5 py-px
                  border select-none touch-none
                  ${showName && (isActive || !allExpanded)
                    ? 'border-gray-600 bg-gray-850'
                    : 'border-transparent'
                  }
                  ${isBeingDragged ? 'opacity-30 scale-95' : ''}
                `}
                style={{
                  transition: isBeingDragged
                    ? 'opacity 150ms, transform 150ms'
                    : 'all 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transform: (!isBeingDragged && isHovered && !isActive) ? 'scale(1.04)' : undefined,
                  boxShadow: isActive ? GLOW_SHADOW[color] : undefined,
                  cursor: isBeingDragged ? 'grabbing' : 'grab',
                }}
                title={s.name}
              >
                <SessionDot color={color} isActive={isActive} />
                <span
                  className="text-xs font-medium text-gray-300 whitespace-nowrap overflow-hidden"
                  style={{
                    maxWidth: showName ? (isActive ? 'none' : 120) : 0,
                    opacity: showName ? 1 : 0,
                    transition: allExpanded ? 'none' : 'max-width 200ms ease, opacity 150ms ease',
                  }}
                >
                  {s.name}
                </span>
                {/* Active indicator bar */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full"
                    style={{ background: `linear-gradient(90deg, transparent, ${INDICATOR_COLOR[color]}, transparent)` }}
                  />
                )}
              </button>
              {/* Insertion line — rendered after the pill */}
              {isOver && dragIdx !== null && idx > dragIdx && (
                <div className="w-0.5 h-4 rounded-full bg-blue-400 shrink-0 transition-all duration-150" />
              )}
            </React.Fragment>
          );
        })}

        {/* ── Dropdown trigger ───────────────────────────── */}
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

          {/* ── Dropdown menu ──────────────────────────────── */}
          {menuOpen && (
            <div
              className="fixed top-auto mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden z-50"
              style={{
                left: '50%',
                animation: 'dropdown-in 120ms cubic-bezier(0.16, 1, 0.3, 1) both',
              }}
            >
              {sessions.length > 0 && (
                <div className="py-1">
                  {sessions.map((s, idx) => {
                    const color = sessionStatuses?.get(s.id) || 'gray';
                    const isBeingDragged = dragIdx === idx && isDragging.current;
                    const isOver = overIdx === idx;
                    return (
                      <div
                        key={s.id}
                        data-session-idx={idx}
                        onPointerDown={(e) => handlePointerDown(e, idx)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        className={`relative flex items-start pr-1 group/row select-none touch-none ${
                          s.id === activeSessionId
                            ? 'bg-gray-800 text-gray-200'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        } ${isBeingDragged ? 'opacity-30' : ''}`}
                        style={{
                          animation: `row-fade-in 100ms ease both`,
                          animationDelay: `${idx * 20}ms`,
                          transition: 'opacity 150ms, background 150ms',
                          cursor: isBeingDragged ? 'grabbing' : 'default',
                          borderTop: isOver && dragIdx !== null && idx <= dragIdx ? '2px solid #60A5FA' : undefined,
                          borderBottom: isOver && dragIdx !== null && idx > dragIdx ? '2px solid #60A5FA' : undefined,
                        }}
                      >
                        {/* Drag grip — visible on hover */}
                        <span className="shrink-0 flex items-center pl-1.5 pt-2.5 opacity-0 group-hover/row:opacity-100 transition-opacity cursor-grab">
                          <DragGrip />
                        </span>
                        <button
                          onClick={() => { if (!suppressClick.current) { onSelectSession(s.id); setMenuOpen(false); } }}
                          className="flex-1 text-left pl-1 pr-3 py-2 flex items-start gap-2 min-w-0"
                        >
                          <span className="mt-0.5"><SessionDot color={color} isActive={s.id === activeSessionId} /></span>
                          <span className="text-[13px] leading-snug flex-1 min-w-0 line-clamp-2">{s.name}</span>
                          <span className="shrink-0 flex items-center gap-1.5 ml-auto">
                            {s.permissionMode === 'bypass' && (
                              <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-[#DD4444]/20 text-[#DD4444]">
                                DANGER
                              </span>
                            )}
                            <span className="text-[10px] text-gray-600 whitespace-nowrap">
                              {s.cwd.replace(/\\/g, '/').split('/').pop()}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onCloseSession(s.id); }}
                          className="absolute right-1 top-2 shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-[#DD4444] hover:bg-gray-700 opacity-0 group-hover/row:opacity-100 transition-all"
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
                <div className="flex">
                  <button
                    onClick={() => { setMenuOpen(false); onOpenResumeBrowser(); }}
                    className="flex-1 px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Resume</span>
                  </button>
                  {/* Gradient divider */}
                  <div className="w-px my-0.5" style={{ background: 'linear-gradient(to bottom, transparent, #555555, transparent)' }} />
                  <button
                    onClick={() => setShowNewForm(true)}
                    className="flex-1 px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span className="text-base leading-none">+</span>
                    <span>New Session</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Floating drag clone (portal) ─────────────────── */}
      {dragging && dragPos && (
        <div
          className="fixed z-[9999] pointer-events-none flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-gray-800 border border-gray-600 shadow-lg shadow-black/40"
          style={{
            left: dragPos.x,
            top: dragPos.y,
            transform: 'translate(-50%, -50%) scale(1.05)',
          }}
        >
          <SessionDot color={dragColor} isActive />
          <span className="text-xs font-medium text-gray-200 whitespace-nowrap max-w-[180px] truncate">
            {dragLabel}
          </span>
        </div>
      )}
    </>
  );
}
