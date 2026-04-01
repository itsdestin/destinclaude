#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(
  require('os').homedir(),
  '.claude',
  'settings.json'
);
// In packaged builds, __dirname points inside app.asar (which Electron can read),
// but Claude Code invokes relay.js externally via system node (which can't read asar).
// Convert to the unpacked path so the hook command works at runtime.
const rawRelayPath = path.resolve(__dirname, '..', 'hook-scripts', 'relay.js');
const unpackedRelayPath = rawRelayPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
// Use unpacked path if it exists, otherwise fall back to original
const RELAY_PATH = fs.existsSync(unpackedRelayPath) ? unpackedRelayPath : rawRelayPath;

// Blocking relay for PermissionRequest — holds socket open for bidirectional response
const rawBlockingRelayPath = path.resolve(__dirname, '..', 'hook-scripts', 'relay-blocking.js');
const unpackedBlockingRelayPath = rawBlockingRelayPath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
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

  const expectedRelayCmd = `node ${JSON.stringify(RELAY_PATH)}`;
  const expectedBlockingCmd = `node ${JSON.stringify(BLOCKING_RELAY_PATH)}`;

  // Register fire-and-forget events with standard relay
  for (const event of FIRE_AND_FORGET_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Find any existing relay hook (may have a stale path from a previous install)
    const existingIdx = settings.hooks[event].findIndex((matcher) =>
      matcher.hooks?.some((h) => h.command?.includes('relay.js') && !h.command?.includes('relay-blocking.js'))
    );

    const relayEntry = {
      matcher: '',
      hooks: [{ type: 'command', command: expectedRelayCmd, timeout: 10 }],
    };

    if (existingIdx >= 0) {
      // Update in place — preserves position relative to other hooks
      settings.hooks[event][existingIdx] = relayEntry;
    } else {
      settings.hooks[event].push(relayEntry);
    }
  }

  // Register PermissionRequest with blocking relay (longer timeout for user response)
  if (!settings.hooks['PermissionRequest']) {
    settings.hooks['PermissionRequest'] = [];
  }

  // Remove any old fire-and-forget relay for PermissionRequest
  settings.hooks['PermissionRequest'] = settings.hooks['PermissionRequest'].filter((matcher) =>
    !matcher.hooks?.some((h) => h.command?.includes('relay.js') && !h.command?.includes('relay-blocking.js'))
  );

  const blockingEntry = {
    matcher: '',
    hooks: [{ type: 'command', command: expectedBlockingCmd, timeout: 300 }],
  };

  const existingBlockingIdx = settings.hooks['PermissionRequest'].findIndex((matcher) =>
    matcher.hooks?.some((h) => h.command?.includes('relay-blocking.js'))
  );

  if (existingBlockingIdx >= 0) {
    settings.hooks['PermissionRequest'][existingBlockingIdx] = blockingEntry;
  } else {
    settings.hooks['PermissionRequest'].push(blockingEntry);
  }

  // --- Auto-titling hook (with DestinClaude deference) ---
  // Only register the desktop-bundled title-update.sh if the DestinClaude toolkit's
  // version is NOT installed. If the toolkit is present, its version takes precedence.
  const toolkitTitlePath = path.join(require('os').homedir(), '.claude', 'plugins', 'destinclaude', 'core', 'hooks', 'title-update.sh');
  const rawTitlePath = path.resolve(__dirname, '..', 'hook-scripts', 'title-update.sh');
  const unpackedTitlePath = rawTitlePath.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const TITLE_UPDATE_PATH = fs.existsSync(unpackedTitlePath) ? unpackedTitlePath : rawTitlePath;

  if (!fs.existsSync(toolkitTitlePath)) {
    // Ensure PostToolUse array exists (should already from relay registration above)
    if (!settings.hooks['PostToolUse']) {
      settings.hooks['PostToolUse'] = [];
    }

    const titleCmd = `bash ${JSON.stringify(TITLE_UPDATE_PATH)}`;
    const titleEntry = {
      matcher: '',
      hooks: [{ type: 'command', command: titleCmd, timeout: 10 }],
    };

    const existingTitleIdx = settings.hooks['PostToolUse'].findIndex((matcher) =>
      matcher.hooks?.some((h) => h.command?.includes('title-update'))
    );

    if (existingTitleIdx >= 0) {
      settings.hooks['PostToolUse'][existingTitleIdx] = titleEntry;
    } else {
      settings.hooks['PostToolUse'].push(titleEntry);
    }

    // Deploy Auto-Title instruction to CLAUDE.md if not already present
    const claudeMdPath = path.join(require('os').homedir(), '.claude', 'CLAUDE.md');
    const autoTitleMarker = '## Auto-Title';
    const autoTitleInstruction = `
## Auto-Title

When you see an \`[Auto-Title]\` reminder, **immediately** use Bash to write a 3-5 word Title Case topic summary to the file path specified. Use: \`echo "Topic Here" > /path/to/file\`. Do this BEFORE continuing with your response — do not skip or defer it.
`;
    try {
      if (fs.existsSync(claudeMdPath)) {
        const content = fs.readFileSync(claudeMdPath, 'utf8');
        if (!content.includes(autoTitleMarker)) {
          fs.appendFileSync(claudeMdPath, autoTitleInstruction);
        }
      } else {
        fs.mkdirSync(path.dirname(claudeMdPath), { recursive: true });
        fs.writeFileSync(claudeMdPath, '# CLAUDE.md\n' + autoTitleInstruction);
      }
    } catch (e) {
      console.warn('Failed to deploy Auto-Title instruction:', e.message);
    }
  } else {
    // DestinClaude is installed — remove any desktop-bundled title-update hook
    if (settings.hooks['PostToolUse']) {
      settings.hooks['PostToolUse'] = settings.hooks['PostToolUse'].filter((matcher) =>
        !matcher.hooks?.some((h) => h.command?.includes('title-update') && !h.command?.includes('plugins'))
      );
    }
  }

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  console.log('Hooks installed for ' + FIRE_AND_FORGET_EVENTS.length + ' fire-and-forget events + PermissionRequest (blocking)' +
    (fs.existsSync(toolkitTitlePath) ? '' : ' + auto-title'));
}

installHooks();
