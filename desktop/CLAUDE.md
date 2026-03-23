# DestinCode

Electron + React app that wraps Claude Code CLI in a GUI.

## Architecture

- `src/main/` — Electron main process (session manager, hook relay, IPC)
- `src/renderer/` — React frontend (terminal view, chat view in Phase 2)
- `hook-scripts/` — Relay scripts that Claude Code hooks shell out to
- `scripts/` — Build and setup scripts

## Key Concepts

- **SessionManager** (`src/main/session-manager.ts`) — PTY pool, spawns/kills Claude Code processes
- **HookRelay** (`src/main/hook-relay.ts`) — Named pipe server receiving hook events from relay.js
- **IPC** — Electron contextBridge connects main process to React renderer
- **Preload** (`src/main/preload.ts`) — IPC channel constants are inlined (not imported) because Electron's sandboxed preload cannot resolve relative imports
- **TerminalRegistry** (`src/renderer/hooks/terminal-registry.ts`) — Coordinates xterm.js instances, screen buffer reads, and write-completion notifications. Permission prompt detection depends on the write-callback pub/sub here — do not bypass it by reading the buffer on raw `pty:output` events
- **PermissionMode** (`src/shared/types.ts`) — `'normal' | 'auto-accept' | 'plan' | 'bypass'`. The HeaderBar badge cycles through these on click by sending Shift+Tab (`\x1b[Z`) to the PTY. Bypass mode only appears in sessions created with `skipPermissions: true`

## Node.js vs Browser Boundary

`src/main/` runs in Node.js. `src/renderer/` runs in a browser sandbox (via Vite).

- **Never use `process.env`** in renderer code — it doesn't exist in the browser. Use `import.meta.env` with `VITE_` prefixed vars if you need build-time env injection, but note the tsconfig uses `module: "commonjs"` so `import.meta` will fail `tsc`. Prefer constants or IPC for config the renderer needs.
- **Never use `require()`** in renderer code — use ES `import` only.
- **`node-pty`** cannot load in Electron's main process (ABI mismatch). It runs in a separate `node` child process via `pty-worker.js`.
- **Preload** is sandboxed — no `require()`, no relative imports, no `process.env`. IPC channel names are inlined as string literals.

## Dev Commands

- `npm run dev` — Start in development mode (hot reload)
- `npm test` — Run tests
- `npm run build` — Build distributable

## Spec

See `~/.claude/specs/claude-desktop-ui-spec.md` for full design.
