import { GitHubAPI, Issue, Comment } from './github-api';
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

// Comment actions (event-sourced game state)
interface GameAction {
  action: 'join' | 'move' | 'chat' | 'leave' | 'rematch';
  username: string;
  column?: number;
  text?: string;
  timestamp: number;
}

// Title prefixes for issue types
const PREFIX_GAME = '[C4:Game]';
const PREFIX_PRESENCE = '[C4:Presence]';
const PREFIX_STATS = '[C4:Stats]';
const PREFIX_CHALLENGE = '[C4:Challenge]';

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
// Helpers
// ---------------------------------------------------------------------------

function parseIssueBody<T>(issue: Issue): T | null {
  try {
    return JSON.parse(issue.body) as T;
  } catch {
    return null;
  }
}

function parseComment(comment: Comment): GameAction | null {
  try {
    return JSON.parse(comment.body) as GameAction;
  } catch {
    return null;
  }
}

/** Replay game actions on top of initial state to get current state. */
function replayGame(initial: GameFile, actions: GameAction[]): GameFile {
  let game = { ...initial, chat: [...initial.chat] };

  for (const action of actions) {
    switch (action.action) {
      case 'join':
        if (game.status === 'waiting' && !game.yellow && action.username !== game.red) {
          game = { ...game, yellow: action.username, status: 'playing' };
        }
        break;

      case 'move':
        if (game.status === 'playing' && action.column !== undefined) {
          const currentPlayer = game.turn === 'red' ? game.red : game.yellow;
          if (action.username !== currentPlayer) break;

          const playerNum = game.turn === 'red' ? 1 : 2;
          const result = dropPiece(game.board, action.column, playerNum);
          if (!result) break;

          const winLine = checkWin(result.board, { col: action.column, row: result.row });
          const isDraw = !winLine && checkDraw(result.board);

          if (winLine) {
            game = { ...game, board: result.board, status: 'finished', winner: game.turn, winLine: winLine as [number, number][] };
          } else if (isDraw) {
            game = { ...game, board: result.board, status: 'finished', winner: 'draw' };
          } else {
            game = { ...game, board: result.board, turn: game.turn === 'red' ? 'yellow' : 'red' };
          }
        }
        break;

      case 'chat':
        if (action.text) {
          game = { ...game, chat: [...game.chat, { from: action.username, text: action.text, timestamp: action.timestamp }] };
        }
        break;

      case 'leave':
        if (game.status === 'playing') {
          const opponentColor: 'red' | 'yellow' = game.red === action.username ? 'yellow' : 'red';
          game = { ...game, status: 'finished', winner: opponentColor };
        }
        break;

      case 'rematch': {
        const votes = game.rematchVotes ?? [];
        if (!votes.includes(action.username)) {
          const newVotes = [...votes, action.username];
          const bothVoted = game.yellow && newVotes.includes(game.red) && newVotes.includes(game.yellow);
          if (bothVoted) {
            game = {
              ...game,
              red: game.yellow!,
              yellow: game.red,
              board: createBoard(),
              turn: 'red',
              status: 'playing',
              winner: undefined,
              winLine: undefined,
              rematchVotes: [],
            };
          } else {
            game = { ...game, rematchVotes: newVotes };
          }
        }
        break;
      }
    }
  }

  return game;
}

// ---------------------------------------------------------------------------
// GameOps
// ---------------------------------------------------------------------------

export class GameOps {
  private api: GitHubAPI;
  private username: string;
  // Cache issue numbers to avoid repeated searches
  private presenceIssueNumber: number | null = null;
  private statsIssueNumber: number | null = null;
  private gameIssueCache = new Map<string, number>(); // code -> issue number
  private commentCountCache = new Map<number, number>(); // issue number -> last known comment count

  constructor(api: GitHubAPI, username: string) {
    this.api = api;
    this.username = username;
  }

  // -------------------------------------------------------------------------
  // Game lifecycle
  // -------------------------------------------------------------------------

  async createGame(): Promise<string> {
    const code = generateCode();
    const initial: GameFile = {
      code,
      red: this.username,
      yellow: null,
      board: createBoard(),
      turn: 'red',
      status: 'waiting',
      chat: [],
    };
    const issue = await this.api.createIssue(
      `${PREFIX_GAME} ${code}`,
      JSON.stringify(initial),
    );
    if (issue) {
      this.gameIssueCache.set(code, issue.number);
      this.commentCountCache.set(issue.number, 0);
    }
    return code;
  }

  async joinGame(code: string): Promise<{ ok: boolean; error?: string }> {
    const issueNum = await this.findGameIssue(code);
    if (!issueNum) return { ok: false, error: 'Game not found' };

    const game = await this.getGameState(issueNum);
    if (!game) return { ok: false, error: 'Game not found' };
    if (game.status !== 'waiting') return { ok: false, error: 'Game is not waiting for a player' };
    if (game.yellow !== null) return { ok: false, error: 'Game is already full' };
    if (game.red === this.username) return { ok: false, error: 'Cannot join your own game' };

    const action: GameAction = { action: 'join', username: this.username, timestamp: Date.now() };
    const comment = await this.api.addComment(issueNum, JSON.stringify(action));
    if (!comment) return { ok: false, error: 'Failed to join game' };

    this.incrementCommentCount(issueNum);
    return { ok: true };
  }

