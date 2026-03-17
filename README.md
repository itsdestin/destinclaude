# ClaudifestDestiny

**Website:** https://itsdestin.github.io/claudifest-destiny/

**A modular toolkit that transforms Claude Code into a personal knowledge system, journal, task manager, and more.**

ClaudifestDestiny is a collection of skills, hooks, commands, and tools for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Anthropic's CLI for Claude. It adds a journaling system, a living encyclopedia of your life, task management, text messaging, and domain-specific modules — all through plain-English conversation.

<!-- TODO: Add demo GIF/screenshot here -->

## Get Started

Choose your path:

### New to Claude Code?
Start with the [Beginner's Guide](docs/for-beginners/00-what-is-claude.md) — it explains everything from scratch, no technical knowledge required.

### Already Use Claude Code?
See the [Quickstart](docs/quickstart.md) — four commands and you're done.

### Want the Deep Dive?
Read the [System Architecture](docs/system-architecture.md) for the full technical breakdown.

## Install

```bash
# Clone the toolkit
git clone https://github.com/itsdestin/claudifest-destiny.git ~/.claude/plugins/claudifest-destiny

# Open Claude Code and run the setup wizard
claude
> /setup
```

Or use the bootstrap script (installs prerequisites too):

**Mac/Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/itsdestin/claudifest-destiny/master/bootstrap/install.sh | bash
```

**Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -c "iwr -useb https://raw.githubusercontent.com/itsdestin/claudifest-destiny/master/bootstrap/install.ps1 -OutFile install.ps1; .\install.ps1"
```

## What's Inside

### Core (Foundation)
- **Session hooks** — Auto-sync, statusline, write guards, git backup
- **Specs system** — Structured documentation that persists across conversations
- **Memory templates** — Organized persistent memory for Claude
- **Commands** — `/setup`, `/update`, `/contribute`, `/toolkit-uninstall`
- **Contribution detector** — Notices your improvements, offers to share them upstream

### Life (Personal Knowledge)
- **Journaling assistant** — Conversational daily journaling with Socratic prompts
- **Encyclopedia system** — A living biography built from 8 modular source files
- **Google Drive sync** — Automated backup via rclone

### Productivity (Task Management)
- **Inbox processor** — Processes notes and tasks from Todoist
- **Skill creator** — Build, test, and benchmark new skills
- **Text messaging** — Read and send SMS/RCS through Claude (via Google Messages)

### Modules (Optional Add-ons)
- **Elections notebook** — Arizona legislative candidate and campaign finance tracking
- **JLBC fiscal note** — Drafts fiscal impact analyses in official format

## How It Works

Each layer is a standalone [Claude Code plugin](https://docs.anthropic.com/en/docs/claude-code/plugins). Install what you need:

| Layer | Depends On | What It Adds |
|-------|-----------|-------------|
| Core | Nothing | Foundation — hooks, specs, memory, commands |
| Life | Core | Journaling, encyclopedia, Drive sync |
| Productivity | Core | Inbox processing, messaging, skill tools |
| Modules | Nothing | Domain-specific tools (fully independent) |

The setup wizard (`/setup`) handles layer selection, conflict resolution with your existing setup, dependency installation, and personalization. Everything is non-destructive — your existing configuration is backed up and can be restored with `/toolkit-uninstall`.

## Keeping Up to Date

The statusline shows your version and flags available updates. To update:

```
/update
```

Claude shows you what changed and merges the update safely.

## Contributing

Made the toolkit better? Share it:

```
/contribute
```

Claude diffs your changes, filters out anything personal, and creates a pull request. No git knowledge required. See the [Contributing Guide](docs/contributing.md) for details.

## Built By

Created by [Destin](https://github.com/itsdestin) — originally as a personal system, now shared for anyone who wants to make Claude Code genuinely useful for daily life.

Contributions welcome. MIT licensed.
