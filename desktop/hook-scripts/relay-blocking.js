#!/usr/bin/env node
/**
 * relay-blocking.js — Hybrid relay script (spike/experiment)
 *
 * Protocol:
 *   1. Read hook JSON from stdin
 *   2. Connect to named pipe, write JSON + newline
 *   3. WAIT on the socket:
 *      - If server closes without writing back → exit 0 (fire-and-forget)
 *      - If server writes back JSON → parse it, exit with indicated code
 *      - If 30s timeout → exit 0 (fail-open safety)
 *
 * The SERVER decides whether a hook is blocking — relay doesn't need to know.
 */
const net = require('net');
const PIPE_NAME = process.env.CLAUDE_DESKTOP_PIPE || '\\\\.\\pipe\\claude-desktop-hooks';
const TIMEOUT_MS = parseInt(process.env.CLAUDE_RELAY_TIMEOUT || '30000', 10);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  // Inject desktop session ID
  const desktopSessionId = process.env.CLAUDE_DESKTOP_SESSION_ID;
  if (desktopSessionId) {
    try {
      const parsed = JSON.parse(input);
      parsed._desktop_session_id = desktopSessionId;
      input = JSON.stringify(parsed);
    } catch {}
  }

  const client = net.createConnection(PIPE_NAME, () => {
    // Write payload but keep the connection open (write, not end)
    client.write(input + '\n');
  });

  let response = '';

  client.on('data', (chunk) => {
    response += chunk;
    // Look for a complete response (newline-delimited JSON)
    const nlIndex = response.indexOf('\n');
    if (nlIndex >= 0) {
      const line = response.substring(0, nlIndex).trim();
      client.destroy();
      try {
        const decision = JSON.parse(line);
        process.exit(decision.allow === false ? 2 : 0);
      } catch {
        // Unparseable response — fail open
        process.exit(0);
      }
    }
  });

  client.on('end', () => {
    // Server closed without sending a response — fire-and-forget mode
    process.exit(0);
  });

  client.setTimeout(TIMEOUT_MS, () => {
    // Timeout — fail open so Claude Code isn't stuck
    client.destroy();
    process.exit(0);
  });

  client.on('error', () => {
    // Pipe not available — fail open
    process.exit(0);
  });
});
