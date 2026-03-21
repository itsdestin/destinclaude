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
  authenticated: boolean;
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
}

export type GameAction =
  | { type: 'SET_USERNAME'; username: string }
  | { type: 'CONNECTION_STATUS'; connected: boolean }
  | { type: 'AUTHENTICATED'; success: boolean }
  | { type: 'PRESENCE_UPDATE'; online: OnlineUser[] }
  | { type: 'ROOM_CREATED'; code: string; color: PlayerColor }
  | { type: 'GAME_START'; board: number[][]; you: PlayerColor; opponent: string }
  | { type: 'GAME_STATE'; board: number[][]; turn: PlayerColor; lastMove: { col: number; row: number } }
  | { type: 'GAME_OVER'; winner: PlayerColor | 'draw'; line?: [number, number][] }
  | { type: 'CHAT_MESSAGE'; from: string; text: string }
  | { type: 'OPPONENT_DISCONNECTED' }
  | { type: 'TOGGLE_PANEL' }
  | { type: 'RETURN_TO_LOBBY' }
  | { type: 'RESET' };

export function createInitialGameState(): GameState {
  return {
    connected: false,
    authenticated: false,
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
  };
}
