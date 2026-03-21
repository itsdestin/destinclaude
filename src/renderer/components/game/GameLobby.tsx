import React, { useState, useEffect } from 'react';
import { useGameState, useGameDispatch } from '../../state/game-context';

interface LeaderboardEntry {
  username: string;
  wins: number;
  losses: number;
}

interface Props {
  connection: {
    register: (username: string, password: string) => Promise<boolean>;
    authenticate: (username: string, password: string) => void;
    createGame: () => void;
    joinGame: (code: string) => void;
    makeMove: (column: number) => void;
    sendChat: (text: string) => void;
    requestRematch: () => void;
    leaveGame: () => void;
  };
}

function SetupScreen({ connection }: Props) {
  const state = useGameState();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setError(null);

    if (isLogin) {
      connection.authenticate(username.trim(), password.trim());
      // AUTHENTICATED action will transition to lobby on success,
      // or set authError on failure (handled via state.authError below)
    } else {
      setLoading(true);
      const ok = await connection.register(username.trim(), password.trim());
      if (!ok) {
        setError('Username already taken. Try a different one.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-8">
      {/* Branding */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-yellow-400 flex items-center justify-center shadow-lg">
          <span className="text-2xl font-black text-white">4</span>
        </div>
        <h2 className="text-lg font-bold text-gray-200">Connect Four</h2>
        <p className="text-xs text-gray-500 text-center">Play against other Claude users in real time</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={isLogin ? 'Username' : 'Pick a username'}
          maxLength={20}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isLogin ? 'Password' : 'Choose a password'}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
        />
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        {state.authError && isLogin && (
          <p className="text-xs text-red-400">Invalid username or password</p>
        )}
        <button
          type="submit"
          disabled={loading || !username.trim() || !password.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg py-2 transition-colors"
        >
          {loading ? 'Getting started...' : isLogin ? 'Log In' : 'Get Started'}
        </button>
        <button
          type="button"
          onClick={() => { setIsLogin(!isLogin); setError(null); }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1"
        >
          {isLogin ? 'Need an account? Register' : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  );
}

function LobbyScreen({ connection }: Props) {
  const state = useGameState();
  const [joinCode, setJoinCode] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetch('http://localhost:3001/leaderboard?limit=5')
      .then((r) => r.json())
      .then((data) => setLeaderboard(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const myStats = leaderboard.find((e) => e.username === state.username);

  return (
    <div className="flex flex-col gap-0">
      {/* Player info bar */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm font-medium text-gray-200">{state.username}</span>
        </div>
        {myStats && (
          <span className="text-xs text-gray-500">{myStats.wins}W / {myStats.losses}L</span>
        )}
      </div>

      {/* Create / Join */}
      <div className="px-3 py-3 border-b border-gray-800 flex flex-col gap-2">
        <button
          onClick={() => connection.createGame()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg py-2 transition-colors"
        >
          Create Game
        </button>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Room code"
            maxLength={6}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors uppercase tracking-widest"
          />
          <button
            onClick={() => { if (joinCode.trim()) connection.joinGame(joinCode.trim()); }}
            disabled={!joinCode.trim()}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 text-sm font-medium rounded-lg px-3 py-2 transition-colors"
          >
            Join
          </button>
        </div>
      </div>

      {/* Online users */}
      <div className="px-3 py-2 border-b border-gray-800">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
          Online ({state.onlineUsers.length})
        </div>
        {state.onlineUsers.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No one else online yet</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {state.onlineUsers.map((user) => (
              <li key={user.username} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${user.status === 'idle' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-sm text-gray-300 truncate">{user.username}</span>
                {user.status === 'in-game' && (
                  <span className="text-[10px] text-yellow-500 ml-auto">in game</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Leaderboard preview */}
      <div className="px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Top Players</div>
        {leaderboard.length === 0 ? (
          <p className="text-xs text-gray-600 italic">No stats yet</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {leaderboard.map((entry, i) => (
              <li key={entry.username} className="flex items-center gap-2 text-xs">
                <span className="text-gray-600 w-4 text-right">{i + 1}.</span>
                <span className={`truncate flex-1 ${entry.username === state.username ? 'text-indigo-400 font-medium' : 'text-gray-300'}`}>
                  {entry.username}
                </span>
                <span className="text-gray-500 shrink-0">{entry.wins}W</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function WaitingScreen({ connection }: Props) {
  const state = useGameState();
  const dispatch = useGameDispatch();
  const code = state.roomCode ?? '';
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider">Room Code</p>
        <div className="flex gap-1.5">
          {code.split('').map((ch, i) => (
            <span
              key={i}
              className="w-9 h-10 flex items-center justify-center bg-gray-800 border border-gray-700 rounded-lg text-lg font-mono font-bold text-gray-200"
            >
              {ch}
            </span>
          ))}
        </div>
        <button
          onClick={copyCode}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* Spinner */}
        <div className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
        <p className="text-sm text-gray-400">Waiting for opponent...</p>
      </div>

      <button
        onClick={() => { connection.leaveGame(); dispatch({ type: 'RETURN_TO_LOBBY' }); }}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

export default function GameLobby({ connection }: Props) {
  const state = useGameState();

  if (state.screen === 'waiting') return <WaitingScreen connection={connection} />;
  if (state.screen === 'lobby') return <LobbyScreen connection={connection} />;
  return <SetupScreen connection={connection} />;
}
