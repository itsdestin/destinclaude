import React, { useState } from 'react';
import { useGameState, useGameDispatch } from '../../state/game-context';
import BrailleSpinner from '../BrailleSpinner';

interface LeaderboardEntry {
  username: string;
  wins: number;
  losses: number;
}

interface Props {
  connection: {
    register: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    authenticate: (username: string, password: string) => void;
    createGame: () => void;
    joinGame: (code: string) => void;
    makeMove: (column: number) => void;
    sendChat: (text: string) => void;
    requestRematch: () => void;
    leaveGame: () => void;
    challengePlayer: (target: string) => void;
    respondToChallenge: (from: string, accept: boolean) => void;
  };
}

function ErrorScreen() {
  const state = useGameState();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 py-8">
      <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center">
        <span className="text-2xl">!</span>
      </div>
      <p className="text-sm text-red-400 text-center">{state.githubError}</p>
      <p className="text-xs text-gray-500 text-center">Make sure GitHub CLI is installed and authenticated: gh auth login</p>
    </div>
  );
}

function LobbyScreen({ connection }: Props) {
  const state = useGameState();
  const dispatch = useGameDispatch();
  const [joinCode, setJoinCode] = useState('');

  return (
    <div className="flex flex-col gap-0">
      {/* Player info bar */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm font-medium text-gray-200">{state.username}</span>
        </div>
      </div>

      {/* Incoming challenge */}
      {state.challengeFrom && (
        <div className="px-3 py-2 border-b border-gray-800 bg-indigo-950/50">
          <p className="text-sm text-gray-200 mb-2">
            <span className="font-medium text-[#66AAFF]">{state.challengeFrom}</span> wants to play!
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { connection.respondToChallenge(state.challengeFrom!, true); dispatch({ type: 'CLEAR_CHALLENGE' }); }}
              className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg py-1.5 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => { connection.respondToChallenge(state.challengeFrom!, false); dispatch({ type: 'CLEAR_CHALLENGE' }); }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium rounded-lg py-1.5 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Challenge declined notification */}
      {state.challengeDeclinedBy && (
        <div className="px-3 py-2 border-b border-gray-800">
          <p className="text-xs text-gray-400">
            <span className="text-gray-300">{state.challengeDeclinedBy}</span> declined your challenge.
            <button onClick={() => dispatch({ type: 'CLEAR_CHALLENGE' })} className="text-[#66AAFF] ml-1">Dismiss</button>
          </p>
        </div>
      )}

      {/* Create / Join */}
      <div className="px-3 py-3 border-b border-gray-800 flex flex-col gap-2">
        <button
          onClick={() => connection.createGame()}
          className="w-full bg-gray-300 hover:bg-gray-200 text-gray-950 text-sm font-medium rounded-lg py-2 transition-colors"
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
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-gray-400 transition-colors uppercase tracking-widest"
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
            {state.onlineUsers.filter((u) => u.username !== state.username).map((user) => (
              <li key={user.username} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${user.status === 'idle' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-sm text-gray-300 truncate flex-1">{user.username}</span>
                {user.status === 'in-game' ? (
                  <span className="text-[10px] text-yellow-500 ml-auto">in game</span>
                ) : (
                  <button
                    onClick={() => connection.challengePlayer(user.username)}
                    className="text-[10px] text-[#66AAFF] hover:text-[#88CCFF] ml-auto transition-colors"
                  >
                    Challenge
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Leaderboard preview */}
      <div className="px-3 py-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Top Players</div>
        <p className="text-xs text-gray-600 italic">No stats yet</p>
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
          className="text-xs text-[#66AAFF] hover:text-[#88CCFF] transition-colors"
        >
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        <BrailleSpinner size="lg" />
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
  if (state.githubError) return <ErrorScreen />;
  if (state.screen === 'waiting') return <WaitingScreen connection={connection} />;
  return <LobbyScreen connection={connection} />;
}
