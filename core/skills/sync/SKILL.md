---
name: sync
description: Show sync status dashboard and resolve warnings. Use when user says "/sync", "sync status", "check sync", "backup status", "force sync", "backup now", when the statusline shows sync warnings, or when a session-start hook reports unsynced projects/skills.
---

# /sync — Sync Status & Data Protection

You are managing the user's data protection across three categories: system changes (Git), personal data (Drive/GitHub/iCloud), and project repos. The goal: the user should never lose information.

**Note:** The Git-synced repo (`~/.claude/`) and the Drive remote name (`gdrive:`) are determined by the user's backup configuration. The paths below reflect the default setup; adapt to the user's actual config by reading `~/.claude/toolkit-state/config.json`.

## Parse Arguments

Check if the user provided an argument:
- No argument → full status dashboard + guided resolution
- `now` (or phrases: "backup now", "force sync", "force backup", "run a backup", "sync to Drive") → force sync (skip to §5)
- `add <path>` → register a single project (skip to §4 for that path only)
- `ignore <path>` → add path to ignored list in tracked-projects.json, remove from .unsynced-projects, commit

## §1 — Setup: Read State Files

Read ALL of these before showing anything:

```bash
cat ~/.claude/.sync-warnings 2>/dev/null        # Active warnings from session-start
cat ~/.claude/.sync-status 2>/dev/null           # Git sync status line
cat ~/.claude/backup-meta.json 2>/dev/null       # Last personal sync metadata
cat ~/.claude/toolkit-state/.personal-sync-marker 2>/dev/null  # Personal sync debounce timestamp
cat ~/.claude/.push-marker 2>/dev/null           # Git-sync push debounce timestamp

cat ~/.claude/.unsynced-projects 2>/dev/null     # Discovered but unregistered projects
cat ~/.claude/tracked-projects.json 2>/dev/null  # Project registry (may not exist yet)
cat ~/.claude/toolkit-state/config.json 2>/dev/null  # Backend config
tail -20 ~/.claude/backup.log 2>/dev/null        # Recent backup operations
```

Also run live checks:
```bash
# Internet connectivity
node -e 'require("dns").lookup("github.com",e=>{process.exit(e?1:0)})' 2>/dev/null && echo "ONLINE" || echo "OFFLINE"

# Git-sync remote status
git -C ~/.claude remote get-url origin 2>/dev/null

# Personal sync backend reachability (only check configured backends)
# Drive: rclone lsd gdrive: 2>/dev/null
# GitHub: git -C ~/.claude/toolkit-state/personal-sync-repo remote -v 2>/dev/null
# iCloud: test -d "$ICLOUD_PATH"
```

## §2 — Status Dashboard

Always show this first. Compute relative times from epoch timestamps.

```
═══════════════════════════════════════════════════
  Sync Status
═══════════════════════════════════════════════════

  System (Git):
    ✓ ~/.claude → origin (last push: Xm ago)
    — OR —
    ⚠ No remote configured

  Personal Data:
    Backend: Google Drive
    Last sync: Xm ago → gdrive:Claude/Backup/personal/
    Status: ✓ OK
    — OR —
    ⚠ Not configured — run /setup-wizard
    — OR —
    ⚠ Stale (last sync: Xd ago)

  Skills:
    ✓ N toolkit-managed, M git-tracked
    — OR —
    ⚠ N unbackedup: name1, name2

  Projects:
    N tracked, M unsynced detected
    — OR —
    ✓ All projects tracked (N total)
    — OR —
    No project registry yet

═══════════════════════════════════════════════════
```

If there are no warnings at all, show the dashboard and: "Everything looks good — all data is protected."

If there ARE warnings, proceed to §3.

## §3 — Warning Resolution

Walk through each active warning. Present one at a time, wait for user response.

### OFFLINE
> No internet connection detected. Git push and remote sync are paused — local commits continue normally.
> This resolves automatically when connectivity returns. No action needed.

### PERSONAL:NOT_CONFIGURED
> Personal data (memory, CLAUDE.md, config) is NOT backed up to any remote.
> If this machine dies, that data is gone.
>
> Run `/setup-wizard` to configure a backend (Google Drive, GitHub, or iCloud).

### PERSONAL:STALE
Diagnose the cause:
1. Check if `personal-sync.sh` is registered as a PostToolUse hook in `~/.claude/settings.json`
2. Check if the backend is reachable (rclone/git)
3. Check the debounce marker age
4. Check `backup.log` for recent errors

Report what you find, then offer:
> Options:
> 1. Force a sync now (resets debounce, runs sync immediately)
> 2. Show recent backup.log entries for debugging

### SKILLS:name1,name2
For each unbackedup skill:
> `<name>` exists at `~/.claude/skills/<name>/` but is not backed up anywhere.
> It's not a toolkit symlink and not tracked by git.
>
> Options:
> 1. Add to git tracking (recommended — backed up with your other config)
> 2. Skip for now

