import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { registerPlayer, verifyPlayer, getPlayer, getLeaderboard, recordResult } from './db.js';

export function createApp(db: Database.Database, sharedSecret: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/players', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' });
      return;
    }
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'username and password must be strings' });
      return;
    }
    if (username.length < 1 || username.length > 20 || !/^[A-Za-z0-9_-]+$/.test(username)) {
      res.status(400).json({ error: 'username must be 1-20 characters (letters, numbers, underscore, hyphen)' });
      return;
    }
    if (password.length < 1 || password.length > 64) {
      res.status(400).json({ error: 'password must be 1-64 characters' });
      return;
    }
    try {
      const player = await registerPlayer(db, username, password);
      res.status(201).json(player);
    } catch {
      res.status(409).json({ error: 'username taken' });
    }
  });

  app.post('/players/verify', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'username and password required' });
      return;
    }
    const valid = await verifyPlayer(db, username, password);
    if (valid) {
      res.status(200).json({ valid: true });
    } else {
      res.status(401).json({ valid: false });
    }
  });

  app.get('/players/:username', (req, res) => {
    const player = getPlayer(db, req.params.username);
    if (!player) {
      res.status(404).json({ error: 'player not found' });
      return;
    }
    res.json(player);
  });

  app.get('/leaderboard', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const leaderboard = getLeaderboard(db, limit);
    res.json(leaderboard);
  });

  app.post('/results', (req, res) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${sharedSecret}`) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const { winner, loser, draw } = req.body;
    if (!winner || !loser) {
      res.status(400).json({ error: 'winner and loser required' });
      return;
    }
    try {
      recordResult(db, winner, loser, !!draw);
    } catch (err: any) {
      res.status(422).json({ error: err.message ?? 'player not found' });
      return;
    }
    res.json({ ok: true });
  });

  return app;
}
