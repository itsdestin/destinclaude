# PartyKit Game Backend — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Replaces:** GitHub Issues game backend (`github-game.ts`, `useGitHubGame.ts`)

---

## Summary

Replace the GitHub Issues-based game backend with PartyKit (Cloudflare Durable Objects) for real-time multiplayer. GitHub Issues retained only for persistent stats/leaderboard. Per-game server room classes allow game-specific networking behavior. Client-trusted game logic.

## Goals

- Instant move delivery via WebSocket (replacing 10s polling)
- Instant presence and challenge delivery (replacing 60s polling)
- Fix broken challenge system
- Architecture that supports both turn-based and real-time games
- Local favorites list for the lobby
- Zero infrastructure cost (PartyKit free tier)

## Non-Goals

- Server-side game validation (client-trusted)
- Supporting non-DestinCode users (no web client)
- Replacing GitHub Issues for persistent data

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   DestinCode App                      │
│                                                       │
│  React Client                                         │
│  ├── usePartyLobby hook (presence, challenges)        │
│  ├── usePartyGame hook (gameplay, chat, rematch)      │
│  ├── Game logic (connect-four.ts, future games)       │
│  └── Favorites list (local JSON)                      │
│         │                                             │
│         │ WebSocket (partysocket)                      │
│         ▼                                             │
│  ┌──────────────────────────────────────────────┐     │
│  │        PartyKit Server (Cloudflare Edge)      │     │
│  │                                               │     │
│  │  LobbyRoom         ─ presence, challenges     │     │
│  │  ConnectFourRoom    ─ C4 message relay         │     │
│  │  (future) PongRoom  ─ real-time relay          │     │
│  └──────────────────────────────────────────────┘     │
│         │                                             │
│         │ GitHub API (from client, stats only)        │
│         ▼                                             │
│  ┌──────────────────────────────────────────────┐     │
│  │  GitHub Issues (itsdestin/destinclaude-games)  │    │
│  │  ─ Leaderboard/stats (persistent)             │    │
│  └──────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## PartyKit Server

### Directory Structure

```
~/.claude/plugins/destinclaude/partykit/
├── package.json
├── partykit.json
├── tsconfig.json
└── src/
    ├── lobby-room.ts
    └── connect-four-room.ts
```

Deployed via `npx partykit deploy` to the free managed platform.

### LobbyRoom (Single Global Instance)

One room all DestinCode users connect to on app launch.

**Responsibilities:**
- Maintain authoritative list of online users with status
- Broadcast join/leave/status-change events instantly
- Relay challenge messages between specific users
- Send full user list to newly connected clients

**Server-side state (in-memory):**
```typescript
Map<WebSocket, { username: string; status: "idle" | "in-game" }>
```

### ConnectFourRoom (One Per Game Session)

Created when a player starts a new game. Room ID format: `c4-ABCDEF`.

**Responsibilities:**
- Track the two player connections
- Relay messages (moves, chat, rematch votes) between players
- Broadcast join/leave events
- Auto-hibernate when both players disconnect (Durable Object lifecycle)

**Server-side state (in-memory):**
```typescript
{
  players: Map<WebSocket, string>;  // ws → username
  gameCode: string;
}
```

### Future Game Rooms

Each new game type gets its own room class with game-appropriate behavior:
- PongRoom: high-frequency relay, pause-on-disconnect
- SnakeRoom: tick-based updates, spectator support
- etc.

Adding a game = new room class + client components + redeploy.

---

## Message Protocol

### Common Envelope

All messages are JSON with a `type` field.

### Lobby Messages

```typescript
// Client → Server
{ type: "status", status: "idle" | "in-game" }
{ type: "challenge", target: string, gameType: string, code: string }
{ type: "challenge-response", from: string, accept: boolean }

// Server → Client
{ type: "presence", users: { username: string, status: string }[] }
{ type: "user-joined", username: string, status: string }
{ type: "user-left", username: string }
{ type: "user-status", username: string, status: string }
{ type: "challenge", from: string, gameType: string, code: string }
{ type: "challenge-response", from: string, accept: boolean }
```

### Connect Four Messages

```typescript
// Client → Server (relayed to other player)
{ type: "join", username: string }
{ type: "move", username: string, column: number }
{ type: "chat", username: string, text: string }
{ type: "leave", username: string }
{ type: "rematch", username: string }

// Server → Client
{ type: "player-joined", username: string }
{ type: "player-left", username: string }
// All other game messages relayed as-is
```

