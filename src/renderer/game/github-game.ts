import type { GitHubAPI } from './github-api';
import { createBoard, dropPiece, checkWin, checkDraw } from './connect-four';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GameFile {
  code: string;
  red: string;
  yellow: string | null;
  board: number[][];
  turn: 'red' | 'yellow';
  status: 'waiting' | 'playing' | 'finished';
  chat: { from: string; text: string; timestamp: number }[];
  winner?: 'red' | 'yellow' | 'draw';
  winLine?: [number, number][];
  rematchVotes?: string[];
}

interface PresenceEntry {
  username: string;
  status: 'idle' | 'in-game';
  timestamp: number;
}

interface LeaderboardEntry {
  username: string;
  wins: number;
  losses: number;
  draws: number;
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// GameOps
// ---------------------------------------------------------------------------

export class GameOps {
  private api: GitHubAPI;
  private username: string;

  constructor(api: GitHubAPI, username: string) {
    this.api = api;
    this.username = username;
  }

  // -------------------------------------------------------------------------
  // Game lifecycle
  // -------------------------------------------------------------------------

  async createGame(): Promise<string> {
    const code = generateCode();
    const game: GameFile = {
      code,
      red: this.username,
      yellow: null,
      board: createBoard(),
      turn: 'red',
      status: 'waiting',
      chat: [],
    };
    await this.api.writeFile(`games/${code}.json`, game, `create game ${code}`);
    return code;
  }

  async joinGame(code: string): Promise<{ ok: boolean; error?: string }> {
    const result = await this.api.readFile(`games/${code}.json`);
    if (!result) {
      return { ok: false, error: 'Game not found' };
    }
    const game: GameFile = result.data;
    if (game.status !== 'waiting') {
      return { ok: false, error: 'Game is not waiting for a player' };
    }
    if (game.yellow !== null) {
      return { ok: false, error: 'Game is already full' };
    }
    const updated: GameFile = { ...game, yellow: this.username, status: 'playing' };
    const writeResult = await this.api.writeFile(
      `games/${code}.json`,
      updated,
      `join game ${code}`,
      result.sha,
    );
    if (!writeResult) {
      return { ok: false, error: 'Write conflict — please retry' };
    }
    return { ok: true };
  }

  async readGame(code: string): Promise<GameFile | null> {
    const result = await this.api.readFile(`games/${code}.json`);
    if (!result) return null;
    return result.data as GameFile;
  }

  async makeMove(
    code: string,
    column: number,
  ): Promise<{ ok: boolean; gameState?: GameFile; error?: string }> {
    const result = await this.api.readFile(`games/${code}.json`);
    if (!result) {
      return { ok: false, error: 'Game not found' };
    }
    const game: GameFile = result.data;

    if (game.status !== 'playing') {
      return { ok: false, error: 'Game is not in playing state' };
    }

    // Verify it is this player's turn
    const myColor = game.red === this.username ? 'red' : 'yellow';
    if (game.turn !== myColor) {
      return { ok: false, error: 'Not your turn' };
    }

    const playerNum = myColor === 'red' ? 1 : 2;
    const dropResult = dropPiece(game.board, column, playerNum);
    if (!dropResult) {
      return { ok: false, error: 'Invalid move — column is full or out of range' };
    }

    const { board: newBoard, row } = dropResult;
    const winLine = checkWin(newBoard, { col: column, row });
    const isDraw = !winLine && checkDraw(newBoard);

    let updated: GameFile;
    if (winLine) {
      updated = {
        ...game,
        board: newBoard,
        status: 'finished',
        winner: myColor,
        winLine: winLine as [number, number][],
      };
    } else if (isDraw) {
      updated = {
        ...game,
        board: newBoard,
        status: 'finished',
        winner: 'draw',
      };
    } else {
      updated = {
        ...game,
        board: newBoard,
        turn: myColor === 'red' ? 'yellow' : 'red',
      };
    }

    const writeResult = await this.api.writeFile(
      `games/${code}.json`,
      updated,
      `move ${code} col ${column}`,
      result.sha,
    );
    if (!writeResult) {
      return { ok: false, error: 'Write conflict — please retry' };
    }

    // Update leaderboard on game end
    if (updated.status === 'finished' && game.yellow) {
      if (updated.winner === 'draw') {
        await this.recordResult(game.red, game.yellow, true);
      } else {
        const winner = updated.winner === 'red' ? game.red : game.yellow;
        const loser = updated.winner === 'red' ? game.yellow : game.red;
        await this.recordResult(winner, loser, false);
      }
    }

    return { ok: true, gameState: updated };
  }

