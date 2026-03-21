import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { Player } from './types.js';

const SALT_ROUNDS = 10;

export function createDb(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      username      TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      wins          INTEGER DEFAULT 0,
      losses        INTEGER DEFAULT 0,
      draws         INTEGER DEFAULT 0,
      created_at    TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return db;
}

export async function registerPlayer(
  db: Database.Database,
  username: string,
  password: string,
): Promise<Player> {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  db.prepare('INSERT INTO players (username, password_hash) VALUES (?, ?)').run(username, hash);
  return getPlayer(db, username)!;
}

export async function verifyPlayer(
  db: Database.Database,
  username: string,
  password: string,
): Promise<boolean> {
  const row = db
    .prepare('SELECT password_hash FROM players WHERE username = ?')
    .get(username) as { password_hash: string } | undefined;
  if (!row) return false;
  return bcrypt.compare(password, row.password_hash);
}

export function getPlayer(db: Database.Database, username: string): Player | null {
  const row = db
    .prepare('SELECT username, wins, losses, draws, created_at FROM players WHERE username = ?')
    .get(username) as Player | undefined;
  return row ?? null;
}

export function getLeaderboard(db: Database.Database, limit: number): Player[] {
  return db
    .prepare(
      'SELECT username, wins, losses, draws, created_at FROM players ORDER BY wins DESC LIMIT ?',
    )
    .all(limit) as Player[];
}

export function recordResult(
  db: Database.Database,
  winner: string,
  loser: string,
  isDraw: boolean,
): void {
  if (isDraw) {
    db.prepare('UPDATE players SET draws = draws + 1 WHERE username = ?').run(winner);
    db.prepare('UPDATE players SET draws = draws + 1 WHERE username = ?').run(loser);
  } else {
    db.prepare('UPDATE players SET wins = wins + 1 WHERE username = ?').run(winner);
    db.prepare('UPDATE players SET losses = losses + 1 WHERE username = ?').run(loser);
  }
}
