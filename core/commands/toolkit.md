---
description: Show all DestinClaude features, commands, skills, and useful phrases
---

Show the user a complete reference of everything the toolkit provides — both what's installed and what's available but not installed.

## How to determine installed layers

Read `~/.claude/toolkit-state/config.json`. Look for:
- `installed_layers` array (e.g., `["core", "life", "productivity"]`)
- `installed_modules` array (e.g., `[]`)

If the file doesn't exist or can't be read, check which skill symlinks exist in `~/.claude/skills/` to infer installed layers:
- Life: `journaling-assistant` or `encyclopedia-update` exists
- Productivity: `inbox-processor` or `skill-creator` exists

## Output Format

Present this as a clean, scannable reference card. Show installed features first, then available-but-not-installed layers at the bottom.

```
DestinClaude Toolkit — Quick Reference

COMMANDS (type these in Claude)
  /setup-wizard ................ Run or re-run the setup wizard
  /update ............... Check for and install toolkit updates
  /health ............... Quick check that everything is working
  /toolkit .............. Show this reference card
  /toolkit-uninstall .... Remove the toolkit and restore your previous setup

YOUR SKILLS (say these phrases or use the skill name)
```

Then list skills grouped by installed layer. For each skill, show the trigger phrases. Only show layers that are actually installed:

```
  Life:
    journaling .......... "let's journal" / "daily journal" / "let's catch up"
    encyclopedia ........ "update my encyclopedia" / "compile the encyclopedia"
    interviewer ......... "interview me" / "fill gaps in my encyclopedia"
    librarian ........... "brief me on [person]" / "deep search [topic]"
                          "pull together everything about [topic]"
    google-drive ........ "sync to drive" / "upload to drive"

  Productivity:
    inbox-processor ..... "check my inbox" / "process my notes"
    skill-creator ....... "create a skill" / "build a new skill"
```

Then show hooks:

```
HOOKS (run automatically — you don't need to do anything)
    git-sync ............ Backs up your config after every file change
    session-start ....... Syncs encyclopedia + checks inbox on startup
    write-guard ......... Prevents file conflicts between sessions
    statusline .......... Shows model, context %, sync status at bottom of screen
    checklist-reminder .. Reminds about system changes at session end
```

Then the phrase guide — only include phrases for installed layers:

```
WHAT TO SAY
  Here are useful phrases to get started:

    "Let's journal"
      Start a daily journal entry — Claude asks about your day conversationally

    "Let's catch up"
      Same as journaling but more casual — Claude asks what's been going on

    "Check my inbox"
      Process notes and screenshots you captured on your phone via Todoist

    "Brief me on [person]"
      Pull together everything you've recorded about someone

    "Deep search [topic]"
      Search your journal, texts, and encyclopedia for a topic

    "Interview me about [topic]"
      Claude interviews you to fill gaps in your encyclopedia

    "Update my encyclopedia"
      Route recent journal entries into your encyclopedia source files

    "Compile the encyclopedia"
      Generate the full Encyclopedia document from all source files
```

## Modules

Modules are optional domain-specific add-ons. Run `/toolkit` to see available modules, or check `~/.claude/toolkit-state/config.json` for installed modules.

## Available but not installed

**Always show this section** if any layers or modules are not installed. This is how users discover features they might want.

```
AVAILABLE (not installed — run /setup-wizard to add)
```

For each layer that is NOT installed, show a one-line description of what it adds:

- **Life** — Daily journaling with a conversational assistant, a living Encyclopedia that builds your biography over time, and Google Drive sync for automatic backups.
- **Productivity** — Process notes from your phone via Todoist, create custom Claude skills, and read/send texts through Google Messages.

If everything is installed, show: "You have everything installed! Check https://github.com/itsdestin/destinclaude for new modules."

## When a user asks about an uninstalled feature

If the user asks about a feature that belongs to a layer they haven't installed (e.g., they say "let's journal" but Life isn't installed, or "check my inbox" but Productivity isn't installed), respond with:

"That feature is part of the **[Layer Name]** layer, which isn't installed yet. Here's what it includes: [one-line description]. Want me to install it? Just say /setup-wizard and I'll add it to your existing setup."
