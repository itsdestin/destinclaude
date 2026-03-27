export type GameScreen = 'setup' | 'lobby' | 'waiting' | 'playing' | 'game-over';
export type PlayerColor = 'red' | 'yellow';

export interface OnlineUser {
  username: string;
  status: 'idle' | 'in-game';
}

export interface ChatMessage {
  from: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  connected: boolean;
  partyError: string | null;
  username: string | null;
  onlineUsers: OnlineUser[];
  screen: GameScreen;
  roomCode: string | null;
  myColor: PlayerColor | null;
  opponent: string | null;
  board: number[][];
  turn: PlayerColor;
  lastMove: { col: number; row: number } | null;
  winner: PlayerColor | 'draw' | null;
  winLine: [number, number][] | null;
  chatMessages: ChatMessage[];
  panelOpen: boolean;
  /** Incoming challenge from another player */
  challengeFrom: string | null;
  /** Room code from incoming challenge */
  challengeCode: string | null;
  /** Outgoing challenge was declined */
  challengeDeclinedBy: string | null;
  /** Whether this player has requested a rematch */
  rematchRequested: boolean;
}

export type GameAction =
  | { type: 'PARTY_CONNECTED'; username: string }
  | { type: 'PARTY_DISCONNECTED' }
  | { type: 'PARTY_ERROR'; message: string }
  | { type: 'PRESENCE_UPDATE'; online: OnlineUser[] }
  | { type: 'USER_JOINED'; username: string; status: string }
  | { type: 'USER_LEFT'; username: string }
  | { type: 'USER_STATUS'; username: string; status: string }
  | { type: 'ROOM_CREATED'; code: string; color: PlayerColor }
  | { type: 'GAME_START'; board: number[][]; you: PlayerColor; opponent: string }
  | { type: 'GAME_STATE'; board: number[][]; turn: PlayerColor; lastMove: { col: number; row: number }; winner?: PlayerColor | 'draw'; winLine?: [number, number][] }
  | { type: 'GAME_OVER'; winner: PlayerColor | 'draw'; line?: [number, number][] }
  | { type: 'CHAT_MESSAGE'; from: string; text: string }
  | { type: 'OPPONENT_DISCONNECTED' }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'RETURN_TO_LOBBY' }
  | { type: 'RESET' }
  | { type: 'CHALLENGE_RECEIVED'; from: string; code: string }
  | { type: 'CHALLENGE_DECLINED'; by: string }
  | { type: 'CLEAR_CHALLENGE' }
  | { type: 'REMATCH_REQUESTED' };

export interface GameConnection {
  createGame: () => void;
  joinGame: (code: string) => void;
  makeMove: (column: number) => void;
  sendChat: (text: string) => void;
  requestRematch: () => void;
  leaveGame: () => void;
  challengePlayer: (target: string) => void;
  respondToChallenge: (from: string, accept: boolean) => void;
}

export function createInitialGameState(): GameState {
  return {
    connected: false,
    partyError: null,
    username: null,
    onlineUsers: [],
    screen: 'setup',
    roomCode: null,
    myColor: null,
    opponent: null,
    board: [],
    turn: 'red',
    lastMove: null,
    winner: null,
    winLine: null,
    chatMessages: [],
    panelOpen: false,
    challengeFrom: null,
    challengeCode: null,
    challengeDeclinedBy: null,
    rematchRequested: false,
  };
}