If user picks 1:
```bash
cd ~/.claude && git add "skills/<name>/" && git commit -m "feat: track user skill <name>" --no-gpg-sign
```

### PROJECTS:N
Transition to §4 — Project Onboarding.

## §4 — Project Onboarding

Read `~/.claude/.unsynced-projects`. If the file doesn't exist or is empty, report "No unsynced projects detected" and skip.

If `~/.claude/tracked-projects.json` doesn't exist, create it:
```json
{
  "projects": [],
  "ignored": []
}
```

For each unsynced project path, determine its status:
```bash
# Is it a git repo?
git -C "<path>" rev-parse --git-dir 2>/dev/null

# Does it have a remote?
git -C "<path>" remote get-url origin 2>/dev/null

# If it has a remote and gh is available, check visibility
gh repo view "<owner>/<repo>" --json isPrivate -q '.isPrivate' 2>/dev/null
```

Present each project one at a time:

**Git repo with remote:**
> `<path>` → `<remote>` (private/public). Register for tracking? (yes / ignore)

**Git repo, no remote:**
> `<path>` is a Git repo with no remote.
> 1. Create private GitHub repo and register
> 2. Create public GitHub repo and register
> 3. Ignore this project
> 4. Skip for now

**Not a git repo:**
> `<path>` is not a Git repo.
> 1. Initialize Git + create private repo + register
> 2. Initialize Git + create public repo + register
> 3. Ignore
> 4. Skip

### Execution

Before creating repos, verify `gh` is available:
```bash
command -v gh &>/dev/null || echo "GitHub CLI (gh) not found — install from https://cli.github.com/"
```

Get the GitHub username dynamically:
```bash
GH_USER=$(gh api user -q '.login' 2>/dev/null)
```

**Initialize Git (if needed):**
```bash
cd "<path>" && git init && git add -A && git commit -m "Initial commit"
```

**Create GitHub repo:**
```bash
# Private:
gh repo create "$GH_USER/<basename>" --private --source="<path>" --remote=origin --push
# Public:
gh repo create "$GH_USER/<basename>" --public --source="<path>" --remote=origin --push
```

**Register in tracked-projects.json:**
```bash
node -e "
    const fs = require('fs');
    const regPath = process.argv[1];
    const projPath = process.argv[2];
    const remote = process.argv[3] || '';
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    reg.projects.push({ path: projPath, remote: remote, registered: new Date().toISOString() });
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
" ~/.claude/tracked-projects.json "<normalized-path>" "<owner/repo>"
```

**Ignore a project:**
```bash
node -e "
    const fs = require('fs');
    const regPath = process.argv[1];
    const projPath = process.argv[2];
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    if (!reg.ignored) reg.ignored = [];
    if (!reg.ignored.includes(projPath)) reg.ignored.push(projPath);
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
" ~/.claude/tracked-projects.json "<normalized-path>"
```

### Cleanup

After all projects are resolved:
1. Remove resolved entries from `~/.claude/.unsynced-projects` (delete file if all resolved)
2. If `tracked-projects.json` changed:
```bash
cd ~/.claude && git add tracked-projects.json && git commit -m "auto: update tracked-projects.json" --no-gpg-sign
```

## §5 — Force Sync

Triggered by `/sync now` or trigger phrases ("backup now", "force a full backup", "run a backup", "manual backup", "sync to Drive").

```bash
# Reset debounce markers so hooks will fire immediately
touch -t 202001010000 ~/.claude/toolkit-state/.personal-sync-marker 2>/dev/null
touch -t 202001010000 ~/.claude/.push-marker 2>/dev/null

# Run git-sync
cd ~/.claude && git add -A 2>/dev/null && git diff --cached --quiet 2>/dev/null || git commit -m "manual: force sync" --no-gpg-sign 2>/dev/null
git push origin $(git symbolic-ref --short HEAD) 2>/dev/null && echo "✓ Git push: ~/.claude" || echo "⚠ Git push failed: ~/.claude"

# Run personal-sync directly
bash ~/.claude/hooks/personal-sync.sh <<< '{"tool_input":{"file_path":"'"$HOME/.claude/CLAUDE.md"'"}}'
```

Report results:
```
Force sync complete:
  Git (claude-config): ✓ pushed
  Personal data: ✓ synced to Drive / ⚠ failed
```

## §6 — Path Normalization

All paths stored in `tracked-projects.json` must be normalized. Use this before storing:
```bash
# Normalize: backslashes to forward slashes, resolve symlinks
normalize_path() {
    local p="$1"
    p="${p//\\//}"
    realpath "$p" 2>/dev/null || readlink -f "$p" 2>/dev/null || echo "$p"
}
```

This matches the `normalize_path()` function in `lib/backup-common.sh`.
