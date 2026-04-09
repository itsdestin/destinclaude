---
name: sync
description: Manual sync hub for backing up personal data to cloud backends from the CLI. Use when user says "/sync", "sync status", "check sync", "force sync", "backup now", "manual backup", "push to drive", "pull from drive", "configure backends", "manage backends", "skill routing", or when session-start surfaces unrouted-skill / untracked-project warnings.
---

# /sync — Manual Sync Hub

You are managing the user's data protection from the CLI. This is the **manual fallback** for sync — the DestinCode app owns automatic backup when it's running. Use this skill when:

- The user is on a CLI-only machine (headless server, SSH session, no app installed)
- The user wants to trigger an immediate push or pull without waiting for the app
- The user needs to configure backends or routes from the CLI

This skill talks to the **same backends** the app uses (Google Drive via rclone, GitHub via git, iCloud via rsync) and reads/writes the **same config and state files** (`~/.claude/toolkit-state/config.json`, `~/.claude/backup-meta.json`, `~/.claude/.sync-warnings`). Anything you push from here will be visible to the app when it next pulls, and vice versa.

This is an interactive hub: show the dashboard, present an action menu, handle the user's choice, then return to the dashboard until they're done.

## Parse Arguments

- No argument → full status dashboard + action menu
- `push` (or "backup now", "force sync", "push to drive", "manual backup") → skip to §5
- `pull` (or "pull from drive", "fetch backups", "restore latest") → skip to §6
- `add <path>` → register a single project (skip to §4 for that path only)
- `ignore <path>` → add path to ignored list in tracked-projects.json, remove from .unsynced-projects
- `backends` (or "configure backends", "manage backends") → skip to §7
- `skills` (or "skill routing", "manage skill backups") → skip to §8

## §1 — Read State

Read these before showing anything:

```bash
cat ~/.claude/toolkit-state/config.json 2>/dev/null         # Backend config
cat ~/.claude/backup-meta.json 2>/dev/null                  # Last sync metadata (written by app or last manual push)
cat ~/.claude/toolkit-state/.app-sync-active 2>/dev/null    # If present, app is running and owns sync
cat ~/.claude/.sync-warnings 2>/dev/null                    # Toolkit-side warnings (unrouted skills, untracked projects)
cat ~/.claude/.unsynced-projects 2>/dev/null                # Discovered but unregistered projects
cat ~/.claude/tracked-projects.json 2>/dev/null             # Project registry
cat ~/.claude/toolkit-state/skill-routes.json 2>/dev/null   # Skill backup routing
tail -30 ~/.claude/backup.log 2>/dev/null                   # Recent operations from both app + toolkit
```

Compute live status (the toolkit no longer maintains `.sync-marker` automatically):

```bash
# Connectivity
node -e 'require("dns").lookup("github.com",e=>{process.exit(e?1:0)})' 2>/dev/null && echo "ONLINE" || echo "OFFLINE"

# Backend reachability — only run for backends listed in PERSONAL_SYNC_BACKEND
# Drive:  rclone lsd "gdrive:${DRIVE_ROOT:-Claude}/Backup/personal/" 2>/dev/null
# GitHub: test -d ~/.claude/toolkit-state/personal-sync-repo/.git
# iCloud: test -d "$ICLOUD_PATH"
```

## §2 — Status Dashboard

Read `PERSONAL_SYNC_BACKEND` from `config.json` — it's a comma-separated string like `"drive"`, `"drive,github"`, or `"drive,icloud"`.

```
═══════════════════════════════════════════════════
  Sync Status     (manual mode)
═══════════════════════════════════════════════════

  App sync:
    ✓ DestinCode app is running — automatic sync is active
    — OR —
    ○ App not running — toolkit is the only sync mechanism

  Backends:
    Drive:  ✓ active → gdrive:{DRIVE_ROOT}/Backup/personal/
    GitHub: ✓ active → {PERSONAL_SYNC_REPO}
    iCloud: ✓ active → {ICLOUD_PATH}
    — OR for each unconfigured backend —
    Drive:  not configured
    — OR if no backends at all —
    ⚠ No backends configured — run "Reconfigure backends" below

  Last successful push:
    Xm ago (from backup-meta.json)
    — OR —
    Never

  Skills:
    N synced (personal), M contributed, K skipped
    — OR —
    ⚠ N unrouted: name1, name2

  Projects:
    N tracked, M unsynced detected
    — OR —
    ✓ All projects tracked (N total)
    — OR —
    No project registry yet

═══════════════════════════════════════════════════
```

