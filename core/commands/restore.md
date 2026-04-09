---
description: Restore personal data from a backup (Google Drive, GitHub, or iCloud)
---

# /restore — Ad-Hoc Personal Data Restore

Restore personal data from a backup outside of the setup wizard. Use this when you want to pull data from a backup on a machine that already has DestinClaude installed.

This command is **self-contained** — it talks directly to backends via rclone/git/rsync, then uses helpers from `core/hooks/lib/backup-common.sh` to do cross-device cleanup. It works whether or not the DestinCode app is installed.

## Step 1: Coordinate with the app

If the DestinCode app is running (`~/.claude/toolkit-state/.app-sync-active` exists), tell the user:

> The DestinCode app is running and may be syncing in the background. To avoid races, please quit the app before running a restore. (Or proceed if you understand the risk.)

Wait for confirmation.

## Step 2: Check current state

Warn the user if they have existing personal data that would be overwritten:

```bash
CLAUDE_DIR="$HOME/.claude"
HAS_MEMORY=$(find "$CLAUDE_DIR/projects" -name "*.md" -path "*/memory/*" 2>/dev/null | head -1)
HAS_CONVERSATIONS=$(find "$CLAUDE_DIR/projects" -name "*.jsonl" 2>/dev/null | head -1)
HAS_CLAUDE_MD=""
[[ -f "$CLAUDE_DIR/CLAUDE.md" ]] && HAS_CLAUDE_MD="yes"
```

If any are non-empty, tell the user:

> "You have existing personal data (memory files, conversations, or CLAUDE.md). Restoring will merge with or overwrite this data. Continue?"

Wait for confirmation before proceeding.

## Step 3: Choose backend

> "Where is your backup stored?"
>
> 1. Google Drive
> 2. GitHub (private repo)
> 3. iCloud

## Step 4: Backend-specific pull to staging

The staging directory is `~/.claude/.restore-staging/`. After pull, it should mirror the layout the sync engine writes:

```
.restore-staging/
├── memory/<project-key>/...
├── conversations/<slug>/*.jsonl
├── encyclopedia/*.md
├── skills/<name>/...
├── CLAUDE.md
└── system-backup/
    ├── config.json
    ├── settings.json
    ├── keybindings.json
    ├── mcp.json
    ├── history.jsonl
    ├── plans/
    ├── specs/
    └── conversation-index.json
```

### Option 1: Google Drive

```bash
# Verify rclone + gdrive remote
command -v rclone &>/dev/null || { echo "rclone not installed"; exit 1; }
rclone listremotes | grep -q '^gdrive:' || {
    echo "gdrive: remote not configured. Run: rclone config create gdrive drive"
    exit 1
}

# Source utility for config_get
source ~/.claude/hooks/lib/backup-common.sh
DRIVE_ROOT=$(config_get "DRIVE_ROOT" "Claude")

# Pull everything under Backup/personal/ into staging
mkdir -p "$CLAUDE_DIR/.restore-staging"
rclone copy "gdrive:$DRIVE_ROOT/Backup/personal/" "$CLAUDE_DIR/.restore-staging/" --progress
```

### Option 2: GitHub

```bash
read -p "Personal sync repo URL: " REPO_URL
git clone "$REPO_URL" "$CLAUDE_DIR/.restore-staging" 2>/dev/null || {
    echo "Clone failed. Check the URL, repo visibility, and your gh auth."
    exit 1
}
```

### Option 3: iCloud

```bash
ICLOUD_PATH=""
for try in \
    "$HOME/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude" \
    "$HOME/iCloudDrive/DestinClaude" \
    "$HOME/Apple/CloudDocs/DestinClaude"; do
    [[ -d "$try" ]] && { ICLOUD_PATH="$try"; break; }
done
[[ -z "$ICLOUD_PATH" ]] && read -p "iCloud DestinClaude folder: " ICLOUD_PATH

mkdir -p "$CLAUDE_DIR/.restore-staging"
cp -r "$ICLOUD_PATH"/. "$CLAUDE_DIR/.restore-staging/"
```

## Step 5: Run migrations

Source `lib/migrate.sh` and run any pending migrations against the staged data:

```bash
HOOK_DIR="$(cd "$(dirname "$(readlink -f "$HOME/.claude/hooks/session-start.sh")")" && pwd)"
[[ -f "$HOOK_DIR/lib/migrate.sh" ]] && source "$HOOK_DIR/lib/migrate.sh"
type run_migrations &>/dev/null && run_migrations "$CLAUDE_DIR/.restore-staging/"
```

If migration fails (backup newer than toolkit), tell the user to run `/update` first, then re-run `/restore`.

## Step 6: CLAUDE.md merge

If both the backup and the current install have `CLAUDE.md`, present three options:

> "Your backup contains a CLAUDE.md. How would you like to handle it?"
>
> 1. **Merge** (recommended) — Keep your personal notes and preferences, update toolkit sections to match current install
> 2. **Use backup** — Replace current CLAUDE.md with the backup version exactly
> 3. **Keep current** — Ignore the backup's CLAUDE.md entirely

For option 1 (merge): toolkit sections are wrapped in `<!-- BEGIN:section-name -->` / `<!-- END:section-name -->` markers. Replace content between markers with the current install's version. Preserve everything outside markers as user content.

Apply the user's choice now:

```bash
case "$CHOICE" in
    merge)
        # Merge logic — preserve current content between BEGIN/END markers,
        # replace user content with backup content. Implement via node.
        ;;
    use_backup)
        cp "$CLAUDE_DIR/.restore-staging/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
        ;;
    keep_current)
        :  # do nothing
        ;;
esac
```

