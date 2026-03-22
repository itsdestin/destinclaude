# Quickstart

Already using Claude Code? Clone, setup, go.

## Install

```bash
git clone https://github.com/itsdestin/destinclaude.git ~/.claude/plugins/destinclaude
```

## Configure

```
claude
> /setup-wizard
```

The setup wizard handles everything: conflict resolution with your existing setup, layer selection, dependency installation, personalization, and verification.

> **Returning from another device?** When the wizard starts, answer "Yes" to the prior-use question and choose your backup source (GitHub or Google Drive). It will restore your config and skip straight to verification.

## Done

That's it. Your new commands:

| Command | What It Does |
|---------|-------------|
| `/toolkit` | See all features, commands, and useful phrases |
| `/setup-wizard` | Re-run setup wizard (safe to run again) |
| `/update` | Check for and install toolkit updates |
| `/health` | Quick check that everything is working |
| `/toolkit-uninstall` | Cleanly remove the toolkit |

## What You Just Installed

**Core** — The foundation layer. Hooks for session management, git sync, statusline, write guards, and the specs system for documenting features. Memory templates and CLAUDE.md fragments that integrate with your existing setup.

**Life** (optional) — A personal knowledge system. Journaling assistant with Socratic-style prompts. An encyclopedia system that builds and maintains a living biography from 8 modular source files. Google Drive sync via rclone.

**Productivity** (optional) — Task management and communication. Todoist inbox processor, skill creator, and a Google Messages MCP server for reading/sending texts through Claude.

**Modules** (optional) — Optional domain-specific add-ons available. Run `/toolkit` to see what's available.

## Architecture

Each layer is a standalone Claude Code plugin. They can be installed independently — life and productivity both depend on core, but not on each other. Modules are fully independent.

For the full technical deep dive: [System Architecture](system-architecture.md)

## Updating

The statusline shows your current version. When an update is available, you'll see "(Update Available)" in yellow. Run `/update` to install it.

## Questions?

Type `/toolkit` to see everything you can do, or just start talking — try "let's journal" or "check my inbox."
