# Installing the Toolkit

There are two ways to install DestinClaude: the automated way (recommended) and the manual way.

## Option A: Run the Bootstrap Script (Recommended)

The bootstrap script checks that everything is installed, downloads the toolkit, and gets you ready to go.

**On Mac or Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/itsdestin/destinclaude/master/bootstrap/install.sh -o /tmp/install.sh && bash /tmp/install.sh
```

Or if you've already downloaded the repo:
```bash
bash bootstrap/install.sh
```

**On Windows (PowerShell):**
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

Or if you've already downloaded the repo:
```powershell
powershell -ExecutionPolicy Bypass -File bootstrap\install.ps1
```

The script will:
1. Check for Node.js, Git, and Claude Code (install any that are missing)
2. Clone the toolkit to `~/.claude/plugins/destinclaude/`
3. Tell you what to do next

> **Curious what the script does?** Read the [prerequisites explanation](../../bootstrap/prerequisites.md) for a plain-language breakdown.

## Option B: Manual Install

If you'd rather do it yourself:

```bash
git clone https://github.com/itsdestin/destinclaude.git ~/.claude/plugins/destinclaude
```

That's it — the toolkit is downloaded.

## Running the Setup Wizard

After the toolkit is downloaded (either way), open Claude Code:

```
claude
```

Then type:

```
/setup
```

Claude will walk you through the rest. Here's what to expect:

### 1. Environment Check
Claude scans your computer to see what's already installed and configured. This takes a few seconds.

### 2. Conflict Resolution
If you already have Claude Code customizations (hooks, skills, etc.), Claude will show you any conflicts and let you choose how to handle each one. Your existing setup is always backed up first.

### 3. Layer Selection
Claude asks which parts of the toolkit you want:

| Layer | What It Includes |
|-------|-----------------|
| **Core** | Foundation — hooks, specs system, memory templates, commands |
| **Life** | Personal knowledge — journaling, encyclopedia, Google Drive sync |
| **Productivity** | Task management — inbox processor, Todoist integration, text messaging |
| **Modules** | Optional add-ons — specialized tools for specific domains |

You can install everything, just the core, or pick and choose. You can always add more later.

### 4. Dependency Installation
Some layers need additional software. Claude will tell you what's needed and offer to install it. For example:
- **Life layer** needs `rclone` for Google Drive sync
- **Productivity layer** may need `Go` for the text messaging server

### 5. Personalization
Claude asks your name and a few preferences, then fills in the templates so everything is customized for you.

### 6. Verification
Claude runs a health check to make sure everything is working. If anything failed, it tells you what happened and how to fix it.

## How Long Does It Take?

- **Bootstrap script:** 2-5 minutes (mostly downloading)
- **Setup wizard:** 5-10 minutes (mostly answering questions)
- **Total:** Under 15 minutes from nothing to fully configured

## What If Something Goes Wrong?

Tell Claude. Seriously — just describe what happened in plain English. Claude can usually diagnose and fix setup issues on the spot.

If you want to start over completely:
```
/toolkit-uninstall
```
This cleanly removes everything the toolkit added and restores your previous setup.

## Next Steps

Once setup is complete, you're ready to go. Try:
- "Let's journal" — start a journal entry
- "Check my inbox" — process any pending notes
- `/update` — check for toolkit updates

For the full list of what you can do, ask Claude: "What skills do I have installed?"
