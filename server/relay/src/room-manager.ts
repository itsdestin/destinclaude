import { createBoard, Board } from '../../../shared/connect-four';

export interface Room {
  code: string;
  creator: string;
  players: { red: string | null; yellow: string | null };
  board: Board;
  turn: 'red' | 'yellow';
  status: 'waiting' | 'playing' | 'finished';
  rematchVotes: Set<string>;
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private userRooms = new Map<string, string>(); // username -> room code

  createRoom(creator: string): string {
    let code: string;
    do { code = generateCode(); } while (this.rooms.has(code));

    this.rooms.set(code, {
      code,
      creator,
      players: { red: creator, yellow: null },
      board: createBoard(),
      turn: 'red',
      status: 'waiting',
      rematchVotes: new Set(),
    });
    this.userRooms.set(creator, code);
    return code;
  }

  getRoom(code: string): Room | null {
    return this.rooms.get(code) ?? null;
  }

  getUserRoom(username: string): Room | null {
    const code = this.userRooms.get(username);
    if (!code) return null;
    return this.rooms.get(code) ?? null;
  }

  addUserToRoom(code: string, username: string): void {
    this.userRooms.set(username, code);
  }

  destroyRoom(code: string): void {
    const room = this.rooms.get(code);
    if (room) {
      if (room.players.red) this.userRooms.delete(room.players.red);
      if (room.players.yellow) this.userRooms.delete(room.players.yellow);
      this.rooms.delete(code);
    }
  }

  removeUserFromRoom(username: string): void {
    this.userRooms.delete(username);
  }

  activeRoomCount(): number {
    return this.rooms.size;
  }
}
