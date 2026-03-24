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

const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
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

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Check if our relay is already registered
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

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log('Hooks installed for ' + HOOK_EVENTS.length + ' events');
}

installHooks();
