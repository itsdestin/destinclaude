import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

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
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [tailscale, setTailscale] = useState<TailscaleInfo | null>(null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [loading, setLoading] = useState(true);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showSetupQR, setShowSetupQR] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load config, detect Tailscale, and get client list on open
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

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddDevice) setShowAddDevice(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, showAddDevice]);

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

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={() => { if (showAddDevice) setShowAddDevice(false); else onClose(); }}
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

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              Loading...
            </div>
          ) : (
            <div className="flex-1 px-4 py-4 space-y-6">

              {/* Setup banner — shown when no clients connected */}
              {!hasClients && (
                <div className="bg-blue-500/10 border border-blue-500/25 rounded-lg p-3">
                  <p className="text-xs text-blue-400 mb-2">
                    Remote access lets you use DestinCode from any device — phone, tablet, or another computer.
                  </p>

                  {tailscale?.installed && tailscale.url && config?.hasPassword ? (
                    /* Tailscale ready — show button that expands to QR */
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
                    /* Tailscale not installed — run the setup skill */
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

                {/* Enable/disable toggle */}
                <label className="flex items-center justify-between py-2 cursor-pointer">
                  <span className="text-xs text-gray-300">Enabled</span>
                  <button
                    onClick={handleToggleEnabled}
                    className={`w-8 h-4 rounded-full transition-colors relative ${
                      config?.enabled ? 'bg-green-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                      config?.enabled ? 'left-4' : 'left-0.5'
                    }`} />
                  </button>
                </label>

                {/* Password */}
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

                {/* Keep awake */}
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

              {/* Remote Clients section — shown when clients exist */}
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
                      <button
                        onClick={handleToggleTailscaleTrust}
                        className={`w-8 h-4 rounded-full transition-colors relative ${
                          config?.trustTailscale ? 'bg-green-600' : 'bg-gray-700'
                        }`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                          config?.trustTailscale ? 'left-4' : 'left-0.5'
                        }`} />
                      </button>
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
          )}
        </div>
      </div>
    </>
  );
}