  async sendChat(code: string, text: string): Promise<boolean> {
    const result = await this.api.readFile(`games/${code}.json`);
    if (!result) return false;
    const game: GameFile = result.data;
    const updated: GameFile = {
      ...game,
      chat: [...game.chat, { from: this.username, text, timestamp: Date.now() }],
    };
    const writeResult = await this.api.writeFile(
      `games/${code}.json`,
      updated,
      `chat ${code}`,
      result.sha,
    );
    return writeResult !== null;
  }

  async leaveGame(code: string): Promise<void> {
    const result = await this.api.readFile(`games/${code}.json`);
    if (!result) return;
    const game: GameFile = result.data;

    if (game.status === 'playing' && game.yellow) {
      // Determine opponent (the one who wins by forfeit)
      const opponentColor: 'red' | 'yellow' = game.red === this.username ? 'yellow' : 'red';
      const opponentName = opponentColor === 'red' ? game.red : game.yellow;
      const myName = this.username;

      const updated: GameFile = {
        ...game,
        status: 'finished',
        winner: opponentColor,
      };

      const writeResult = await this.api.writeFile(
        `games/${code}.json`,
        updated,
        `forfeit ${code}`,
        result.sha,
      );

      if (writeResult) {
        await this.recordResult(opponentName, myName, false);
        await this.api.deleteFile(`games/${code}.json`, writeResult.sha, `delete game ${code}`);
        return;
      }
    }

    await this.api.deleteFile(`games/${code}.json`, result.sha, `delete game ${code}`);
  }

  async requestRematch(
    code: string,
  ): Promise<{ ready: boolean; gameState?: GameFile }> {
    const result = await this.api.readFile(`games/${code}.json`);
    if (!result) return { ready: false };
    const game: GameFile = result.data;

    const votes = game.rematchVotes ?? [];
    if (votes.includes(this.username)) {
      // Already voted
      return { ready: false, gameState: game };
    }

    const newVotes = [...votes, this.username];
    const bothVoted =
      game.yellow !== null &&
      newVotes.includes(game.red) &&
      newVotes.includes(game.yellow);

    let updated: GameFile;
    if (bothVoted) {
      // Swap colors and reset board
      updated = {
        ...game,
        red: game.yellow!,
        yellow: game.red,
        board: createBoard(),
        turn: 'red',
        status: 'playing',
        winner: undefined,
        winLine: undefined,
        rematchVotes: [],
        chat: game.chat,
      };
    } else {
      updated = { ...game, rematchVotes: newVotes };
    }

    await this.api.writeFile(`games/${code}.json`, updated, `rematch ${code}`, result.sha);
    return { ready: bothVoted, gameState: updated };
  }

  // -------------------------------------------------------------------------
  // Presence
  // -------------------------------------------------------------------------

  async updatePresence(status: 'idle' | 'in-game'): Promise<void> {
    await this._writePresence(status, false);
  }

  private async _writePresence(status: 'idle' | 'in-game', isRetry: boolean): Promise<void> {
    const result = await this.api.readFile('presence.json');
    const presenceMap: Record<string, PresenceEntry> = result ? { ...result.data } : {};
    presenceMap[this.username] = {
      username: this.username,
      status,
      timestamp: Date.now(),
    };
    const writeResult = await this.api.writeFile(
      'presence.json',
      presenceMap,
      `presence ${this.username}`,
      result?.sha,
    );
    if (!writeResult && !isRetry) {
      // 409 conflict — retry once
      await this._writePresence(status, true);
    }
  }

