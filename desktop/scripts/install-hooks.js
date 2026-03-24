#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.claude',
  'settings.json'
);
// In packaged builds, __dirname points inside app.asar (which Electron can read),
// but Claude Code invokes relay.js externally via system node (which can't read asar).
// Convert to the unpacked path so the hook command works at runtime.
const rawRelayPath = path.resolve(__dirname, '..', 'hook-scripts', 'relay.js');
const unpackedRelayPath = rawRelayPath.replace('app.asar', 'app.asar.unpacked');
// Use unpacked path if it exists, otherwise fall back to original
const RELAY_PATH = fs.existsSync(unpackedRelayPath) ? unpackedRelayPath : rawRelayPath;

// Blocking relay for PermissionRequest — holds socket open for bidirectional response
const rawBlockingRelayPath = path.resolve(__dirname, '..', 'hook-scripts', 'relay-blocking.js');
const unpackedBlockingRelayPath = rawBlockingRelayPath.replace('app.asar', 'app.asar.unpacked');
const BLOCKING_RELAY_PATH = fs.existsSync(unpackedBlockingRelayPath) ? unpackedBlockingRelayPath : rawBlockingRelayPath;

// Fire-and-forget events use the standard relay
const FIRE_AND_FORGET_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Notification',
  'SubagentStart',
  'SubagentStop',
];

function installHooks() {
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Register fire-and-forget events with standard relay
  for (const event of FIRE_AND_FORGET_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    const hasRelay = settings.hooks[event].some((matcher) =>
      matcher.hooks?.some((h) => h.command?.includes('relay.js'))
    );

    if (!hasRelay) {
      settings.hooks[event].push({
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: 'node "' + RELAY_PATH + '"',
            timeout: 10,
          },
        ],
      });
    }
  }

  // Register PermissionRequest with blocking relay (longer timeout for user response)
  if (!settings.hooks['PermissionRequest']) {
    settings.hooks['PermissionRequest'] = [];
  }

  const hasBlockingRelay = settings.hooks['PermissionRequest'].some((matcher) =>
    matcher.hooks?.some((h) => h.command?.includes('relay-blocking.js'))
  );

  if (!hasBlockingRelay) {
    // Remove any old fire-and-forget relay for PermissionRequest
    settings.hooks['PermissionRequest'] = settings.hooks['PermissionRequest'].filter((matcher) =>
      !matcher.hooks?.some((h) => h.command?.includes('relay.js') && !h.command?.includes('relay-blocking.js'))
    );

    settings.hooks['PermissionRequest'].push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: 'node "' + BLOCKING_RELAY_PATH + '"',
          timeout: 300,
        },
      ],
    });
  }

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log('Hooks installed for ' + FIRE_AND_FORGET_EVENTS.length + ' fire-and-forget events + PermissionRequest (blocking)');
}

installHooks();
