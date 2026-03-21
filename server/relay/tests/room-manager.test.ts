import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../src/room-manager';

let manager: RoomManager;

beforeEach(() => {
  manager = new RoomManager();
});

describe('RoomManager', () => {
  it('creates a room and returns a 6-char code', () => {
    const code = manager.createRoom('alice');
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('getRoom returns the room by code', () => {
    const code = manager.createRoom('alice');
    const room = manager.getRoom(code);
    expect(room).not.toBeNull();
    expect(room!.creator).toBe('alice');
  });

  it('getUserRoom finds room by username', () => {
    const code = manager.createRoom('alice');
    expect(manager.getUserRoom('alice')).toBe(manager.getRoom(code));
  });

  it('returns null for unknown code', () => {
    expect(manager.getRoom('XXXXXX')).toBeNull();
  });

  it('destroyRoom removes the room', () => {
    const code = manager.createRoom('alice');
    manager.destroyRoom(code);
    expect(manager.getRoom(code)).toBeNull();
  });

  it('generates unique codes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(manager.createRoom(`user${i}`));
    }
    expect(codes.size).toBe(100);
  });
});
