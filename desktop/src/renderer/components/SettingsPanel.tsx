import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { isAndroid } from '../platform';
import { useTheme, THEMES, type ThemeName } from '../state/theme-context';

// Local Font Access API — available in Chromium/Electron
declare function queryLocalFonts(): Promise<{ family: string; fullName: string; postScriptName: string; style: string }[]>;

interface RemoteConfig {
  enabled: boolean;
  port: number;
  hasPassword: boolean;
  trustTailscale: boolean;
  keepAwakeHours: number;
  clientCount: number;
}

const KEEP_AWAKE_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1h', value: 1 },
  { label: '4h', value: 4 },
  { label: '8h', value: 8 },
  { label: '24h', value: 24 },
];

interface TailscaleInfo {
  installed: boolean;
  ip: string | null;
  hostname: string | null;
  url: string | null;
}

interface ClientInfo {
  id: string;
  ip: string;
  connectedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSendInput: (text: string) => void;
  hasActiveSession: boolean;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function SettingsPanel({ open, onClose, onSendInput, hasActiveSession }: Props) {
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-80 bg-panel border-r border-edge-dim z-50 transform transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
            <h2 className="text-sm font-bold text-fg">Settings</h2>
            <button
              onClick={onClose}
              className="text-fg-muted hover:text-fg-2 text-lg leading-none"
            >
              ✕
            </button>
          </div>

          {isAndroid() ? (
            <AndroidSettings open={open} onClose={onClose} />
          ) : (
            <DesktopSettings
              open={open}
              onClose={onClose}
              onSendInput={onSendInput}
              hasActiveSession={hasActiveSession}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Toggle component (shared) ──────────────────────────────────────────────

function Toggle({ enabled, onToggle, color = 'green' }: { enabled: boolean; onToggle: () => void; color?: 'green' | 'red' }) {
  const bg = enabled
    ? color === 'red' ? 'bg-red-600' : 'bg-green-600'
    : 'bg-inset';
  return (
    <button
      onClick={onToggle}
      className={`w-8 h-4 rounded-full transition-colors relative ${bg}`}
    >
      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
        enabled ? 'left-4' : 'left-0.5'
      }`} />
    </button>
  );
}

// ─── Theme selector (shared) ───────────────────────────────────────────────

const THEME_LABELS: Record<ThemeName, string> = {
  light: 'Light',
  dark: 'Dark',
  midnight: 'Midnight',
  creme: 'Crème',
};

const THEME_DESCRIPTIONS: Record<ThemeName, string> = {
  light: 'Neutral grays, easy on the eyes',
  dark: 'Pure neutral dark',
  midnight: 'Deep navy with blue tint',
  creme: 'Warm parchment tones',
};

// Preview swatches — the 4 surface colors for each theme
const THEME_SWATCHES: Record<ThemeName, { canvas: string; panel: string; inset: string; fg: string; accent: string }> = {
  light:    { canvas: '#F2F2F2', panel: '#EAEAEA', inset: '#E0E0E0', fg: '#1A1A1A', accent: '#1A1A1A' },
  dark:     { canvas: '#111111', panel: '#191919', inset: '#222222', fg: '#E0E0E0', accent: '#D4D4D4' },
  midnight: { canvas: '#0D1117', panel: '#161B22', inset: '#21262D', fg: '#C9D1D9', accent: '#B1BAC4' },
  creme:    { canvas: '#F0E6D6', panel: '#EBE1D1', inset: '#DDD1BE', fg: '#2C2418', accent: '#3D3229' },
};

/** Extract display name from font CSS value (strips quotes and fallbacks) */
function fontDisplayName(font: string): string {
  const first = font.split(',')[0].trim();
  return first.replace(/^['"]|['"]$/g, '');
}

// Fallback fonts shown when queryLocalFonts() is unavailable (remote browser)
const FALLBACK_FONTS = [
  'Arial', 'Cascadia Mono', 'Cascadia Code', 'Consolas', 'Courier New',
  'Fira Code', 'Georgia', 'Helvetica', 'Inter', 'JetBrains Mono',
  'Menlo', 'Monaco', 'Roboto', 'San Francisco', 'Segoe UI',
  'SF Mono', 'Source Code Pro', 'System UI', 'Times New Roman', 'Verdana',
];

function ThemeSelector() {
  const { theme, setTheme, cycleList, setCycleList, font, setFont } = useTheme();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'fonts'>('main');
  const [fontSearch, setFontSearch] = useState('');
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  const [fontsLoading, setFontsLoading] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggleCycle = useCallback((t: ThemeName) => {
    const isIn = cycleList.includes(t);
    if (isIn) {
      if (cycleList.length <= 1) return;
      setCycleList(cycleList.filter((x) => x !== t));
    } else {
      setCycleList(THEMES.filter((x) => cycleList.includes(x) || x === t));
    }
  }, [cycleList, setCycleList]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
        // Reset view when closing
        setTimeout(() => setView('main'), 300);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Load system fonts when font view opens
  useEffect(() => {
    if (view !== 'fonts' || systemFonts !== null) return;
    setFontsLoading(true);

    if (typeof queryLocalFonts === 'function') {
      queryLocalFonts().then((fonts: any[]) => {
        const families = new Set<string>();
        for (const f of fonts) families.add(f.family);
        const sorted = [...families].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        setSystemFonts(sorted);
        setFontsLoading(false);
      }).catch(() => {
        setSystemFonts(FALLBACK_FONTS);
        setFontsLoading(false);
      });
    } else {
      setSystemFonts(FALLBACK_FONTS);
      setFontsLoading(false);
    }
  }, [view, systemFonts]);

  // Auto-focus search when entering font view
  useEffect(() => {
    if (view === 'fonts') {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [view]);

  const filteredFonts = systemFonts?.filter((f) =>
    f.toLowerCase().includes(fontSearch.toLowerCase())
  ) ?? [];

  const currentFontName = fontDisplayName(font);
  const sw = THEME_SWATCHES[theme];

  return (
    <section>
      <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Appearance</h3>

      {/* Current theme row */}
      <button
        onClick={() => { setView('main'); setOpen(true); }}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-left"
      >
        <div className="flex rounded overflow-hidden shrink-0" style={{ width: 32, height: 20 }}>
          <div style={{ flex: 1, background: sw.canvas }} />
          <div style={{ flex: 1, background: sw.panel }} />
          <div style={{ flex: 1, background: sw.inset }} />
          <div style={{ flex: 1, background: sw.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-fg font-medium">{THEME_LABELS[theme]}</span>
          <span className="text-[10px] text-fg-muted ml-2">{currentFontName}</span>
        </div>
        <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Popup overlay */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[60]" onClick={() => { setOpen(false); setTimeout(() => setView('main'), 300); }} />
          <div
            ref={popupRef}
            className="fixed z-[61] rounded-xl bg-panel border border-edge shadow-2xl overflow-hidden"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 340,
              maxHeight: '80vh',
            }}
          >
            {view === 'main' ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
                  <h3 className="text-sm font-bold text-fg">Appearance</h3>
                  <button onClick={() => { setOpen(false); setTimeout(() => setView('main'), 300); }} className="text-fg-muted hover:text-fg-2 text-lg leading-none">✕</button>
                </div>

                <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 52px)' }}>
                  {/* Theme cards */}
                  {THEMES.map((t) => {
                    const s = THEME_SWATCHES[t];
                    const isActive = theme === t;
                    const inCycle = cycleList.includes(t);
                    return (
                      <div
                        key={t}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isActive ? 'border-accent bg-accent/10' : 'border-edge-dim hover:border-edge'
                        }`}
                      >
                        <button
                          onClick={() => { setTheme(t); setOpen(false); setTimeout(() => setView('main'), 300); }}
                          className="flex items-start gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="shrink-0 rounded-md overflow-hidden border border-edge-dim" style={{ width: 56, height: 40, background: s.canvas }}>
                            <div style={{ height: 6, background: s.panel, borderBottom: `1px solid ${s.inset}` }} />
                            <div style={{ padding: '3px 4px' }}>
                              <div style={{ height: 3, width: '80%', borderRadius: 1, background: s.fg, opacity: 0.4, marginBottom: 2 }} />
                              <div style={{ height: 3, width: '55%', borderRadius: 1, background: s.fg, opacity: 0.25, marginBottom: 3 }} />
                              <div style={{ height: 5, width: '100%', borderRadius: 2, background: s.inset }} />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${isActive ? 'text-fg' : 'text-fg-2'}`}>{THEME_LABELS[t]}</span>
                              {isActive && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-accent text-on-accent">Active</span>}
                            </div>
                            <p className="text-[10px] text-fg-muted mt-0.5">{THEME_DESCRIPTIONS[t]}</p>
                            <div className="flex gap-1 mt-1.5">
                              {[s.canvas, s.panel, s.inset, s.accent, s.fg].map((color, i) => (
                                <div key={i} className="w-3.5 h-3.5 rounded-full border border-edge-dim" style={{ background: color }} />
                              ))}
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCycle(t); }}
                          className={`shrink-0 mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                            inCycle ? 'bg-accent border-accent' : 'bg-transparent border-edge hover:border-fg-dim'
                          }`}
                          title={inCycle ? 'Remove from quick cycle' : 'Add to quick cycle'}
                        >
                          {inCycle && (
                            <svg className="w-3 h-3 text-on-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      </div>
                    );
                  })}

                  <p className="text-[9px] text-fg-faint text-center pt-1">
                    Checked themes appear in the status bar cycle
                  </p>

                  {/* Divider */}
                  <div className="border-t border-edge-dim my-1" />

                  {/* Font row — opens font browser */}
                  <button
                    onClick={() => { setView('fonts'); setFontSearch(''); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-edge-dim hover:border-edge transition-colors text-left"
                  >
                    <span className="text-lg shrink-0 leading-none text-fg-dim">Aa</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-fg font-medium">Font</span>
                      <p className="text-[10px] text-fg-muted truncate" style={{ fontFamily: font }}>{currentFontName}</p>
                    </div>
                    <svg className="w-3.5 h-3.5 text-fg-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Font browser header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-edge">
                  <button
                    onClick={() => setView('main')}
                    className="text-fg-muted hover:text-fg-2 shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h3 className="text-sm font-bold text-fg">Font</h3>
                  <button onClick={() => { setOpen(false); setTimeout(() => setView('main'), 300); }} className="text-fg-muted hover:text-fg-2 text-lg leading-none ml-auto">✕</button>
                </div>

                {/* Search */}
                <div className="px-3 pt-3 pb-2">
                  <input
                    ref={searchRef}
                    type="text"
                    value={fontSearch}
                    onChange={(e) => setFontSearch(e.target.value)}
                    placeholder="Search fonts..."
                    className="w-full px-3 py-1.5 rounded-lg bg-well border border-edge-dim text-xs text-fg placeholder-fg-muted focus:outline-none focus:border-fg-dim"
                  />
                </div>

                {/* Font list */}
                <div className="overflow-y-auto px-1 pb-2" style={{ maxHeight: 'calc(80vh - 120px)' }}>
                  {fontsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <span className="text-xs text-fg-muted">Loading fonts...</span>
                    </div>
                  ) : filteredFonts.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <span className="text-xs text-fg-muted">No fonts found</span>
                    </div>
                  ) : (
                    filteredFonts.map((f) => {
                      const isSelected = currentFontName === f;
                      return (
                        <button
                          key={f}
                          onClick={() => {
                            setFont(`'${f}', sans-serif`);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 mx-1 rounded-lg text-left transition-colors ${
                            isSelected
                              ? 'bg-accent/10 border border-accent'
                              : 'hover:bg-inset/50 border border-transparent'
                          }`}
                        >
                          <span
                            className={`text-sm flex-1 truncate ${isSelected ? 'text-fg font-medium' : 'text-fg-2'}`}
                            style={{ fontFamily: `'${f}', sans-serif` }}
                          >
                            {f}
                          </span>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Android Settings ───────────────────────────────────────────────────────

interface PairedDevice {
  name: string;
  host: string;
  port: number;
  password: string;
}

function AndroidSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('CORE');
  const [directories, setDirectories] = useState<{ label: string; path: string }[]>([]);
  const [aboutInfo, setAboutInfo] = useState<{ version: string; build: string } | null>(null);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [formName, setFormName] = useState('Desktop');
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState('9900');
  const [formPassword, setFormPassword] = useState('');
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [connectedDeviceName, setConnectedDeviceName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const claude = (window as any).claude;

  // Sync remote connection state
  useEffect(() => {
    import('../platform').then(({ isRemoteMode, onConnectionModeChange }) => {
      setRemoteConnected(isRemoteMode());
      const unsub = onConnectionModeChange((mode) => {
        setRemoteConnected(mode === 'remote');
      });
      return unsub;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setShowConnectForm(false);
    Promise.all([
      claude.android?.getTier?.() ?? 'CORE',
      claude.android?.getDirectories?.() ?? [],
      claude.android?.getAbout?.() ?? { version: 'unknown', build: '' },
      claude.android?.getPairedDevices?.() ?? [],
    ]).then(([t, dirs, about, devices]) => {
      setTier(t?.tier || t || 'CORE');
      setDirectories(dirs?.directories || dirs || []);
      setAboutInfo(about);
      setPairedDevices(devices?.devices || devices || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open]);

  const handleSetTier = useCallback(async (newTier: string) => {
    const result = await claude.android?.setTier?.(newTier);
    setTier(newTier);
    if (result?.restartRequired) {
      // The bridge handles restart prompt natively
    }
  }, []);

  const handleRemoveDirectory = useCallback(async (path: string) => {
    await claude.android?.removeDirectory?.(path);
    setDirectories(prev => prev.filter(d => d.path !== path));
  }, []);

  const doConnect = useCallback(async (device: PairedDevice) => {
    setConnecting(true);
    setConnectError(null);
    try {
      const { connectToHost } = await import('../remote-shim');
      await connectToHost(device.host, device.port, device.password);
      setConnectedDeviceName(device.name);
      onClose();
    } catch (err: any) {
      setConnectError(err?.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  }, [onClose]);

  const handleSaveDevice = useCallback(async () => {
    if (!formHost.trim()) return;
    const device: PairedDevice = {
      name: formName.trim() || 'Desktop',
      host: formHost.trim(),
      port: parseInt(formPort) || 9900,
      password: formPassword,
    };
    await claude.android?.savePairedDevice?.(device);
    setPairedDevices(prev => [...prev.filter(d => d.host !== device.host || d.port !== device.port), device]);
    setShowConnectForm(false);
    setFormName('Desktop');
    setFormHost('');
    setFormPort('9900');
    setFormPassword('');
    // Connect immediately after saving
    await doConnect(device);
  }, [formName, formHost, formPort, formPassword, doConnect]);

  const handleRemoveDevice = useCallback(async (device: PairedDevice) => {
    await claude.android?.removePairedDevice?.(device.host, device.port);
    setPairedDevices(prev => prev.filter(d => d.host !== device.host || d.port !== device.port));
  }, []);

  const handleConnectToDesktop = useCallback(async (device: PairedDevice) => {
    await doConnect(device);
  }, [doConnect]);

  const handleDisconnect = useCallback(async () => {
    setConnecting(true);
    try {
      const { disconnectFromHost } = await import('../remote-shim');
      await disconnectFromHost();
      setConnectedDeviceName('');
    } catch (err: any) {
      setConnectError(err?.message || 'Disconnect failed');
    } finally {
      setConnecting(false);
    }
  }, []);

  const handleScanQr = useCallback(async () => {
    const result = await claude.android?.scanQr?.();
    if (result?.url) {
      try {
        const u = new URL(result.url);
        setFormHost(u.hostname);
        setFormPort(u.port || '9900');
        setShowConnectForm(true);
      } catch { /* invalid URL */ }
    }
  }, []);

  const TIERS = [
    { id: 'CORE', name: 'Core', desc: 'Personal assistant — journal, inbox, briefings' },
    { id: 'DEVELOPER', name: 'Developer', desc: 'Core + git, tests, code review' },
    { id: 'FULL_DEV', name: 'Full Dev', desc: 'Everything — all dev tools included' },
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-6">

        <ThemeSelector />

        {/* Package Tier */}
        <section>
          <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Package Tier</h3>
          <div className="space-y-1">
            {TIERS.map(t => (
              <button
                key={t.id}
                onClick={() => handleSetTier(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-colors ${
                  tier === t.id ? 'bg-inset' : 'hover:bg-inset/50'
                }`}
              >
                <span className={`text-[10px] ${tier === t.id ? 'text-fg' : 'text-fg-faint'}`}>
                  {tier === t.id ? '●' : '○'}
                </span>
                <div>
                  <span className="text-xs text-fg font-medium">{t.name}</span>
                  <p className="text-[10px] text-fg-muted">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Project Directories */}
        <section>
          <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Project Directories</h3>
          {directories.length > 0 ? (
            <div className="space-y-1">
              {directories.map(dir => (
                <div key={dir.path} className="flex items-center justify-between py-1.5 px-2 rounded bg-inset/50">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-fg-2 block truncate">{dir.label}</span>
                    <span className="text-[10px] text-fg-faint block truncate font-mono">{dir.path}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveDirectory(dir.path)}
                    className="text-fg-faint hover:text-red-400 text-sm leading-none px-1 shrink-0 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-fg-faint">No custom directories. Home (~) is always available.</p>
          )}
        </section>

        {/* Connect to Desktop */}
        <section>
          <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Connect to Desktop</h3>

          {/* Connection status banner */}
          {remoteConnected && (
            <div className="bg-green-500/10 border border-green-500/25 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-400 font-medium">
                  Connected to {connectedDeviceName || 'Desktop'}
                </span>
              </div>
              <button
                onClick={handleDisconnect}
                disabled={connecting}
                className="w-full px-3 py-1.5 rounded bg-inset hover:bg-edge text-xs text-fg-2 disabled:opacity-50"
              >
                {connecting ? 'Disconnecting...' : 'Disconnect — Return to Local'}
              </button>
            </div>
          )}

          {connectError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-2 mb-3">
              <p className="text-[10px] text-red-400">{connectError}</p>
            </div>
          )}

          {/* Paired devices — hidden when connected to remote */}
          {!remoteConnected && pairedDevices.length > 0 && (
            <div className="space-y-1 mb-3">
              {pairedDevices.map(device => (
                <div key={`${device.host}:${device.port}`} className="flex items-center justify-between py-2 px-3 rounded bg-inset/50">
                  <button
                    onClick={() => handleConnectToDesktop(device)}
                    disabled={connecting}
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                  >
                    <span className="text-xs text-fg block">{device.name}</span>
                    <span className="text-[10px] text-fg-muted font-mono block">{device.host}:{device.port}</span>
                  </button>
                  <button
                    onClick={() => handleRemoveDevice(device)}
                    className="text-fg-faint hover:text-red-400 text-sm leading-none px-1 shrink-0 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {connecting && (
            <div className="text-center py-3">
              <span className="text-xs text-fg-dim">Connecting...</span>
            </div>
          )}

          {!remoteConnected && !connecting && !showConnectForm ? (
            <div className="space-y-2">
              <button
                onClick={handleScanQr}
                className="w-full px-3 py-2 rounded bg-accent text-on-accent text-xs font-medium active:brightness-110"
              >
                Scan QR Code
              </button>
              <button
                onClick={() => setShowConnectForm(true)}
                className="w-full px-3 py-2 rounded border border-edge text-fg-dim text-xs active:bg-inset"
              >
                Enter Manually
              </button>
            </div>
          ) : (
            <div className="space-y-3 bg-inset/50 rounded-lg p-3">
              <div>
                <label className="text-[10px] text-fg-muted uppercase tracking-wider block mb-1">Device Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="My Desktop"
                  className="w-full px-2 py-1.5 rounded bg-well border border-edge-dim text-xs text-fg focus:outline-none focus:border-fg-muted"
                />
              </div>
              <div>
                <label className="text-[10px] text-fg-muted uppercase tracking-wider block mb-1">Host / IP</label>
                <input
                  type="text"
                  value={formHost}
                  onChange={e => setFormHost(e.target.value)}
                  placeholder="100.x.x.x"
                  className="w-full px-2 py-1.5 rounded bg-well border border-edge-dim text-xs text-fg focus:outline-none focus:border-fg-muted"
                />
              </div>
              <div>
                <label className="text-[10px] text-fg-muted uppercase tracking-wider block mb-1">Port</label>
                <input
                  type="text"
                  value={formPort}
                  onChange={e => setFormPort(e.target.value)}
                  placeholder="9900"
                  className="w-full px-2 py-1.5 rounded bg-well border border-edge-dim text-xs text-fg focus:outline-none focus:border-fg-muted"
                />
              </div>
              <div>
                <label className="text-[10px] text-fg-muted uppercase tracking-wider block mb-1">Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  placeholder="Remote access password"
                  className="w-full px-2 py-1.5 rounded bg-well border border-edge-dim text-xs text-fg focus:outline-none focus:border-fg-muted"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConnectForm(false)}
                  className="px-3 py-1.5 rounded bg-inset hover:bg-edge text-xs text-fg-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDevice}
                  disabled={!formHost.trim()}
                  className="flex-1 px-3 py-1.5 rounded bg-accent text-on-accent text-xs font-medium disabled:opacity-50 active:brightness-110"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-fg-faint mt-3">
            Connect to the DestinCode desktop app on your computer. Set up remote access in the desktop app's settings first.
          </p>
        </section>
      </div>

      {/* Footer — About + Donate */}
      <div className="border-t border-edge px-4 py-3 space-y-2">
        {aboutInfo && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-fg-faint">DestinCode {aboutInfo.version}</span>
            {aboutInfo.build && <span className="text-[10px] text-fg-faint font-mono">{aboutInfo.build}</span>}
          </div>
        )}
        <a
          href="https://buymeacoffee.com/itsdestin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-sm text-fg-2 hover:text-fg"
        >
          <span>☕</span>
          <span>Donate</span>
        </a>
      </div>
    </>
  );
}

// ─── Desktop Settings (existing, unchanged) ─────────────────────────────────

function DesktopSettings({ open, onClose, onSendInput, hasActiveSession }: {
  open: boolean;
  onClose: () => void;
  onSendInput: (text: string) => void;
  hasActiveSession: boolean;
}) {
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [tailscale, setTailscale] = useState<TailscaleInfo | null>(null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loading, setLoading] = useState(true);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showSetupQR, setShowSetupQR] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setShowAddDevice(false);
    setShowSetupQR(false);
    const claude = (window as any).claude;
    if (!claude?.remote) { setLoading(false); return; }
    Promise.all([
      claude.remote.getConfig(),
      claude.remote.detectTailscale(),
      claude.remote.getClientList(),
    ]).then(([cfg, ts, cls]: [RemoteConfig, TailscaleInfo, ClientInfo[]]) => {
      setConfig(cfg);
      setTailscale(ts);
      setClients(cls);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open]);

  const handleSetPassword = useCallback(async () => {
    if (!newPassword.trim()) return;
    setPasswordStatus('saving');
    try {
      await (window as any).claude.remote.setPassword(newPassword);
      setConfig(prev => prev ? { ...prev, hasPassword: true } : prev);
      setNewPassword('');
      setPasswordStatus('saved');
      setTimeout(() => setPasswordStatus('idle'), 2000);
    } catch {
      setPasswordStatus('idle');
    }
  }, [newPassword]);

  const handleToggleEnabled = useCallback(async () => {
    if (!config) return;
    const updated = await (window as any).claude.remote.setConfig({ enabled: !config.enabled });
    setConfig(prev => prev ? { ...prev, ...updated } : prev);
  }, [config]);

  const handleToggleTailscaleTrust = useCallback(async () => {
    if (!config) return;
    const updated = await (window as any).claude.remote.setConfig({ trustTailscale: !config.trustTailscale });
    setConfig(prev => prev ? { ...prev, ...updated } : prev);
  }, [config]);

  const handleSetKeepAwake = useCallback(async (hours: number) => {
    const updated = await (window as any).claude.remote.setConfig({ keepAwakeHours: hours });
    setConfig(prev => prev ? { ...prev, ...updated } : prev);
  }, []);

  const handleRunSetup = useCallback(() => {
    if (!hasActiveSession) return;
    onSendInput('/remote-setup');
    onClose();
  }, [hasActiveSession, onSendInput, onClose]);

  const handleDisconnectClient = useCallback(async (clientId: string) => {
    await (window as any).claude.remote.disconnectClient(clientId);
    setClients(prev => prev.filter(c => c.id !== clientId));
    setConfig(prev => prev ? { ...prev, clientCount: Math.max(0, prev.clientCount - 1) } : prev);
  }, []);

  const handleCopyLink = useCallback(() => {
    if (tailscale?.url) {
      navigator.clipboard.writeText(tailscale.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [tailscale]);

  const hasClients = clients.length > 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-6">

        <ThemeSelector />

        {/* Setup banner — shown when no clients connected */}
        {!hasClients && (
          <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-3">
            <p className="text-xs text-blue-400 mb-2">
              Remote access lets you use DestinCode from any device — phone, tablet, or another computer.
            </p>

            {tailscale?.installed && tailscale.url && config?.hasPassword ? (
              showSetupQR ? (
                <div className="mt-2">
                  <p className="text-[10px] text-fg-muted mb-2">Scan to connect a device:</p>
                  <div className="flex justify-center bg-white rounded-lg p-3 w-fit mx-auto">
                    <QRCodeSVG value={tailscale.url} size={140} />
                  </div>
                  <p className="text-[10px] text-fg-muted mt-2 text-center font-mono">{tailscale.url}</p>
                  <button
                    onClick={handleCopyLink}
                    className="w-full mt-2 px-3 py-1 rounded bg-inset hover:bg-edge text-[10px] text-fg-dim"
                  >
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSetupQR(true)}
                  className="w-full px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium"
                >
                  Set Up Remote Access
                </button>
              )
            ) : (
              <>
                <button
                  onClick={handleRunSetup}
                  disabled={!hasActiveSession}
                  className="w-full px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!hasActiveSession ? 'Create a session first' : ''}
                >
                  Set Up Remote Access
                </button>
                {!hasActiveSession && (
                  <p className="text-[10px] text-fg-muted mt-1 text-center">Create a session first to run setup</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Remote Access section */}
        <section>
          <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Remote Access</h3>

          <label className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-xs text-fg-2">Enabled</span>
            <Toggle enabled={!!config?.enabled} onToggle={handleToggleEnabled} />
          </label>

          <div className="py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-fg-2">Password</span>
              {config?.hasPassword && (
                <span className="text-[10px] text-green-400">Set</span>
              )}
            </div>
            <div className="flex gap-1">
              <input
                type="password"
                placeholder={config?.hasPassword ? 'Change password...' : 'Set password...'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
                className="flex-1 px-2 py-1 rounded bg-well border border-edge-dim text-xs text-fg focus:outline-none focus:border-fg-muted"
              />
              <button
                onClick={handleSetPassword}
                disabled={!newPassword.trim() || passwordStatus === 'saving'}
                className="px-2 py-1 rounded bg-inset hover:bg-edge text-xs disabled:opacity-50"
              >
                {passwordStatus === 'saved' ? '✓' : passwordStatus === 'saving' ? '...' : 'Set'}
              </button>
            </div>
          </div>

          <div className="py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-fg-2">Keep awake</span>
            </div>
            <div className="flex gap-1">
              {KEEP_AWAKE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetKeepAwake(opt.value)}
                  className={`flex-1 px-1.5 py-1 rounded text-[10px] transition-colors ${
                    config?.keepAwakeHours === opt.value
                      ? 'bg-accent text-on-accent font-medium'
                      : 'bg-inset text-fg-dim hover:bg-edge'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Remote Clients section */}
        {hasClients && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase">Remote Clients</h3>
              <button
                onClick={() => setShowAddDevice(true)}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                + Add Device
              </button>
            </div>

            <div className="space-y-1">
              {clients.map(client => (
                <div key={client.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-inset/50">
                  <div>
                    <span className="text-xs text-fg-2 font-mono">{client.ip}</span>
                    <span className="text-[10px] text-fg-faint ml-2">{timeAgo(client.connectedAt)}</span>
                  </div>
                  <button
                    onClick={() => handleDisconnectClient(client.id)}
                    className="text-fg-faint hover:text-red-400 text-sm leading-none px-1"
                    title="Disconnect"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Add Device overlay */}
        {showAddDevice && tailscale?.url && (
          <section className="bg-inset/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-fg-2">Add Device</h3>
              <button
                onClick={() => setShowAddDevice(false)}
                className="text-fg-muted hover:text-fg-2 text-sm leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-[10px] text-fg-muted mb-2">Scan QR or copy link to connect a new device:</p>
            <div className="flex justify-center bg-white rounded-lg p-3 w-fit mx-auto">
              <QRCodeSVG value={tailscale.url} size={140} />
            </div>
            <p className="text-[10px] text-fg-muted mt-2 text-center font-mono">{tailscale.url}</p>
            <button
              onClick={handleCopyLink}
              className="w-full mt-2 px-3 py-1.5 rounded bg-inset hover:bg-edge text-xs"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </section>
        )}

        {/* Tailscale section */}
        <section>
          <h3 className="text-[10px] font-medium text-fg-muted tracking-wider uppercase mb-3">Tailscale</h3>

          {tailscale?.installed ? (
            <>
              <div className="py-2 flex items-center justify-between">
                <span className="text-xs text-fg-2">Status</span>
                <span className="text-[10px] text-green-400">
                  Connected{tailscale.hostname ? ` · ${tailscale.hostname}` : ''}
                </span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-xs text-fg-2">IP</span>
                <span className="text-xs text-fg-dim font-mono">{tailscale.ip}</span>
              </div>

              <label className="flex items-center justify-between py-2 cursor-pointer">
                <span className="text-xs text-fg-2">Skip password on Tailscale</span>
                <Toggle enabled={!!config?.trustTailscale} onToggle={handleToggleTailscaleTrust} />
              </label>
            </>
          ) : (
            <div className="py-2">
              <p className="text-xs text-fg-muted mb-2">
                Tailscale is not installed. It creates a secure private network so you can access DestinCode from anywhere.
              </p>
              <button
                onClick={handleRunSetup}
                disabled={!hasActiveSession}
                className="px-3 py-1.5 rounded bg-inset hover:bg-edge text-xs disabled:opacity-50"
              >
                Install with Setup Skill
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Support */}
      <div className="border-t border-edge pt-4 mt-2 flex flex-col gap-2">
        <a
          href="https://buymeacoffee.com/itsdestin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-inset/50 hover:bg-inset transition-colors text-sm text-fg-2 hover:text-fg"
        >
          <span>☕</span>
          <span>Donate</span>
        </a>
      </div>
    </>
  );
}