For the App sync row, check whether `~/.claude/toolkit-state/.app-sync-active` exists. If it does, mention that the app is the canonical sync engine and the user normally doesn't need to run `/sync` — but they can still use it to trigger an immediate push/pull or change config.

For the Skills row, count from `skill-routes.json`: skills with `"route": "personal"` are "synced", `"route": "contribute"` are "contributed", `"route": "none"` are "skipped". Any user-created skill in `~/.claude/skills/` not present in `skill-routes.json` (and not a toolkit symlink/copy) is "unrouted".

If everything looks fine, say "Everything looks good — your data is protected." Then always show the Action Menu.

## Action Menu

```
What would you like to do?

  1. Resolve warnings          ← only if .sync-warnings has entries
  2. Configure skill backups   ← only if unrouted skills exist, or always if user wants to manage routes
  3. Register projects         ← only if .unsynced-projects has entries
  4. Reconfigure backends
  5. Push now (force backup)
  6. Pull now (fetch latest)
  7. Done
```

Route to the corresponding section:
- 1 → §3 (Warning Resolution)
- 2 → §8 (Skill Backup Management)
- 3 → §4 (Project Onboarding)
- 4 → §7 (Backend Reconfiguration)
- 5 → §5 (Force Push)
- 6 → §6 (Force Pull)
- 7 → End. Say "All good — your data is protected." and stop.

### Hub Return

After completing ANY section (§3, §4, §5, §6, §7, §8), return here:
1. Re-read the state files from §1 (they may have changed)
2. Show a refreshed dashboard (§2)
3. Show the action menu again
4. Continue until the user picks "Done"

## §3 — Warning Resolution

Walk through each active warning. Present one at a time, wait for user response.

### OFFLINE
> No internet connection detected. Remote sync is paused.
> This resolves automatically when connectivity returns. No action needed.

### PERSONAL:NOT_CONFIGURED
> Personal data (memory, CLAUDE.md, config) is NOT backed up to any remote.
> If this machine dies, that data is gone.
>
> Options:
> 1. Configure a backend now (goes to §7)
> 2. Install the DestinCode app for automatic sync — https://github.com/itsdestin/destincode/releases

### PERSONAL:STALE
Diagnose the cause:
1. Check whether the DestinCode app is running (`~/.claude/toolkit-state/.app-sync-active` present?)
2. Check whether the configured backend is reachable (rclone/git/iCloud path)
3. Check `backup.log` for recent errors
4. Compute the age of `~/.claude/backup-meta.json` (last successful push)

Report what you find, then offer:
> Options:
> 1. Push now (goes to §5)
> 2. Show recent backup.log entries for debugging

### SKILLS:unrouted:name1,name2
Transition to §8 — Skill Backup Management — and resolve the unrouted skills there.

### PROJECTS:N
Transition to §4 — Project Onboarding.

## §4 — Project Onboarding

Read `~/.claude/.unsynced-projects`. If the file doesn't exist or is empty, report "No unsynced projects detected" and return to Action Menu.

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

Verify `gh` is available, get the GitHub username, and use the standard `gh repo create` flow:
```bash
GH_USER=$(gh api user -q '.login' 2>/dev/null)
gh repo create "$GH_USER/<basename>" --private --source="<path>" --remote=origin --push
```

**Register in tracked-projects.json:**
```bash
node -e "
    const fs = require('fs');
    const reg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    reg.projects.push({ path: process.argv[2], remote: process.argv[3] || '', registered: new Date().toISOString() });
    fs.writeFileSync(process.argv[1], JSON.stringify(reg, null, 2) + '\n');
" ~/.claude/tracked-projects.json "<normalized-path>" "<owner/repo>"
```

**Ignore a project:**
```bash
node -e "
    const fs = require('fs');
    const reg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    if (!reg.ignored) reg.ignored = [];
    if (!reg.ignored.includes(process.argv[2])) reg.ignored.push(process.argv[2]);
    fs.writeFileSync(process.argv[1], JSON.stringify(reg, null, 2) + '\n');
" ~/.claude/tracked-projects.json "<normalized-path>"
```

After all projects are resolved, remove resolved entries from `~/.claude/.unsynced-projects` (delete the file if all are resolved).

## §5 — Force Push

Triggered by `/sync push` or trigger phrases ("backup now", "force a push", "manual backup", "push to Drive").

**Coordination:** If the DestinCode app is running (`.app-sync-active` exists), tell the user:
> The DestinCode app is running and handles sync automatically every 15 minutes.
> Running a manual push now is safe — it will use the same backends and the app will pick up the changes. Continue? (yes/no)

