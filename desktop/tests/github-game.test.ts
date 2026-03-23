import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameOps } from '../src/renderer/game/github-game';
import type { GitHubAPI } from '../src/renderer/game/github-api';

let ops: GameOps;
let mockApi: any;

beforeEach(() => {
  mockApi = {
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    searchIssues: vi.fn(),
    getIssue: vi.fn(),
    addComment: vi.fn(),
    getComments: vi.fn(),
    getCommentsSince: vi.fn(),
  };
  ops = new GameOps(mockApi as unknown as GitHubAPI, 'testuser');
});

describe('createGame', () => {
  it('creates a game issue and returns a 6-char code', async () => {
    mockApi.createIssue.mockResolvedValueOnce({ number: 1, title: '', body: '', state: 'open', user: { login: 'testuser' }, updated_at: '' });
    const code = await ops.createGame();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(mockApi.createIssue).toHaveBeenCalledWith(
      expect.stringContaining('[C4:Game]'),
      expect.stringContaining('"red":"testuser"'),
    );
  });
});

describe('joinGame', () => {
  it('joins a waiting game by adding a comment', async () => {
    const initial = { code: 'ABCDEF', red: 'alice', yellow: null, board: [], turn: 'red', status: 'waiting', chat: [] };
    mockApi.searchIssues.mockResolvedValueOnce([{ number: 1, title: '[C4:Game] ABCDEF', body: JSON.stringify(initial), state: 'open', user: { login: 'alice' }, updated_at: '' }]);
    mockApi.getIssue.mockResolvedValueOnce({ number: 1, body: JSON.stringify(initial), state: 'open', user: { login: 'alice' }, updated_at: '' });
    mockApi.getComments.mockResolvedValueOnce([]);
    mockApi.addComment.mockResolvedValueOnce({ id: 1, body: '{}', user: { login: 'testuser' }, created_at: '' });

    const result = await ops.joinGame('ABCDEF');
    expect(result.ok).toBe(true);
    expect(mockApi.addComment).toHaveBeenCalledWith(1, expect.stringContaining('"action":"join"'));
  });

  it('rejects joining a full game', async () => {
    const initial = { code: 'ABCDEF', red: 'alice', yellow: 'bob', board: [], turn: 'red', status: 'playing', chat: [] };
    mockApi.searchIssues.mockResolvedValueOnce([{ number: 1, title: '[C4:Game] ABCDEF', body: JSON.stringify(initial), state: 'open', user: { login: 'alice' }, updated_at: '' }]);
    mockApi.getIssue.mockResolvedValueOnce({ number: 1, body: JSON.stringify(initial), state: 'open', user: { login: 'alice' }, updated_at: '' });
    mockApi.getComments.mockResolvedValueOnce([]);

    const result = await ops.joinGame('ABCDEF');
    expect(result.ok).toBe(false);
  });
});

describe('makeMove', () => {
  it('posts a move comment and returns updated state', async () => {
    const board = Array.from({ length: 7 }, () => Array(6).fill(0));
    const initial = { code: 'ABCDEF', red: 'testuser', yellow: 'bob', board, turn: 'red', status: 'playing', chat: [] };
    mockApi.searchIssues.mockResolvedValueOnce([{ number: 1, title: '[C4:Game] ABCDEF', body: JSON.stringify(initial), state: 'open', user: { login: 'testuser' }, updated_at: '' }]);
    mockApi.getIssue.mockResolvedValueOnce({ number: 1, body: JSON.stringify(initial), state: 'open', user: { login: 'testuser' }, updated_at: '' });
    mockApi.getComments.mockResolvedValueOnce([]);
    mockApi.addComment.mockResolvedValueOnce({ id: 1, body: '{}', user: { login: 'testuser' }, created_at: '' });

    const result = await ops.makeMove('ABCDEF', 3);
    expect(result.ok).toBe(true);
    expect(result.gameState).toBeDefined();
    expect(result.gameState!.board[3][0]).toBe(1); // red piece at bottom
    expect(result.gameState!.turn).toBe('yellow');
  });

  it('rejects move when not your turn', async () => {
    const board = Array.from({ length: 7 }, () => Array(6).fill(0));
    const initial = { code: 'ABCDEF', red: 'alice', yellow: 'testuser', board, turn: 'red', status: 'playing', chat: [] };
    mockApi.searchIssues.mockResolvedValueOnce([{ number: 1, title: '[C4:Game] ABCDEF', body: JSON.stringify(initial), state: 'open', user: { login: 'alice' }, updated_at: '' }]);
    mockApi.getIssue.mockResolvedValueOnce({ number: 1, body: JSON.stringify(initial), state: 'open', user: { login: 'alice' }, updated_at: '' });
    mockApi.getComments.mockResolvedValueOnce([]);

    const result = await ops.makeMove('ABCDEF', 3);
    expect(result.ok).toBe(false);
  });
});

describe('updatePresence', () => {
  it('creates a presence issue on first call', async () => {
    mockApi.searchIssues.mockResolvedValueOnce([]);
    mockApi.createIssue.mockResolvedValueOnce({ number: 10, title: '', body: '', state: 'open', user: { login: 'testuser' }, updated_at: '' });

    await ops.updatePresence('idle');
    expect(mockApi.createIssue).toHaveBeenCalledWith(
      expect.stringContaining('[C4:Presence]'),
      expect.stringContaining('"status":"idle"'),
    );
  });

  it('updates existing presence issue', async () => {
    mockApi.searchIssues.mockResolvedValueOnce([{ number: 10, title: '[C4:Presence] testuser', body: '{}', state: 'open', user: { login: 'testuser' }, updated_at: '' }]);
    mockApi.updateIssue.mockResolvedValueOnce(true);

    await ops.updatePresence('in-game');
    expect(mockApi.updateIssue).toHaveBeenCalledWith(10, { body: expect.stringContaining('"status":"in-game"') });
  });
});

describe('getOnlineUsers', () => {
  it('returns users with timestamps within 5 minutes', async () => {
    const now = Date.now();
    mockApi.searchIssues.mockResolvedValueOnce([
      { number: 1, title: '[C4:Presence] alice', body: JSON.stringify({ username: 'alice', status: 'idle', timestamp: now - 60000 }), state: 'open', user: { login: 'alice' }, updated_at: '' },
      { number: 2, title: '[C4:Presence] bob', body: JSON.stringify({ username: 'bob', status: 'idle', timestamp: now - 400000 }), state: 'open', user: { login: 'bob' }, updated_at: '' },
    ]);

    const users = await ops.getOnlineUsers();
    expect(users.length).toBe(1);
    expect(users[0].username).toBe('alice');
  });
});

describe('getLeaderboard', () => {
  it('returns stats sorted by wins', async () => {
    mockApi.searchIssues.mockResolvedValueOnce([
      { number: 1, title: '[C4:Stats] alice', body: JSON.stringify({ username: 'alice', wins: 3, losses: 1, draws: 0 }), state: 'open', user: { login: 'alice' }, updated_at: '' },
      { number: 2, title: '[C4:Stats] bob', body: JSON.stringify({ username: 'bob', wins: 5, losses: 2, draws: 1 }), state: 'open', user: { login: 'bob' }, updated_at: '' },
    ]);

    const lb = await ops.getLeaderboard();
    expect(lb[0].username).toBe('bob');
    expect(lb[0].wins).toBe(5);
  });
});
