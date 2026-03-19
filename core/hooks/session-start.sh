#!/bin/bash
# SessionStart hook: pull latest from Git, sync personal data, sync encyclopedia cache, extract MCP config, check inbox
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
ENCYCLOPEDIA_DIR="$CLAUDE_DIR/encyclopedia"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"
MCP_CONFIG="$CLAUDE_DIR/mcp-servers/mcp-config.json"
CLAUDE_JSON="$HOME/.claude.json"

# --- Resolve TOOLKIT_ROOT once (used by auto-refresh, version check, announcements) ---
TOOLKIT_ROOT=""
if command -v node &>/dev/null && [[ -f "$CONFIG_FILE" ]]; then
    TOOLKIT_ROOT=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" "$CONFIG_FILE" 2>/dev/null) || TOOLKIT_ROOT=""
fi
# Fallback: walk up from this script's real path to find VERSION file
if [[ -z "$TOOLKIT_ROOT" || ! -f "$TOOLKIT_ROOT/VERSION" ]]; then
    TOOLKIT_ROOT=""
    _REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
    SEARCH_DIR="$(cd "$(dirname "$_REAL")" && pwd)"
    for _ in 1 2 3 4 5; do
        if [[ -f "$SEARCH_DIR/VERSION" ]]; then
            TOOLKIT_ROOT="$SEARCH_DIR"
            break
        fi
        SEARCH_DIR="$(dirname "$SEARCH_DIR")"
    done
fi
# Auto-create config.json if toolkit was found via fallback (self-healing)
if [[ -n "$TOOLKIT_ROOT" && -f "$TOOLKIT_ROOT/VERSION" && ! -f "$CONFIG_FILE" ]]; then
    mkdir -p "$(dirname "$CONFIG_FILE")"
    echo "{\"toolkit_root\": \"$TOOLKIT_ROOT\"}" > "$CONFIG_FILE"
fi

# --- Read DRIVE_ROOT from config (used for encyclopedia sync and backup paths) ---
DRIVE_ROOT="Claude"
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    _DR=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.DRIVE_ROOT)console.log(c.DRIVE_ROOT)}catch{}" "$CONFIG_FILE" 2>/dev/null)
    [[ -n "$_DR" ]] && DRIVE_ROOT="$_DR"
fi

