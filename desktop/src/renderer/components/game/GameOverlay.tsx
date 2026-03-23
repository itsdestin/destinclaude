import React from 'react';
import { useGameState, useGameDispatch } from '../../state/game-context';

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

export default function GameOverlay({ connection }: Props) {
  const state = useGameState();
  const dispatch = useGameDispatch();

  const { winner, myColor } = state;

  let headline = 'Draw!';
  let headlineClass = 'text-gray-200';

  if (winner && winner !== 'draw') {
    if (winner === myColor) {
      headline = 'You Win!';
      headlineClass = winner === 'red' ? 'text-red-400' : 'text-yellow-400';
    } else {
      headline = 'You Lose!';
      headlineClass = 'text-gray-400';
    }
  }

  return (
    <div className="absolute inset-0 bg-gray-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10 rounded">
      <div className="flex flex-col items-center gap-1">
        <span className={`text-3xl font-black ${headlineClass}`}>{headline}</span>
        {winner && winner !== 'draw' && (
          <span className="text-xs text-gray-500">
            {winner === myColor ? 'Congratulations!' : 'Better luck next time'}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 w-40">
        <button
          onClick={() => connection.requestRematch()}
          className="w-full bg-gray-300 hover:bg-gray-200 text-gray-950 text-sm font-medium rounded-lg py-2 transition-colors"
        >
          Rematch
        </button>
        <button
          onClick={() => { connection.leaveGame(); dispatch({ type: 'RETURN_TO_LOBBY' }); }}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg py-2 transition-colors"
        >
          Back to Lobby
        </button>
      </div>
    </div>
  );
}
