import { useEffect, useRef, useCallback } from 'react';
import { useGameDispatch, useGameState } from '../state/game-context';
import { GitHubAPI } from '../game/github-api';
import { GameOps } from '../game/github-game';

const GITHUB_REPO = 'itsdestin/destinclaude-games';

export function useGitHubGame() {
  const dispatch = useGameDispatch();
  const state = useGameState();
  const opsRef = useRef<GameOps | null>(null);
  const currentGameCode = useRef<string | null>(null);

  // ── Initialize: get GitHub auth on mount ──
  useEffect(() => {
    let cancelled = false;
    const w = window as any;
    w.claude?.getGitHubAuth?.()
      .then((auth: { token: string; username: string } | null) => {
        if (cancelled) return;
        if (!auth) {
          dispatch({ type: 'GITHUB_ERROR', message: 'GitHub CLI not authenticated. Run: gh auth login' });
          return;
        }
        const api = new GitHubAPI(auth.token, GITHUB_REPO);
        opsRef.current = new GameOps(api, auth.username);
        dispatch({ type: 'GITHUB_READY', username: auth.username });
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'GITHUB_ERROR', message: 'Failed to get GitHub auth' });
        }
      });
    return () => {
      cancelled = true;
      opsRef.current = null;
    };
  }, [dispatch]);

  // ── Presence write loop (60s, while connected) ──
  useEffect(() => {
    if (!state.connected || !opsRef.current) return;
    const status = state.screen === 'playing' || state.screen === 'game-over' ? 'in-game' : 'idle';
    // Write immediately, then every 60s
    opsRef.current.updatePresence(status).catch(() => {});
    const interval = setInterval(() => {
      const s = state.screen === 'playing' || state.screen === 'game-over' ? 'in-game' : 'idle';
      opsRef.current?.updatePresence(s).catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [state.connected, state.screen]);

  // ── Presence + challenge read loop (60s, on lobby screen) ──
  useEffect(() => {
    if (state.screen !== 'lobby' || !opsRef.current) return;
    const poll = async () => {
      const ops = opsRef.current;
      if (!ops) return;
      try {
        const users = await ops.getOnlineUsers();
        dispatch({ type: 'PRESENCE_UPDATE', online: users });
        const challenge = await ops.getMyChallenge();
        if (challenge) {
          dispatch({ type: 'CHALLENGE_RECEIVED', from: challenge.from });
        }
      } catch {}
    };
    poll(); // immediate
    const interval = setInterval(poll, 60_000);
    return () => clearInterval(interval);
  }, [state.screen, dispatch]);

  // ── Game state poll (10s, during opponent's turn) ──
  useEffect(() => {
    if (state.screen !== 'playing' || !opsRef.current || !currentGameCode.current) return;
    if (state.turn === state.myColor) return; // my turn, no need to poll
    const poll = async () => {
      const ops = opsRef.current;
      const code = currentGameCode.current;
      if (!ops || !code) return;
      try {
        const game = await ops.readGame(code);
        if (!game) return;
        // Check if game state changed
        if (game.status === 'finished' && game.winner) {
          dispatch({ type: 'GAME_STATE', board: game.board, turn: game.turn, lastMove: state.lastMove! });
          dispatch({ type: 'GAME_OVER', winner: game.winner, line: game.winLine });
        } else if (game.turn !== state.turn) {
          dispatch({ type: 'GAME_STATE', board: game.board, turn: game.turn, lastMove: { col: 0, row: 0 } });
        }
        // Check for new chat messages
        if (game.chat && game.chat.length > state.chatMessages.length) {
          const newMsgs = game.chat.slice(state.chatMessages.length);
          for (const msg of newMsgs) {
            if (msg.from !== state.username) {
              dispatch({ type: 'CHAT_MESSAGE', from: msg.from, text: msg.text });
            }
          }
        }
      } catch {}
    };
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [state.screen, state.turn, state.myColor, state.chatMessages.length, state.username, state.lastMove, dispatch]);

  // ── Waiting for opponent poll (10s, on waiting screen) ──
  useEffect(() => {
    if (state.screen !== 'waiting' || !opsRef.current || !currentGameCode.current) return;
    const poll = async () => {
      const ops = opsRef.current;
      const code = currentGameCode.current;
      if (!ops || !code) return;
      try {
        const game = await ops.readGame(code);
        if (!game) return;
        if (game.status === 'playing' && game.yellow) {
          dispatch({
            type: 'GAME_START',
            board: game.board,
            you: game.red === state.username ? 'red' : 'yellow',
            opponent: game.red === state.username ? game.yellow : game.red,
          });
        }
      } catch {}
    };
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [state.screen, state.username, dispatch]);

  // ── Action functions ──

  const createGame = useCallback(async () => {
    if (!opsRef.current) return;
    const code = await opsRef.current.createGame();
    currentGameCode.current = code;
    dispatch({ type: 'ROOM_CREATED', code, color: 'red' });
  }, [dispatch]);

  const joinGame = useCallback(async (code: string) => {
    if (!opsRef.current) return;
    const result = await opsRef.current.joinGame(code);
    if (!result.ok) return; // TODO: show error
    const game = await opsRef.current.readGame(code);
    if (!game) return;
    currentGameCode.current = code;
    dispatch({
      type: 'GAME_START',
      board: game.board,
      you: 'yellow',
      opponent: game.red,
    });
  }, [dispatch]);

  const makeMove = useCallback(async (column: number) => {
    if (!opsRef.current || !currentGameCode.current) return;
    const result = await opsRef.current.makeMove(currentGameCode.current, column);
    if (!result.ok || !result.gameState) return;
    const game = result.gameState;
    dispatch({
      type: 'GAME_STATE',
      board: game.board,
      turn: game.turn,
      lastMove: { col: column, row: 0 }, // approximate — the reducer uses this for display
    });
    if (game.status === 'finished' && game.winner) {
      dispatch({ type: 'GAME_OVER', winner: game.winner, line: game.winLine });
    }
  }, [dispatch]);

  const sendChat = useCallback(async (text: string) => {
    if (!opsRef.current || !currentGameCode.current) return;
    await opsRef.current.sendChat(currentGameCode.current, text);
    dispatch({ type: 'CHAT_MESSAGE', from: state.username || '', text });
  }, [dispatch, state.username]);

  const requestRematch = useCallback(async () => {
    if (!opsRef.current || !currentGameCode.current) return;
    const result = await opsRef.current.requestRematch(currentGameCode.current);
    if (result.ready && result.gameState) {
      const game = result.gameState;
      dispatch({
        type: 'GAME_START',
        board: game.board,
        you: game.red === state.username ? 'red' : 'yellow',
        opponent: game.red === state.username ? (game.yellow || '') : game.red,
      });
    }
    // If not ready, opponent hasn't voted yet — keep polling
  }, [dispatch, state.username]);

  const leaveGame = useCallback(async () => {
    if (!opsRef.current || !currentGameCode.current) return;
    await opsRef.current.leaveGame(currentGameCode.current);
    currentGameCode.current = null;
  }, []);

  const challengePlayer = useCallback(async (target: string) => {
    if (!opsRef.current) return;
    const code = await opsRef.current.challengePlayer(target);
    currentGameCode.current = code;
    dispatch({ type: 'ROOM_CREATED', code, color: 'red' });
  }, [dispatch]);

  const respondToChallenge = useCallback(async (from: string, accept: boolean) => {
    if (!opsRef.current) return;
    dispatch({ type: 'CLEAR_CHALLENGE' });
    const result = await opsRef.current.respondToChallenge(from, accept);
    if (accept && result.ok && result.gameState) {
      const game = result.gameState;
      currentGameCode.current = game.code;
      dispatch({
        type: 'GAME_START',
        board: game.board,
        you: 'yellow',
        opponent: game.red,
      });
    }
  }, [dispatch]);

  // register and authenticate are no-ops for GitHub (identity is automatic)
  const register = useCallback(async () => ({ ok: true } as { ok: boolean; error?: string }), []);
  const authenticate = useCallback(() => {}, []);

  return {
    register,
    authenticate,
    createGame,
    joinGame,
    makeMove,
    sendChat,
    requestRematch,
    leaveGame,
    challengePlayer,
    respondToChallenge,
  };
}
