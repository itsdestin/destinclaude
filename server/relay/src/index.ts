import { WebSocketServer, WebSocket } from 'ws';
import { Presence } from './presence.js';
import { RoomManager } from './room-manager.js';
import { joinRoom, handleMove as applyMove, handleRematch as applyRematch } from './room.js';
import type { ClientMessage, ServerMessage } from './types.js';

const PORT = parseInt(process.env.RELAY_PORT || '3002');
const LEADERBOARD_URL = process.env.LEADERBOARD_URL || 'http://localhost:3001';
const SHARED_SECRET = process.env.SHARED_SECRET || 'dev-secret';

const wss = new WebSocketServer({ port: PORT });
const presence = new Presence();
const rooms = new RoomManager();

// Maps: WebSocket <-> username
const socketUser = new Map<WebSocket, string>();
const userSocket = new Map<string, WebSocket>();

// Disconnect timers: username -> timeout handle
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastPresence(): void {
  const online = presence.getOnlineUsers();
  const msg: ServerMessage = { type: 'presence', online };
  for (const ws of wss.clients) {
    send(ws as WebSocket, msg);
  }
}

function sendToUser(username: string, msg: ServerMessage): void {
  const ws = userSocket.get(username);
  if (ws) send(ws, msg);
}

async function verifyCredentials(username: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`${LEADERBOARD_URL}/players/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function reportResult(winner: string, loser: string, draw: boolean): Promise<void> {
  try {
    await fetch(`${LEADERBOARD_URL}/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SHARED_SECRET}`,
      },
      body: JSON.stringify({ winner, loser, draw }),
    });
  } catch {
    // Non-fatal: log but don't crash
    console.error('[relay] Failed to report result to leaderboard');
  }
}

// ─── Message handlers ────────────────────────────────────────────────────────

async function handleAuthenticate(
  ws: WebSocket,
  msg: Extract<ClientMessage, { type: 'authenticate' }>,
): Promise<void> {
  const { username, password } = msg;
  const ok = await verifyCredentials(username, password);

  if (!ok) {
    send(ws, { type: 'authenticated', success: false });
    return;
  }

  // Cancel any pending disconnect timer for a reconnecting player
  const existingTimer = disconnectTimers.get(username);
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
    disconnectTimers.delete(username);
  }

  // Replace any stale socket mapping
  const oldWs = userSocket.get(username);
  if (oldWs && oldWs !== ws) {
    socketUser.delete(oldWs);
  }

  socketUser.set(ws, username);
  userSocket.set(username, ws);
  presence.addUser(username);

  send(ws, { type: 'authenticated', success: true });
  broadcastPresence();
}

function handleCreate(ws: WebSocket): void {
  const username = socketUser.get(ws);
  if (!username) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const code = rooms.createRoom(username);
  presence.setStatus(username, 'in-game');
  send(ws, { type: 'room:created', code, color: 'red' });
  broadcastPresence();
}

function handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): void {
  const username = socketUser.get(ws);
  if (!username) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const room = rooms.getRoom(msg.code);
  if (!room) {
    send(ws, { type: 'error', message: 'Room not found' });
    return;
  }

  const result = joinRoom(room, username);
  if (!result.success) {
    send(ws, { type: 'error', message: result.error ?? 'Cannot join room' });
    return;
  }

  rooms.addUserToRoom(msg.code, username);
  presence.setStatus(username, 'in-game');
  if (room.players.red) presence.setStatus(room.players.red, 'in-game');

  const startMsg = (you: 'red' | 'yellow', opponent: string): ServerMessage => ({
    type: 'game:start',
    board: room.board,
    you,
    opponent,
  });

  // Send game:start to both players
  send(ws, startMsg('yellow', room.players.red!));
  if (room.players.red) sendToUser(room.players.red, startMsg('red', username));

  broadcastPresence();
}

function handleMove(ws: WebSocket, msg: Extract<ClientMessage, { type: 'move' }>): void {
  const username = socketUser.get(ws);
  if (!username) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const room = rooms.getUserRoom(username);
  if (!room) {
    send(ws, { type: 'error', message: 'Not in a room' });
    return;
  }

  const result = applyMove(room, username, msg.column);
  if (!result.success) {
    send(ws, { type: 'error', message: result.error ?? 'Invalid move' });
    return;
  }

  const stateMsg: ServerMessage = {
    type: 'game:state',
    board: room.board,
    turn: room.turn,
    lastMove: { col: msg.column, row: result.row! },
  };

  // Broadcast state to both players
  const red = room.players.red;
  const yellow = room.players.yellow;
  if (red) sendToUser(red, stateMsg);
  if (yellow) sendToUser(yellow, stateMsg);

  if (result.winner) {
    const overMsg: ServerMessage = {
      type: 'game:over',
      winner: result.winner,
      ...(result.line ? { line: result.line } : {}),
    };
    if (red) sendToUser(red, overMsg);
    if (yellow) sendToUser(yellow, overMsg);

    // Report to leaderboard
    if (result.winner === 'draw') {
      if (red && yellow) reportResult(red, yellow, true);
    } else {
      const winner = result.winner === 'red' ? red : yellow;
      const loser = result.winner === 'red' ? yellow : red;
      if (winner && loser) reportResult(winner, loser, false);
    }

    // Update presence back to idle
    if (red) presence.setStatus(red, 'idle');
    if (yellow) presence.setStatus(yellow, 'idle');
    broadcastPresence();

    // Idle cleanup: destroy room after 5 minutes if no rematch
    const foundRoom = room;
    setTimeout(() => {
      const currentRoom = rooms.getRoom(foundRoom.code);
      if (currentRoom && currentRoom.status === 'finished') {
        // Room still exists and still finished — no rematch happened
        if (currentRoom.players.red) {
          presence.setStatus(currentRoom.players.red, 'idle');
        }
        if (currentRoom.players.yellow) {
          presence.setStatus(currentRoom.players.yellow, 'idle');
        }
        rooms.destroyRoom(foundRoom.code);
        broadcastPresence();
      }
    }, 5 * 60 * 1000);
  }
}

function handleChat(ws: WebSocket, msg: Extract<ClientMessage, { type: 'chat' }>): void {
  const username = socketUser.get(ws);
  if (!username) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const room = rooms.getUserRoom(username);
  if (!room) {
    send(ws, { type: 'error', message: 'Not in a room' });
    return;
  }

  if (typeof msg.text !== 'string') {
    send(ws, { type: 'error', message: 'chat text must be a string' });
    return;
  }
  const trimmed = msg.text.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    send(ws, { type: 'error', message: 'chat message must be 1-200 characters' });
    return;
  }

  const chatMsg: ServerMessage = { type: 'chat:message', from: username, text: trimmed };
  if (room.players.red) sendToUser(room.players.red, chatMsg);
  if (room.players.yellow) sendToUser(room.players.yellow, chatMsg);
}

function handleRematchRequest(ws: WebSocket): void {
  const username = socketUser.get(ws);
  if (!username) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const room = rooms.getUserRoom(username);
  if (!room) {
    send(ws, { type: 'error', message: 'Not in a room' });
    return;
  }

  const result = applyRematch(room, username);

  if (result.ready) {
    const red = room.players.red;
    const yellow = room.players.yellow;

    if (red) {
      presence.setStatus(red, 'in-game');
      sendToUser(red, { type: 'game:start', board: room.board, you: 'red', opponent: yellow ?? '' });
    }
    if (yellow) {
      presence.setStatus(yellow, 'in-game');
      sendToUser(yellow, { type: 'game:start', board: room.board, you: 'yellow', opponent: red ?? '' });
    }

    broadcastPresence();
  }
}

function handleLeave(ws: WebSocket): void {
  const username = socketUser.get(ws);
  if (!username) {
    send(ws, { type: 'error', message: 'Not authenticated' });
    return;
  }

  const room = rooms.getUserRoom(username);
  if (room) {
    const opponent = room.players.red === username ? room.players.yellow : room.players.red;
    if (opponent && room.status === 'playing') {
      sendToUser(opponent, { type: 'opponent:disconnected' });
      reportResult(opponent, username, false);
      presence.setStatus(opponent, 'idle');
    }
    rooms.destroyRoom(room.code);
  }

  presence.setStatus(username, 'idle');
  broadcastPresence();
}

// ─── Disconnect logic ────────────────────────────────────────────────────────

function handleDisconnect(ws: WebSocket): void {
  const username = socketUser.get(ws);
  if (!username) return;

  socketUser.delete(ws);
  userSocket.delete(username);
  presence.removeUser(username);
  broadcastPresence();

  const room = rooms.getUserRoom(username);
  if (!room) return;

  const opponent = room.players.red === username ? room.players.yellow : room.players.red;
  if (opponent) {
    sendToUser(opponent, { type: 'opponent:disconnected' });
  }

  // 60-second grace period for reconnect
  const timer = setTimeout(() => {
    disconnectTimers.delete(username);

    // If the room still exists and still has this player, opponent wins by forfeit
    const currentRoom = rooms.getUserRoom(username);
    if (!currentRoom) return;

    const opp = currentRoom.players.red === username ? currentRoom.players.yellow : currentRoom.players.red;
    if (opp && currentRoom.status === 'playing') {
      reportResult(opp, username, false);
      sendToUser(opp, { type: 'game:over', winner: currentRoom.players.red === opp ? 'red' : 'yellow' });
      presence.setStatus(opp, 'idle');
      broadcastPresence();
    }

    rooms.destroyRoom(currentRoom.code);
  }, 60_000);

  disconnectTimers.set(username, timer);
}

// ─── WebSocket server ─────────────────────────────────────────────────────────

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', async (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'authenticate':
        await handleAuthenticate(ws, msg);
        break;
      case 'create':
        handleCreate(ws);
        break;
      case 'join':
        handleJoin(ws, msg);
        break;
      case 'move':
        handleMove(ws, msg);
        break;
      case 'chat':
        handleChat(ws, msg);
        break;
      case 'rematch':
        handleRematchRequest(ws);
        break;
      case 'leave':
        handleLeave(ws);
        break;
      default:
        send(ws, { type: 'error', message: 'Unknown message type' });
    }
  });

  ws.on('close', () => handleDisconnect(ws));
  ws.on('error', () => handleDisconnect(ws));
});

// ─── Heartbeat ───────────────────────────────────────────────────────────────

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }
}, 30_000);

console.log(`[relay] WebSocket server listening on port ${PORT}`);