  async readGame(code: string): Promise<GameFile | null> {
    const issueNum = await this.findGameIssue(code);
    if (!issueNum) return null;
    return this.getGameState(issueNum);
  }

  async makeMove(code: string, column: number): Promise<{ ok: boolean; gameState?: GameFile; error?: string }> {
    const issueNum = await this.findGameIssue(code);
    if (!issueNum) return { ok: false, error: 'Game not found' };

    const game = await this.getGameState(issueNum);
    if (!game) return { ok: false, error: 'Game not found' };
    if (game.status !== 'playing') return { ok: false, error: 'Game is not in playing state' };

    const myColor = game.red === this.username ? 'red' : 'yellow';
    if (game.turn !== myColor) return { ok: false, error: 'Not your turn' };

    // Validate move locally before posting
    const playerNum = myColor === 'red' ? 1 : 2;
    const dropResult = dropPiece(game.board, column, playerNum);
    if (!dropResult) return { ok: false, error: 'Invalid move' };

    const action: GameAction = { action: 'move', username: this.username, column, timestamp: Date.now() };
    const comment = await this.api.addComment(issueNum, JSON.stringify(action));
    if (!comment) return { ok: false, error: 'Failed to post move' };

    this.incrementCommentCount(issueNum);

    // Compute new state locally
    const newGame = replayGame(game, [parseComment({ ...comment, body: JSON.stringify(action) } as any)!]);

    // Update stats on game end
    if (newGame.status === 'finished' && game.yellow) {
      if (newGame.winner === 'draw') {
        await this.recordResult(game.red, game.yellow, true);
      } else if (newGame.winner) {
        const winner = newGame.winner === 'red' ? game.red : game.yellow;
        const loser = newGame.winner === 'red' ? game.yellow : game.red;
        await this.recordResult(winner, loser, false);
      }
    }

    return { ok: true, gameState: newGame };
  }

  async sendChat(code: string, text: string): Promise<boolean> {
    const issueNum = await this.findGameIssue(code);
    if (!issueNum) return false;

    const action: GameAction = { action: 'chat', username: this.username, text, timestamp: Date.now() };
    const comment = await this.api.addComment(issueNum, JSON.stringify(action));
    if (comment) this.incrementCommentCount(issueNum);
    return comment !== null;
  }

  async leaveGame(code: string): Promise<void> {
    const issueNum = await this.findGameIssue(code);
    if (!issueNum) return;

    const game = await this.getGameState(issueNum);
    if (!game) return;

    if (game.status === 'playing' && game.yellow) {
      const action: GameAction = { action: 'leave', username: this.username, timestamp: Date.now() };
      await this.api.addComment(issueNum, JSON.stringify(action));

      const opponent = game.red === this.username ? game.yellow : game.red;
      await this.recordResult(opponent, this.username, false);
    }

    this.gameIssueCache.delete(code);
    this.commentCountCache.delete(issueNum);
  }

  async requestRematch(code: string): Promise<{ ready: boolean; gameState?: GameFile }> {
    const issueNum = await this.findGameIssue(code);
    if (!issueNum) return { ready: false };

    const game = await this.getGameState(issueNum);
    if (!game) return { ready: false };

    const votes = game.rematchVotes ?? [];
    if (votes.includes(this.username)) return { ready: false, gameState: game };

    const action: GameAction = { action: 'rematch', username: this.username, timestamp: Date.now() };
    await this.api.addComment(issueNum, JSON.stringify(action));
    this.incrementCommentCount(issueNum);

    const newGame = replayGame(game, [{ ...action }]);
    return { ready: newGame.status === 'playing', gameState: newGame };
  }

  // -------------------------------------------------------------------------
  // Presence (each user owns their own issue)
  // -------------------------------------------------------------------------

  async updatePresence(status: 'idle' | 'in-game'): Promise<void> {
    const body = JSON.stringify({ username: this.username, status, timestamp: Date.now() });

    if (this.presenceIssueNumber) {
      // Update existing issue
      await this.api.updateIssue(this.presenceIssueNumber, { body });
      return;
    }

    // Search for existing presence issue
    const issues = await this.api.searchIssues(`${PREFIX_PRESENCE} ${this.username}`);
    const mine = issues.find((i) => i.user.login === this.username);

    if (mine) {
      this.presenceIssueNumber = mine.number;
      await this.api.updateIssue(mine.number, { body });
    } else {
      // Create new presence issue
      const issue = await this.api.createIssue(`${PREFIX_PRESENCE} ${this.username}`, body);
      if (issue) this.presenceIssueNumber = issue.number;
    }
  }

  async getOnlineUsers(): Promise<{ username: string; status: 'idle' | 'in-game' }[]> {
    const issues = await this.api.searchIssues(PREFIX_PRESENCE);
    const cutoff = Date.now() - 300_000; // 5 minutes
    const users: { username: string; status: 'idle' | 'in-game' }[] = [];

    for (const issue of issues) {
      const data = parseIssueBody<{ username: string; status: 'idle' | 'in-game'; timestamp: number }>(issue);
      if (data && data.timestamp >= cutoff) {
        users.push({ username: data.username, status: data.status });
      }
    }

    return users;
  }

