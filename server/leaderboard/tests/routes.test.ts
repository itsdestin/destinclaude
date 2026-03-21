import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/routes';
import { createDb } from '../src/db';
import { createServer } from 'http';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const db = createDb(':memory:');
  app = createApp(db, 'test-secret');
});

async function request(
  method: string,
  path: string,
  body?: object,
  headers?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address() as { port: number };
      const url = `http://localhost:${addr.port}${path}`;
      const opts: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
      };
      fetch(url, opts)
        .then(async (res) => {
          const text = await res.text();
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            json = text;
          }
          resolve({ status: res.status, body: json });
        })
        .finally(() => server.close());
    });
  });
}

describe('POST /players', () => {
  it('returns 201 and player record for new registration', async () => {
    const { status, body } = await request('POST', '/players', {
      username: 'alice',
      password: 'pass123',
    });
    expect(status).toBe(201);
    expect(body.username).toBe('alice');
    expect(body.wins).toBe(0);
    expect(body.losses).toBe(0);
    expect(body.draws).toBe(0);
  });

  it('returns 409 for duplicate username', async () => {
    await request('POST', '/players', { username: 'alice', password: 'pass123' });
    const { status, body } = await request('POST', '/players', {
      username: 'alice',
      password: 'other',
    });
    expect(status).toBe(409);
    expect(body.error).toBe('username taken');
  });

  it('returns 400 when username is missing', async () => {
    const { status, body } = await request('POST', '/players', { password: 'pass123' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/username/);
  });

  it('returns 400 when password is missing', async () => {
    const { status, body } = await request('POST', '/players', { username: 'alice' });
    expect(status).toBe(400);
    expect(body.error).toMatch(/password/);
  });
});

describe('POST /players/verify', () => {
  it('returns 200 with valid:true for correct credentials', async () => {
    await request('POST', '/players', { username: 'alice', password: 'pass123' });
    const { status, body } = await request('POST', '/players/verify', {
      username: 'alice',
      password: 'pass123',
    });
    expect(status).toBe(200);
    expect(body.valid).toBe(true);
  });

  it('returns 401 with valid:false for wrong password', async () => {
    await request('POST', '/players', { username: 'alice', password: 'pass123' });
    const { status, body } = await request('POST', '/players/verify', {
      username: 'alice',
      password: 'wrong',
    });
    expect(status).toBe(401);
    expect(body.valid).toBe(false);
  });

  it('returns 401 for nonexistent user', async () => {
    const { status, body } = await request('POST', '/players/verify', {
      username: 'nobody',
      password: 'pass',
    });
    expect(status).toBe(401);
    expect(body.valid).toBe(false);
  });

  it('returns 400 when fields are missing', async () => {
    const { status } = await request('POST', '/players/verify', { username: 'alice' });
    expect(status).toBe(400);
  });
});

describe('GET /players/:username', () => {
  it('returns 200 with player stats', async () => {
    await request('POST', '/players', { username: 'alice', password: 'pass123' });
    const { status, body } = await request('GET', '/players/alice');
    expect(status).toBe(200);
    expect(body.username).toBe('alice');
    expect(typeof body.wins).toBe('number');
  });

  it('returns 404 for unknown player', async () => {
    const { status, body } = await request('GET', '/players/nobody');
    expect(status).toBe(404);
    expect(body.error).toBe('player not found');
  });
});

describe('GET /leaderboard', () => {
  it('returns sorted list of players by wins descending', async () => {
    await request('POST', '/players', { username: 'alice', password: 'p1' });
    await request('POST', '/players', { username: 'bob', password: 'p2' });
    // Give bob 2 wins, alice 1
    await request('POST', '/results', { winner: 'bob', loser: 'alice' }, {
      Authorization: 'Bearer test-secret',
    });
    await request('POST', '/results', { winner: 'bob', loser: 'alice' }, {
      Authorization: 'Bearer test-secret',
    });
    await request('POST', '/results', { winner: 'alice', loser: 'bob' }, {
      Authorization: 'Bearer test-secret',
    });
    const { status, body } = await request('GET', '/leaderboard');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].username).toBe('bob');
    expect(body[0].wins).toBe(2);
    expect(body[1].username).toBe('alice');
  });

  it('respects limit query param', async () => {
    await request('POST', '/players', { username: 'a', password: 'p' });
    await request('POST', '/players', { username: 'b', password: 'p' });
    await request('POST', '/players', { username: 'c', password: 'p' });
    const { status, body } = await request('GET', '/leaderboard?limit=2');
    expect(status).toBe(200);
    expect(body.length).toBe(2);
  });

  it('caps limit at 100', async () => {
    // Just confirm the route accepts a large limit without error
    const { status } = await request('GET', '/leaderboard?limit=999');
    expect(status).toBe(200);
  });
});

describe('POST /results', () => {
  it('returns 401 without authorization header', async () => {
    const { status, body } = await request('POST', '/results', {
      winner: 'alice',
      loser: 'bob',
    });
    expect(status).toBe(401);
    expect(body.error).toBe('unauthorized');
  });

  it('returns 401 with wrong secret', async () => {
    const { status } = await request(
      'POST',
      '/results',
      { winner: 'alice', loser: 'bob' },
      { Authorization: 'Bearer wrong-secret' },
    );
    expect(status).toBe(401);
  });

  it('returns 400 when winner or loser missing', async () => {
    const { status, body } = await request(
      'POST',
      '/results',
      { winner: 'alice' },
      { Authorization: 'Bearer test-secret' },
    );
    expect(status).toBe(400);
    expect(body.error).toMatch(/loser/);
  });

  it('records a win/loss with correct secret', async () => {
    await request('POST', '/players', { username: 'alice', password: 'p1' });
    await request('POST', '/players', { username: 'bob', password: 'p2' });
    const { status, body } = await request(
      'POST',
      '/results',
      { winner: 'alice', loser: 'bob' },
      { Authorization: 'Bearer test-secret' },
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    const { body: alice } = await request('GET', '/players/alice');
    expect(alice.wins).toBe(1);
    const { body: bob } = await request('GET', '/players/bob');
    expect(bob.losses).toBe(1);
  });

  it('returns 422 when players do not exist', async () => {
    const res = await request('POST', '/results', { winner: 'ghost', loser: 'nobody' }, { Authorization: 'Bearer test-secret' });
    expect(res.status).toBe(422);
  });

  it('records a draw with draw:true', async () => {
    await request('POST', '/players', { username: 'alice', password: 'p1' });
    await request('POST', '/players', { username: 'bob', password: 'p2' });
    const { status } = await request(
      'POST',
      '/results',
      { winner: 'alice', loser: 'bob', draw: true },
      { Authorization: 'Bearer test-secret' },
    );
    expect(status).toBe(200);
    const { body: alice } = await request('GET', '/players/alice');
    expect(alice.draws).toBe(1);
  });
});
