import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubAPI } from '../src/renderer/game/github-api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

let api: GitHubAPI;

beforeEach(() => {
  mockFetch.mockReset();
  api = new GitHubAPI('test-token', 'owner/repo');
});

describe('createIssue', () => {
  it('creates an issue and returns it', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ number: 42, title: 'test', body: '{}', state: 'open', user: { login: 'alice' }, updated_at: '2024-01-01' }),
    });
    const result = await api.createIssue('test', '{}');
    expect(result).not.toBeNull();
    expect(result!.number).toBe(42);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/issues'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns null on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422 });
    const result = await api.createIssue('test', '{}');
    expect(result).toBeNull();
  });
});

describe('updateIssue', () => {
  it('updates an issue body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await api.updateIssue(42, { body: 'new body' });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/issues/42'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('returns false on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    const result = await api.updateIssue(42, { body: 'x' });
    expect(result).toBe(false);
  });
});

describe('searchIssues', () => {
  it('returns issues matching title prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { number: 1, title: '[C4:Game] ABCDEF', body: '{}', state: 'open', user: { login: 'alice' }, updated_at: '' },
        { number: 2, title: '[C4:Game] GHIJKL', body: '{}', state: 'open', user: { login: 'bob' }, updated_at: '' },
        { number: 3, title: '[C4:Presence] alice', body: '{}', state: 'open', user: { login: 'alice' }, updated_at: '' },
      ],
    });
    const result = await api.searchIssues('[C4:Game]');
    expect(result.length).toBe(2);
  });

  it('returns empty array on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await api.searchIssues('[C4:Game]');
    expect(result).toEqual([]);
  });
});

describe('addComment', () => {
  it('adds a comment and returns it', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 99, body: '{"action":"move"}', user: { login: 'alice' }, created_at: '' }),
    });
    const result = await api.addComment(42, '{"action":"move"}');
    expect(result).not.toBeNull();
    expect(result!.id).toBe(99);
  });
});

describe('getComments', () => {
  it('returns comments for an issue', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 1, body: '{"action":"join"}', user: { login: 'bob' }, created_at: '' },
        { id: 2, body: '{"action":"move","column":3}', user: { login: 'alice' }, created_at: '' },
      ],
    });
    const result = await api.getComments(42);
    expect(result.length).toBe(2);
  });
});

describe('getIssue', () => {
  it('returns a specific issue', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ number: 42, title: 'test', body: '{}', state: 'open', user: { login: 'alice' }, updated_at: '' }),
    });
    const result = await api.getIssue(42);
    expect(result).not.toBeNull();
    expect(result!.number).toBe(42);
  });

  it('returns null for missing issue', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    const result = await api.getIssue(999);
    expect(result).toBeNull();
  });
});
