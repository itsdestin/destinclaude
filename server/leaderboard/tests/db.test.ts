import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, registerPlayer, verifyPlayer, getPlayer, getLeaderboard, recordResult } from '../src/db';

let db: ReturnType<typeof createDb>;

beforeEach(() => {
  db = createDb(':memory:');
});

describe('registerPlayer', () => {
  it('registers a new player and returns the player record', async () => {
    const player = await registerPlayer(db, 'alice', 'pass123');
    expect(player.username).toBe('alice');
    expect(player.wins).toBe(0);
  });

  it('throws on duplicate username', async () => {
    await registerPlayer(db, 'alice', 'pass123');
    await expect(registerPlayer(db, 'alice', 'other')).rejects.toThrow();
  });
});

describe('verifyPlayer', () => {
  it('returns true for correct password', async () => {
    await registerPlayer(db, 'alice', 'pass123');
    expect(await verifyPlayer(db, 'alice', 'pass123')).toBe(true);
  });

  it('returns false for wrong password', async () => {
    await registerPlayer(db, 'alice', 'pass123');
    expect(await verifyPlayer(db, 'alice', 'wrong')).toBe(false);
  });

  it('returns false for nonexistent user', async () => {
    expect(await verifyPlayer(db, 'nobody', 'pass')).toBe(false);
  });
});

describe('getPlayer', () => {
  it('returns player stats', async () => {
    await registerPlayer(db, 'alice', 'pass123');
    const player = getPlayer(db, 'alice');
    expect(player).not.toBeNull();
    expect(player!.username).toBe('alice');
  });

  it('returns null for unknown player', () => {
    expect(getPlayer(db, 'nobody')).toBeNull();
  });
});

describe('recordResult', () => {
  it('increments winner wins and loser losses', async () => {
    await registerPlayer(db, 'alice', 'p1');
    await registerPlayer(db, 'bob', 'p2');
    recordResult(db, 'alice', 'bob', false);
    expect(getPlayer(db, 'alice')!.wins).toBe(1);
    expect(getPlayer(db, 'bob')!.losses).toBe(1);
  });

  it('increments draws for both players', async () => {
    await registerPlayer(db, 'alice', 'p1');
    await registerPlayer(db, 'bob', 'p2');
    recordResult(db, 'alice', 'bob', true);
    expect(getPlayer(db, 'alice')!.draws).toBe(1);
    expect(getPlayer(db, 'bob')!.draws).toBe(1);
  });
});

describe('getLeaderboard', () => {
  it('returns players sorted by wins descending', async () => {
    await registerPlayer(db, 'alice', 'p1');
    await registerPlayer(db, 'bob', 'p2');
    recordResult(db, 'bob', 'alice', false);
    recordResult(db, 'bob', 'alice', false);
    recordResult(db, 'alice', 'bob', false);
    const lb = getLeaderboard(db, 10);
    expect(lb[0].username).toBe('bob');
    expect(lb[0].wins).toBe(2);
    expect(lb[1].username).toBe('alice');
  });

  it('respects limit parameter', async () => {
    await registerPlayer(db, 'a', 'p');
    await registerPlayer(db, 'b', 'p');
    await registerPlayer(db, 'c', 'p');
    const lb = getLeaderboard(db, 2);
    expect(lb.length).toBe(2);
  });
});
