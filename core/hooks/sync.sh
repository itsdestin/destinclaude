#!/usr/bin/env bash
# PostToolUse hook for Write|Edit
# Unified sync — backs up all personal data and system config to configured backends.
# Debounced to 15-minute intervals. Cross-platform (Windows/Mac/Linux).
# Supersedes: git-sync.sh + personal-sync.sh (sync-consolidation-design 04-01-2026)
# Spec: core/specs/backup-system-spec.md

set -euo pipefail

# --- Parse stdin JSON ---
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{const j=JSON.parse(d);const p=j.tool_input&&j.tool_input.file_path||j.file_path||'';
    console.log(p.split(String.fromCharCode(92)).join('/'))}catch{console.log('')}
  })" 2>/dev/null)
[[ -z "$FILE_PATH" ]] && exit 0

# Source shared backup utilities
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ -f "$HOOK_DIR/lib/hook-preamble.sh" ]] && source "$HOOK_DIR/lib/hook-preamble.sh"

if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
fi
if [[ -f "$HOOK_DIR/lib/migrate.sh" ]]; then
    source "$HOOK_DIR/lib/migrate.sh"
fi

# Ensure is_toolkit_owned() has TOOLKIT_ROOT to check against
TOOLKIT_ROOT=$(config_get "toolkit_root" "")

# --- Path filter: sync personal data and system config ---
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"

