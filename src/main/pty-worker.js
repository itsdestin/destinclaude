#!/usr/bin/env node
// PTY Worker — runs in a separate Node.js process (not Electron)
// so that node-pty uses Node's native binary, not Electron's.
// Communicates with the Electron main process via IPC (process.send).

const pty = require('node-pty');
const which = require('which');

let ptyProcess = null;

process.on('message', (msg) => {
  switch (msg.type) {
    case 'spawn': {
      // Resolve full path — node-pty on Windows needs it (no shell lookup)
      let shell;
      try {
        shell = which.sync(msg.command || 'claude');
      } catch {
        shell = msg.command || 'claude';
      }
      const args = msg.args || [];
      ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: msg.cols || 120,
        rows: msg.rows || 30,
        cwd: msg.cwd || process.env.HOME || process.env.USERPROFILE,
        env: {
          ...process.env,
          // Pass our session ID so hook scripts can include it in payloads
          CLAUDE_DESKTOP_SESSION_ID: msg.sessionId || '',
          // Pass the unique pipe name so relay.js connects to the right instance
          CLAUDE_DESKTOP_PIPE: msg.pipeName || '',
        },
      });

      ptyProcess.onData((data) => {
        process.send({ type: 'data', data });
      });

      ptyProcess.onExit(({ exitCode }) => {
        process.send({ type: 'exit', exitCode });
        process.exit(0);
      });

      process.send({ type: 'spawned', pid: ptyProcess.pid });
      break;
    }
    case 'input': {
      if (ptyProcess) ptyProcess.write(msg.data);
      break;
    }
    case 'resize': {
      if (ptyProcess) ptyProcess.resize(msg.cols, msg.rows);
      break;
    }
    case 'kill': {
      if (ptyProcess) ptyProcess.kill();
      break;
    }
  }
});

process.on('disconnect', () => {
  if (ptyProcess) ptyProcess.kill();
  process.exit(0);
});
