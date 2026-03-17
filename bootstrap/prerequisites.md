# What the Installer Does

This page explains exactly what the bootstrap scripts (`install.sh` and `install.ps1`) do, step by step. Nothing hidden.

## What Gets Installed

The scripts check for these and install any that are missing:

### 1. Homebrew (Mac only)
- **What it is:** A package manager for macOS — think of it as an app store for developer tools, but free and in the terminal.
- **Why it's needed:** Almost everything else the toolkit installs (Node.js, git tools, Google Cloud SDK, rclone, Go) is installed through Homebrew. Setting it up first makes everything else a one-liner.
- **Where it comes from:** brew.sh — the official Homebrew project.
- **On Windows/Linux:** Not needed. Windows uses `winget`, Linux uses `apt`/`dnf`.

### 2. Node.js
- **What it is:** A program that runs JavaScript on your computer. Claude Code is built with it.
- **Why it's needed:** Claude Code won't work without it.
- **Where it comes from:** The official Node.js website (nodejs.org) or your system's package manager.
- **What version:** The latest LTS (Long Term Support) version — the most stable one.

### 3. Git
- **What it is:** A tool developers use to track changes to code. It's how you'll receive toolkit updates.
- **Why it's needed:** The toolkit is downloaded using git, and updates are delivered through it.
- **Where it comes from:** Already installed on most Macs. On Windows, from git-scm.com.

### 4. Claude Code
- **What it is:** Anthropic's command-line tool for Claude. This is the main program the toolkit extends.
- **Why it's needed:** The whole toolkit is built for Claude Code.
- **Where it comes from:** npm (Node.js's package registry), installed globally on your system.

## What Gets Downloaded

After checking prerequisites, the script downloads the toolkit itself:

- **From:** `https://github.com/itsdestin/destinclaude`
- **To:** `~/.claude/plugins/destinclaude/` (inside your Claude Code configuration directory)
- **Size:** A few megabytes
- **What it contains:** Skills, hooks, commands, and templates — all plain text files you can read

## What Does NOT Happen

- No accounts are created
- No data is sent anywhere
- No background services are started
- No system settings are changed (beyond adding the programs above)
- Nothing runs automatically — you choose what to install next by talking to Claude

## After the Script

The script ends by telling you to open Claude Code and say "set me up." From there, Claude walks you through choosing which toolkit features you want, personalizing your setup, and making sure everything works. You're in control the whole time.

## Uninstalling

If you change your mind, tell Claude `/toolkit-uninstall` and it will cleanly remove everything the toolkit added, restoring your previous setup.
