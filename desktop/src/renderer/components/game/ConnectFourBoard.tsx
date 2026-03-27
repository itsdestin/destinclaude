import React, { useState } from 'react';
import { useGameState } from '../../state/game-context';
import { GameConnection } from '../../state/game-types';

const COLS = 7;
const ROWS = 6;

interface Props {
  connection: GameConnection;
}

function cellValue(board: number[][], col: number, row: number): number {
  // board[col][row], row 0 = bottom of the visual board
  if (!board[col]) return 0;
  return board[col][row] ?? 0;
}

function isWinCell(winLine: [number, number][] | null, col: number, row: number): boolean {
  if (!winLine) return false;
  return winLine.some(([c, r]) => c === col && r === row);
}

export default function ConnectFourBoard({ connection }: Props) {
  const state = useGameState();
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const isMyTurn = state.myColor !== null && state.turn === state.myColor;
  const isPlaying = state.screen === 'playing';
  const canMove = isMyTurn && isPlaying;

  const handleColClick = (col: number) => {
    if (!canMove) return;
    connection.makeMove(col);
  };

  // Ghost piece: find the lowest empty row in the hovered column
  const getGhostRow = (col: number): number | null => {
    if (!canMove || hoveredCol !== col || !state.board[col]) return null;
    for (let row = 0; row < ROWS; row++) {
      if (!state.board[col][row]) return row;
    }
    return null; // column full
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Turn indicator */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-full ${state.myColor === 'red' ? 'bg-red-500' : 'bg-yellow-400'}`} />
          <span className="text-gray-400">You{state.myColor ? ` (${state.myColor})` : ''}</span>
        </div>
        <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          canMove
            ? 'bg-gray-700/50 text-gray-300'
            : 'bg-gray-800 text-gray-500'
        }`}>
          {isPlaying ? (canMove ? 'Your turn' : `${state.turn}'s turn`) : ''}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">{state.opponent ?? 'Opponent'}</span>
          <span className={`w-3 h-3 rounded-full ${state.myColor === 'red' ? 'bg-yellow-400' : 'bg-red-500'}`} />
        </div>
      </div>

      {/* Board */}
      <div
        className="bg-blue-700 rounded-lg p-2 select-none"
        onMouseLeave={() => setHoveredCol(null)}
      >
        <div className="flex gap-1">
          {Array.from({ length: COLS }, (_, col) => {
            const isHovered = hoveredCol === col;
            const ghostRow = getGhostRow(col);

            return (
              <div
                key={col}
                className={`flex flex-col gap-1 rounded cursor-pointer transition-colors ${
                  canMove && isHovered ? 'bg-blue-600/50' : ''
                }`}
                onMouseEnter={() => setHoveredCol(col)}
                onClick={() => handleColClick(col)}
              >
                {/* Render rows top-down visually (ROWS-1 down to 0 in data) */}
                {Array.from({ length: ROWS }, (_, visualRow) => {
                  const dataRow = ROWS - 1 - visualRow;
                  const value = cellValue(state.board, col, dataRow);
                  const isWin = isWinCell(state.winLine, col, dataRow);
                  const isGhost = ghostRow === dataRow;

                  let cellClass = 'w-9 h-9 rounded-full transition-all ';
                  if (isWin) {
                    cellClass += value === 1
                      ? 'bg-red-600 ring-2 ring-white animate-pulse'
                      : 'bg-yellow-500 ring-2 ring-white animate-pulse';
                  } else if (value === 1) {
                    cellClass += 'bg-red-600';
                  } else if (value === 2) {
                    cellClass += 'bg-yellow-500';
                  } else if (isGhost) {
                    cellClass += state.myColor === 'red'
                      ? 'bg-red-600/40'
                      : 'bg-yellow-500/40';
                  } else {
                    cellClass += 'bg-gray-900';
                  }

                  return <div key={dataRow} className={cellClass} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