**Source the shared utilities:**
```bash
source ~/.claude/hooks/lib/backup-common.sh
```

**Read backend config:**
```bash
BACKENDS=$(get_backends)              # newline-separated list
DRIVE_ROOT=$(config_get "DRIVE_ROOT" "Claude")
SYNC_REPO=$(config_get "PERSONAL_SYNC_REPO" "")
ICLOUD_PATH=$(config_get "ICLOUD_PATH" "")
```

For each backend in `$BACKENDS`, push these data categories:

**Memory files** (per project key, never as a single sync — sync deletes things):
- Source: `~/.claude/projects/<key>/memory/`
- Destination: `<backend-root>/memory/<key>/`

**Conversations** (`.jsonl` files only, not symlinks):
- Source: `~/.claude/projects/<slug>/*.jsonl`
- Destination: `<backend-root>/conversations/<slug>/`

**System files:**
- `~/.claude/CLAUDE.md` → `<backend-root>/CLAUDE.md`
- `~/.claude/encyclopedia/*.md` (top level only) → `<backend-root>/encyclopedia/`
- `~/.claude/toolkit-state/config.json` → `<backend-root>/system-backup/config.json`
- `~/.claude/settings.json` → `<backend-root>/system-backup/settings.json`
- `~/.claude/keybindings.json`, `mcp.json`, `history.jsonl` → `<backend-root>/system-backup/`
- `~/.claude/plans/`, `~/.claude/specs/` → `<backend-root>/system-backup/plans|specs/`
- `~/.claude/conversation-index.json` → `<backend-root>/system-backup/conversation-index.json`

**User-created skills** (skip toolkit-owned symlinks and skills routed to "none"):
- Source: `~/.claude/skills/<name>/` (where `is_toolkit_owned` returns false)
- Skip if `skill-routes.json` route is `"none"`
- Destination: `<backend-root>/skills/<name>/`

### Per-backend commands

**Drive** (`<backend-root>` = `gdrive:$DRIVE_ROOT/Backup/personal`):
```bash
rclone copy "$SRC" "gdrive:$DRIVE_ROOT/Backup/personal/$DST" --update --skip-links
```

**GitHub** (`<backend-root>` = `~/.claude/toolkit-state/personal-sync-repo`):
```bash
REPO_DIR=~/.claude/toolkit-state/personal-sync-repo
# If repo doesn't exist, clone or init:
[[ -d "$REPO_DIR/.git" ]] || git clone "$SYNC_REPO" "$REPO_DIR" 2>/dev/null || {
    mkdir -p "$REPO_DIR"
    cd "$REPO_DIR" && git init && git remote add personal-sync "$SYNC_REPO"
    echo "# Personal Claude Data Backup" > README.md
    git add -A && git commit -m "Initial commit" --no-gpg-sign
    git branch -M main && git push -u personal-sync main
}
# Then copy files into $REPO_DIR matching the layout above, then:
cd "$REPO_DIR" && git add -A && git diff --cached --quiet || {
    git commit -m "manual sync" --no-gpg-sign
    git push personal-sync main
}
```

**iCloud** (`<backend-root>` = `$ICLOUD_PATH`):
```bash
rsync -a --update "$SRC" "$ICLOUD_PATH/$DST"
# Fall back to cp -r if rsync isn't available
```

### After the push

Update `~/.claude/backup-meta.json` so the next status check shows a fresh timestamp:
```bash
node -e "
  const fs = require('fs');
  const meta = { last_sync: new Date().toISOString(), source: 'manual-push', backends: process.argv[1].split(',') };
  fs.writeFileSync(process.argv[2], JSON.stringify(meta, null, 2) + '\n');
" "$BACKENDS" ~/.claude/backup-meta.json
```

Report results:
```
Push complete:
  Drive:  ✓ pushed (memory, conversations, system, skills)
  GitHub: ⚠ failed — see ~/.claude/backup.log
  iCloud: ✓ pushed
```

If any backend failed, point the user at `~/.claude/backup.log` and offer to show the last 30 lines.

## §6 — Force Pull

Triggered by `/sync pull` or trigger phrases ("pull from Drive", "fetch latest", "download backups").

**Coordination:** If the DestinCode app is running, tell the user:
> The app pulled on launch and continues to sync. A manual pull is only useful if data was changed on another device since you opened the app. Continue? (yes/no)

**Source utilities and read backend config** (same as §5).

### Pull operations (preferred backend only — first in list)

