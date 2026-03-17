#!/usr/bin/env node
/**
 * imessages MCP Server
 * Reads macOS Messages (iMessage/SMS) from ~/Library/Messages/chat.db
 * and sends messages via AppleScript (osascript).
 *
 * Requires Full Disk Access for the app running Claude Code (Terminal, iTerm2, etc.)
 * System Settings → Privacy & Security → Full Disk Access → enable your terminal app
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const readline = require('readline');

const DB_PATH = path.join(os.homedir(), 'Library/Messages/chat.db');

// Apple's Core Data epoch starts 2001-01-01; Unix epoch starts 1970-01-01
const APPLE_EPOCH_OFFSET = 978307200;

function appleTimestampToISO(ts) {
  if (!ts) return null;
  // Modern macOS stores nanoseconds; older stores seconds
  const seconds = ts > 1e12 ? ts / 1e9 : ts;
  return new Date((seconds + APPLE_EPOCH_OFFSET) * 1000).toISOString();
}

function dateToAppleTimestamp(date) {
  const seconds = date.getTime() / 1000 - APPLE_EPOCH_OFFSET;
  return seconds * 1e9; // nanoseconds
}

function sqliteQuery(sql) {
  const result = spawnSync('sqlite3', ['-json', '-readonly', DB_PATH, sql], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error) {
    throw new Error(`sqlite3 spawn error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const err = result.stderr || '';
    if (err.includes('authorization denied') || err.includes('unable to open')) {
      throw new Error(
        'Full Disk Access required. Go to System Settings → Privacy & Security → Full Disk Access and enable your terminal app (Terminal or iTerm2), then restart it.'
      );
    }
    throw new Error(`sqlite3 error: ${err}`);
  }
  const out = result.stdout.trim();
  if (!out) return [];
  return JSON.parse(out);
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

function handleStatus() {
  try {
    const rows = sqliteQuery('SELECT COUNT(*) as count FROM message LIMIT 1');
    return {
      available: true,
      message_count: rows[0]?.count ?? 0,
      db_path: DB_PATH,
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

function handleConversations({ limit = 20 } = {}) {
  const rows = sqliteQuery(`
    SELECT
      c.ROWID as id,
      c.chat_identifier,
      c.display_name,
      c.service_name,
      MAX(m.date) as last_date,
      (SELECT text FROM message WHERE ROWID = MAX(m.ROWID)) as last_text
    FROM chat c
    LEFT JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
    LEFT JOIN message m ON m.ROWID = cmj.message_id
    GROUP BY c.ROWID
    ORDER BY last_date DESC
    LIMIT ${Number(limit)}
  `);

  return rows.map((r) => ({
    id: String(r.id),
    chat_identifier: r.chat_identifier,
    display_name: r.display_name || r.chat_identifier,
    service: r.service_name,
    last_message_at: appleTimestampToISO(r.last_date),
    last_message_preview: r.last_text
      ? r.last_text.substring(0, 100)
      : '(no text)',
  }));
}

function handleMessages({ contact, conversation_id, limit = 50 } = {}) {
  let chatId = conversation_id;

  if (!chatId && contact) {
    const matches = sqliteQuery(`
      SELECT ROWID, chat_identifier, display_name
      FROM chat
      WHERE lower(display_name) LIKE lower('%${contact.replace(/'/g, "''")}%')
         OR lower(chat_identifier) LIKE lower('%${contact.replace(/'/g, "''")}%')
      LIMIT 10
    `);
    if (matches.length === 0) {
      return {
        error: 'no_match',
        message: `No conversation found matching "${contact}". Use imessages_conversations to see available chats.`,
      };
    }
    if (matches.length > 1) {
      return {
        error: 'ambiguous',
        message: `Multiple conversations match "${contact}". Use conversation_id.`,
        matches: matches.map((m) => ({
          id: String(m.ROWID),
          display_name: m.display_name || m.chat_identifier,
          chat_identifier: m.chat_identifier,
        })),
      };
    }
    chatId = String(matches[0].ROWID);
  }

  if (!chatId) {
    return { error: 'missing_param', message: "Provide 'contact' or 'conversation_id'." };
  }

  const rows = sqliteQuery(`
    SELECT
      m.ROWID as id,
      m.text,
      m.is_from_me,
      m.date,
      m.service,
      h.id as sender_handle
    FROM message m
    LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    WHERE cmj.chat_id = ${Number(chatId)}
    ORDER BY m.date DESC
    LIMIT ${Number(limit)}
  `);

  return rows.reverse().map((r) => ({
    id: String(r.id),
    text: r.text || '(attachment or empty)',
    from_me: r.is_from_me === 1,
    sender: r.is_from_me ? 'me' : (r.sender_handle || 'unknown'),
    sent_at: appleTimestampToISO(r.date),
    service: r.service,
  }));
}

function handleSearch({ query, limit = 50 } = {}) {
  if (!query) return { error: 'missing_param', message: "'query' is required." };

  const safe = query.replace(/'/g, "''");
  const rows = sqliteQuery(`
    SELECT
      m.ROWID as id,
      m.text,
      m.is_from_me,
      m.date,
      m.service,
      h.id as sender_handle,
      c.display_name as chat_name,
      c.chat_identifier,
      cmj.chat_id
    FROM message m
    LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    LEFT JOIN chat c ON c.ROWID = cmj.chat_id
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    WHERE m.text LIKE '%${safe}%'
    ORDER BY m.date DESC
    LIMIT ${Number(limit)}
  `);

  return rows.map((r) => ({
    id: String(r.id),
    text: r.text,
    from_me: r.is_from_me === 1,
    sender: r.is_from_me ? 'me' : (r.sender_handle || 'unknown'),
    sent_at: appleTimestampToISO(r.date),
    conversation: r.chat_name || r.chat_identifier,
    conversation_id: String(r.chat_id),
  }));
}

function handleRecent({ since, limit = 100 } = {}) {
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 3600 * 1000);
  const appleTs = dateToAppleTimestamp(sinceDate);

  const rows = sqliteQuery(`
    SELECT
      m.ROWID as id,
      m.text,
      m.is_from_me,
      m.date,
      m.service,
      h.id as sender_handle,
      c.display_name as chat_name,
      c.chat_identifier,
      cmj.chat_id
    FROM message m
    LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    LEFT JOIN chat c ON c.ROWID = cmj.chat_id
    LEFT JOIN handle h ON h.ROWID = m.handle_id
    WHERE m.date >= ${appleTs}
    ORDER BY m.date ASC
    LIMIT ${Number(limit)}
  `);

  return rows.map((r) => ({
    id: String(r.id),
    text: r.text || '(attachment or empty)',
    from_me: r.is_from_me === 1,
    sender: r.is_from_me ? 'me' : (r.sender_handle || 'unknown'),
    sent_at: appleTimestampToISO(r.date),
    conversation: r.chat_name || r.chat_identifier,
    conversation_id: String(r.chat_id),
  }));
}

function handleSend({ to, message } = {}) {
  if (!to) return { error: 'missing_param', message: "'to' (phone number, email, or contact name) is required." };
  if (!message) return { error: 'missing_param', message: "'message' is required." };

  // Escape for AppleScript string
  const safeTo = to.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeMsg = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  const script = `
tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "${safeTo}" of targetService
  send "${safeMsg}" to targetBuddy
end tell
`.trim();

  const result = spawnSync('osascript', ['-e', script], {
    encoding: 'utf8',
    timeout: 15000,
  });

  if (result.status !== 0) {
    // Fallback: try SMS via phone number service
    const scriptSMS = `
tell application "Messages"
  send "${safeMsg}" to buddy "${safeTo}" of (1st service whose service type = SMS)
end tell
`.trim();
    const result2 = spawnSync('osascript', ['-e', scriptSMS], {
      encoding: 'utf8',
      timeout: 15000,
    });
    if (result2.status !== 0) {
      return {
        status: 'failed',
        error: result.stderr || result2.stderr || 'AppleScript failed',
        hint: 'Make sure the Messages app is open and the contact exists. For iMessage, use an Apple ID email or phone number registered with iMessage.',
      };
    }
  }

  return {
    status: 'sent',
    to,
    message: `Message sent to ${to}.`,
  };
}

// ─── MCP Protocol ─────────────────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'imessages_status',
    description: 'Check if macOS Messages database is accessible. Returns availability and message count. If unavailable, provides instructions for granting Full Disk Access.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'imessages_conversations',
    description: 'List recent iMessage/SMS conversations from the macOS Messages app.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max conversations to return (default 20)' },
      },
    },
  },
  {
    name: 'imessages_messages',
    description: 'Get messages from a specific conversation. Search by contact name/number or conversation ID.',
    inputSchema: {
      type: 'object',
      properties: {
        contact: { type: 'string', description: 'Contact name or phone number to find' },
        conversation_id: { type: 'string', description: 'Exact conversation ID (from imessages_conversations)' },
        limit: { type: 'number', description: 'Max messages to return (default 50)' },
      },
    },
  },
  {
    name: 'imessages_search',
    description: 'Search across all iMessage/SMS messages for a keyword or phrase.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text to search for in messages' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'imessages_recent',
    description: 'Get all messages received since a given time. Useful for checking what has come in recently.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: "ISO 8601 timestamp (e.g. '2026-03-14T10:00:00Z'). Defaults to last 1 hour." },
        limit: { type: 'number', description: 'Max messages to return (default 100)' },
      },
    },
  },
  {
    name: 'imessages_send',
    description: 'Send an iMessage or SMS via the macOS Messages app using AppleScript. Use with care — this sends a real message.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: "Recipient phone number (e.g. '+16025551234'), Apple ID email, or contact name" },
        message: { type: 'string', description: 'Message text to send' },
      },
      required: ['to', 'message'],
    },
  },
];

function dispatchTool(name, args) {
  switch (name) {
    case 'imessages_status':        return handleStatus(args);
    case 'imessages_conversations': return handleConversations(args);
    case 'imessages_messages':      return handleMessages(args);
    case 'imessages_search':        return handleSearch(args);
    case 'imessages_recent':        return handleRecent(args);
    case 'imessages_send':          return handleSend(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// Minimal stdio MCP server (JSON-RPC 2.0)
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

rl.on('line', (line) => {
  let req;
  try {
    req = JSON.parse(line.trim());
  } catch {
    return;
  }

  const { id, method, params } = req;

  try {
    switch (method) {
      case 'initialize':
        respond(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'imessages', version: '1.0.0' },
        });
        break;

      case 'notifications/initialized':
        // No response needed for notifications
        break;

      case 'tools/list':
        respond(id, { tools: TOOL_DEFINITIONS });
        break;

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};
        try {
          const result = dispatchTool(toolName, toolArgs);
          respond(id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          });
        } catch (err) {
          respond(id, {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true,
          });
        }
        break;
      }

      default:
        if (id != null) respondError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (id != null) respondError(id, -32603, err.message);
  }
});
