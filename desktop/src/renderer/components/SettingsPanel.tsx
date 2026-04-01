import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { isAndroid } from '../platform';

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
        className={`fixed top-0 left-0 h-full w-80 bg-gray-900 border-r border-gray-700/50 z-50 transform transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-bold text-gray-200">Settings</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
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
    : 'bg-gray-700';
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
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-6">

        {/* Package Tier */}
        <section>
          <h3 className="text-[10px] font-medium text-gray-500 tracking-wider uppercase mb-3">Package Tier</h3>
          <div className="space-y-1">
            {TIERS.map(t => (
              <button
                key={t.id}
                onClick={() => handleSetTier(t.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-colors ${
                  tier === t.id ? 'bg-gray-800' : 'hover:bg-gray-800/50'
                }`}
              >
                <span className={`text-[10px] ${tier === t.id ? 'text-gray-200' : 'text-gray-600'}`}>
                  {tier === t.id ? '●' : '○'}
                </span>
                <div>
                  <span className="text-xs text-gray-200 font-medium">{t.name}</span>
                  <p className="text-[10px] text-gray-500">{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Project Directories */}
        <section>
          <h3 className="text-[10px] font-medium text-gray-500 tracking-wider uppercase mb-3">Project Directories</h3>
          {directories.length > 0 ? (
            <div className="space-y-1">
              {directories.map(dir => (
                <div key={dir.path} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-800/50">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-gray-300 block truncate">{dir.label}</span>
                    <span className="text-[10px] text-gray-600 block truncate font-mono">{dir.path}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveDirectory(dir.path)}
                    className="text-gray-600 hover:text-red-400 text-sm leading-none px-1 shrink-0 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-600">No custom directories. Home (~) is always available.</p>
          )}
        </section>

        {/* Connect to Desktop */}
        <section>
          <h3 className="text-[10px] font-medium text-gray-500 tracking-wider uppercase mb-3">Connect to Desktop</h3>

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
                className="w-full px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 disabled:opacity-50"
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
                <div key={`${device.host}:${device.port}`} className="flex items-center justify-between py-2 px-3 rounded bg-gray-800/50">
                  <button
                    onClick={() => handleConnectToDesktop(device)}
                    disabled={connecting}
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                  >
                    <span className="text-xs text-gray-200 block">{device.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono block">{device.host}:{device.port}</span>
                  </button>
                  <button
                    onClick={() => handleRemoveDevice(device)}
                    className="text-gray-600 hover:text-red-400 text-sm leading-none px-1 shrink-0 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {connecting && (
            <div className="text-center py-3">
              <span className="text-xs text-gray-400">Connecting...</span>
            </div>
          )}

          {!remoteConnected && !connecting && !showConnectForm ? (
            <div className="space-y-2">
              <button
                onClick={handleScanQr}
                className="w-full px-3 py-2 rounded bg-gray-200 text-gray-900 text-xs font-medium active:bg-gray-300"
              >
                Scan QR Code
              </button>
              <button
                onClick={() => setShowConnectForm(true)}
                className="w-full px-3 py-2 rounded border border-gray-700 text-gray-400 text-xs active:bg-gray-800"
              >
                Enter Manually
              </button>
            </div>
          ) : (
            <div className="space-y-3 bg-gray-800/50 rounded-lg p-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Device Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="My Desktop"
                  className="w-full px-2 py-1.5 rounded bg-[#1C1C1C] border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Host / IP</label>
                <input
                  type="text"
                  value={formHost}
                  onChange={e => setFormHost(e.target.value)}
                  placeholder="100.x.x.x"
                  className="w-full px-2 py-1.5 rounded bg-[#1C1C1C] border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Port</label>
                <input
                  type="text"
                  value={formPort}
                  onChange={e => setFormPort(e.target.value)}
                  placeholder="9900"
                  className="w-full px-2 py-1.5 rounded bg-[#1C1C1C] border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => setFormPassword(e.target.value)}
                  placeholder="Remote access password"
                  className="w-full px-2 py-1.5 rounded bg-[#1C1C1C] border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConnectForm(false)}
                  className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDevice}
                  disabled={!formHost.trim()}
                  className="flex-1 px-3 py-1.5 rounded bg-gray-200 text-gray-900 text-xs font-medium disabled:opacity-50 active:bg-gray-300"
                >
                  Save & Connect
                </button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-600 mt-3">
            Connect to the DestinCode desktop app on your computer. Set up remote access in the desktop app's settings first.
          </p>
        </section>
      </div>

      {/* Footer — About + Donate */}
      <div className="border-t border-gray-800 px-4 py-3 space-y-2">
        {aboutInfo && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600">DestinCode {aboutInfo.version}</span>
            {aboutInfo.build && <span className="text-[10px] text-gray-700 font-mono">{aboutInfo.build}</span>}
          </div>
        )}
        <a
          href="https://buymeacoffee.com/itsdestin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors text-sm text-gray-300 hover:text-gray-100"
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
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 px-4 py-4 space-y-6">

        {/* Setup banner — shown when no clients connected */}
        {!hasClients && (
          <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-3">
            <p className="text-xs text-blue-400 mb-2">
              Remote access lets you use DestinCode from any device — phone, tablet, or another computer.
            </p>

            {tailscale?.installed && tailscale.url && config?.hasPassword ? (
              showSetupQR ? (
                <div className="mt-2">
                  <p className="text-[10px] text-gray-500 mb-2">Scan to connect a device:</p>
                  <div className="flex justify-center bg-white rounded-lg p-3 w-fit mx-auto">
                    <QRCodeSVG value={tailscale.url} size={140} />
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 text-center font-mono">{tailscale.url}</p>
                  <button
                    onClick={handleCopyLink}
                    className="w-full mt-2 px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-[10px] text-gray-400"
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
                  <p className="text-[10px] text-gray-500 mt-1 text-center">Create a session first to run setup</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Remote Access section */}
        <section>
          <h3 className="text-[10px] font-medium text-gray-500 tracking-wider uppercase mb-3">Remote Access</h3>

          <label className="flex items-center justify-between py-2 cursor-pointer">
            <span className="text-xs text-gray-300">Enabled</span>
            <Toggle enabled={!!config?.enabled} onToggle={handleToggleEnabled} />
          </label>

          <div className="py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-300">Password</span>
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
                className="flex-1 px-2 py-1 rounded bg-[#1C1C1C] border border-gray-700/50 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={handleSetPassword}
                disabled={!newPassword.trim() || passwordStatus === 'saving'}
                className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs disabled:opacity-50"
              >
                {passwordStatus === 'saved' ? '✓' : passwordStatus === 'saving' ? '...' : 'Set'}
              </button>
            </div>
          </div>

          <div className="py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-300">Keep awake</span>
            </div>
            <div className="flex gap-1">
              {KEEP_AWAKE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSetKeepAwake(opt.value)}
                  className={`flex-1 px-1.5 py-1 rounded text-[10px] transition-colors ${
                    config?.keepAwakeHours === opt.value
                      ? 'bg-gray-300 text-gray-950 font-medium'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
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
              <h3 className="text-[10px] font-medium text-gray-500 tracking-wider uppercase">Remote Clients</h3>
              <button
                onClick={() => setShowAddDevice(true)}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                + Add Device
              </button>
            </div>

            <div className="space-y-1">
              {clients.map(client => (
                <div key={client.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-800/50">
                  <div>
                    <span className="text-xs text-gray-300 font-mono">{client.ip}</span>
                    <span className="text-[10px] text-gray-600 ml-2">{timeAgo(client.connectedAt)}</span>
                  </div>
                  <button
                    onClick={() => handleDisconnectClient(client.id)}
                    className="text-gray-600 hover:text-red-400 text-sm leading-none px-1"
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
          <section className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-gray-300">Add Device</h3>
              <button
                onClick={() => setShowAddDevice(false)}
                className="text-gray-500 hover:text-gray-300 text-sm leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">Scan QR or copy link to connect a new device:</p>
            <div className="flex justify-center bg-white rounded-lg p-3 w-fit mx-auto">
              <QRCodeSVG value={tailscale.url} size={140} />
            </div>
            <p className="text-[10px] text-gray-500 mt-2 text-center font-mono">{tailscale.url}</p>
            <button
              onClick={handleCopyLink}
              className="w-full mt-2 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs"
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </section>
        )}

        {/* Tailscale section */}
        <section>
          <h3 className="text-[10px] font-medium text-gray-500 tracking-wider uppercase mb-3">Tailscale</h3>

          {tailscale?.installed ? (
            <>
              <div className="py-2 flex items-center justify-between">
                <span className="text-xs text-gray-300">Status</span>
                <span className="text-[10px] text-green-400">
                  Connected{tailscale.hostname ? ` · ${tailscale.hostname}` : ''}
                </span>
              </div>

              <div className="py-2 flex items-center justify-between">
                <span className="text-xs text-gray-300">IP</span>
                <span className="text-xs text-gray-400 font-mono">{tailscale.ip}</span>
              </div>

              <label className="flex items-center justify-between py-2 cursor-pointer">
                <span className="text-xs text-gray-300">Skip password on Tailscale</span>
                <Toggle enabled={!!config?.trustTailscale} onToggle={handleToggleTailscaleTrust} />
              </label>
            </>
          ) : (
            <div className="py-2">
              <p className="text-xs text-gray-500 mb-2">
                Tailscale is not installed. It creates a secure private network so you can access DestinCode from anywhere.
              </p>
              <button
                onClick={handleRunSetup}
                disabled={!hasActiveSession}
                className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-xs disabled:opacity-50"
              >
                Install with Setup Skill
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Support */}
      <div className="border-t border-gray-800 pt-4 mt-2 flex flex-col gap-2">
        <a
          href="https://buymeacoffee.com/itsdestin"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors text-sm text-gray-300 hover:text-gray-100"
        >
          <span>☕</span>
          <span>Donate</span>
        </a>
      </div>
    </>
  );
}
