#!/usr/bin/env bash
# PostToolUse hook for Write|Edit
# Syncs personal data (memory, CLAUDE.md, config, encyclopedia, skills) to all configured backends.
# Debounced to 15-minute intervals. Cross-platform (Windows/Mac/Linux).
# Spec: core/specs/personal-sync-spec.md

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
if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
fi
if [[ -f "$HOOK_DIR/lib/migrate.sh" ]]; then
    source "$HOOK_DIR/lib/migrate.sh"
fi

# --- Path filter: only sync personal data files ---
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"

case "$FILE_PATH" in
    */toolkit-state/config.local.json) exit 0 ;;   # Machine-specific, never sync (D1)
    */mcp-servers/mcp-config.json) exit 0 ;;        # Machine-specific, never sync (D2)
    */projects/*/*.jsonl) ;;                        # Conversation transcripts (D3)
    */projects/*/memory/*) ;;
    */CLAUDE.md) ;;
    */toolkit-state/config.json) ;;
    */encyclopedia/*) ;;
    */skills/*)
        if type is_toolkit_owned &>/dev/null && is_toolkit_owned "$FILE_PATH"; then
            exit 0
        fi
        ;;
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
elif command -v node &>/dev/null; then
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
    BACKEND=$(grep -o '"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "none")
    DRIVE_ROOT=$(grep -o '"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "Claude")
    SYNC_REPO=$(grep -o '"PERSONAL_SYNC_REPO"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_REPO"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "")
fi

[[ -z "$BACKEND" || "$BACKEND" == "none" ]] && exit 0

# --- Debounce: 15 minutes ---
MARKER_FILE="$CLAUDE_DIR/toolkit-state/.personal-sync-marker"

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

# --- Drive backend ---
sync_drive() {
    if ! command -v rclone &>/dev/null; then
        log_backup "ERROR" "rclone not found in PATH — skipping Drive sync"
        return 1
    fi

    local REMOTE_BASE="gdrive:$DRIVE_ROOT/Backup/personal"
    local ERRORS=0

    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for PROJECT_DIR in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            local MEMORY_DIR="$PROJECT_DIR/memory"
            [[ ! -d "$MEMORY_DIR" ]] && continue
            local PROJECT_KEY
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            rclone copy "$MEMORY_DIR/" "$REMOTE_BASE/memory/$PROJECT_KEY/" --update 2>/dev/null || {
                log_backup "WARN" "Failed to sync memory for project $PROJECT_KEY"
                ERRORS=$((ERRORS + 1))
            }
        done
    fi

    if [[ -f "$CLAUDE_DIR/CLAUDE.md" ]]; then
        rclone copyto "$CLAUDE_DIR/CLAUDE.md" "$REMOTE_BASE/CLAUDE.md" --update 2>/dev/null || {
            log_backup "WARN" "Failed to sync CLAUDE.md"
            ERRORS=$((ERRORS + 1))
        }
    fi

    if [[ -f "$CONFIG_FILE" ]]; then
        rclone copyto "$CONFIG_FILE" "$REMOTE_BASE/toolkit-state/config.json" --update 2>/dev/null || {
            log_backup "WARN" "Failed to sync config.json"
            ERRORS=$((ERRORS + 1))
        }
    fi

    if [[ -d "$CLAUDE_DIR/encyclopedia" ]]; then
        rclone copy "$CLAUDE_DIR/encyclopedia/" "$REMOTE_BASE/encyclopedia/" \
            --update --exclude '.DS_Store' 2>/dev/null || \
            log_backup "WARN" "Encyclopedia sync to Drive failed"
    fi

    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                rclone copy "$skill_dir" "$REMOTE_BASE/skills/$skill_name/" \
                    --update --exclude '.DS_Store' 2>/dev/null || \
                    log_backup "WARN" "Skill $skill_name sync to Drive failed"
            fi
        done
    fi

    # Conversations — push per-slug (Design ref: D3, D4)
    if [[ -d "$CLAUDE_DIR/projects" ]]; then
        for slug_dir in "$CLAUDE_DIR"/projects/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            # Skip symlinked slug directories (foreign device slugs)
            [[ -L "${slug_dir%/}" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")
            # Check if this slug has any real (non-symlink) .jsonl files
            local has_jsonl=false
            for f in "$slug_dir"*.jsonl; do
                [[ -f "$f" && ! -L "$f" ]] && { has_jsonl=true; break; }
            done
            if [[ "$has_jsonl" == true ]]; then
                rclone copy "$slug_dir" "$REMOTE_BASE/conversations/$slug_name/" \
                    --checksum --include '*.jsonl' --skip-links 2>/dev/null || {
                    log_backup "WARN" "Failed to sync conversations for $slug_name"
                    ERRORS=$((ERRORS + 1))
                }
            fi
        done
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
    [[ -f "$CONFIG_FILE" ]] && { mkdir -p "$REPO_DIR/toolkit-state"; cp "$CONFIG_FILE" "$REPO_DIR/toolkit-state/config.json" 2>/dev/null || true; }
    [[ -d "$CLAUDE_DIR/encyclopedia" ]] && { mkdir -p "$REPO_DIR/encyclopedia"; cp -r "$CLAUDE_DIR/encyclopedia"/* "$REPO_DIR/encyclopedia/" 2>/dev/null || true; }

    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                mkdir -p "$REPO_DIR/skills/$skill_name"
                cp -r "$skill_dir"/* "$REPO_DIR/skills/$skill_name/" 2>/dev/null || true
            fi
        done
    fi

    # Conversations — copy per-slug (Design ref: D3, D4)
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
                mkdir -p "$REPO_DIR/conversations/$slug_name"
                for f in "$slug_dir"*.jsonl; do
                    [[ -f "$f" && ! -L "$f" ]] && cp "$f" "$REPO_DIR/conversations/$slug_name/" 2>/dev/null || true
                done
            fi
        done
    fi

    git add -A 2>/dev/null || true
    if ! git diff --cached --quiet 2>/dev/null; then
        git commit -m "auto: personal sync" --no-gpg-sign 2>/dev/null || true
        git push personal-sync main 2>/dev/null || {
            log_backup "WARN" "Push to personal-sync repo failed (will retry next cycle)"
            return 1
        }
    fi

    log_backup "INFO" "GitHub sync completed successfully"
    return 0
)

# --- iCloud backend: local folder copy (Design ref: D5) ---
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

    log_backup "INFO" "Syncing personal data to iCloud: $ICLOUD_PATH"

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

    [[ -f "$CONFIG_FILE" ]] && {
        mkdir -p "$ICLOUD_PATH/toolkit-state"
        rsync -a --update "$CONFIG_FILE" "$ICLOUD_PATH/toolkit-state/" 2>/dev/null || \
            cp "$CONFIG_FILE" "$ICLOUD_PATH/toolkit-state/" 2>/dev/null || true
    }

    [[ -d "$CLAUDE_DIR/encyclopedia" ]] && {
        mkdir -p "$ICLOUD_PATH/encyclopedia"
        rsync -a --update "$CLAUDE_DIR/encyclopedia/" "$ICLOUD_PATH/encyclopedia/" 2>/dev/null || \
            cp -r "$CLAUDE_DIR/encyclopedia"/* "$ICLOUD_PATH/encyclopedia/" 2>/dev/null || true
    }

    if [[ -d "$CLAUDE_DIR/skills" ]]; then
        for skill_dir in "$CLAUDE_DIR/skills"/*/; do
            [[ ! -d "$skill_dir" ]] && continue
            if [[ ! -L "$skill_dir" ]] || ! is_toolkit_owned "${skill_dir%/}"; then
                local skill_name
                skill_name=$(basename "$skill_dir")
                mkdir -p "$ICLOUD_PATH/skills/$skill_name"
                rsync -a --update "$skill_dir" "$ICLOUD_PATH/skills/$skill_name/" 2>/dev/null || \
                    cp -r "$skill_dir"/* "$ICLOUD_PATH/skills/$skill_name/" 2>/dev/null || true
            fi
        done
    fi

    # Conversations — copy per-slug, skip symlinks (Design ref: D3, D4)
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
                mkdir -p "$ICLOUD_PATH/conversations/$slug_name"
                for f in "$slug_dir"*.jsonl; do
                    [[ -f "$f" && ! -L "$f" ]] && {
                        rsync -a --update "$f" "$ICLOUD_PATH/conversations/$slug_name/" 2>/dev/null || \
                            cp "$f" "$ICLOUD_PATH/conversations/$slug_name/" 2>/dev/null || true
                    }
                done
            fi
        done
    fi

    log_backup "INFO" "iCloud sync complete."
    return 0
}

# --- Multi-backend sync loop (Design ref: D6) ---
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

# Write backup-meta.json after successful sync (Design ref: D7)
if [[ $_sync_errors -eq 0 ]] && type write_backup_meta &>/dev/null; then
    write_backup_meta "$CLAUDE_DIR"
fi

# --- Surface errors in session (mandate: visible error messages) ---
if [[ $_sync_errors -gt 0 ]]; then
    echo "{\"hookSpecificOutput\": \"Warning: personal sync completed with $_sync_errors error(s) — check ~/.claude/backup.log\"}" >&2
fi

# --- Update debounce marker (CRITICAL: must happen after sync) ---
if type debounce_touch &>/dev/null; then
    debounce_touch "$MARKER_FILE"
else
    mkdir -p "$CLAUDE_DIR/toolkit-state"
    date +%s > "$MARKER_FILE"
fi

exit 0
