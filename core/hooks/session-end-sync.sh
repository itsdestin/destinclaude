#!/usr/bin/env bash
# session-end-sync.sh — Sync the current session's JSONL at session exit.
# Ensures conversations from read-only/Bash-only sessions are backed up.
# Bypasses debounce (session is ending — no retry opportunity).
# Hard timeout: 15 seconds (enforced by settings.json timeout property).

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HOOK_DIR/lib/hook-preamble.sh" ]] && source "$HOOK_DIR/lib/hook-preamble.sh"
[[ -f "$HOOK_DIR/lib/backup-common.sh" ]] && source "$HOOK_DIR/lib/backup-common.sh"

# Read hook payload for session context
SESSION_ID=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" 2>/dev/null)
[[ -z "$SESSION_ID" ]] && exit 0

# Check backend
BACKEND=$(config_get "PERSONAL_SYNC_BACKEND" "none")
[[ "$BACKEND" == "none" ]] && exit 0

DRIVE_ROOT=$(config_get "DRIVE_ROOT" "Claude")
SYNC_REPO=$(config_get "PERSONAL_SYNC_REPO" "")
PERSONAL_DRIVE_REMOTE=$(config_get "PERSONAL_DRIVE_REMOTE" "gdrive")

SLUG=$(get_current_project_slug 2>/dev/null || echo "")
[[ -z "$SLUG" ]] && exit 0

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
JSONL_FILE="$CLAUDE_DIR/projects/$SLUG/$SESSION_ID.jsonl"
[[ ! -f "$JSONL_FILE" ]] && exit 0

# Conversation index — update from topic files (best-effort within timeout)
if type update_conversation_index &>/dev/null; then
    update_conversation_index 2>/dev/null || true
fi

# --- Drive backend ---
_session_end_drive() {
    [[ -z "$DRIVE_ROOT" ]] && return 0
    if ! command -v rclone &>/dev/null; then
        log_backup "ERROR" "rclone not found — skipping Drive session-end sync"
        return 1
    fi

    local REMOTE_BASE="${PERSONAL_DRIVE_REMOTE}:$DRIVE_ROOT/Backup/personal/conversations/$SLUG"

    _capture_err "session-end sync $SESSION_ID" \
        rclone copy "$JSONL_FILE" "$REMOTE_BASE/" --checksum || true

    local _INDEX_FILE="$CLAUDE_DIR/conversation-index.json"
    if [[ -f "$_INDEX_FILE" ]]; then
        _capture_err "session-end index sync" \
            rclone copyto "$_INDEX_FILE" \
            "${PERSONAL_DRIVE_REMOTE}:$DRIVE_ROOT/Backup/system-backup/conversation-index.json" \
            --checksum || true
    fi
}

# --- GitHub backend ---
_session_end_github() {
    if ! command -v git &>/dev/null; then
        log_backup "ERROR" "git not found — skipping GitHub session-end sync"
        return 1
    fi

    local REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
    [[ ! -d "$REPO_DIR/.git" ]] && return 0

    local CONV_DIR="$REPO_DIR/conversations/$SLUG"
    mkdir -p "$CONV_DIR"
    cp "$JSONL_FILE" "$CONV_DIR/" 2>/dev/null || true

    local _INDEX_FILE="$CLAUDE_DIR/conversation-index.json"
    if [[ -f "$_INDEX_FILE" ]]; then
        mkdir -p "$REPO_DIR/system-backup"
        cp "$_INDEX_FILE" "$REPO_DIR/system-backup/conversation-index.json" 2>/dev/null || true
    fi

    (
        cd "$REPO_DIR"
        git add -A 2>/dev/null || true
        if ! git diff --cached --quiet 2>/dev/null; then
            git commit -m "auto: session-end sync" --no-gpg-sign 2>/dev/null || true
            git push personal-sync main 2>/dev/null || true
        fi
    )
}

# --- iCloud backend ---
_session_end_icloud() {
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
            log_backup "ERROR" "iCloud Drive folder not found"
            return 1
        fi
    fi

    [[ ! -d "$ICLOUD_PATH" ]] && mkdir -p "$ICLOUD_PATH"

    local CONV_DIR="$ICLOUD_PATH/conversations/$SLUG"
    mkdir -p "$CONV_DIR"
    rsync -a --update "$JSONL_FILE" "$CONV_DIR/" 2>/dev/null || \
        cp "$JSONL_FILE" "$CONV_DIR/" 2>/dev/null || true

    local _INDEX_FILE="$CLAUDE_DIR/conversation-index.json"
    if [[ -f "$_INDEX_FILE" ]]; then
        mkdir -p "$ICLOUD_PATH/system-backup"
        rsync -a --checksum "$_INDEX_FILE" "$ICLOUD_PATH/system-backup/conversation-index.json" 2>/dev/null || \
            cp "$_INDEX_FILE" "$ICLOUD_PATH/system-backup/conversation-index.json" 2>/dev/null || true
    fi
}

# --- Multi-backend sync loop ---
_sync_errors=0
while IFS= read -r backend; do
    [[ -z "$backend" ]] && continue
    case "$backend" in
        drive)
            _session_end_drive || { log_backup "WARN" "Drive session-end sync failed"; _sync_errors=$((_sync_errors + 1)); } ;;
        github)
            _session_end_github || { log_backup "WARN" "GitHub session-end sync failed"; _sync_errors=$((_sync_errors + 1)); } ;;
        icloud)
            _session_end_icloud || { log_backup "WARN" "iCloud session-end sync failed"; _sync_errors=$((_sync_errors + 1)); } ;;
        *)
            log_backup "WARN" "Unknown backend: $backend — skipping" ;;
    esac
done < <(if type get_backends &>/dev/null; then get_backends; else echo "$BACKEND"; fi)

log_backup "INFO" "Session-end sync for $SESSION_ID" "sync.sessionend"
