// @ts-nocheck — deprecated; will be deleted in Task 12 (replaced by usePartyLobby + usePartyGame)
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

  // Refs for synchronous access in poll callbacks (avoids stale closures)
  const movePendingRef = useRef(false);
  const actionCountRef = useRef(0);
  const chatCountRef = useRef(0);

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
  // Uses refs to avoid stale closure bugs and to skip polls during in-flight moves
  useEffect(() => {
    if (state.screen !== 'playing' || !opsRef.current || !currentGameCode.current) return;
    if (state.turn === state.myColor) return; // my turn, no need to poll

    const poll = async () => {
      // Skip if a local move is in flight — the API response hasn't returned yet,
      // so the server might not have our comment and would return stale state
      if (movePendingRef.current) return;

      const ops = opsRef.current;
      const code = currentGameCode.current;
      if (!ops || !code) return;
      try {
        const readResult = await ops.readGame(code);
        if (!readResult) return;
        const { game, actionCount } = readResult;

        // Double-check: could have started a move while the fetch was in flight
        if (movePendingRef.current) return;

        // Only apply if the server has strictly MORE actions than we know about.
        // This prevents stale reads from reverting optimistic local state.
        if (actionCount <= actionCountRef.current) return;

        actionCountRef.current = actionCount;
        dispatch({
          type: 'GAME_STATE',
          board: game.board,
          turn: game.turn,
          lastMove: { col: 0, row: 0 },
          actionCount,
          winner: game.status === 'finished' ? game.winner : undefined,
          winLine: game.status === 'finished' ? game.winLine : undefined,
        });

        // Sync chat messages
        if (game.chat && game.chat.length > chatCountRef.current) {
          const newMsgs = game.chat.slice(chatCountRef.current);
          for (const msg of newMsgs) {
            if (msg.from !== state.username) {
              dispatch({ type: 'CHAT_MESSAGE', from: msg.from, text: msg.text });
            }
          }
          chatCountRef.current = game.chat.length;
        }
      } catch {}
    };
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [state.screen, state.turn, state.myColor, state.username, dispatch]);

  // ── Waiting for opponent poll (10s, on waiting screen) ──
  useEffect(() => {
    if (state.screen !== 'waiting' || !opsRef.current || !currentGameCode.current) return;
    const poll = async () => {
      const ops = opsRef.current;
      const code = currentGameCode.current;
      if (!ops || !code) return;
      try {
        const readResult = await ops.readGame(code);
        if (!readResult) return;
        const { game, actionCount } = readResult;
        if (game.status === 'playing' && game.yellow) {
          actionCountRef.current = actionCount;
          chatCountRef.current = 0;
          dispatch({
            type: 'GAME_START',
            board: game.board,
            you: game.red === state.username ? 'red' : 'yellow',
            opponent: game.red === state.username ? game.yellow : game.red,
            actionCount,
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
    actionCountRef.current = 0;
    chatCountRef.current = 0;
    dispatch({ type: 'ROOM_CREATED', code, color: 'red' });
  }, [dispatch]);

  const joinGame = useCallback(async (code: string) => {
    if (!opsRef.current) return;
    const result = await opsRef.current.joinGame(code);
    if (!result.ok) return; // TODO: show error
    const readResult = await opsRef.current.readGame(code);
    if (!readResult) return;
    currentGameCode.current = code;
    actionCountRef.current = readResult.actionCount;
    chatCountRef.current = 0;
    dispatch({
      type: 'GAME_START',
      board: readResult.game.board,
      you: 'yellow',
      opponent: readResult.game.red,
      actionCount: readResult.actionCount,
    });
  }, [dispatch]);

  const makeMove = useCallback(async (column: number) => {
    if (!opsRef.current || !currentGameCode.current) return;
    // Block concurrent moves — prevents double-click and race conditions
    if (movePendingRef.current) return;

    movePendingRef.current = true;
    dispatch({ type: 'MOVE_PENDING', pending: true });

    try {
      const result = await opsRef.current.makeMove(currentGameCode.current, column);
      if (!result.ok || !result.gameState) {
        movePendingRef.current = false;
        dispatch({ type: 'MOVE_PENDING', pending: false });
        return;
      }
      const game = result.gameState;
      const newActionCount = result.actionCount ?? (actionCountRef.current + 1);
      actionCountRef.current = newActionCount;

      // Single atomic dispatch — board + turn + optional game-over in one frame
      dispatch({
        type: 'GAME_STATE',
        board: game.board,
        turn: game.turn,
        lastMove: { col: column, row: 0 },
        actionCount: newActionCount,
        winner: game.status === 'finished' ? game.winner : undefined,
        winLine: game.status === 'finished' ? game.winLine : undefined,
      });
    } finally {
      movePendingRef.current = false;
      dispatch({ type: 'MOVE_PENDING', pending: false });
    }
  }, [dispatch]);

  const sendChat = useCallback(async (text: string) => {
    if (!opsRef.current || !currentGameCode.current) return;
    await opsRef.current.sendChat(currentGameCode.current, text);
    chatCountRef.current += 1;
    dispatch({ type: 'CHAT_MESSAGE', from: state.username || '', text });
  }, [dispatch, state.username]);

  const requestRematch = useCallback(async () => {
    if (!opsRef.current || !currentGameCode.current) return;
    const result = await opsRef.current.requestRematch(currentGameCode.current);
    if (result.ready && result.gameState) {
      const game = result.gameState;
      const ac = result.actionCount ?? 0;
      actionCountRef.current = ac;
      chatCountRef.current = 0;
      dispatch({
        type: 'GAME_START',
        board: game.board,
        you: game.red === state.username ? 'red' : 'yellow',
        opponent: game.red === state.username ? (game.yellow || '') : game.red,
        actionCount: ac,
      });
    }
    // If not ready, opponent hasn't voted yet — keep polling
  }, [dispatch, state.username]);

  const leaveGame = useCallback(async () => {
    if (!opsRef.current || !currentGameCode.current) return;
    await opsRef.current.leaveGame(currentGameCode.current);
    currentGameCode.current = null;
    actionCountRef.current = 0;
    chatCountRef.current = 0;
  }, []);

  const challengePlayer = useCallback(async (target: string) => {
    if (!opsRef.current) return;
    const code = await opsRef.current.challengePlayer(target);
    currentGameCode.current = code;
    actionCountRef.current = 0;
    chatCountRef.current = 0;
    dispatch({ type: 'ROOM_CREATED', code, color: 'red' });
  }, [dispatch]);

  const respondToChallenge = useCallback(async (from: string, accept: boolean) => {
    if (!opsRef.current) return;
    dispatch({ type: 'CLEAR_CHALLENGE' });
    const result = await opsRef.current.respondToChallenge(from, accept);
    if (accept && result.ok && result.gameState) {
      const game = result.gameState;
      const ac = result.actionCount ?? 0;
      currentGameCode.current = game.code;
      actionCountRef.current = ac;
      chatCountRef.current = 0;
      dispatch({
        type: 'GAME_START',
        board: game.board,
        you: 'yellow',
        opponent: game.red,
        actionCount: ac,
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