  // -------------------------------------------------------------------------
  // Leaderboard (each user owns their own stats issue)
  // -------------------------------------------------------------------------

  async getLeaderboard(): Promise<{ username: string; wins: number; losses: number; draws: number }[]> {
    const issues = await this.api.searchIssues(PREFIX_STATS);
    const entries: { username: string; wins: number; losses: number; draws: number }[] = [];

    for (const issue of issues) {
      const data = parseIssueBody<{ username: string; wins: number; losses: number; draws: number }>(issue);
      if (data) entries.push(data);
    }

    return entries.sort((a, b) => b.wins - a.wins);
  }

  async recordResult(winner: string, loser: string, isDraw: boolean): Promise<void> {
    // Update my own stats issue (I can only update issues I created)
    if (this.username === winner || this.username === loser) {
      await this.updateMyStats(this.username === winner, isDraw);
    }
  }

  private async updateMyStats(isWinner: boolean, isDraw: boolean): Promise<void> {
    let issueNum = this.statsIssueNumber;
    let currentStats = { username: this.username, wins: 0, losses: 0, draws: 0 };

    if (!issueNum) {
      const issues = await this.api.searchIssues(`${PREFIX_STATS} ${this.username}`);
      const mine = issues.find((i) => i.user.login === this.username);
      if (mine) {
        issueNum = mine.number;
        this.statsIssueNumber = mine.number;
        const data = parseIssueBody<typeof currentStats>(mine);
        if (data) currentStats = data;
      }
    } else {
      const issue = await this.api.getIssue(issueNum);
      if (issue) {
        const data = parseIssueBody<typeof currentStats>(issue);
        if (data) currentStats = data;
      }
    }

    if (isDraw) {
      currentStats.draws += 1;
    } else if (isWinner) {
      currentStats.wins += 1;
    } else {
      currentStats.losses += 1;
    }

    if (issueNum) {
      await this.api.updateIssue(issueNum, { body: JSON.stringify(currentStats) });
    } else {
      const issue = await this.api.createIssue(
        `${PREFIX_STATS} ${this.username}`,
        JSON.stringify(currentStats),
      );
      if (issue) this.statsIssueNumber = issue.number;
    }
  }

  // -------------------------------------------------------------------------
  // Challenges
  // -------------------------------------------------------------------------

  async challengePlayer(target: string): Promise<string> {
    const code = await this.createGame();
    await this.api.createIssue(
      `${PREFIX_CHALLENGE} ${target} from ${this.username}`,
      JSON.stringify({ from: this.username, target, code }),
    );
    return code;
  }

  async getMyChallenge(): Promise<{ from: string; code: string } | null> {
    const issues = await this.api.searchIssues(`${PREFIX_CHALLENGE} ${this.username} from `);
    if (issues.length === 0) return null;
    const data = parseIssueBody<{ from: string; code: string }>(issues[0]);
    return data;
  }

  async respondToChallenge(from: string, accept: boolean): Promise<{ ok: boolean; gameState?: GameFile }> {
    // Find and close the challenge issue
    const issues = await this.api.searchIssues(`${PREFIX_CHALLENGE} ${this.username} from ${from}`);
    for (const issue of issues) {
      // Only the creator can close — add a comment to mark as responded
      // The challenger will see the issue is stale
      await this.api.addComment(issue.number, JSON.stringify({ responded: true, accept }));
      // Try to close (works if we created it, fails silently otherwise)
      await this.api.updateIssue(issue.number, { state: 'closed' });
    }

    if (!accept) return { ok: true };

    // Find the game code from the challenge
    if (issues.length === 0) return { ok: false };
    const data = parseIssueBody<{ from: string; code: string }>(issues[0]);
    if (!data) return { ok: false };

    const joinResult = await this.joinGame(data.code);
    if (!joinResult.ok) return { ok: false };

    const gameState = await this.readGame(data.code);
    return { ok: true, gameState: gameState ?? undefined };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async findGameIssue(code: string): Promise<number | null> {
    const cached = this.gameIssueCache.get(code);
    if (cached) return cached;

    const issues = await this.api.searchIssues(`${PREFIX_GAME} ${code}`, 'all');
    if (issues.length === 0) return null;

    this.gameIssueCache.set(code, issues[0].number);
    return issues[0].number;
  }

  private async getGameState(issueNumber: number): Promise<GameFile | null> {
    const issue = await this.api.getIssue(issueNumber);
    if (!issue) return null;

    const initial = parseIssueBody<GameFile>(issue);
    if (!initial) return null;

    const comments = await this.api.getComments(issueNumber);
    const actions = comments.map(parseComment).filter((a): a is GameAction => a !== null);

    return replayGame(initial, actions);
  }

  private incrementCommentCount(issueNumber: number): void {
    const current = this.commentCountCache.get(issueNumber) ?? 0;
    this.commentCountCache.set(issueNumber, current + 1);
  }
}
