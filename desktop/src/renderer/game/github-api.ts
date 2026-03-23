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

export interface Comment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
}

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

  /** Create a new issue. Returns the issue number. */
  async createIssue(title: string, body: string): Promise<Issue | null> {
    const res = await fetch(`${this.apiBase}/issues`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) return null;
    return await res.json();
  }

  /** Update an issue's body or state. Only the issue creator can do this. */
  async updateIssue(issueNumber: number, updates: { body?: string; state?: 'open' | 'closed' }): Promise<boolean> {
    const res = await fetch(`${this.apiBase}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(updates),
    });
    return res.ok;
  }

  /** Search for issues by title prefix. Returns open issues by default. */
  async searchIssues(titlePrefix: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<Issue[]> {
    const res = await fetch(
      `${this.apiBase}/issues?state=${state}&per_page=100&sort=updated&direction=desc`,
      { headers: this.headers() },
    );
    if (!res.ok) return [];
    const issues: Issue[] = await res.json();
    return issues.filter((i) => i.title.startsWith(titlePrefix));
  }

  /** Get a specific issue by number. */
  async getIssue(issueNumber: number): Promise<Issue | null> {
    const res = await fetch(`${this.apiBase}/issues/${issueNumber}`, { headers: this.headers() });
    if (!res.ok) return null;
    return await res.json();
  }

  /** Add a comment to an issue. Any GitHub user can do this on public repos. */
  async addComment(issueNumber: number, body: string): Promise<Comment | null> {
    const res = await fetch(`${this.apiBase}/issues/${issueNumber}/comments`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return null;
    return await res.json();
  }

  /** Get all comments on an issue. */
  async getComments(issueNumber: number): Promise<Comment[]> {
    const res = await fetch(
      `${this.apiBase}/issues/${issueNumber}/comments?per_page=100&sort=created&direction=asc`,
      { headers: this.headers() },
    );
    if (!res.ok) return [];
    return await res.json();
  }

  /** Get comments added after a certain count (for incremental polling). */
  async getCommentsSince(issueNumber: number, afterCount: number): Promise<Comment[]> {
    // GitHub doesn't support "after comment N" natively, so fetch page by page
    // For our use case (Connect 4 with ~42 max moves), one page is always enough
    const page = Math.floor(afterCount / 100) + 1;
    const res = await fetch(
      `${this.apiBase}/issues/${issueNumber}/comments?per_page=100&page=${page}&sort=created&direction=asc`,
      { headers: this.headers() },
    );
    if (!res.ok) return [];
    const all: Comment[] = await res.json();
    const offset = afterCount % 100;
    return all.slice(offset);
  }
}
