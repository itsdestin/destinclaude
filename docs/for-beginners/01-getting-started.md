# Getting Started

Before you can use Claude Code and this toolkit, you need three things installed on your computer: **Node.js**, **Git**, and **Claude Code** itself. This page walks you through each one.

> **Shortcut:** If you'd rather not do this manually, the bootstrap script does all of it for you. See [Installing the Toolkit](03-installing-the-toolkit.md) for that approach.

## What's a Terminal?

A terminal is a program where you type commands instead of clicking buttons. Every computer has one built in.

**On Mac:**
1. Press `Cmd + Space` to open Spotlight
2. Type "Terminal" and press Enter
3. A window appears with a blinking cursor — that's your terminal

**On Windows:**
1. Press the Windows key
2. Type "PowerShell" and press Enter
3. A blue window appears with a blinking cursor — that's your terminal

**On Linux:**
You probably already know this one. `Ctrl + Alt + T` on most distributions.

From here on, when this guide says "run this command," it means: type it into the terminal and press Enter.

## Step 1: Install Node.js

Node.js is a program that runs JavaScript on your computer. Claude Code needs it to work.

**On Mac (with Homebrew):**
```
brew install node
```

**On Mac (without Homebrew):**
Go to https://nodejs.org, download the LTS version, and run the installer.

**On Windows:**
```
winget install OpenJS.NodeJS.LTS
```
If that doesn't work, go to https://nodejs.org, download the LTS version, and run the installer.

**On Linux (Ubuntu/Debian):**
```
sudo apt install nodejs npm
```

**Verify it worked:**
```
node --version
```
You should see something like `v22.x.x`. The exact number doesn't matter as long as it's v18 or higher.

## Step 2: Install Git

Git is a tool that tracks changes to files. The toolkit uses it to deliver updates.

**On Mac:**
Git is usually already installed. Check with:
```
git --version
```
If it's not installed, you'll be prompted to install Xcode Command Line Tools. Say yes.

**On Windows:**
```
winget install Git.Git
```
Or download from https://git-scm.com. During installation, accept the defaults.

**On Linux:**
```
sudo apt install git
```

**Verify it worked:**
```
git --version
```

## Step 3: Install Claude Code

Claude Code is Anthropic's command-line interface for Claude. It's what you'll actually talk to.

```
npm install -g @anthropic-ai/claude-code
```

**Verify it worked:**
```
claude --version
```

## Step 4: Set Up Claude Code

The first time you run Claude Code, it'll ask you to log in:

```
claude
```

Follow the prompts to authenticate. You'll need either:
- An Anthropic API key (from https://console.anthropic.com), or
- A Claude Max subscription

Once authenticated, you'll see Claude's prompt — a place where you can type in plain English and Claude responds. Type `exit` or press `Ctrl+C` to leave.

## Next Steps

Now that Claude Code is installed and working:
- [Your First Conversation](02-your-first-conversation.md) — learn how to talk to Claude
- [Installing the Toolkit](03-installing-the-toolkit.md) — add the DestinClaude skills and tools
