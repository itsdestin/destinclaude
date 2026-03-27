// GitHub Issues API wrapper for Connect 4 game state.
// Uses Issues + Comments instead of Contents API so any GitHub user
// can interact with the public repo without being a collaborator.

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: { login: string };
  updated_at: string;
}

// Default timeout for API requests (15 seconds)
const FETCH_TIMEOUT_MS = 15_000;

export class GitHubAPI {
  private token: string;
  private repo: string;
  private apiBase: string;

  constructor(token: string, repo: string) {
    this.token = token;
    this.repo = repo;
    this.apiBase = `https://api.github.com/repos/${repo}`;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  /** Fetch with timeout and safe JSON parsing */
  private async safeFetch(url: string, opts?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Safely parse JSON from a response, returning null on malformed data */
  private async safeJson<T>(res: Response): Promise<T | null> {
    try {
      return await res.json();
    } catch {
      console.warn('[GitHubAPI] Failed to parse JSON response');
      return null;
    }
  }

  /** Create a new issue. Returns the issue number. */
  async createIssue(title: string, body: string): Promise<Issue | null> {
    const res = await this.safeFetch(`${this.apiBase}/issues`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) return null;
    return await this.safeJson<Issue>(res);
  }

  /** Update an issue's body or state. Only the issue creator can do this. */
  async updateIssue(issueNumber: number, updates: { body?: string; state?: 'open' | 'closed' }): Promise<boolean> {
    const res = await this.safeFetch(`${this.apiBase}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(updates),
    });
    return res.ok;
  }

  /** Search for issues by title prefix. Returns open issues by default. */
  async searchIssues(titlePrefix: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<Issue[]> {
    const res = await this.safeFetch(
      `${this.apiBase}/issues?state=${state}&per_page=100&sort=updated&direction=desc`,
      { headers: this.headers() },
    );
    if (!res.ok) return [];
    const issues = await this.safeJson<Issue[]>(res);
    return (issues || []).filter((i) => i.title.startsWith(titlePrefix));
  }

  /** Get a specific issue by number. */
  async getIssue(issueNumber: number): Promise<Issue | null> {
    const res = await this.safeFetch(`${this.apiBase}/issues/${issueNumber}`, { headers: this.headers() });
    if (!res.ok) return null;
    return await this.safeJson<Issue>(res);
  }

}
