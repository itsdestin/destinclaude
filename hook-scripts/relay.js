#!/usr/bin/env node
const net = require('net');
const PIPE_NAME = process.env.CLAUDE_DESKTOP_PIPE || '\\\\.\\pipe\\claude-desktop-hooks';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const client = net.createConnection(PIPE_NAME, () => {
    client.write(input);
  });

  client.setTimeout(120000, () => {
    client.destroy();
    process.exit(0);
  });

  let response = '';
  client.on('data', (data) => { response += data.toString(); });
  client.on('end', () => {
    if (response) {
      process.stdout.write(response);
    }
    process.exit(0);
  });

  client.on('error', () => {
    // If pipe not available, proceed silently (exit 0 = allow)
    process.exit(0);
  });
});
