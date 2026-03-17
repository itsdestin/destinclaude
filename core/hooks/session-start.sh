#!/bin/bash
# SessionStart hook: pull latest from Git, sync encyclopedia cache, extract MCP config, check inbox
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
ENCYCLOPEDIA_DIR="$CLAUDE_DIR/encyclopedia"
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