---

## Client-Side Architecture

### File Changes

**New files:**
- `src/renderer/game/party-client.ts` — PartyKit connection manager
- `src/renderer/hooks/usePartyLobby.ts` — lobby presence/challenges hook
- `src/renderer/hooks/usePartyGame.ts` — gameplay hook

**Delete:**
- `src/renderer/game/github-game.ts` — replaced by PartyKit
- `src/renderer/hooks/useGitHubGame.ts` — replaced by new hooks

**Keep (modified):**
- `src/renderer/game/github-api.ts` — stats/leaderboard only
- `src/renderer/game/connect-four.ts` — game logic unchanged
- UI components — rewired to new hooks, same appearance

**Keep (unchanged):**
- `src/main/preload.ts` — GitHub auth IPC stays
- `src/main/main.ts` — GitHub auth handler stays

### party-client.ts

Wrapper around `partysocket` (PartyKit's client SDK):
- Manages WebSocket connection to a specific room
- Automatic reconnection (built into partysocket)
- JSON message serialization/deserialization
- Typed event callbacks for incoming messages

### usePartyLobby Hook

Active whenever the app is open. Connects to the global LobbyRoom.

- Dispatches `PRESENCE_UPDATE` on user join/leave/status changes
- Dispatches `CHALLENGE_RECEIVED` instantly on incoming challenges
- Exposes `challengePlayer(target, gameType)` and `respondToChallenge(from, accept)`
- Sends status updates ("idle" ↔ "in-game") as player enters/leaves games

### usePartyGame Hook

Active during gameplay. Connects to a game-specific room.

- Dispatches `GAME_STATE` when opponent's moves arrive
- Dispatches `CHAT_MESSAGE` for in-game chat
- Exposes `makeMove(column)`, `sendChat(text)`, `requestRematch()`, `leaveGame()`
- Handles reconnection: client preserves local game state across WebSocket reconnects. The room re-adds the player to its connection list; no board state is sent from the server (server doesn't hold game state)

### Favorites

Stored locally at `~/.claude/destinclaude-favorites.json`:
```json
{ "favorites": ["alice", "bob"] }
```

- Read/written via IPC from main process
- Lobby UI shows favorited users at top of online list with indicator
- Star/heart toggle next to each username
- One-sided (no mutual acceptance required)
- Favorited users shown even when offline (grayed out)

### GitHub Issues (Stats Only)

Existing `GitHubAPI` class retained. Slimmed-down stats operations:
- `recordResult(winner, loser, isDraw)` — updates stats issues after game ends
- `getLeaderboard()` — fetches stats on lobby entry

All game/presence/challenge Issue code deleted.

---

## State Changes

### New Reducer Actions

```typescript
| { type: "PARTY_CONNECTED" }
| { type: "PARTY_DISCONNECTED" }
| { type: "PARTY_ERROR"; message: string }
```

### Removed Reducer Actions

- `GITHUB_READY` / `GITHUB_ERROR` — replaced by `PARTY_CONNECTED` / `PARTY_ERROR`

### State Shape Changes

- Remove `githubError` → replace with `partyError: string | null`
- `connected` now reflects PartyKit WebSocket status (not GitHub API reachability)
- GitHub auth still checked on startup (needed for identity + stats), but connection status is PartyKit

---

## Deployment

### Target: PartyKit Free Managed Tier

- 10 projects (using 1)
- 100,000 requests/day (more than sufficient)
- Storage wipes every 24 hours (irrelevant — persistent data in GitHub Issues)
- Zero cost

### Upgrade Path

If usage grows, deploy to own Cloudflare account:
- Change `partykit.json` to target CF account
- Run `npx partykit deploy`
- No code changes

---

## Migration Strategy

1. Build and deploy PartyKit server (lobby + connect four rooms)
2. Add `partysocket` dependency to desktop app
3. Create `party-client.ts`, `usePartyLobby.ts`, `usePartyGame.ts`
4. Add favorites IPC + local JSON storage in main process
5. Slim down GitHub Issues to stats-only
6. Swap hooks in UI components
7. Delete `github-game.ts`, `useGitHubGame.ts`, and old Issue game code
8. Update state types/reducer for new action types
