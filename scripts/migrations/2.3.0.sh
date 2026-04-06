#!/usr/bin/env bash
# Migration 2.3.0: Sync consolidation — merge git-sync.sh + personal-sync.sh into sync.sh.
#
# Steps:
#   1. GIT_REMOTE → PERSONAL_SYNC_BACKEND/PERSONAL_SYNC_REPO auto-migration (D4)
#   2. settings.json hook swap: remove git-sync.sh + personal-sync.sh, add sync.sh (D7)
#   3. Old hook symlink removal (D7)
#   4. State file cleanup: rename .personal-sync-marker → .sync-marker, remove stale files (D7)
#   5. Git repo advisory (D8)
#
# Must be idempotent — safe to run multiple times.
set -euo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
CONFIG_FILE="$CLAUDE_HOME/toolkit-state/config.json"
STATE_DIR="$CLAUDE_HOME/toolkit-state"
SETTINGS_FILE="$CLAUDE_HOME/settings.json"

# ---------------------------------------------------------------------------
# Step 1: GIT_REMOTE → PERSONAL_SYNC_BACKEND/PERSONAL_SYNC_REPO (D4)
# ---------------------------------------------------------------------------
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    node -e "
        const fs = require('fs');
        const path = process.argv[1];
        try {
            const c = JSON.parse(fs.readFileSync(path, 'utf8'));
            const gitRemote = c.GIT_REMOTE || '';
            if (!gitRemote || gitRemote === 'none') {
                console.log('[SKIP] GIT_REMOTE not set or none — no migration needed');
                process.exit(0);
            }
            // Add github backend if not already configured
            let backends = (c.PERSONAL_SYNC_BACKEND || 'none').trim();
            if (backends === 'none' || backends === '') {
                backends = 'github';
            } else if (!backends.split(',').map(s=>s.trim()).includes('github')) {
                backends = backends + ',github';
            }
            c.PERSONAL_SYNC_BACKEND = backends;
            // Set PERSONAL_SYNC_REPO if not already set
            if (!c.PERSONAL_SYNC_REPO) {
                c.PERSONAL_SYNC_REPO = gitRemote;
            }
            delete c.GIT_REMOTE;
            fs.writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
            console.log('[OK] Migrated GIT_REMOTE=' + gitRemote + ' -> PERSONAL_SYNC_BACKEND=' + backends);
        } catch(e) {
            console.error('[ERROR] GIT_REMOTE migration: ' + e.message);
            process.exit(1);
        }
    " "$CONFIG_FILE" 2>&1
else
    echo "[SKIP] Config file not found or node unavailable — GIT_REMOTE migration skipped"
fi

# ---------------------------------------------------------------------------
# Step 2: settings.json hook swap (D7)
# Remove git-sync.sh and personal-sync.sh PostToolUse entries; add sync.sh
# ---------------------------------------------------------------------------
if [[ -f "$SETTINGS_FILE" ]] && command -v node &>/dev/null; then
    node -e "
        const fs = require('fs');
        const path = process.argv[1];
        try {
            const settings = JSON.parse(fs.readFileSync(path, 'utf8'));
            const hooks = settings.hooks || {};
            const ptu = hooks.PostToolUse || [];
            const changes = [];
            let syncShPresent = false;

            // Check if sync.sh already registered
            for (const group of ptu) {
                for (const h of (group.hooks || [])) {
                    if (h.command && h.command.includes('sync.sh')) {
                        syncShPresent = true;
                    }
                }
            }

            // Remove old entries
            hooks.PostToolUse = ptu.filter(group => {
                const hasOld = (group.hooks || []).some(h =>
                    h.command && (h.command.includes('git-sync.sh') || h.command.includes('personal-sync.sh'))
                );
                if (hasOld) changes.push('[REMOVED] ' + (group.hooks || []).map(h => h.command).join(', '));
                return !hasOld;
            });

            // Add sync.sh if not already present
            if (!syncShPresent) {
                hooks.PostToolUse.unshift({
                    matcher: 'Write|Edit',
                    hooks: [{ type: 'command', command: 'bash ~/.claude/hooks/sync.sh', timeout: 120 }]
                });
                changes.push('[ADDED] PostToolUse: sync.sh');
            }

            settings.hooks = hooks;
            const tmp = path + '.tmp.' + process.pid;
            fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
            fs.renameSync(tmp, path);
            console.log(changes.join('\n') || '[SKIP] settings.json already up to date');
        } catch(e) {
            console.error('[ERROR] settings.json migration: ' + e.message);
            process.exit(1);
        }
    " "$SETTINGS_FILE" 2>&1
else
    echo "[SKIP] settings.json not found or node unavailable"
fi

# ---------------------------------------------------------------------------
# Step 3: Remove old hook symlinks (D7)
# ---------------------------------------------------------------------------
for _old_hook in git-sync.sh personal-sync.sh; do
    _hook_path="$CLAUDE_HOME/hooks/$_old_hook"
    if [[ -L "$_hook_path" || -f "$_hook_path" ]]; then
        rm -f "$_hook_path"
        echo "[OK] Removed old hook: $_old_hook"
    else
        echo "[SKIP] $_old_hook not present — already removed"
    fi
done

# ---------------------------------------------------------------------------
# Step 4: State file cleanup (D7)
# ---------------------------------------------------------------------------
# Rename .personal-sync-marker → .sync-marker
if [[ -f "$STATE_DIR/.personal-sync-marker" && ! -f "$STATE_DIR/.sync-marker" ]]; then
    mv "$STATE_DIR/.personal-sync-marker" "$STATE_DIR/.sync-marker"
    echo "[OK] Renamed .personal-sync-marker → .sync-marker"
elif [[ -f "$STATE_DIR/.personal-sync-marker" && -f "$STATE_DIR/.sync-marker" ]]; then
    rm -f "$STATE_DIR/.personal-sync-marker"
    echo "[OK] Removed stale .personal-sync-marker (.sync-marker already exists)"
else
    echo "[SKIP] .personal-sync-marker not found — already migrated"
fi

# Remove old git-sync state files
for _stale in ".push-marker" ".rebase-fail-count"; do
    if [[ -f "$CLAUDE_HOME/$_stale" ]]; then
        rm -f "$CLAUDE_HOME/$_stale"
        echo "[OK] Removed stale file: $_stale"
    fi
done

# Remove old sync lock if leftover
if [[ -d "$STATE_DIR/.personal-sync-lock" ]]; then
    rm -rf "$STATE_DIR/.personal-sync-lock"
    echo "[OK] Removed stale .personal-sync-lock"
fi

# ---------------------------------------------------------------------------
# Step 5: Git repo advisory (D8)
# ---------------------------------------------------------------------------
if [[ -d "$CLAUDE_HOME/.git" ]]; then
    echo ""
    echo "[NOTE] ~/.claude/.git still exists. The sync system no longer uses a local"
    echo "       git repo — your data is backed up via your cloud backend instead."
    echo "       If you no longer need local git history, you can safely run:"
    echo "         rm -rf ~/.claude/.git"
fi

echo ""
echo "[DONE] Migration 2.3.0 complete"