case "$FILE_PATH" in
    # --- Exclusions (machine-specific, never sync) ---
    */toolkit-state/config.local.json) exit 0 ;;
    */mcp-servers/mcp-config.json) exit 0 ;;
    */settings.local.json) exit 0 ;;
    # --- Personal data ---
    */projects/*/*.jsonl) ;;
    */projects/*/memory/*) ;;
    */CLAUDE.md) ;;
    */encyclopedia/*) ;;
    */skills/*)
        if type is_toolkit_owned &>/dev/null && is_toolkit_owned "$FILE_PATH"; then
            exit 0
        fi
        ;;
    # --- System config (remote: system-backup/) ---
    */toolkit-state/config.json) ;;
    */settings.json) ;;
    */keybindings.json) ;;
    */mcp.json) ;;
    */history.jsonl) ;;
    */plans/*) ;;
    */specs/*) ;;
    *) exit 0 ;;
esac

# --- Read config ---
CONFIG_FILE="${CONFIG_FILE:-$CLAUDE_DIR/toolkit-state/config.json}"
[[ ! -f "$CONFIG_FILE" ]] && exit 0

BACKEND=""
DRIVE_ROOT="Claude"
SYNC_REPO=""

if type config_get &>/dev/null; then
    BACKEND=$(config_get "PERSONAL_SYNC_BACKEND" "none")
    DRIVE_ROOT=$(config_get "DRIVE_ROOT" "Claude")
    SYNC_REPO=$(config_get "PERSONAL_SYNC_REPO" "")
    PERSONAL_DRIVE_REMOTE=$(config_get "PERSONAL_DRIVE_REMOTE" "gdrive")
elif command -v node &>/dev/null; then
    BACKEND=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_SYNC_BACKEND||'none')}catch{console.log('none')}" "$CONFIG_FILE" 2>/dev/null) || BACKEND="none"
    DRIVE_ROOT=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.DRIVE_ROOT||'Claude')}catch{console.log('Claude')}" "$CONFIG_FILE" 2>/dev/null) || DRIVE_ROOT="Claude"
    SYNC_REPO=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_SYNC_REPO||'')}catch{console.log('')}" "$CONFIG_FILE" 2>/dev/null) || SYNC_REPO=""
    PERSONAL_DRIVE_REMOTE=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_DRIVE_REMOTE||'gdrive')}catch{console.log('gdrive')}" "$CONFIG_FILE" 2>/dev/null) || PERSONAL_DRIVE_REMOTE="gdrive"
else
    BACKEND=$(grep -o '"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "none")
    DRIVE_ROOT=$(grep -o '"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "Claude")
    SYNC_REPO=$(grep -o '"PERSONAL_SYNC_REPO"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_REPO"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "")
    PERSONAL_DRIVE_REMOTE=$(grep -o '"PERSONAL_DRIVE_REMOTE"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_DRIVE_REMOTE"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "gdrive")
fi
PERSONAL_DRIVE_REMOTE="${PERSONAL_DRIVE_REMOTE:-gdrive}"

# --- Write registry update (for write-guard) ---
# Must happen before debounce — registry is updated on every write, not just sync cycles.
REGISTRY="${REGISTRY:-$CLAUDE_DIR/.write-registry.json}"
if [[ -n "${PPID:-}" ]]; then
    CONTENT_HASH=""
    if [[ -f "$FILE_PATH" ]]; then
        CONTENT_HASH=$( (sha256sum "$FILE_PATH" 2>/dev/null || shasum -a 256 "$FILE_PATH" 2>/dev/null) | awk '{print substr($1,1,16)}')
    fi
    TIMESTAMP=$(date +%s)
    if [[ -f "$REGISTRY" ]]; then
        REG_CONTENT=$(cat "$REGISTRY")
    else
        REG_CONTENT="{}"
    fi
    NORM_PATH="${FILE_PATH//\\//}"
    REG_CONTENT=$(node -e "
        const reg = JSON.parse(process.argv[1]);
        reg[process.argv[2]] = {pid: parseInt(process.argv[3]), timestamp: parseInt(process.argv[4]), content_hash: process.argv[5]};
        console.log(JSON.stringify(reg, null, 2));
    " "$REG_CONTENT" "$NORM_PATH" "$PPID" "$TIMESTAMP" "$CONTENT_HASH" 2>/dev/null) || true
    if type atomic_write &>/dev/null; then
        atomic_write "$REGISTRY" "$REG_CONTENT"
    else
        echo "$REG_CONTENT" > "$REGISTRY"
    fi
fi

[[ -z "$BACKEND" || "$BACKEND" == "none" ]] && exit 0

# --- Mutex: prevent concurrent sync instances ---
# Portable PID liveness check (kill -0 doesn't work for Windows PIDs in Git Bash)
_sync_pid_alive() {
    local pid="$1"
    [[ -z "$pid" || "$pid" == "0" ]] && return 1
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) tasklist //FI "PID eq $pid" 2>/dev/null | grep -qv 'INFO: No tasks' ;;
        *) kill -0 "$pid" 2>/dev/null ;;
    esac
}

LOCK_DIR="$CLAUDE_DIR/toolkit-state/.sync-lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    _lock_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo 0)
    if _sync_pid_alive "$_lock_pid"; then
        exit 0  # Another sync is running
    fi
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR" 2>/dev/null || exit 0
fi
echo $$ > "$LOCK_DIR/pid"
register_cleanup "rm -rf '$LOCK_DIR'"

# --- Debounce: 15 minutes ---
MARKER_FILE="$CLAUDE_DIR/toolkit-state/.sync-marker"

if type debounce_check &>/dev/null; then
    debounce_check "$MARKER_FILE" 15 || exit 0
else
    SYNC_INTERVAL=900
    if [[ -f "$MARKER_FILE" ]]; then
        LAST_SYNC=$(cat "$MARKER_FILE" 2>/dev/null || echo 0)
        NOW=$(date +%s)
        ELAPSED=$((NOW - LAST_SYNC))
        [[ $ELAPSED -lt $SYNC_INTERVAL ]] && exit 0
    fi
fi

# --- Skill route lookup ---
_SKILL_ROUTES_JSON=""
_SKILL_ROUTES_FILE="$CLAUDE_DIR/toolkit-state/skill-routes.json"
[[ -f "$_SKILL_ROUTES_FILE" ]] && _SKILL_ROUTES_JSON=$(cat "$_SKILL_ROUTES_FILE" 2>/dev/null)

_should_sync_skill() {
    local name="$1"
    if [[ -n "$_SKILL_ROUTES_JSON" ]] && command -v node &>/dev/null; then
        local route=""
        route=$(node -e "try{const r=JSON.parse(process.argv[1]);
            console.log((r[process.argv[2]]||{}).route||'')}catch{}" \
            "$_SKILL_ROUTES_JSON" "$name" 2>/dev/null) || true
        [[ "$route" == "none" ]] && return 1
    fi
    return 0
}

# --- Drive backend ---
sync_drive() {
    if ! command -v rclone &>/dev/null; then
        log_backup "ERROR" "rclone not found in PATH — skipping Drive sync"
        return 1
    fi

    local REMOTE_BASE="${PERSONAL_DRIVE_REMOTE}:$DRIVE_ROOT/Backup/personal"
    local SYS_REMOTE="$REMOTE_BASE/system-backup"
    local ERRORS=0

    # Memory files
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for PROJECT_DIR in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            local MEMORY_DIR="$PROJECT_DIR/memory"
            [[ ! -d "$MEMORY_DIR" ]] && continue
            local PROJECT_KEY
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            if ! _capture_err "rclone push memory/$PROJECT_KEY" \
                rclone copy "$MEMORY_DIR/" "$REMOTE_BASE/memory/$PROJECT_KEY/" --update --skip-links ; then
                log_backup "WARN" "Failed to sync memory for project $PROJECT_KEY" "sync.push.memory"
                ERRORS=$((ERRORS + 1))
            fi
        done
    fi

    # CLAUDE.md
    if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
        rclone copyto "$CLAUDE_DIR/CLAUDE.md" "$REMOTE_BASE/CLAUDE.md" --update 2>/dev/null || {
            log_backup "WARN" "Failed to sync CLAUDE.md"
            ERRORS=$((ERRORS + 1))
        }
    fi

    # Encyclopedia
    if [[ -d "$CLAUDE_DIR/encyclopedia" ]]; then
        rclone copy "$CLAUDE_DIR/encyclopedia/" "$REMOTE_BASE/encyclopedia/" \
            --update --max-depth 1 --include "*.md" 2>/dev/null || \
            log_backup "WARN" "Encyclopedia sync to Backup failed"

        local _enc_remote_path="Encyclopedia/System"
        if [[ -f "$CONFIG_FILE" ]]; then
            local _enc_configured
            _enc_configured=$(grep -o '"encyclopedia_remote_path"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"encyclopedia_remote_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || true)
            [[ -n "$_enc_configured" ]] && _enc_remote_path="$_enc_configured"
        fi
        rclone copy "$CLAUDE_DIR/encyclopedia/" "${PERSONAL_DRIVE_REMOTE}:$DRIVE_ROOT/$_enc_remote_path/" \
            --update --max-depth 1 --include "*.md" 2>/dev/null || \
            log_backup "WARN" "Encyclopedia sync to remote failed"
    fi

    # User-created skills
    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                _should_sync_skill "$skill_name" || continue
                rclone copy "$skill_dir" "$REMOTE_BASE/skills/$skill_name/" \
                    --update --exclude '.DS_Store' 2>/dev/null || \
                    log_backup "WARN" "Skill $skill_name sync to Drive failed"
            fi
        done
    fi

    # Conversations (snapshot to avoid races with subagents)
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        local _snap_dir
        _snap_dir=$(mktemp -d)
        register_cleanup "rm -rf '$_snap_dir'"

        for slug_dir in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            [[ -L "${slug_dir%/}" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")

            local _has_jsonl=false
            for _f in "$slug_dir"*.jsonl; do
                [[ -f "$_f" && ! -L "$_f" ]] && _has_jsonl=true && break
            done
            [[ "$_has_jsonl" == "false" ]] && continue

            find "$slug_dir" -name '*.jsonl' -not -type l 2>/dev/null | while IFS= read -r _f; do
                local _rel="${_f#$slug_dir}"
                mkdir -p "$_snap_dir/$slug_name/$(dirname "$_rel")"
                cp "$_f" "$_snap_dir/$slug_name/$_rel" 2>/dev/null
            done

            if ! _capture_err "rclone push conversations/$slug_name" \
                rclone copy "$_snap_dir/$slug_name/" "$REMOTE_BASE/conversations/$slug_name/" \
                --checksum --include '*.jsonl'; then
                log_backup "WARN" "Failed to sync conversations for $slug_name" "sync.push.drive"
                ERRORS=$((ERRORS + 1))
            fi
        done
    fi

    # System config under system-backup/ (D3)
    [[ -f "$CONFIG_FILE" ]] && {
        rclone copyto "$CONFIG_FILE" "$SYS_REMOTE/config.json" --update 2>/dev/null || {
            log_backup "WARN" "Failed to sync config.json"; ERRORS=$((ERRORS + 1))
        }
    }
    [[ -f "$CLAUDE_DIR/settings.json" ]] && \
        rclone copyto "$CLAUDE_DIR/settings.json" "$SYS_REMOTE/settings.json" --update 2>/dev/null || \
        log_backup "WARN" "Failed to sync settings.json"
    [[ -f "$CLAUDE_DIR/keybindings.json" ]] && \
        rclone copyto "$CLAUDE_DIR/keybindings.json" "$SYS_REMOTE/keybindings.json" --update 2>/dev/null || \
        log_backup "WARN" "Failed to sync keybindings.json"
    [[ -f "$CLAUDE_DIR/mcp.json" ]] && \
        rclone copyto "$CLAUDE_DIR/mcp.json" "$SYS_REMOTE/mcp.json" --update 2>/dev/null || \
        log_backup "WARN" "Failed to sync mcp.json"
    [[ -f "$CLAUDE_DIR/history.jsonl" ]] && \
        rclone copyto "$CLAUDE_DIR/history.jsonl" "$SYS_REMOTE/history.jsonl" --update 2>/dev/null || \
        log_backup "WARN" "Failed to sync history.jsonl"
    [[ -d "$CLAUDE_DIR/plans" ]] && \
        rclone copy "$CLAUDE_DIR/plans/" "$SYS_REMOTE/plans/" --update 2>/dev/null || \
        log_backup "WARN" "Failed to sync plans/"
    [[ -d "$CLAUDE_DIR/specs" ]] && \
        rclone copy "$CLAUDE_DIR/specs/" "$SYS_REMOTE/specs/" --update 2>/dev/null || \
        log_backup "WARN" "Failed to sync specs/"

    # Conversation index
    local _INDEX_FILE="$CLAUDE_DIR/conversation-index.json"
    if [[ -f "$_INDEX_FILE" ]]; then
        rclone copyto "$_INDEX_FILE" "$SYS_REMOTE/conversation-index.json" \
            --checksum 2>/dev/null || \
            log_backup "WARN" "Conversation index sync to Drive failed" "sync.push.drive"
    fi

    if [[ $ERRORS -gt 0 ]]; then
        log_backup "WARN" "Drive sync completed with $ERRORS warning(s)"
        return 1
    fi

    log_backup "INFO" "Drive sync completed successfully"
    return 0
}

# --- GitHub backend ---
sync_github() (
    if ! command -v git &>/dev/null; then
        log_backup "ERROR" "git not found in PATH — skipping GitHub sync"
        return 1
    fi

    local REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"

    if [[ ! -d "$REPO_DIR/.git" ]]; then
        if [[ -z "$SYNC_REPO" ]]; then
            log_backup "ERROR" "PERSONAL_SYNC_REPO not configured"
            return 1
        fi
        mkdir -p "$REPO_DIR"
        git clone "$SYNC_REPO" "$REPO_DIR" 2>/dev/null || {
            cd "$REPO_DIR"
            git init 2>/dev/null
            git remote add personal-sync "$SYNC_REPO" 2>/dev/null || true
            echo "# Personal Claude Data Backup" > README.md
            printf '.DS_Store\nThumbs.db\n*.tmp\n' > .gitignore
            git add -A 2>/dev/null
            git commit -m "Initial commit" --no-gpg-sign 2>/dev/null || true
            git branch -M main 2>/dev/null || true
            git push -u personal-sync main 2>/dev/null || {
                log_backup "WARN" "Initial push to personal-sync repo failed (will retry next cycle)"
            }
        }
    fi

    cd "$REPO_DIR"
    git remote set-url personal-sync "$SYNC_REPO" 2>/dev/null || \
        git remote add personal-sync "$SYNC_REPO" 2>/dev/null || true

    # Memory files
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for PROJECT_DIR in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            local MEMORY_DIR="$PROJECT_DIR/memory"
            [[ ! -d "$MEMORY_DIR" ]] && continue
            local PROJECT_KEY
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            mkdir -p "$REPO_DIR/memory/$PROJECT_KEY"
            cp -r "$MEMORY_DIR"/* "$REPO_DIR/memory/$PROJECT_KEY/" 2>/dev/null || true
        done
    fi

    [[ -f "$CLAUDE_DIR/CLAUDE.md" ]] && cp "$CLAUDE_DIR/CLAUDE.md" "$REPO_DIR/CLAUDE.md" 2>/dev/null || true
    [[ -d "$CLAUDE_DIR/encyclopedia" ]] && {
        mkdir -p "$REPO_DIR/encyclopedia"
        cp -r "$CLAUDE_DIR/encyclopedia"/* "$REPO_DIR/encyclopedia/" 2>/dev/null || true
    }

    # User-created skills
    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                _should_sync_skill "$skill_name" || continue
                mkdir -p "$REPO_DIR/skills/$skill_name"
                cp -r "$skill_dir"/* "$REPO_DIR/skills/$skill_name/" 2>/dev/null || true
            fi
        done
    fi

    # Conversations
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for slug_dir in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            [[ -L "${slug_dir%/}" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")
            local has_jsonl=false
            for f in "$slug_dir"*.jsonl; do
                [[ -f "$f" && ! -L "$f" ]] && { has_jsonl=true; break; }
            done
            if [[ "$has_jsonl" == true ]]; then
                find "$slug_dir" -name '*.jsonl' -not -type l 2>/dev/null | while IFS= read -r _f; do
                    local _rel="${_f#$slug_dir}"
                    mkdir -p "$REPO_DIR/conversations/$slug_name/$(dirname "$_rel")"
                    cp "$_f" "$REPO_DIR/conversations/$slug_name/$_rel" 2>/dev/null
                done
            fi
        done
    fi

    # System config under system-backup/ (D3)
    local SYS_DIR="$REPO_DIR/system-backup"
    mkdir -p "$SYS_DIR"
    [[ -f "$CONFIG_FILE" ]] && cp "$CONFIG_FILE" "$SYS_DIR/config.json" 2>/dev/null || true
    [[ -f "$CLAUDE_DIR/settings.json" ]] && cp "$CLAUDE_DIR/settings.json" "$SYS_DIR/settings.json" 2>/dev/null || true
    [[ -f "$CLAUDE_DIR/keybindings.json" ]] && cp "$CLAUDE_DIR/keybindings.json" "$SYS_DIR/keybindings.json" 2>/dev/null || true
    [[ -f "$CLAUDE_DIR/mcp.json" ]] && cp "$CLAUDE_DIR/mcp.json" "$SYS_DIR/mcp.json" 2>/dev/null || true
    [[ -f "$CLAUDE_DIR/history.jsonl" ]] && cp "$CLAUDE_DIR/history.jsonl" "$SYS_DIR/history.jsonl" 2>/dev/null || true
    [[ -d "$CLAUDE_DIR/plans" ]] && { mkdir -p "$SYS_DIR/plans"; cp -r "$CLAUDE_DIR/plans"/* "$SYS_DIR/plans/" 2>/dev/null || true; }
    [[ -d "$CLAUDE_DIR/specs" ]] && { mkdir -p "$SYS_DIR/specs"; cp -r "$CLAUDE_DIR/specs"/* "$SYS_DIR/specs/" 2>/dev/null || true; }

    # Conversation index
    local _INDEX_FILE="$CLAUDE_DIR/conversation-index.json"
    if [[ -f "$_INDEX_FILE" ]]; then
        cp "$_INDEX_FILE" "$SYS_DIR/conversation-index.json" 2>/dev/null || true
    fi

    git add -A 2>/dev/null || true
    if ! git diff --cached --quiet 2>/dev/null; then
        git commit -m "auto: sync" --no-gpg-sign 2>/dev/null || true
        git push personal-sync main 2>/dev/null || {
            log_backup "WARN" "Push to personal-sync repo failed (will retry next cycle)"
            return 1
        }
    fi

    log_backup "INFO" "GitHub sync completed successfully"
    return 0
)

# --- iCloud backend ---
sync_icloud() {
    local ICLOUD_PATH
    ICLOUD_PATH=$(config_get "ICLOUD_PATH" "")

    if [[ -z "$ICLOUD_PATH" ]]; then
        if [[ -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ]]; then
            ICLOUD_PATH="$HOME/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude"
        elif [[ -d "$HOME/iCloudDrive" ]]; then
            ICLOUD_PATH="$HOME/iCloudDrive/DestinClaude"
        elif [[ -d "$HOME/Apple/CloudDocs" ]]; then
            ICLOUD_PATH="$HOME/Apple/CloudDocs/DestinClaude"
        else
            log_backup "ERROR" "iCloud Drive folder not found. Install the iCloud app or configure ICLOUD_PATH."
            return 1
        fi
    fi

    if [[ ! -d "$ICLOUD_PATH" ]]; then
        mkdir -p "$ICLOUD_PATH" || {
            log_backup "ERROR" "Cannot create iCloud sync directory: $ICLOUD_PATH"
            return 1
        }
    fi

    log_backup "INFO" "Syncing to iCloud: $ICLOUD_PATH"

    # Memory files
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for PROJECT_DIR in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            local MEMORY_DIR="$PROJECT_DIR/memory"
            [[ ! -d "$MEMORY_DIR" ]] && continue
            local PROJECT_KEY
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            mkdir -p "$ICLOUD_PATH/memory/$PROJECT_KEY"
            rsync -a --update "$MEMORY_DIR/" "$ICLOUD_PATH/memory/$PROJECT_KEY/" 2>/dev/null || \
                cp -r "$MEMORY_DIR"/* "$ICLOUD_PATH/memory/$PROJECT_KEY/" 2>/dev/null || true
        done
    fi

    [[ -f "$CLAUDE_DIR/CLAUDE.md" ]] && {
        rsync -a --update "$CLAUDE_DIR/CLAUDE.md" "$ICLOUD_PATH/" 2>/dev/null || \
            cp "$CLAUDE_DIR/CLAUDE.md" "$ICLOUD_PATH/" 2>/dev/null || true
    }

    [[ -d "$CLAUDE_DIR/encyclopedia" ]] && {
        mkdir -p "$ICLOUD_PATH/encyclopedia"
        rsync -a --update "$CLAUDE_DIR/encyclopedia/" "$ICLOUD_PATH/encyclopedia/" 2>/dev/null || \
            cp -r "$CLAUDE_DIR/encyclopedia"/* "$ICLOUD_PATH/encyclopedia/" 2>/dev/null || true
    }

    # User-created skills
    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                _should_sync_skill "$skill_name" || continue
                mkdir -p "$ICLOUD_PATH/skills/$skill_name"
                rsync -a --update "$skill_dir" "$ICLOUD_PATH/skills/$skill_name/" 2>/dev/null || \
                    cp -r "$skill_dir"/* "$ICLOUD_PATH/skills/$skill_name/" 2>/dev/null || true
            fi
        done
    fi

    # Conversations
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for slug_dir in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            [[ -L "${slug_dir%/}" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")
            local has_jsonl=false
            for f in "$slug_dir"*.jsonl; do
                [[ -f "$f" && ! -L "$f" ]] && { has_jsonl=true; break; }
            done
            if [[ "$has_jsonl" == true ]]; then
                find "$slug_dir" -name '*.jsonl' -not -type l 2>/dev/null | while IFS= read -r _f; do
                    local _rel="${_f#$slug_dir}"
                    mkdir -p "$ICLOUD_PATH/conversations/$slug_name/$(dirname "$_rel")"
                    rsync -a --update "$_f" "$ICLOUD_PATH/conversations/$slug_name/$_rel" 2>/dev/null || \
                        cp "$_f" "$ICLOUD_PATH/conversations/$slug_name/$_rel" 2>/dev/null || true
                done
            fi
        done
    fi

    # System config under system-backup/ (D3)
    local SYS_PATH="$ICLOUD_PATH/system-backup"
    mkdir -p "$SYS_PATH"
    [[ -f "$CONFIG_FILE" ]] && {
        rsync -a --update "$CONFIG_FILE" "$SYS_PATH/config.json" 2>/dev/null || \
            cp "$CONFIG_FILE" "$SYS_PATH/config.json" 2>/dev/null || true
    }
    [[ -f "$CLAUDE_DIR/settings.json" ]] && {
        rsync -a --update "$CLAUDE_DIR/settings.json" "$SYS_PATH/settings.json" 2>/dev/null || \
            cp "$CLAUDE_DIR/settings.json" "$SYS_PATH/settings.json" 2>/dev/null || true
    }
    [[ -f "$CLAUDE_DIR/keybindings.json" ]] && {
        rsync -a --update "$CLAUDE_DIR/keybindings.json" "$SYS_PATH/keybindings.json" 2>/dev/null || \
            cp "$CLAUDE_DIR/keybindings.json" "$SYS_PATH/keybindings.json" 2>/dev/null || true
    }
    [[ -f "$CLAUDE_DIR/mcp.json" ]] && {
        rsync -a --update "$CLAUDE_DIR/mcp.json" "$SYS_PATH/mcp.json" 2>/dev/null || \
            cp "$CLAUDE_DIR/mcp.json" "$SYS_PATH/mcp.json" 2>/dev/null || true
    }
    [[ -f "$CLAUDE_DIR/history.jsonl" ]] && {
        rsync -a --update "$CLAUDE_DIR/history.jsonl" "$SYS_PATH/history.jsonl" 2>/dev/null || \
            cp "$CLAUDE_DIR/history.jsonl" "$SYS_PATH/history.jsonl" 2>/dev/null || true
    }
    [[ -d "$CLAUDE_DIR/plans" ]] && {
        mkdir -p "$SYS_PATH/plans"
        rsync -a --update "$CLAUDE_DIR/plans/" "$SYS_PATH/plans/" 2>/dev/null || \
            cp -r "$CLAUDE_DIR/plans"/* "$SYS_PATH/plans/" 2>/dev/null || true
    }
    [[ -d "$CLAUDE_DIR/specs" ]] && {
        mkdir -p "$SYS_PATH/specs"
        rsync -a --update "$CLAUDE_DIR/specs/" "$SYS_PATH/specs/" 2>/dev/null || \
            cp -r "$CLAUDE_DIR/specs"/* "$SYS_PATH/specs/" 2>/dev/null || true
    }

    # Conversation index
    local _INDEX_FILE="$CLAUDE_DIR/conversation-index.json"
    if [[ -f "$_INDEX_FILE" ]]; then
        rsync -a --checksum "$_INDEX_FILE" "$SYS_PATH/conversation-index.json" 2>/dev/null || \
            cp "$_INDEX_FILE" "$SYS_PATH/conversation-index.json" 2>/dev/null || true
    fi

    log_backup "INFO" "iCloud sync complete."
    return 0
}

# --- Build conversation index from topic files before push ---
if type update_conversation_index &>/dev/null; then
    update_conversation_index || log_backup "WARN" "Conversation index update failed" "sync.push.index"
fi

# --- Multi-backend sync loop ---
_sync_errors=0
while IFS= read -r backend; do
    [[ -z "$backend" ]] && continue
    case "$backend" in
        drive)
            sync_drive || { log_backup "WARN" "Drive sync failed — continuing"; _sync_errors=$((_sync_errors + 1)); } ;;
        github)
            sync_github || { log_backup "WARN" "GitHub sync failed — continuing"; _sync_errors=$((_sync_errors + 1)); } ;;
        icloud)
            sync_icloud || { log_backup "WARN" "iCloud sync failed — continuing"; _sync_errors=$((_sync_errors + 1)); } ;;
        *)
            log_backup "WARN" "Unknown backend: $backend — skipping" ;;
    esac
done < <(if type get_backends &>/dev/null; then get_backends; else echo "$BACKEND"; fi)

# Write backup-meta.json after successful sync
if [[ $_sync_errors -eq 0 ]] && type write_backup_meta &>/dev/null; then
    write_backup_meta "$CLAUDE_DIR"
fi

# Surface errors in session
if [[ $_sync_errors -gt 0 ]]; then
    echo "{\"hookSpecificOutput\": \"Warning: sync completed with $_sync_errors error(s) — check ~/.claude/backup.log\"}" >&2
fi

# Update debounce marker (CRITICAL: must happen after sync)
if type debounce_touch &>/dev/null; then
    debounce_touch "$MARKER_FILE"
else
    mkdir -p "$CLAUDE_DIR/toolkit-state"
    date +%s > "$MARKER_FILE"
fi

exit 0