**Memory** (preserves local files; uses `--update` so newer wins):
- Pull `<backend-root>/memory/<key>/` → `~/.claude/projects/<key>/memory/`

**Conversations** (`.jsonl`, never overwrite local — local is authoritative):
- Pull `<backend-root>/conversations/` → `~/.claude/projects/`
- Use `--ignore-existing` (rclone) or `cp -n` (rsync) so local files always win

**System files** (use `--update` so newer wins):
- `<backend-root>/CLAUDE.md` → `~/.claude/CLAUDE.md`
- `<backend-root>/encyclopedia/*.md` → `~/.claude/encyclopedia/`
- `<backend-root>/system-backup/config.json` → `~/.claude/toolkit-state/config.json`
- Other system-backup files → `~/.claude/`

**Conversation index** (stage to a temp file, then merge):
```bash
mkdir -p ~/.claude/toolkit-state/.index-staging
# Pull <backend-root>/system-backup/conversation-index.json → .index-staging/
merge_conversation_index ~/.claude/toolkit-state/.index-staging/conversation-index.json
rm -rf ~/.claude/toolkit-state/.index-staging
```

### Per-backend commands

**Drive:**
```bash
DRIVE_SOURCE="gdrive:$DRIVE_ROOT/Backup/personal"
# Iterate memory project keys (don't bulk-sync — that would delete local conversations)
while IFS= read -r key; do
    key="${key%/}"
    [[ -z "$key" ]] && continue
    mkdir -p ~/.claude/projects/"$key"/memory
    rclone copy "$DRIVE_SOURCE/memory/$key/" ~/.claude/projects/"$key"/memory/ --update --skip-links
done < <(rclone lsf "$DRIVE_SOURCE/memory/" --dirs-only)
rclone copy "$DRIVE_SOURCE/conversations/" ~/.claude/projects/ --include '*.jsonl' --ignore-existing
rclone copy "$DRIVE_SOURCE/CLAUDE.md" ~/.claude/ --update
# ...etc
```

**GitHub:**
```bash
cd ~/.claude/toolkit-state/personal-sync-repo && git pull personal-sync main
# Then rsync from REPO_DIR back into ~/.claude/
rsync -a --update memory/ ~/.claude/projects/
rsync -a --update CLAUDE.md ~/.claude/
# ...etc
```

**iCloud:**
```bash
rsync -a --update "$ICLOUD_PATH/memory/" ~/.claude/projects/
rsync -a --update "$ICLOUD_PATH/CLAUDE.md" ~/.claude/
# ...etc
```

### After the pull

Run cross-device cleanup so `/resume` works across devices:
```bash
source ~/.claude/hooks/lib/backup-common.sh
rewrite_project_slugs ~/.claude/projects
aggregate_conversations ~/.claude/projects
regenerate_topic_cache
```

Report results per backend, similar to §5.

## §7 — Backend Reconfiguration

Interactive reconfiguration of sync backends. Users should not need to re-run `/setup-wizard` to change their backend setup.

### Step 1: Show current backend config

Read `~/.claude/toolkit-state/config.json` and display:

```
Backend    Status           Config
Drive      ✓ active         gdrive:{DRIVE_ROOT}/Backup/personal/
GitHub     ✓ active         {PERSONAL_SYNC_REPO}
iCloud     not configured   —
```

Show all three supported backends. Mark as "active" if present in `PERSONAL_SYNC_BACKEND`, "not configured" otherwise.

### Step 2: Action menu

```
What would you like to do?
  1. Add a backend
  2. Remove a backend
  3. Change backend settings
  4. Test all backends (round-trip)
  5. Back to dashboard
```

### Adding a backend

Ask which backend to add (only show unconfigured ones):

**Drive:**
1. Verify rclone is installed; if not, show install command for the platform
2. Verify `gdrive:` remote exists (`rclone listremotes | grep -q '^gdrive:'`); if not, walk through `rclone config create gdrive drive`
3. Ask for Drive root folder name (default: "Claude")
4. Run round-trip test
5. On success, update config (add to `PERSONAL_SYNC_BACKEND`, set `DRIVE_ROOT`)

**GitHub:**
1. Verify `gh` is installed and authenticated
2. Ask for sync repo URL or offer to create one (`gh repo create $USER/claude-personal-sync --private`)
3. Run round-trip test
4. On success, update config (add to `PERSONAL_SYNC_BACKEND`, set `PERSONAL_SYNC_REPO`)