## Step 7: Apply restore

Copy data from staging to live locations:

```bash
# --- Memory (per project key) ---
if [[ -d "$CLAUDE_DIR/.restore-staging/memory" ]]; then
    for key_dir in "$CLAUDE_DIR/.restore-staging/memory"/*/; do
        [[ ! -d "$key_dir" ]] && continue
        key=$(basename "$key_dir")
        mkdir -p "$CLAUDE_DIR/projects/$key/memory"
        cp -rn "$key_dir"* "$CLAUDE_DIR/projects/$key/memory/" 2>/dev/null || true
    done
fi

# --- Conversations (per slug, never overwrite local) ---
if [[ -d "$CLAUDE_DIR/.restore-staging/conversations" ]]; then
    for slug_dir in "$CLAUDE_DIR/.restore-staging/conversations"/*/; do
        [[ ! -d "$slug_dir" ]] && continue
        slug=$(basename "$slug_dir")
        mkdir -p "$CLAUDE_DIR/projects/$slug"
        # cp -n preserves any local files (local is authoritative for conversations)
        cp -rn "$slug_dir"*.jsonl "$CLAUDE_DIR/projects/$slug/" 2>/dev/null || true
    done
fi

# --- Encyclopedia (top-level .md files only) ---
if [[ -d "$CLAUDE_DIR/.restore-staging/encyclopedia" ]]; then
    mkdir -p "$CLAUDE_DIR/encyclopedia"
    cp -n "$CLAUDE_DIR/.restore-staging/encyclopedia"/*.md "$CLAUDE_DIR/encyclopedia/" 2>/dev/null || true
fi

# --- User-created skills (skip toolkit-owned symlinks if present) ---
if [[ -d "$CLAUDE_DIR/.restore-staging/skills" ]]; then
    mkdir -p "$CLAUDE_DIR/skills"
    for skill_dir in "$CLAUDE_DIR/.restore-staging/skills"/*/; do
        [[ ! -d "$skill_dir" ]] && continue
        name=$(basename "$skill_dir")
        # Don't overwrite a toolkit-owned symlink
        [[ -L "$CLAUDE_DIR/skills/$name" ]] && continue
        mkdir -p "$CLAUDE_DIR/skills/$name"
        cp -rn "$skill_dir"* "$CLAUDE_DIR/skills/$name/" 2>/dev/null || true
    done
fi

# --- System config: merge backup keys into current (current wins) ---
if [[ -f "$CLAUDE_DIR/.restore-staging/system-backup/config.json" ]] && command -v node &>/dev/null; then
    node -e "
        const fs = require('fs');
        const current = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        const backup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
        // Backup fills in missing keys only — current values take precedence
        const merged = { ...backup, ...current };
        fs.writeFileSync(process.argv[1], JSON.stringify(merged, null, 2) + '\n');
    " "$CLAUDE_DIR/toolkit-state/config.json" "$CLAUDE_DIR/.restore-staging/system-backup/config.json"
fi

# --- Other system files (don't overwrite if local exists) ---
SYS="$CLAUDE_DIR/.restore-staging/system-backup"
[[ -f "$SYS/settings.json"     && ! -f "$CLAUDE_DIR/settings.json"     ]] && cp "$SYS/settings.json"     "$CLAUDE_DIR/"
[[ -f "$SYS/keybindings.json"  && ! -f "$CLAUDE_DIR/keybindings.json"  ]] && cp "$SYS/keybindings.json"  "$CLAUDE_DIR/"
[[ -f "$SYS/mcp.json"          && ! -f "$CLAUDE_DIR/mcp.json"          ]] && cp "$SYS/mcp.json"          "$CLAUDE_DIR/"
[[ -f "$SYS/history.jsonl"     && ! -f "$CLAUDE_DIR/history.jsonl"     ]] && cp "$SYS/history.jsonl"    "$CLAUDE_DIR/"
[[ -d "$SYS/plans" ]] && { mkdir -p "$CLAUDE_DIR/plans"; cp -rn "$SYS/plans/"* "$CLAUDE_DIR/plans/" 2>/dev/null || true; }
[[ -d "$SYS/specs" ]] && { mkdir -p "$CLAUDE_DIR/specs"; cp -rn "$SYS/specs/"* "$CLAUDE_DIR/specs/" 2>/dev/null || true; }
```

## Step 8: Cross-device cleanup

After copying, run the shared utilities so `/resume` and memory lookups work across devices:

```bash
source ~/.claude/hooks/lib/backup-common.sh

# Symlink foreign device slugs into the current device's slug
rewrite_project_slugs "$CLAUDE_DIR/projects"

# Symlink all .jsonl files into the home slug for /resume from ~
aggregate_conversations "$CLAUDE_DIR/projects"

# Merge restored conversation index and rebuild topic cache
if [[ -f "$CLAUDE_DIR/.restore-staging/system-backup/conversation-index.json" ]]; then
    merge_conversation_index "$CLAUDE_DIR/.restore-staging/system-backup/conversation-index.json"
fi
regenerate_topic_cache
```

## Step 9: Clean up and confirm

```bash
rm -rf "$CLAUDE_DIR/.restore-staging"
```

Tell the user:
> "Restore complete. Your personal data has been recovered from [backend name].
> Restart Claude Code to pick up restored memory and conversation index.
> If the DestinCode app is installed, it will pick up the restored config on its next push."
