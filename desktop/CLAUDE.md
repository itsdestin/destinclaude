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

## Dev Commands

- `npm run dev` — Start in development mode (hot reload)
- `npm test` — Run tests
- `npm run build` — Build distributable

## Spec

See `~/.claude/specs/claude-desktop-ui-spec.md` for full design.
