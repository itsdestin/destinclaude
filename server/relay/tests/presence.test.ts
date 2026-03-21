import { describe, it, expect, beforeEach } from 'vitest';
import { Presence } from '../src/presence';

let presence: Presence;

beforeEach(() => {
  presence = new Presence();
});

describe('Presence', () => {
  it('adds a user and reports them online', () => {
    presence.addUser('alice');
    expect(presence.getOnlineUsers()).toEqual([{ username: 'alice', status: 'idle' }]);
  });

  it('removes a user', () => {
    presence.addUser('alice');
    presence.removeUser('alice');
    expect(presence.getOnlineUsers()).toEqual([]);
  });

  it('updates user status', () => {
    presence.addUser('alice');
    presence.setStatus('alice', 'in-game');
    expect(presence.getOnlineUsers()).toEqual([{ username: 'alice', status: 'in-game' }]);
  });

  it('tracks multiple users', () => {
    presence.addUser('alice');
    presence.addUser('bob');
    expect(presence.getOnlineUsers().length).toBe(2);
  });

  it('isOnline returns correct status', () => {
    presence.addUser('alice');
    expect(presence.isOnline('alice')).toBe(true);
    expect(presence.isOnline('bob')).toBe(false);
  });
});
