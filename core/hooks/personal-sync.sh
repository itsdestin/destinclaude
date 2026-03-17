#!/usr/bin/env bash
# PostToolUse hook for Write|Edit
# Syncs personal data (memory, CLAUDE.md, config) to Drive or private GitHub.
# Debounced to 15-minute intervals. Cross-platform (Windows/Mac/Linux).
# Spec: core/specs/personal-sync-spec.md

set -euo pipefail

# --- Parse stdin JSON ---
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[[ -z "$FILE_PATH" ]] && exit 0

# Normalize path separators (Windows backslashes to forward slashes)
FILE_PATH="${FILE_PATH//\\//}"

# --- Path check: only sync personal data files ---
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
IS_PERSONAL=false

case "$FILE_PATH" in
    */projects/*/memory/*|*/.claude/projects/*/memory/*)
        IS_PERSONAL=true ;;
    */CLAUDE.md|*/.claude/CLAUDE.md)
        IS_PERSONAL=true ;;
    */toolkit-state/config.json|*/.claude/toolkit-state/config.json)
        IS_PERSONAL=true ;;
esac

[[ "$IS_PERSONAL" == "false" ]] && exit 0

# --- Read config ---
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"
[[ ! -f "$CONFIG_FILE" ]] && exit 0

BACKEND=""
DRIVE_ROOT="Claude"
SYNC_REPO=""

if command -v node &>/dev/null; then
    read -r BACKEND DRIVE_ROOT SYNC_REPO < <(node -e "
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
    # Fallback: grep-based config parsing
    BACKEND=$(grep -o '"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "none")
    DRIVE_ROOT=$(grep -o '"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "Claude")
    SYNC_REPO=$(grep -o '"PERSONAL_SYNC_REPO"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_REPO"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "")
fi

[[ -z "$BACKEND" || "$BACKEND" == "none" ]] && exit 0

# --- Debounce: 15 minutes ---
SYNC_INTERVAL=900
MARKER_FILE="$CLAUDE_DIR/toolkit-state/.personal-sync-marker"

if [[ -f "$MARKER_FILE" ]]; then
    LAST_SYNC=$(cat "$MARKER_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_SYNC))
    [[ $ELAPSED -lt $SYNC_INTERVAL ]] && exit 0
fi

# --- Log helper ---
LOG_FILE="$CLAUDE_DIR/backup.log"
log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [personal-sync] $1" >> "$LOG_FILE" 2>/dev/null || true
}

# --- Drive backend ---
sync_drive() {
    if ! command -v rclone &>/dev/null; then
        log_msg "ERROR: rclone not found in PATH — skipping Drive sync"
        return 1
    fi

    local REMOTE_BASE="gdrive:$DRIVE_ROOT/Backup/personal"
    local ERRORS=0

    # Sync memory files (each project as a subfolder)
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for PROJECT_DIR in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            local MEMORY_DIR="$PROJECT_DIR/memory"
            [[ ! -d "$MEMORY_DIR" ]] && continue
            local PROJECT_KEY
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            rclone sync "$MEMORY_DIR/" "$REMOTE_BASE/memory/$PROJECT_KEY/" --update 2>/dev/null || {
                log_msg "WARN: Failed to sync memory for project $PROJECT_KEY"
                ERRORS=$((ERRORS + 1))
            }
        done
    fi

    # Sync CLAUDE.md
    if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
        rclone copyto "$CLAUDE_DIR/CLAUDE.md" "$REMOTE_BASE/CLAUDE.md" --update 2>/dev/null || {
            log_msg "WARN: Failed to sync CLAUDE.md"
            ERRORS=$((ERRORS + 1))
        }
    fi

    # Sync toolkit config
    if [[ -f "$CONFIG_FILE" ]]; then
        rclone copyto "$CONFIG_FILE" "$REMOTE_BASE/toolkit-state/config.json" --update 2>/dev/null || {
            log_msg "WARN: Failed to sync config.json"
            ERRORS=$((ERRORS + 1))
        }
    fi

    if [[ $ERRORS -gt 0 ]]; then
        log_msg "Drive sync completed with $ERRORS warning(s)"
        return 1
    fi

    log_msg "Drive sync completed successfully"
    return 0
}

# --- GitHub backend ---
sync_github() {
    if ! command -v git &>/dev/null; then
        log_msg "ERROR: git not found in PATH — skipping GitHub sync"
        return 1
    fi

    local REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"

    # Initialize repo checkout if it doesn't exist
    if [[ ! -d "$REPO_DIR/.git" ]]; then
        if [[ -z "$SYNC_REPO" ]]; then
            log_msg "ERROR: PERSONAL_SYNC_REPO not configured"
            return 1
        fi
        mkdir -p "$REPO_DIR"
        git clone "$SYNC_REPO" "$REPO_DIR" 2>/dev/null || {
            # Repo might be empty — init and set remote
            cd "$REPO_DIR"
            git init 2>/dev/null
            git remote add personal-sync "$SYNC_REPO" 2>/dev/null || true
            echo "# Personal Claude Data Backup" > README.md
            printf '.DS_Store\nThumbs.db\n*.tmp\n' > .gitignore
            git add -A 2>/dev/null
            git commit -m "Initial commit" --no-gpg-sign 2>/dev/null || true
            git branch -M main 2>/dev/null || true
            git push -u personal-sync main 2>/dev/null || {
                log_msg "WARN: Initial push to personal-sync repo failed (will retry next cycle)"
            }
        }
    fi

    cd "$REPO_DIR"

    # Ensure remote is set correctly
    git remote set-url personal-sync "$SYNC_REPO" 2>/dev/null || \
        git remote add personal-sync "$SYNC_REPO" 2>/dev/null || true

    # Copy personal data into repo checkout
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

    # CLAUDE.md
    if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
        cp "$CLAUDE_DIR/CLAUDE.md" "$REPO_DIR/CLAUDE.md" 2>/dev/null || true
    fi

    # Toolkit config
    if [[ -f "$CONFIG_FILE" ]]; then
        mkdir -p "$REPO_DIR/toolkit-state"
        cp "$CONFIG_FILE" "$REPO_DIR/toolkit-state/config.json" 2>/dev/null || true
    fi

    # Commit and push
    git add -A 2>/dev/null || true
    if ! git diff --cached --quiet 2>/dev/null; then
        git commit -m "auto: personal sync" --no-gpg-sign 2>/dev/null || true
        git push personal-sync main 2>/dev/null || {
            log_msg "WARN: Push to personal-sync repo failed (will retry next cycle)"
            return 1
        }
    fi

    log_msg "GitHub sync completed successfully"
    return 0
}

# --- Execute sync ---
SYNC_OK=false
case "$BACKEND" in
    drive)
        sync_drive && SYNC_OK=true ;;
    github)
        sync_github && SYNC_OK=true ;;
    *)
        exit 0 ;;
esac

# --- Update debounce marker ---
if [[ "$SYNC_OK" == "true" ]]; then
    mkdir -p "$CLAUDE_DIR/toolkit-state"
    date +%s > "$MARKER_FILE"
fi

exit 0