  async getOnlineUsers(): Promise<{ username: string; status: 'idle' | 'in-game' }[]> {
    const result = await this.api.readFile('presence.json');
    if (!result) return [];
    const presenceMap: Record<string, PresenceEntry> = result.data;
    const cutoff = Date.now() - 300000; // 5 minutes
    return Object.values(presenceMap)
      .filter((entry) => entry.timestamp >= cutoff)
      .map((entry) => ({ username: entry.username, status: entry.status }));
  }

  // -------------------------------------------------------------------------
  // Leaderboard
  // -------------------------------------------------------------------------

  async getLeaderboard(): Promise<
    { username: string; wins: number; losses: number; draws: number }[]
  > {
    const result = await this.api.readFile('leaderboard.json');
    if (!result) return [];
    const lb: Record<string, LeaderboardEntry> = result.data;
    return Object.values(lb).sort((a, b) => b.wins - a.wins);
  }

  async recordResult(winner: string, loser: string, isDraw: boolean): Promise<void> {
    await this._writeLeaderboard(winner, loser, isDraw, false);
  }

  private async _writeLeaderboard(
    winner: string,
    loser: string,
    isDraw: boolean,
    isRetry: boolean,
  ): Promise<void> {
    const result = await this.api.readFile('leaderboard.json');
    const lb: Record<string, LeaderboardEntry> = result ? { ...result.data } : {};

    const defaultEntry = (username: string): LeaderboardEntry => ({
      username,
      wins: 0,
      losses: 0,
      draws: 0,
    });

    lb[winner] = lb[winner] ?? defaultEntry(winner);
    lb[loser] = lb[loser] ?? defaultEntry(loser);

    if (isDraw) {
      lb[winner].draws += 1;
      lb[loser].draws += 1;
    } else {
      lb[winner].wins += 1;
      lb[loser].losses += 1;
    }

    const writeResult = await this.api.writeFile(
      'leaderboard.json',
      lb,
      `result ${winner} vs ${loser}`,
      result?.sha,
    );
    if (!writeResult && !isRetry) {
      await this._writeLeaderboard(winner, loser, isDraw, true);
    }
  }

  // -------------------------------------------------------------------------
  // Challenges
  // -------------------------------------------------------------------------

  async challengePlayer(target: string): Promise<string> {
    const code = await this.createGame();
    await this.api.writeFile(
      `challenges/${target}_${this.username}.json`,
      { from: this.username, code },
      `challenge ${target} from ${this.username}`,
    );
    return code;
  }

  async getMyChallenge(): Promise<{ from: string; code: string } | null> {
    const files = await this.api.listFiles('challenges');
    const mine = files.find((f) => f.startsWith(`${this.username}_`));
    if (!mine) return null;
    const result = await this.api.readFile(`challenges/${mine}`);
    if (!result) return null;
    return result.data as { from: string; code: string };
  }

  async respondToChallenge(
    from: string,
    accept: boolean,
  ): Promise<{ ok: boolean; gameState?: GameFile }> {
    const challengePath = `challenges/${this.username}_${from}.json`;
    const challengeResult = await this.api.readFile(challengePath);
    if (!challengeResult) {
      return { ok: false };
    }
    const { code } = challengeResult.data as { from: string; code: string };

    // Delete challenge file
    await this.api.deleteFile(challengePath, challengeResult.sha, `respond challenge from ${from}`);

    if (!accept) {
      // Decline — also delete the game file
      const gameResult = await this.api.readFile(`games/${code}.json`);
      if (gameResult) {
        await this.api.deleteFile(`games/${code}.json`, gameResult.sha, `decline game ${code}`);
      }
      return { ok: true };
    }

    // Accept — join the game
    const joinResult = await this.joinGame(code);
    if (!joinResult.ok) {
      return { ok: false };
    }

    const gameState = await this.readGame(code);
    return { ok: true, gameState: gameState ?? undefined };
  }
}
