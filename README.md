# DestinClaude

**The plugin toolkit that powers [DestinCode](https://github.com/itsdestin/destincode).**

DestinClaude is a collection of skills, hooks, commands, and tools for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). It adds journaling, a living personal encyclopedia, task management, text messaging, cross-device sync, and more — all through plain-English conversation.

Looking for the app? See **[DestinCode](https://github.com/itsdestin/destincode)** — available on Windows, macOS, Linux, and Android.

## Install

The DestinCode app installs this toolkit automatically. If you want to install it standalone with Claude Code:

```bash
git clone https://github.com/itsdestin/destinclaude.git ~/.claude/plugins/destinclaude
claude
> /setup-wizard
```

## What's Inside

Three layers, each a standalone [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins). Install what you need:

| Layer | Depends On | What It Adds |
|-------|-----------|-------------|
| **Core** | Nothing | Foundation — hooks, specs system, memory templates, commands, theme builder |
| **Life** | Core | Journaling assistant, personal encyclopedia, Google Drive sync |
| **Productivity** | Core | Inbox processing (Todoist, Gmail, etc.), text messaging, skill creator |

### Core Features
- **Session hooks** — auto-sync, statusline, write guards, worktree guard
- **Specs system** — structured, versioned documentation that persists across conversations
- **Memory templates** — organized persistent memory for Claude
- **Commands** — `/setup-wizard`, `/update`, `/health`, `/diagnose`, `/sync`, `/toolkit`, `/theme-builder`
- **Theme builder** — build immersive DestinCode theme packs with custom colors, wallpapers, mascots, and effects
- **Contribution detector** — notices your improvements and offers to share them upstream

### Life Features
- **Journaling assistant** — conversational daily journaling with Socratic prompts
- **Encyclopedia system** — a living biography built from 8 modular source files
- **Personal data sync** — automated backup via Google Drive, GitHub, or iCloud

### Productivity Features
- **Claude's Inbox** — processes notes and tasks from Todoist, Drive, Gmail, Apple Notes, and more
- **Skill creator** — build, test, and benchmark new skills
- **Text messaging** — read and send SMS/RCS through Claude (via Google Messages)

## Commands

After setup, type `/toolkit` to see all installed features and available modules:

```
/toolkit
```

## Updating

```
/update
```

## Contributing

Report bugs or request features via [GitHub Issues](https://github.com/itsdestin/destinclaude/issues). See the [Contributing Guide](docs/contributing.md) for details, or type `/contribute` and Claude handles the rest.

## License

MIT
