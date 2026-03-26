import React, { useState, useRef, useEffect, useCallback } from 'react';

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
}

export default function SessionSelector({ sessions, activeSessionId, onSelectSession, onCreateSession, onCloseSession }: Props) {
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCwd, setNewCwd] = useState('');
  const [dangerous, setDangerous] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Resolve home path asynchronously on mount
  useEffect(() => {
    window.claude.getHomePath?.()
      .then((home: string) => { if (home) setNewCwd(home); })
      .catch(() => {});
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const displayName = activeSession?.name || 'No Session';

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNewForm(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((id: string) => {
    onSelectSession(id);
    setOpen(false);
    setShowNewForm(false);
  }, [onSelectSession]);

  const handleBrowse = useCallback(async () => {
    try {
      const folder = await window.claude.dialog.openFolder();
      if (folder) setNewCwd(folder);
    } catch (err) {
      console.error('Failed to open folder dialog:', err);
    }
  }, []);

  const handleCreate = useCallback(() => {
    onCreateSession(newCwd, dangerous);
    setOpen(false);
    setShowNewForm(false);
    setDangerous(false);
  }, [newCwd, dangerous, onCreateSession]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger — centered session name */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-800 transition-colors"
      >
        <span className="text-sm font-medium text-gray-200 truncate max-w-[120px] sm:max-w-[350px]">
          {displayName}
        </span>
        <svg
          className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
          {/* Session list */}
          {sessions.length > 0 && (
            <div className="py-1">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 pr-1 transition-colors group/row ${
                    s.id === activeSessionId
                      ? 'bg-gray-800 text-gray-200'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <button
                    onClick={() => handleSelect(s.id)}
                    className="flex-1 text-left px-3 py-2 flex items-center gap-2 min-w-0"
                  >
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
                    title="Close session"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-700" />

          {/* New session section */}
          {showNewForm ? (
            <div className="p-3 flex flex-col gap-2">
              {/* Folder picker */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 block">Project Folder</label>
                <button
                  onClick={handleBrowse}
                  className="w-full text-left px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-300 hover:border-gray-600 transition-colors truncate"
                >
                  {newCwd || 'Select folder...'}
                </button>
              </div>

              {/* Permission mode toggle */}
              <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase tracking-wider text-gray-500">Skip Permissions</label>
                <button
                  onClick={() => setDangerous(!dangerous)}
                  className={`w-8 h-4.5 rounded-full relative transition-colors ${
                    dangerous ? 'bg-[#DD4444]' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      dangerous ? 'left-[calc(100%-16px)]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              {dangerous && (
                <p className="text-[10px] text-[#DD4444]">
                  Claude will execute tools without asking for approval.
                </p>
              )}

              {/* Create button */}
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
  );
}
