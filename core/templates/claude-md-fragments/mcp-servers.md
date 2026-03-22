## MCP Server Configuration

**IMPORTANT:** Local MCP servers are configured in `~/.claude.json` (NOT `~/.claude/mcp.json`), under `projects["<project-path>"].mcpServers`. The `/mcp` command manages this.

| Server | Type | Purpose | Platform |
|---|---|---|---|
| `windows-control` | stdio (uvx) | Windows desktop interaction | Windows only |
| `macos-automator` | stdio (npx) | AppleScript + JXA Mac automation | macOS only |
| `home-mcp` | stdio (npx) | HomeKit device/scene/automation control | macOS only |
| `apple-events` | stdio (npx) | Native Reminders + Calendar via EventKit | macOS only |
| `gmessages` | stdio (Go) | Google Messages SMS/RCS read/write via libgm | All |
| `imessages` | stdio (node) | iMessage read/send via Messages app | macOS only |
| `todoist` | http | Todoist task management | All |

MCP server code lives at `<toolkit_root>/productivity/mcp-servers/<name>/`.
