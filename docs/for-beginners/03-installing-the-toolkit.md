# Installing the Toolkit

## Step 1: Run the Installer

Open your terminal and copy-paste the command for your system. It handles everything — checking prerequisites, downloading the toolkit, installing the desktop app, and launching the setup wizard.

**On Mac or Linux (Terminal):**
```bash
curl -fsSL https://raw.githubusercontent.com/itsdestin/destinclaude/master/bootstrap/install.sh -o /tmp/install.sh && bash /tmp/install.sh
```

**On Windows (PowerShell):**
```powershell
iwr -useb https://raw.githubusercontent.com/itsdestin/destinclaude/master/bootstrap/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File install.ps1
```

> **Tip:** You don't need to understand what these commands do — they just download and run the installer. If you're curious, see the [plain-language breakdown](../../bootstrap/prerequisites.md).

> **On Windows,** you may see a permission prompt to enable Developer Mode. This is a safe, one-time setting that lets the toolkit stay up to date automatically — it doesn't change how your computer works.

## Step 2: Say "Set Me Up"

After the installer finishes, the DestinCode app opens automatically. Start a conversation and say **"set me up"** — Claude will walk you through the rest.

If the app didn't open, you can launch it from your Start Menu (Windows), Spotlight (Mac), or app launcher (Linux). Or open a terminal and type `claude`.

## What the Setup Wizard Does

Here's what to expect — the whole process takes about 10 minutes:

### Prior Use Check
Claude asks whether you've used DestinClaude before. If you're coming from another device with a backup, say yes — Claude will restore your data and skip ahead. If this is your first time, say no.

### Layer Selection
Claude asks which parts of the toolkit you want:

| Layer | What It Includes |
|-------|-----------------|
| **Core** | Foundation — hooks, specs system, memory templates, commands |
| **Life** | Personal knowledge — journaling, encyclopedia, Google Drive sync |
| **Productivity** | Task management — inbox processor, Todoist integration, text messaging |

You can install everything (recommended), or pick and choose. You can always add more later.

### Dependency Installation
Some features need additional software. Claude tells you what's needed and installs it for you — your browser may open a few times for sign-in prompts (Google Drive, GitHub, etc.).

### Personalization
Claude asks your name and a few preferences, then configures everything for you.

### Verification
Claude runs a health check to make sure everything works. If anything failed, it tells you what happened and how to fix it.

## How Long Does It Take?

- **Installer:** 2-5 minutes (mostly downloading)
- **Setup wizard:** 5-10 minutes (mostly answering questions)
- **Total:** Under 15 minutes from nothing to fully configured

## What If Something Goes Wrong?

Tell Claude. Seriously — just describe what happened in plain English. Claude can usually diagnose and fix setup issues on the spot.

If you want to start over completely, tell Claude `/toolkit-uninstall` — it cleanly removes everything and restores your previous setup.

<details>
<summary>Already have Claude Code and Git? Manual install instead</summary>

```bash
git clone https://github.com/itsdestin/destinclaude.git ~/.claude/plugins/destinclaude
claude
> /setup-wizard
```
</details>

## Next Steps

Head to [Your New Toolkit](04-your-new-toolkit.md) for the five commands and five phrases you should know, plus how updates and troubleshooting work.
