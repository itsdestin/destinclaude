#!/bin/bash
# SessionStart hook: pull latest from Git, sync personal data, sync encyclopedia cache, extract MCP config, check inbox
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
ENCYCLOPEDIA_DIR="$CLAUDE_DIR/encyclopedia"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"
MCP_CONFIG="$CLAUDE_DIR/mcp-servers/mcp-config.json"
CLAUDE_JSON="$HOME/.claude.json"

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

# --- Encyclopedia cache sync ---
mkdir -p "$ENCYCLOPEDIA_DIR"
if command -v rclone &>/dev/null; then
    rclone sync "gdrive:Claude/The Journal/System/" "$ENCYCLOPEDIA_DIR/" 2>/dev/null || \
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

# --- Toolkit version check ---
TOOLKIT_ROOT=""
# Resolve symlinks to find the real script location (not the symlink in ~/.claude/hooks/)
SCRIPT_REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_REAL")" && pwd)"
SEARCH_DIR="$SCRIPT_DIR"
for _ in 1 2 3 4 5; do
    if [[ -f "$SEARCH_DIR/VERSION" ]]; then
        TOOLKIT_ROOT="$SEARCH_DIR"
        break
    fi
    SEARCH_DIR="$(dirname "$SEARCH_DIR")"
done

if [[ -n "$TOOLKIT_ROOT" ]]; then
    STATE_DIR="$CLAUDE_DIR/toolkit-state"
    mkdir -p "$STATE_DIR"
    CURRENT=$(cat "$TOOLKIT_ROOT/VERSION" 2>/dev/null | tr -d '[:space:]')
    CURRENT_TAG="v${CURRENT}"

    # Fetch tags silently (fail silently if offline)
    (cd "$TOOLKIT_ROOT" && git fetch --tags origin 2>/dev/null) || true

    LATEST_TAG=$(cd "$TOOLKIT_ROOT" && git tag --sort=-v:refname 2>/dev/null | head -1)
    LATEST=${LATEST_TAG#v}

    if [[ -n "$LATEST" && "$CURRENT" != "$LATEST" ]]; then
        UPDATE_AVAILABLE=true
    else
        UPDATE_AVAILABLE=false
    fi

    cat > "$STATE_DIR/update-status.json" << VEREOF
{"current": "${CURRENT:-unknown}", "latest": "${LATEST:-unknown}", "update_available": ${UPDATE_AVAILABLE}}
VEREOF
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
