import { GameState, GameAction, createInitialGameState } from './game-types';

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'PARTY_CONNECTED':
      return { ...state, connected: true, username: action.username, screen: 'lobby', partyError: null };

    case 'PARTY_DISCONNECTED':
      return { ...state, connected: false };

    case 'PARTY_ERROR':
      return { ...state, connected: false, partyError: action.message };

    case 'PRESENCE_UPDATE':
      return { ...state, onlineUsers: action.online };

    case 'USER_JOINED':
      return {
        ...state,
        onlineUsers: [...state.onlineUsers.filter(u => u.username !== action.username), { username: action.username, status: action.status as 'idle' | 'in-game' }],
      };

    case 'USER_LEFT':
      return {
        ...state,
        onlineUsers: state.onlineUsers.filter(u => u.username !== action.username),
      };

    case 'USER_STATUS':
      return {
        ...state,
        onlineUsers: state.onlineUsers.map(u => u.username === action.username ? { ...u, status: action.status as 'idle' | 'in-game' } : u),
      };

    case 'ROOM_CREATED':
      return {
        ...state,
        roomCode: action.code,
        myColor: action.color,
        screen: 'waiting',
      };

    case 'GAME_START':
      return {
        ...state,
        board: action.board,
        myColor: action.you,
        opponent: action.opponent,
        turn: 'red',
        screen: 'playing',
        winner: null,
        winLine: null,
        chatMessages: [],
        lastMove: null,
        rematchRequested: false,
      };

    case 'GAME_STATE': {
      const next: GameState = {
        ...state,
        board: action.board,
        turn: action.turn,
        lastMove: action.lastMove,
      };
      if (action.winner) {
        return { ...next, winner: action.winner, winLine: action.winLine ?? null, screen: 'game-over' };
      }
      return next;
    }

    case 'GAME_OVER':
      return {
        ...state,
        winner: action.winner,
        winLine: action.line ?? null,
        screen: 'game-over',
      };

    case 'CHAT_MESSAGE':
      return {
        ...state,
        chatMessages: [
          ...state.chatMessages,
          { from: action.from, text: action.text, timestamp: Date.now() },
        ],
      };

    case 'OPPONENT_DISCONNECTED':
      return { ...state, opponent: null };

    case 'TOGGLE_PANEL':
      return { ...state, panelOpen: !state.panelOpen };

    case 'RETURN_TO_LOBBY':
      return {
        ...state,
        screen: 'lobby',
        roomCode: null,
        myColor: null,
        opponent: null,
        board: [],
        winner: null,
        winLine: null,
        chatMessages: [],
        lastMove: null,
        challengeCode: null,
        rematchRequested: false,
      };

    case 'CHALLENGE_RECEIVED':
      return { ...state, challengeFrom: action.from, challengeCode: action.code, panelOpen: true };

    case 'CHALLENGE_DECLINED':
      return { ...state, challengeDeclinedBy: action.by };

    case 'CLEAR_CHALLENGE':
      return { ...state, challengeFrom: null, challengeCode: null, challengeDeclinedBy: null };

    case 'REMATCH_REQUESTED':
      return { ...state, rematchRequested: true };

    case 'RESET':
      return createInitialGameState();

    default:
      return state;
  }
}
