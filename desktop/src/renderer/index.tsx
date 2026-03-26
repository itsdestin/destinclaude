import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App';

/** Minimal login screen for remote browser access. */
function LoginScreen({ onLogin }: { onLogin: (password: string) => Promise<void>; }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onLogin(password);
    } catch (err: any) {
      setError(
        err.message === 'no-password-configured'
          ? 'Remote access is not configured. Set a password in the desktop app.'
          : 'Invalid password'
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-gray-900 text-white">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-72">
        <h1 className="text-xl font-bold text-center mb-2">DestinCode Remote</h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="px-3 py-2 rounded bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-gray-500"
          autoFocus
          disabled={loading}
        />
        <button type="submit" disabled={loading} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-50">
          {loading ? 'Connecting...' : 'Connect'}
        </button>
        {error && (
          <p className="text-red-400 text-xs text-center">{error}</p>
        )}
      </form>
    </div>
  );
}

/**
 * Wrapper that owns all connection logic. LoginScreen is pure-presentational.
 * This eliminates the race condition where LoginScreen and Root both
 * independently manage connection state.
 */
// Capture before any shim can modify window.claude
const isElectron = !!(window as any).claude;

function Root() {
  const [connected, setConnected] = useState(isElectron);
  const [hasConnectedOnce, setHasConnectedOnce] = useState(isElectron);
  const [shimReady, setShimReady] = useState(isElectron);

  // In browser mode: install shim once, attempt token auto-login, listen for state changes
  useEffect(() => {
    if (isElectron) return;
    import('./remote-shim').then(({ installShim, connect, onConnectionStateChange }) => {
      installShim();
      setShimReady(true);

      onConnectionStateChange((state) => {
        const isConnected = state === 'connected';
        setConnected(isConnected);
        if (isConnected) setHasConnectedOnce(true);
      });

      // Auto-login with stored token
      const storedToken = localStorage.getItem('destincode-remote-token');
      if (storedToken) {
        connect(storedToken, true).catch(() => {
          localStorage.removeItem('destincode-remote-token');
        });
      }
    });
  }, [isElectron]);

  const handleLogin = useCallback(async (password: string) => {
    const { connect } = await import('./remote-shim');
    await connect(password);
  }, []);

  // Once connected, keep showing App even during transient disconnections
  if (isElectron || connected || hasConnectedOnce) {
    return <App />;
  }

  if (!shimReady) {
    return <div className="flex items-center justify-center h-full bg-gray-900 text-white text-sm">Loading...</div>;
  }

  return <LoginScreen onLogin={handleLogin} />;
}

createRoot(document.getElementById('root')!).render(<Root />);
