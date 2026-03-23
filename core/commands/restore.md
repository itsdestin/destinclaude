---
description: Restore personal data from a backup (Google Drive, GitHub, or iCloud)
---

# /restore — Ad-Hoc Personal Data Restore

Restore personal data from a backup outside of the setup wizard. Use this when you want to pull data from a backup on a machine that already has DestinClaude installed.

## Step 1: Check current state

Before restoring, warn the user if they have existing personal data that would be overwritten:

```bash
CLAUDE_DIR="$HOME/.claude"
HAS_MEMORY=$(find "$CLAUDE_DIR/projects" -name "*.md" -path "*/memory/*" 2>/dev/null | head -1)
HAS_CLAUDE_MD=""
[[ -f "$CLAUDE_DIR/CLAUDE.md" ]] && HAS_CLAUDE_MD="yes"
```

If either `HAS_MEMORY` or `HAS_CLAUDE_MD` is non-empty, tell the user:

> "You have existing personal data (memory files and/or CLAUDE.md). Restoring will merge with or overwrite this data. Continue?"

Wait for confirmation before proceeding.

## Step 2: Choose backend

Ask:

> "Where is your backup stored?"
>
> 1. Google Drive
> 2. GitHub (private repo)
> 3. iCloud

## Step 3: Backend-specific restore

### Option 1: Google Drive

1. Verify rclone is installed and `gdrive:` remote is configured: `rclone lsd gdrive: 2>/dev/null`
2. If not configured, walk through rclone setup (same as setup wizard Phase 4 Life Dependencies)
3. Ask for Drive root folder name (default: "Claude")
4. Pull: `rclone sync "gdrive:$DRIVE_ROOT/Backup/personal/" "$CLAUDE_DIR/.restore-staging/" --progress`

### Option 2: GitHub

1. Ask for the private repo URL
2. Clone to staging: `git clone "$REPO_URL" "$CLAUDE_DIR/.restore-staging/" 2>/dev/null`
3. If clone fails, check if repo exists and user has access

### Option 3: iCloud

1. Detect iCloud folder:
   - macOS: `~/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude/`
   - Windows: `~/iCloudDrive/DestinClaude/` or `~/Apple/CloudDocs/DestinClaude/`
2. If not found, ask the user to point to their iCloud Drive folder
3. Copy to staging: `cp -r "$ICLOUD_PATH/" "$CLAUDE_DIR/.restore-staging/"`

## Step 4: Run migrations

Source `lib/migrate.sh` and run:

```bash
HOOK_DIR="$(cd "$(dirname "$(readlink -f "$HOME/.claude/hooks/session-start.sh")")" && pwd)"
source "$HOOK_DIR/lib/migrate.sh"
run_migrations "$CLAUDE_DIR/.restore-staging/"
```

If migration fails (backup newer than toolkit), tell the user to run `/update` first.

## Step 5: CLAUDE.md merge

If both the backup and the current install have CLAUDE.md, present three options:

> "Your backup contains a CLAUDE.md. How would you like to handle it?"
>
> 1. **Merge** (recommended) — Keep your personal notes and preferences, update toolkit sections to match current install
> 2. **Use backup** — Replace current CLAUDE.md with the backup version exactly
> 3. **Keep current** — Ignore the backup's CLAUDE.md entirely

For option 1 (merge): toolkit sections are wrapped in `<!-- BEGIN:section-name -->` / `<!-- END:section-name -->` markers. Replace content between markers with the current install's version. Preserve everything outside markers as user content.

## Step 5.5: Cross-device project slug rewriting

Claude Code stores sessions and memory under `~/.claude/projects/<slug>/` where `<slug>` is derived from the working directory path (slashes replaced with dashes). When restoring from a different device, these slugs won't match.

Detect foreign slugs in the backup and inform the user:

```bash
CURRENT_SLUG=$(get_current_project_slug)
FOREIGN_SLUGS=()

if [[ -d "$CLAUDE_DIR/.restore-staging/memory" ]]; then
    for slug_dir in "$CLAUDE_DIR/.restore-staging/memory"/*/; do
        [[ ! -d "$slug_dir" ]] && continue
        slug_name=$(basename "$slug_dir")
        [[ "$slug_name" != "$CURRENT_SLUG" ]] && FOREIGN_SLUGS+=("$slug_name")
    done
fi
```

If foreign slugs are found, tell the user:

> "Found [N] project slug(s) from other devices: [list]. These will be automatically symlinked into your current project directory so `/resume` and memory lookups work on this device."

The actual rewriting is handled automatically by `rewrite_project_slugs` (from `backup-common.sh`) after files are copied in Step 6.

## Step 6: Apply restore

Copy files from staging to live locations:

```bash
# Memory
[[ -d "$CLAUDE_DIR/.restore-staging/memory" ]] && cp -r "$CLAUDE_DIR/.restore-staging/memory"/* "$CLAUDE_DIR/projects/" 2>/dev/null

# Config: merge backup keys into current config (don't overwrite — current install may have newer keys)
if [[ -f "$CLAUDE_DIR/.restore-staging/toolkit-state/config.json" ]] && command -v node &>/dev/null; then
    node -e "
        const fs = require('fs');
        const current = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        const backup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
        // Backup fills in missing keys only — current values take precedence
        const merged = { ...backup, ...current };
        fs.writeFileSync(process.argv[1], JSON.stringify(merged, null, 2));
    " "$CLAUDE_DIR/toolkit-state/config.json" "$CLAUDE_DIR/.restore-staging/toolkit-state/config.json" 2>/dev/null
fi

# Encyclopedia
[[ -d "$CLAUDE_DIR/.restore-staging/encyclopedia" ]] && cp -r "$CLAUDE_DIR/.restore-staging/encyclopedia"/* "$CLAUDE_DIR/encyclopedia/" 2>/dev/null

# User-created skills
[[ -d "$CLAUDE_DIR/.restore-staging/skills" ]] && cp -r "$CLAUDE_DIR/.restore-staging/skills"/* "$CLAUDE_DIR/skills/" 2>/dev/null
```

After copying, rewrite any foreign project slugs:

```bash
# Cross-device slug rewriting — symlinks foreign slugs into current device's slug
HOOK_DIR="$(cd "$(dirname "$(readlink -f "$HOME/.claude/hooks/session-start.sh")")" && pwd)"
if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
    rewrite_project_slugs "$CLAUDE_DIR/projects"
fi
```

## Step 7: Clean up and confirm

```bash
rm -rf "$CLAUDE_DIR/.restore-staging"
```

Tell the user: "Restore complete. Your personal data has been recovered from [backend name]."