# --- Extract MCP server config from .claude.json (before git pull, so local changes get committed) ---
if [[ -f "$CLAUDE_JSON" ]] && command -v node &>/dev/null; then
    EXTRACTED=$(node -e "
        const fs = require('fs');
        const d = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        const projects = d.projects || {};
        // Find the first project key that has mcpServers
        for (const [key, val] of Object.entries(projects)) {
            if (val.mcpServers && Object.keys(val.mcpServers).length > 0) {
                console.log(JSON.stringify(val.mcpServers, null, 2));
                process.exit(0);
            }
        }
        console.log('{}');
    " "$CLAUDE_JSON" 2>/dev/null) || EXTRACTED=""
    if [[ -n "$EXTRACTED" && "$EXTRACTED" != "{}" ]]; then
        # Only write if changed (avoid unnecessary git commits)
        EXISTING=""
        [[ -f "$MCP_CONFIG" ]] && EXISTING=$(cat "$MCP_CONFIG")
        if [[ "$EXTRACTED" != "$EXISTING" ]]; then
            echo "$EXTRACTED" > "$MCP_CONFIG"
            # Stage and commit so git-pull doesn't conflict
            cd "$CLAUDE_DIR"
            git add "$MCP_CONFIG" 2>/dev/null && \
                git commit -m "auto: mcp-config.json" --no-gpg-sign 2>/dev/null || true
        fi
    fi
fi

# --- Git pull (cross-device sync) ---
cd "$CLAUDE_DIR"
if git remote get-url origin &>/dev/null; then
    if ! git pull --rebase origin main 2>/dev/null; then
        git rebase --abort 2>/dev/null || true
        echo '{"hookSpecificOutput": "Warning: Git pull failed on session start. Working with local state."}' >&2
    fi
fi

# --- Auto-refresh stale hooks from toolkit repo ---
# On copy-based installs (Windows, or when symlinks fail), hooks in ~/.claude/hooks/
# don't update when the toolkit repo is updated. This block refreshes any stale
# toolkit-owned copies so new features reach users without manual intervention.
# SAFETY: Only overwrites files that have a matching source in the toolkit repo.
# Never touches user-created files. Flags orphans for Claude to ask about — never
# auto-deletes anything that might contain user data.
# Uses TOOLKIT_ROOT resolved at script start (config.json + fallback).
if [[ -n "$TOOLKIT_ROOT" && -d "$TOOLKIT_ROOT/core/hooks" ]]; then
    _REFRESHED=0
    # Canonical list of toolkit-owned hooks — ONLY these get overwritten
    for _h in checklist-reminder.sh contribution-detector.sh git-sync.sh personal-sync.sh session-start.sh title-update.sh todo-capture.sh tool-router.sh write-guard.sh; do
        if [[ -f "$TOOLKIT_ROOT/core/hooks/$_h" ]]; then
            if [[ ! -f "$CLAUDE_DIR/hooks/$_h" ]] || ! diff -q "$CLAUDE_DIR/hooks/$_h" "$TOOLKIT_ROOT/core/hooks/$_h" >/dev/null 2>&1; then
                cp -f "$TOOLKIT_ROOT/core/hooks/$_h" "$CLAUDE_DIR/hooks/$_h" 2>/dev/null && _REFRESHED=$((_REFRESHED + 1))
            fi
        fi
    done
    # Toolkit-owned utility scripts
    for _u in announcement-fetch.js usage-fetch.js; do
        if [[ -f "$TOOLKIT_ROOT/core/hooks/$_u" ]]; then
            if [[ ! -f "$CLAUDE_DIR/hooks/$_u" ]] || ! diff -q "$CLAUDE_DIR/hooks/$_u" "$TOOLKIT_ROOT/core/hooks/$_u" >/dev/null 2>&1; then
                cp -f "$TOOLKIT_ROOT/core/hooks/$_u" "$CLAUDE_DIR/hooks/$_u" 2>/dev/null && _REFRESHED=$((_REFRESHED + 1))
            fi
        fi
    done
    # Statusline (lives at ~/.claude/statusline.sh, not in hooks/)
    if [[ -f "$TOOLKIT_ROOT/core/hooks/statusline.sh" ]]; then
        if [[ ! -f "$HOME/.claude/statusline.sh" ]] || ! diff -q "$HOME/.claude/statusline.sh" "$TOOLKIT_ROOT/core/hooks/statusline.sh" >/dev/null 2>&1; then
            cp -f "$TOOLKIT_ROOT/core/hooks/statusline.sh" "$HOME/.claude/statusline.sh" 2>/dev/null && _REFRESHED=$((_REFRESHED + 1))
        fi
    fi
    # Toolkit-owned commands (install missing OR refresh stale)
    if [[ -d "$TOOLKIT_ROOT/core/commands" ]]; then
        mkdir -p "$CLAUDE_DIR/commands"
        for _c in setup-wizard.md contribute.md toolkit.md toolkit-uninstall.md update.md health.md; do
            if [[ -f "$TOOLKIT_ROOT/core/commands/$_c" ]]; then
                if [[ ! -f "$CLAUDE_DIR/commands/$_c" ]] || ! diff -q "$CLAUDE_DIR/commands/$_c" "$TOOLKIT_ROOT/core/commands/$_c" >/dev/null 2>&1; then
                    cp -f "$TOOLKIT_ROOT/core/commands/$_c" "$CLAUDE_DIR/commands/$_c" 2>/dev/null && _REFRESHED=$((_REFRESHED + 1))
                fi
            fi
        done
    fi
    # Flag known orphan files from pre-v1.1.5 installs (never auto-delete)
    _ORPHANS=""
    [[ -f "$CLAUDE_DIR/hooks/statusline.sh" ]] && _ORPHANS="~/.claude/hooks/statusline.sh"
    _MSG=""
    if [[ $_REFRESHED -gt 0 ]]; then
        _MSG="Refreshed $_REFRESHED stale hook(s)/script(s) from toolkit repo."
    fi
    if [[ -n "$_ORPHANS" ]]; then
        _MSG="$_MSG Found orphan file(s) that may be safe to remove: $_ORPHANS — ask the user before deleting."
    fi
    if [[ -n "$_MSG" ]]; then
        _MSG=$(echo "$_MSG" | sed 's/^ //')
        echo "{\"hookSpecificOutput\": \"$_MSG\"}" >&2
    fi
fi

# --- Encyclopedia cache sync ---
mkdir -p "$ENCYCLOPEDIA_DIR"
if command -v rclone &>/dev/null; then
    rclone sync "gdrive:$DRIVE_ROOT/The Journal/System/" "$ENCYCLOPEDIA_DIR/" 2>/dev/null || \
        echo '{"hookSpecificOutput": "Warning: Encyclopedia cache sync failed. Skills will use stale cache."}' >&2
fi

# --- Personal data pull (cross-device sync for memory, CLAUDE.md, config) ---
if [[ -f "$CONFIG_FILE" ]]; then
    PS_BACKEND=""
    PS_DRIVE_ROOT="Claude"
    PS_REPO=""

    if command -v node &>/dev/null; then
        read -r PS_BACKEND PS_DRIVE_ROOT PS_REPO < <(node -e "
            const fs = require('fs');
            try {
                const c = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
                const b = c.PERSONAL_SYNC_BACKEND || 'none';
                const d = c.DRIVE_ROOT || 'Claude';
                const r = c.PERSONAL_SYNC_REPO || '';
                process.stdout.write(b + ' ' + d + ' ' + r);
            } catch { process.stdout.write('none Claude '); }
        " "$CONFIG_FILE" 2>/dev/null) || true
    else
        PS_BACKEND=$(grep -o '"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "none")
        PS_DRIVE_ROOT=$(grep -o '"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "Claude")
    fi

    if [[ "$PS_BACKEND" == "drive" ]] && command -v rclone &>/dev/null; then
        REMOTE_BASE="gdrive:$PS_DRIVE_ROOT/Backup/personal"
        # Pull memory files
        if rclone lsd "$REMOTE_BASE/memory/" 2>/dev/null | grep -q .; then
            for REMOTE_PROJECT in $(rclone lsd "$REMOTE_BASE/memory/" 2>/dev/null | awk '{print $NF}'); do
                LOCAL_MEMORY="$CLAUDE_DIR/projects/$REMOTE_PROJECT/memory"
                mkdir -p "$LOCAL_MEMORY"
                rclone sync "$REMOTE_BASE/memory/$REMOTE_PROJECT/" "$LOCAL_MEMORY/" --update 2>/dev/null || true
            done
        fi
        # Pull CLAUDE.md
        rclone copyto "$REMOTE_BASE/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" --update 2>/dev/null || true
        # Pull config (careful: don't overwrite if local is newer)
        rclone copyto "$REMOTE_BASE/toolkit-state/config.json" "$CONFIG_FILE" --update 2>/dev/null || true
    elif [[ "$PS_BACKEND" == "github" ]] && command -v git &>/dev/null; then
        REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
        if [[ -d "$REPO_DIR/.git" ]]; then
            (cd "$REPO_DIR" && git pull personal-sync main 2>/dev/null) || true
            # Copy pulled data to local paths
            if [[ -d "$REPO_DIR/memory" ]]; then
                for PROJECT_DIR in "$REPO_DIR"/memory/*/; do
                    [[ ! -d "$PROJECT_DIR" ]] && continue
                    PROJECT_KEY=$(basename "$PROJECT_DIR")
                    LOCAL_MEMORY="$CLAUDE_DIR/projects/$PROJECT_KEY/memory"
                    mkdir -p "$LOCAL_MEMORY"
                    cp -r "$PROJECT_DIR"* "$LOCAL_MEMORY/" 2>/dev/null || true
                done
            fi
            [[ -f "$REPO_DIR/CLAUDE.md" ]] && cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true
            [[ -f "$REPO_DIR/toolkit-state/config.json" ]] && cp "$REPO_DIR/toolkit-state/config.json" "$CONFIG_FILE" 2>/dev/null || true
        fi
    fi
fi

# --- Sync health check (writes ~/.claude/.sync-warnings for statusline) ---
# Detects unprotected personal data, unbackedup skills, and stale syncs.
# Advisory only — warns the user so they never lose information unknowingly.
WARNINGS_FILE="$CLAUDE_DIR/.sync-warnings"
> "$WARNINGS_FILE" 2>/dev/null  # reset each session

# 0. Internet connectivity (DNS lookup via node — fast, no HTTP overhead)
if ! node -e "require('dns').lookup('github.com',e=>{process.exit(e?1:0)})" 2>/dev/null; then
    echo "OFFLINE" >> "$WARNINGS_FILE"
fi

# 1. Personal data sync status
_PS_BACKEND=""
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    _PS_BACKEND=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_SYNC_BACKEND||'none')}catch{console.log('none')}" "$CONFIG_FILE" 2>/dev/null) || _PS_BACKEND="none"
fi
if [[ -z "$_PS_BACKEND" || "$_PS_BACKEND" == "none" ]]; then
    echo "PERSONAL:NOT_CONFIGURED" >> "$WARNINGS_FILE"
else
    # Check if last sync is stale (>24 hours)
    _PS_MARKER="$CLAUDE_DIR/toolkit-state/.personal-sync-marker"
    if [[ -f "$_PS_MARKER" ]]; then
        _PS_LAST=$(cat "$_PS_MARKER" 2>/dev/null || echo 0)
        _PS_NOW=$(date +%s)
        _PS_AGE=$((_PS_NOW - _PS_LAST))
        if [[ $_PS_AGE -ge 86400 ]]; then
            echo "PERSONAL:STALE" >> "$WARNINGS_FILE"
        fi
    fi
fi

# 2. Unbackedup user skills (not toolkit symlinks, not in a git-tracked backup)
_UNBACKEDUP_SKILLS=""
if [[ -d "$CLAUDE_DIR/skills" ]]; then
    for _SKILL_DIR in "$CLAUDE_DIR"/skills/*/; do
        [[ ! -d "$_SKILL_DIR" ]] && continue
        _SKILL_NAME=$(basename "$_SKILL_DIR")
        # Skip toolkit-managed skills (symlinks into the plugin directory)
        if [[ -L "$_SKILL_DIR" ]] || [[ -L "${_SKILL_DIR%/}" ]]; then
            continue
        fi
        # Check if the skill directory is inside the ~/.claude/ git repo (backed up by git-sync)
        if git -C "$CLAUDE_DIR" ls-files --error-unmatch "$_SKILL_DIR/SKILL.md" &>/dev/null 2>&1; then
            continue  # tracked by git — will be backed up
        fi
        # Not a symlink and not git-tracked — unbackedup
        _UNBACKEDUP_SKILLS="${_UNBACKEDUP_SKILLS:+$_UNBACKEDUP_SKILLS,}$_SKILL_NAME"
    done
fi
if [[ -n "$_UNBACKEDUP_SKILLS" ]]; then
    echo "SKILLS:$_UNBACKEDUP_SKILLS" >> "$WARNINGS_FILE"
fi

# 3. Unsynced projects (just check if the file exists and is non-empty — detection is in git-sync.sh)
if [[ -s "$CLAUDE_DIR/.unsynced-projects" ]]; then
    _UP_COUNT=$(sort -u "$CLAUDE_DIR/.unsynced-projects" 2>/dev/null | wc -l | tr -d ' ')
    echo "PROJECTS:$_UP_COUNT" >> "$WARNINGS_FILE"
fi

# Remove warnings file if empty (no warnings = no statusline clutter)
[[ ! -s "$WARNINGS_FILE" ]] && rm -f "$WARNINGS_FILE" 2>/dev/null

# --- Toolkit version check (uses TOOLKIT_ROOT resolved at script start) ---
if [[ -n "$TOOLKIT_ROOT" && -f "$TOOLKIT_ROOT/VERSION" ]]; then
    STATE_DIR="$CLAUDE_DIR/toolkit-state"
    mkdir -p "$STATE_DIR"
    CURRENT=$(cat "$TOOLKIT_ROOT/VERSION" 2>/dev/null | tr -d '[:space:]')
    CURRENT_TAG="v${CURRENT}"

    # Fetch tags silently (fail silently if offline)
    (cd "$TOOLKIT_ROOT" && git fetch --tags origin 2>/dev/null) || true

    LATEST_TAG=$(cd "$TOOLKIT_ROOT" && git tag --sort=-v:refname 2>/dev/null | head -1)
    LATEST=${LATEST_TAG#v}

    # Semver-aware comparison: only flag update if LATEST is strictly newer than CURRENT
    UPDATE_AVAILABLE=false
    if [[ -n "$LATEST" && "$CURRENT" != "$LATEST" ]]; then
        _NEWER=$(printf '%s\n' "$CURRENT" "$LATEST" | sort -V | tail -1)
        if [[ "$_NEWER" == "$LATEST" ]]; then
            UPDATE_AVAILABLE=true
        fi
    fi

    cat > "$STATE_DIR/update-status.json" << VEREOF
{"current": "${CURRENT:-unknown}", "latest": "${LATEST:-unknown}", "update_available": ${UPDATE_AVAILABLE}}
VEREOF
fi

# --- Announcement fetch (background) ---
if command -v node &>/dev/null; then
    # Use toolkit root (already resolved above) to find announcement-fetch.js
    ANNOUNCEMENT_FETCH=""
    [[ -n "$TOOLKIT_ROOT" ]] && ANNOUNCEMENT_FETCH="$TOOLKIT_ROOT/core/hooks/announcement-fetch.js"
    # Fallback: check sibling in same directory as this script
    if [[ -z "$ANNOUNCEMENT_FETCH" || ! -f "$ANNOUNCEMENT_FETCH" ]]; then
        ANNOUNCEMENT_FETCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/announcement-fetch.js"
    fi
    if [[ -f "$ANNOUNCEMENT_FETCH" ]]; then
        nohup node "$ANNOUNCEMENT_FETCH" >/dev/null 2>&1 &
    fi
fi

# --- Check inbox ---
if [[ -f "$CLAUDE_DIR/hooks/check-inbox.sh" ]]; then
    bash "$CLAUDE_DIR/hooks/check-inbox.sh" 2>/dev/null || true
fi

# --- Periodic /toolkit reminder ---
# Remind user about /toolkit every ~20 sessions so they discover features they may have forgotten
STATE_DIR="$CLAUDE_DIR/toolkit-state"
REMINDER_FILE="$STATE_DIR/toolkit-reminder.json"
if [[ -f "$REMINDER_FILE" ]] && command -v node &>/dev/null; then
    SESSIONS_SINCE=$(node -e "
        const fs = require('fs');
        try {
            const s = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
            console.log(s.sessions_since_reminder || 0);
        } catch { console.log(0); }
    " "$REMINDER_FILE" 2>/dev/null) || SESSIONS_SINCE=0
    SESSIONS_SINCE=$((SESSIONS_SINCE + 1))
    if [[ "$SESSIONS_SINCE" -ge 20 ]]; then
        echo '{"hookSpecificOutput": "Tip: Type /toolkit to see all your features and useful phrases."}' >&2
        SESSIONS_SINCE=0
    fi
    cat > "$REMINDER_FILE" << REMEOF
{"sessions_since_reminder": ${SESSIONS_SINCE}}
REMEOF
else
    mkdir -p "$STATE_DIR"
    echo '{"sessions_since_reminder": 1}' > "$REMINDER_FILE"
fi

exit 0
