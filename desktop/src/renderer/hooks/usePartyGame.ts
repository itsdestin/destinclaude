import { useEffect, useRef, useCallback } from 'react';
import { useGameDispatch, useGameState } from '../state/game-context';
import { PartyClient } from '../game/party-client';
import { createBoard, dropPiece, checkWin, checkDraw } from '../game/connect-four';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function usePartyGame(
  lobbyStatusUpdate: (status: 'idle' | 'in-game') => void,
  lobbyChallenge: (target: string, gameType: string, code: string) => void,
) {
  const dispatch = useGameDispatch();
  const state = useGameState();
  const clientRef = useRef<PartyClient | null>(null);
  const gameCodeRef = useRef<string | null>(null);
  const myColorRef = useRef<'red' | 'yellow' | null>(null);
  const boardRef = useRef<number[][]>([]);
  const turnRef = useRef<'red' | 'yellow'>('red');
  const rematchRequestedRef = useRef(false);

  // Clean up game connection on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, []);

  const connectToRoom = useCallback((code: string, username: string) => {
    clientRef.current?.close();

    const client = new PartyClient({
      party: 'connectfour',
      room: code,
      username,
      onMessage: (data) => {
        switch (data.type) {
          case 'player-joined': {
            if (data.username !== username) {
              const board = createBoard();
              boardRef.current = board;
              turnRef.current = 'red';
              dispatch({
                type: 'GAME_START',
                board,
                you: myColorRef.current!,
                opponent: data.username,
              });
              lobbyStatusUpdate('in-game');
            }
            break;
          }

          case 'player-left': {
            if (data.username !== username) {
              dispatch({ type: 'OPPONENT_DISCONNECTED' });
            }
            break;
          }

          case 'move': {
            if (data.username === username) break;
            const playerNum = turnRef.current === 'red' ? 1 : 2;
            const result = dropPiece(boardRef.current, data.column, playerNum);
            if (!result) break;

            boardRef.current = result.board;
            const winLine = checkWin(result.board, { col: data.column, row: result.row });
            const isDraw = !winLine && checkDraw(result.board);
            const nextTurn = turnRef.current === 'red' ? 'yellow' : 'red';
            turnRef.current = nextTurn;

            if (winLine) {
              dispatch({
                type: 'GAME_STATE',
                board: result.board,
                turn: nextTurn,
                lastMove: { col: data.column, row: result.row },
                winner: nextTurn === 'red' ? 'yellow' : 'red',
                winLine: winLine as [number, number][],
              });
            } else if (isDraw) {
              dispatch({
                type: 'GAME_STATE',
                board: result.board,
                turn: nextTurn,
                lastMove: { col: data.column, row: result.row },
                winner: 'draw',
              });
            } else {
              dispatch({
                type: 'GAME_STATE',
                board: result.board,
                turn: nextTurn,
                lastMove: { col: data.column, row: result.row },
              });
            }
            break;
          }

          case 'chat': {
            if (data.username !== username) {
              dispatch({ type: 'CHAT_MESSAGE', from: data.username, text: data.text });
            }
            break;
          }

          case 'rematch': {
            if (rematchRequestedRef.current) {
              // Both players agreed — start new game
              const board = createBoard();
              boardRef.current = board;
              myColorRef.current = myColorRef.current === 'red' ? 'yellow' : 'red';
              turnRef.current = 'red';
              rematchRequestedRef.current = false;
              dispatch({
                type: 'GAME_START',
                board,
                you: myColorRef.current,
                opponent: data.username,
              });
            } else {
              // Opponent wants a rematch; we haven't agreed yet
              dispatch({ type: 'REMATCH_REQUESTED' });
            }
            break;
          }
        }
      },
    });

    clientRef.current = client;
    gameCodeRef.current = code;
  }, [dispatch, lobbyStatusUpdate]);

  const createGame = useCallback(() => {
    if (!state.username) return;
    const code = generateCode();
    myColorRef.current = 'red';
    rematchRequestedRef.current = false;
    dispatch({ type: 'ROOM_CREATED', code, color: 'red' });
    connectToRoom(code, state.username);
  }, [state.username, dispatch, connectToRoom]);

  const joinGame = useCallback((code: string) => {
    if (!state.username) return;
    myColorRef.current = 'yellow';
    rematchRequestedRef.current = false;
    connectToRoom(code, state.username);
  }, [state.username, connectToRoom]);

  const makeMove = useCallback((column: number) => {
    if (!clientRef.current || !state.username) return;
    const playerNum = turnRef.current === 'red' ? 1 : 2;
    const result = dropPiece(boardRef.current, column, playerNum);
    if (!result) return;

    boardRef.current = result.board;
    const winLine = checkWin(result.board, { col: column, row: result.row });
    const isDraw = !winLine && checkDraw(result.board);
    const mover = turnRef.current;
    const nextTurn = mover === 'red' ? 'yellow' : 'red';
    turnRef.current = nextTurn;

    clientRef.current.send({ type: 'move', username: state.username, column });

    if (winLine) {
      dispatch({
        type: 'GAME_STATE',
        board: result.board,
        turn: nextTurn,
        lastMove: { col: column, row: result.row },
        winner: mover,
        winLine: winLine as [number, number][],
      });
    } else if (isDraw) {
      dispatch({
        type: 'GAME_STATE',
        board: result.board,
        turn: nextTurn,
        lastMove: { col: column, row: result.row },
        winner: 'draw',
      });
    } else {
      dispatch({
        type: 'GAME_STATE',
        board: result.board,
        turn: nextTurn,
        lastMove: { col: column, row: result.row },
      });
    }
  }, [state.username, dispatch]);

  const sendChat = useCallback((text: string) => {
    if (!clientRef.current || !state.username) return;
    clientRef.current.send({ type: 'chat', username: state.username, text });
    dispatch({ type: 'CHAT_MESSAGE', from: state.username, text });
  }, [state.username, dispatch]);

  const requestRematch = useCallback(() => {
    if (!clientRef.current || !state.username) return;
    rematchRequestedRef.current = true;
    clientRef.current.send({ type: 'rematch', username: state.username });
    dispatch({ type: 'REMATCH_REQUESTED' });
  }, [state.username, dispatch]);

  const leaveGame = useCallback(() => {
    if (clientRef.current && state.username) {
      clientRef.current.send({ type: 'leave', username: state.username });
      clientRef.current.close();
      clientRef.current = null;
    }
    gameCodeRef.current = null;
    myColorRef.current = null;
    boardRef.current = [];
    turnRef.current = 'red';
    rematchRequestedRef.current = false;
    lobbyStatusUpdate('idle');
  }, [state.username, lobbyStatusUpdate]);

  const challengePlayer = useCallback((target: string) => {
    if (!state.username) return;
    const code = generateCode();
    myColorRef.current = 'red';
    rematchRequestedRef.current = false;
    dispatch({ type: 'ROOM_CREATED', code, color: 'red' });
    connectToRoom(code, state.username);
    lobbyChallenge(target, 'connect-four', code);
  }, [state.username, dispatch, connectToRoom, lobbyChallenge]);

  const respondToChallenge = useCallback((_from: string, _accept: boolean) => {
    // This is handled by the lobby hook — forward the response
    // If accepted, also join the game
    // Note: The challenge message includes the game code, but we need it here
    // For now, the lobby forwards the response. The accept-and-join flow
    // will need the code from the challenge. This is handled in the UI layer.
  }, []);

  return { createGame, joinGame, makeMove, sendChat, requestRematch, leaveGame, challengePlayer, respondToChallenge };
}