**iCloud:**
1. Detect iCloud Drive path (macOS standard, Windows iCloud, Linux fallback)
2. Create sync directory if missing
3. Run round-trip test
4. On success, update config (add to `PERSONAL_SYNC_BACKEND`, set `ICLOUD_PATH`)

### Updating config.json

Use this pattern for any config write:
```bash
node -e "
  const fs = require('fs');
  const f = process.argv[1];
  const c = JSON.parse(fs.readFileSync(f, 'utf8'));
  const backends = (c.PERSONAL_SYNC_BACKEND || '').split(',').filter(Boolean);
  if (!backends.includes(process.argv[2])) backends.push(process.argv[2]);
  c.PERSONAL_SYNC_BACKEND = backends.join(',');
  // Set the backend-specific key from process.argv[3]/[4]
  fs.writeFileSync(f, JSON.stringify(c, null, 2) + '\n');
" ~/.claude/toolkit-state/config.json "<backend-name>"
```

Atomic writes are required — use a temp file + rename if you change this pattern.

### Removing a backend

1. Ask which active backend to remove
2. Confirm: "Your data on this backend won't be deleted — it just won't be synced to anymore. Continue?"
3. Update config to drop the backend from `PERSONAL_SYNC_BACKEND` (set to "none" if list becomes empty)

### Round-trip test (per backend)

Write a small marker file → read it back → verify content → delete. Surface failures with actionable errors:
- Drive auth expired → "Run `rclone config reconnect gdrive:` to refresh credentials"
- GitHub push rejected → "Check repo permissions: `gh repo view <repo> --json viewerPermission`"
- iCloud path missing → "iCloud Drive folder not found. Is iCloud installed and signed in?"

After any add/remove/change/test, return to §7 Step 1. When user picks "Back to dashboard", return to the Action Menu.

## §8 — Skill Backup Management

Per-skill routing to one of three destinations. The routing manifest at `~/.claude/toolkit-state/skill-routes.json` is the single source of truth for which user-created skills get backed up where.

### Routing options (per skill)

1. **Personal sync** (`"personal"`) — back up to all configured backends during a manual push (§5) or by the app
2. **Contribute** (`"contribute"`) — fork/branch/PR via `/contribute`, plus kept in personal sync as safety net until PR is merged
3. **No backup** (`"none"`) — skip this skill entirely (lives only on this machine)

### Step 1: Show routing table

Scan `~/.claude/skills/` for all user-created skills (not symlinks, not toolkit copies). For each, look up its route in `skill-routes.json`.

For skills routed as `"contribute"` with a `pr` field, check PR status:
```bash
gh pr view <pr-number> -R itsdestin/destinclaude --json state -q '.state' 2>/dev/null
```

Display:
```
Skill Backup Routing
────────────────────────────────────────────────

Skill                Route              Status
journaling           personal-sync      ✓ synced
elections-notebook   personal-sync      ✓ synced
announce             contribute         PR #72 open
fork-file            none               — skipped
my-new-skill         ⚠ unrouted         —

────────────────────────────────────────────────
```

### Step 2: Handle unrouted skills first

For each unrouted skill:
> `<name>` has no backup route. Where should it be backed up?
> 1. **Personal sync** — back up to your configured backends
> 2. **Contribute to DestinClaude** — share as a PR (stays in personal sync until merged)
> 3. **No backup** — skip (only on this machine)

Write the choice:
```bash
node -e "
  const fs = require('fs');
  const f = process.argv[1];
  let routes = {};
  try { routes = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  routes[process.argv[2]] = { route: process.argv[3], since: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(f, JSON.stringify(routes, null, 2) + '\n');
" ~/.claude/toolkit-state/skill-routes.json "<skill-name>" "<personal|contribute|none>"
```

If "Contribute" is chosen, run the `/contribute` command flow and record the PR number once it's created.

### Step 3: General management

After unrouted skills are handled, ask:
```
What would you like to do?
  1. Change a skill's route
  2. Back to dashboard
```

If user picks "Change a skill's route", show the table again, ask which skill to change, present the three options, and update `skill-routes.json`.

After any change, show the updated routing table and ask again. When user picks "Back to dashboard", return to the Action Menu (hub return).

## §9 — Path Normalization

All paths stored in `tracked-projects.json` must be normalized. The shared utility lives in `lib/backup-common.sh`:

```bash
source ~/.claude/hooks/lib/backup-common.sh
NORM=$(normalize_path "$RAW_PATH")
```

If you can't source the library, fall back to:
```bash
p="${1//\\//}"
realpath "$p" 2>/dev/null || readlink -f "$p" 2>/dev/null || echo "$p"
```
