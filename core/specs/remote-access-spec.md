# Remote Access — Spec

**Version:** 1.0
**Last updated:** 2026-03-26
**Feature location:** `desktop/src/main/remote-server.ts`, `desktop/src/main/remote-config.ts`, `core/skills/remote-setup/SKILL.md`

## Purpose

Remote access allows users to control DestinCode from any device on their network via a web browser. The system has two parts: a WebSocket-based remote server built into the DestinCode desktop app (added v2.1.5), and a guided setup skill (`/remote-setup`) that configures Tailscale networking and authentication.

## User Mandates

- (2026-03-26) Password hashes must use bcrypt. Plaintext passwords must never be stored in config files.
- (2026-03-26) The remote server must only listen when explicitly enabled via `destincode-remote.json`. It must not start by default on fresh installs.

## Design Decisions

| Decision | Rationale | Alternatives considered |
|----------|-----------|----------------------|
| WebSocket bridge in Electron main process | Reuses existing SessionManager and HookRelay instances — avoids duplicating session management. IPC surface is small (~15 methods). See `desktop/docs/superpowers/specs/2026-03-24-remote-web-access-design.md`. | Separate server process (rejected: shared state coordination overhead with no benefit) |
| Shared view model (all clients see same sessions) | Single-user app — independent views would require session ownership tracking with no practical benefit. | Per-client sessions (rejected: unnecessary complexity) |
| Password + optional Tailscale trust | Bcrypt hash stored at rest. Session tokens avoid re-entry. `trustTailscale` flag skips auth for Tailscale IPs (`100.64.0.0/10`). | OAuth (rejected: over-engineered for personal use), no auth (rejected: unsafe on shared networks) |
| Guided setup skill (`/remote-setup`) | Non-technical users need step-by-step guidance for Tailscale install, auth, and phone setup. Conversational skill format matches the toolkit's approach. | Documentation-only (rejected: users don't read docs), auto-configure (rejected: Tailscale requires interactive auth) |
| Port 9900 default | Unlikely to conflict with common services. Configurable via `destincode-remote.json`. | Dynamic port (rejected: harder to bookmark/remember), port 80/443 (rejected: requires root/admin) |

## Current Implementation

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Remote server | `desktop/src/main/remote-server.ts` | HTTP + WebSocket server, auth, event broadcasting |
| Remote config | `desktop/src/main/remote-config.ts` | Reads/writes `~/.claude/destincode-remote.json` |
| Remote shim | `desktop/src/renderer/remote-shim.ts` | Replaces Electron IPC with WebSocket transport for browser clients |
| Remote setup skill | `core/skills/remote-setup/SKILL.md` | Guided Tailscale + password configuration |
| Config file | `~/.claude/destincode-remote.json` | Password hash, port, enabled flag, Tailscale trust |

### Config File Schema

```json
{
  "enabled": true,
  "port": 9900,
  "passwordHash": "$2a$10...",
  "trustTailscale": true
}
```

### Connection Flow

1. Browser connects to `http://<tailscale-ip>:9900`
2. Server serves static React app (same Vite-built renderer)
3. Browser opens WebSocket to `/ws`
4. Auth: password prompt (or auto-auth if Tailscale trust enabled and client IP is in `100.64.0.0/10`)
5. Authenticated clients receive all session events via WebSocket broadcast

### Setup Flow (`/remote-setup`)

1. Check current state (Tailscale installed? Connected? Config exists?)
2. Install Tailscale (platform-specific: brew, winget, curl)
3. Authenticate Tailscale (`tailscale up` → browser login)
4. Set remote access password (bcrypt hash → config file)
5. Guide phone setup (install Tailscale app, sign in, navigate to URL)
6. Verify (Tailscale connected, config valid, server listening)

## Dependencies

- **Depends on:** DestinCode desktop app (Electron), Tailscale (optional but recommended for secure networking), Node.js (bcrypt hashing)
- **Depended on by:** Desktop app settings panel (QR code, remote status display)

## Known Issues & Planned Updates

See [GitHub Issues](https://github.com/itsdestin/destinclaude/issues) for known issues and planned updates.

## Change Log

| Date | Version | What changed | Type |
|------|---------|-------------|------|
| 2026-03-26 | 1.0 | Initial spec — consolidates remote web access (v2.1.5) and remote-setup skill into a single living reference | New |
