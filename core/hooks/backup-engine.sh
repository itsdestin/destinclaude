#!/usr/bin/env bash
# backup-engine.sh — Unified backup engine for DestinClaude
# Replaces: git-sync.sh, personal-sync.sh, drive-archive.sh
# Trigger: PostToolUse hook on Write/Edit
# Also callable in pull/restore mode: bash backup-engine.sh --pull | --restore

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
TOOLKIT_STATE="$CLAUDE_DIR/toolkit-state"
CONFIG_FILE="$TOOLKIT_STATE/config.json"
MANIFEST_FILE=""  # Set after TOOLKIT_ROOT resolution
SCHEMA_FILE=""    # Set after TOOLKIT_ROOT resolution
BACKUP_LOG="$CLAUDE_DIR/backup.log"
LOCK_DIR="$CLAUDE_DIR/.backup-lock"
REGISTRY_FILE="$CLAUDE_DIR/.write-registry.json"

# --- Mode detection ---
MODE="push"  # default: PostToolUse hook
[[ "${1:-}" == "--pull" ]] && MODE="pull"
[[ "${1:-}" == "--restore" ]] && MODE="restore"

# --- Logging ---
log_msg() {
    local MSG="$1"
    local TIMESTAMP
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$TIMESTAMP] [backup-engine] $MSG" >> "$BACKUP_LOG"
}

# --- Config reading ---
read_config() {
    local KEY="$1"
    local DEFAULT="${2:-}"
    if [[ -f "$CONFIG_FILE" ]]; then
        local VAL
        VAL=$(node -e "
            const fs = require('fs');
            try {
                const c = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
                // Support old key names (D10 migration)
                const migrations = {
                    'primary_backend': ['PERSONAL_SYNC_BACKEND'],
                    'primary_backend_repo': ['PERSONAL_SYNC_REPO']
                };
                let v = c['$KEY'];
                if (v === undefined && migrations['$KEY']) {
                    for (const old of migrations['$KEY']) {
                        if (c[old] !== undefined) { v = c[old]; break; }
                    }
                }
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " 2>/dev/null)
        echo "${VAL:-$DEFAULT}"
    else
        echo "$DEFAULT"
    fi
}

# --- Resolve TOOLKIT_ROOT ---
TOOLKIT_ROOT=$(read_config "toolkit_root" "")
if [[ -z "$TOOLKIT_ROOT" ]]; then
    # Fallback: walk up from this script's location
    SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")")" && pwd)"
    WALK="$SCRIPT_DIR"
    while [[ "$WALK" != "/" && "$WALK" != "." ]]; do
        if [[ -f "$WALK/VERSION" && -f "$WALK/plugin.json" ]]; then
            TOOLKIT_ROOT="$WALK"
            break
        fi
        WALK=$(dirname "$WALK")
    done
fi

# Set manifest and schema paths
[[ -n "$TOOLKIT_ROOT" ]] && MANIFEST_FILE="$TOOLKIT_ROOT/plugin-manifest.json"
[[ -n "$TOOLKIT_ROOT" ]] && SCHEMA_FILE="$TOOLKIT_ROOT/backup-schema.json"

# --- Read backend config ---
PRIMARY_BACKEND=$(read_config "primary_backend" "none")
PRIMARY_BACKEND_REPO=$(read_config "primary_backend_repo" "")
SECONDARY_BACKEND=$(read_config "secondary_backend" "none")
SECONDARY_BACKEND_REPO=$(read_config "secondary_backend_repo" "")
DRIVE_ROOT=$(read_config "DRIVE_ROOT" "Claude")

# --- Load backend driver ---
load_driver() {
    local BACKEND="$1"
    local DRIVER_DIR
    if [[ -n "$TOOLKIT_ROOT" ]]; then
        DRIVER_DIR="$TOOLKIT_ROOT/core/hooks/backends"
    else
        DRIVER_DIR="$(dirname "${BASH_SOURCE[0]}")/backends"
    fi
    local DRIVER_FILE="$DRIVER_DIR/backend-${BACKEND}.sh"
    if [[ -f "$DRIVER_FILE" ]]; then
        source "$DRIVER_FILE"
        return 0
    else
        log_msg "ERROR: Backend driver not found: $DRIVER_FILE"
        return 1
    fi
}

# --- File classification ---
# Returns: "personal", "extension", "toolkit", "excluded", "external"
classify_file() {
    local FILE_PATH="$1"

    # Normalize path
    FILE_PATH="${FILE_PATH//\\//}"

    # Check exclusions first (fast path)
    case "$FILE_PATH" in
        */.env|*token*|*secret*|*credential*) echo "excluded"; return ;;
        */node_modules/*|*/__pycache__/*|*/.venv/*) echo "excluded"; return ;;
        */sessions/*|*/tasks/*|*/shell-snapshots/*) echo "excluded"; return ;;
        *settings.json|*settings.local.json|*.claude.json) echo "excluded"; return ;;
        *.lock|*.lock/*) echo "excluded"; return ;;
    esac

    # Check if it's in the CLAUDE_DIR at all
    local CLAUDE_DIR_NORM="${CLAUDE_DIR//\\//}"
    if [[ "$FILE_PATH" != "$CLAUDE_DIR_NORM"* ]]; then
        echo "external"
        return
    fi

    # Check manifest (toolkit-owned)
    if [[ -f "$MANIFEST_FILE" ]]; then
        local REL_PATH="${FILE_PATH#$CLAUDE_DIR_NORM/}"

        # Check skills
        if [[ "$REL_PATH" == skills/* ]]; then
            local SKILL_NAME
            SKILL_NAME=$(echo "$REL_PATH" | sed 's|skills/\([^/]*\)/.*|\1|')
            local IS_TOOLKIT
            IS_TOOLKIT=$(node -e "
                try {
                    const m = JSON.parse(require('fs').readFileSync('$MANIFEST_FILE', 'utf8'));
                    console.log(m.owned_files.skills.includes('$SKILL_NAME') ? 'yes' : 'no');
                } catch(e) { console.log('no'); }
            " 2>/dev/null)
            if [[ "$IS_TOOLKIT" == "yes" ]]; then
                echo "toolkit"
                return
            fi
            echo "extension"
            return
        fi

        # Check hooks
        if [[ "$REL_PATH" == hooks/* ]]; then
            local HOOK_NAME
            HOOK_NAME=$(basename "$REL_PATH")
            local IS_TOOLKIT
            IS_TOOLKIT=$(node -e "
                try {
                    const m = JSON.parse(require('fs').readFileSync('$MANIFEST_FILE', 'utf8'));
                    const all = [...(m.owned_files.hooks||[]), ...(m.owned_files.utility_scripts||[])];
                    console.log(all.includes('$HOOK_NAME') ? 'yes' : 'no');
                } catch(e) { console.log('no'); }
            " 2>/dev/null)
            if [[ "$IS_TOOLKIT" == "yes" ]]; then
                echo "toolkit"
                return
            fi
            echo "extension"
            return
        fi

        # Check specs/commands (always toolkit-owned)
        if [[ "$REL_PATH" == specs/* || "$REL_PATH" == commands/* ]]; then
            echo "toolkit"
            return
        fi
    fi

    # Check personal data patterns
    case "$FILE_PATH" in
        */projects/*/memory/*) echo "personal"; return ;;
        */CLAUDE.md) echo "personal"; return ;;
        */keybindings.json) echo "personal"; return ;;
        */projects/*/*.jsonl) echo "personal"; return ;;
        */encyclopedia/*) echo "personal"; return ;;
        */toolkit-state/config.json) echo "personal"; return ;;
    esac

    # Default: not classified as backupable
    echo "excluded"
}

# --- Canonical path mapping ---
map_to_canonical() {
    local FILE_PATH="$1"
    local CLAUDE_DIR_NORM="${CLAUDE_DIR//\\//}"
    FILE_PATH="${FILE_PATH//\\//}"

    case "$FILE_PATH" in
        */projects/*/memory/*)
            local PROJECT_KEY
            PROJECT_KEY=$(echo "$FILE_PATH" | sed "s|.*projects/\([^/]*\)/memory/.*|\1|")
            local FILE_NAME
            FILE_NAME=$(basename "$FILE_PATH")
            echo "memory/$PROJECT_KEY/$FILE_NAME"
            ;;
        */CLAUDE.md)
            echo "claude-md/CLAUDE.md"
            ;;
        */keybindings.json)
            echo "config/keybindings.json"
            ;;
        */toolkit-state/config.json)
            echo "config/user-choices.json"
            ;;
        */projects/*/*.jsonl)
            local PROJECT_KEY
            PROJECT_KEY=$(echo "$FILE_PATH" | sed "s|.*projects/\([^/]*\)/.*|\1|")
            local FILE_NAME
            FILE_NAME=$(basename "$FILE_PATH")
            echo "conversations/$PROJECT_KEY/$FILE_NAME"
            ;;
        */encyclopedia/*)
            local FILE_NAME
            FILE_NAME=$(basename "$FILE_PATH")
            echo "encyclopedia/$FILE_NAME"
            ;;
        */skills/*)
            local SKILL_NAME
            SKILL_NAME=$(echo "$FILE_PATH" | sed "s|.*skills/\([^/]*\)/.*|\1|")
            local REL
            REL=$(echo "$FILE_PATH" | sed "s|.*skills/$SKILL_NAME/||")
            echo "extensions/skills/$SKILL_NAME/$REL"
            ;;
        *)
            echo ""  # No canonical mapping
            ;;
    esac
}

# --- Mutex ---
acquire_lock() {
    local RETRIES=30
    while ! mkdir "$LOCK_DIR" 2>/dev/null; do
        RETRIES=$((RETRIES - 1))
        if [[ $RETRIES -le 0 ]]; then
            # Check for stale lock (>2 minutes)
            local LOCK_AGE=0
            if [[ -f "$LOCK_DIR/pid" ]]; then
                local LOCK_TIME
                LOCK_TIME=$(cat "$LOCK_DIR/pid" 2>/dev/null | tail -1)
                local NOW
                NOW=$(date +%s)
                LOCK_AGE=$(( NOW - ${LOCK_TIME:-0} ))
            fi
            if [[ $LOCK_AGE -gt 120 ]]; then
                rm -rf "$LOCK_DIR" 2>/dev/null
                mkdir "$LOCK_DIR" 2>/dev/null && break
            fi
            log_msg "ERROR: Could not acquire lock after 30 retries"
            return 1
        fi
        sleep 1
    done
    echo "$$" > "$LOCK_DIR/pid"
    date +%s >> "$LOCK_DIR/pid"
}

release_lock() {
    rm -rf "$LOCK_DIR" 2>/dev/null
}

# --- Debounce ---
check_debounce() {
    local BACKEND="$1"
    local MARKER="$CLAUDE_DIR/.push-marker-${BACKEND}"
    local INTERVAL=900  # 15 minutes

    if [[ ! -f "$MARKER" ]]; then
        return 0  # No marker — push now
    fi

    local LAST_PUSH
    LAST_PUSH=$(cat "$MARKER" 2>/dev/null || echo "0")
    local NOW
    NOW=$(date +%s)
    local ELAPSED=$(( NOW - LAST_PUSH ))

    if [[ $ELAPSED -ge $INTERVAL ]]; then
        return 0  # Debounce expired — push now
    fi
    return 1  # Too soon — skip
}

update_debounce() {
    local BACKEND="$1"
    local MARKER="$CLAUDE_DIR/.push-marker-${BACKEND}"
    date +%s > "$MARKER"
}

# --- Write registry update (for write-guard.sh) ---
update_registry() {
    local FILE_PATH="$1"
    local CONTENT_HASH
    if [[ -f "$FILE_PATH" ]]; then
        CONTENT_HASH=$(sha256sum "$FILE_PATH" 2>/dev/null | head -c 16 || shasum -a 256 "$FILE_PATH" 2>/dev/null | head -c 16 || echo "unknown")
    else
        CONTENT_HASH="deleted"
    fi

    node -e "
        const fs = require('fs');
        const path = '$REGISTRY_FILE';
        const filePath = '${FILE_PATH//\'/\\\'}';
        let reg = {};
        try { reg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) {}
        reg[filePath] = {
            pid: $PPID,
            timestamp: Math.floor(Date.now() / 1000),
            content_hash: '$CONTENT_HASH'
        };
        fs.writeFileSync(path, JSON.stringify(reg, null, 2));
    " 2>/dev/null
}

# --- Push to backend ---
push_to_backend() {
    local BACKEND="$1"
    local LOCAL_PATH="$2"
    local CANONICAL_PATH="$3"

    # Set backend-specific env vars
    export DRIVE_ROOT
    export BACKUP_REPO_URL="$PRIMARY_BACKEND_REPO"
    export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo"

    if [[ "$BACKEND" == "$SECONDARY_BACKEND" ]]; then
        export BACKUP_REPO_URL="$SECONDARY_BACKEND_REPO"
        export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo-secondary"
    fi

    load_driver "$BACKEND" || return 1
    backup_push "$LOCAL_PATH" "$CANONICAL_PATH"
}

# --- Check if file is high-value (for secondary backup) ---
is_high_value() {
    local CANONICAL_PATH="$1"
    case "$CANONICAL_PATH" in
        memory/*|claude-md/*|extensions/skills/*) return 0 ;;
        *) return 1 ;;
    esac
}

# --- Extract user-choice keys for config backup ---
extract_user_choices() {
    local CONFIG="$1"
    local OUTPUT="$2"
    [[ ! -f "$SCHEMA_FILE" ]] && return 1
    node -e "
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync('$CONFIG', 'utf8'));
        const schema = JSON.parse(fs.readFileSync('$SCHEMA_FILE', 'utf8'));
        const result = {};
        for (const key of schema.user_choice_keys) {
            if (config[key] !== undefined) result[key] = config[key];
        }
        fs.writeFileSync('$OUTPUT', JSON.stringify(result, null, 2));
    " 2>/dev/null
}

# ==============================================================
# MAIN: Push mode (PostToolUse hook)
# ==============================================================
if [[ "$MODE" == "push" ]]; then
    # Parse stdin JSON
    INPUT=$(cat)
    FILE_PATH=$(echo "$INPUT" | node -e "
        let d=''; process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try {
                const j=JSON.parse(d);
                const p=j.tool_input?.file_path || j.file_path || '';
                process.stdout.write(p.replace(/\\\\/g,'/'));
            } catch(e) {}
        });
    " 2>/dev/null)

    [[ -z "$FILE_PATH" ]] && exit 0

    # Classify
    CLASSIFICATION=$(classify_file "$FILE_PATH")

    # Update write registry regardless of classification (for write-guard)
    if [[ "$CLASSIFICATION" != "external" ]]; then
        update_registry "$FILE_PATH"
    fi

    # Exit if not backupable
    if [[ "$CLASSIFICATION" == "toolkit" || "$CLASSIFICATION" == "excluded" ]]; then
        exit 0
    fi

    # Handle user extensions — check if user has approved this extension
    if [[ "$CLASSIFICATION" == "extension" ]]; then
        EXT_NAME=$(basename "$(dirname "$FILE_PATH")")
        APPROVED=$(node -e "
            const fs = require('fs');
            try {
                const c = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
                const exts = c.user_extensions || {};
                const skills = exts.skills || [];
                const hooks = exts.hooks || [];
                console.log([...skills, ...hooks].includes('$EXT_NAME') ? 'yes' : 'no');
            } catch(e) { console.log('no'); }
        " 2>/dev/null)
        if [[ "$APPROVED" != "yes" ]]; then
            exit 0  # Not approved for backup — skip silently
        fi
    fi

    # Map to canonical path
    CANONICAL=$(map_to_canonical "$FILE_PATH")
    [[ -z "$CANONICAL" ]] && exit 0

    # Special handling: config.json → extract user-choice keys only
    TEMP_CHOICES=""
    if [[ "$CANONICAL" == "config/user-choices.json" ]]; then
        TEMP_CHOICES=$(mktemp)
        extract_user_choices "$FILE_PATH" "$TEMP_CHOICES" || exit 0
        FILE_PATH="$TEMP_CHOICES"
    fi

    # Cleanup function for combined trap (C4 fix: avoid overlapping traps)
    _cleanup_push() {
        release_lock 2>/dev/null
        [[ -n "$TEMP_CHOICES" ]] && rm -f "$TEMP_CHOICES" 2>/dev/null
    }

    # Primary backend push (debounced)
    if [[ "$PRIMARY_BACKEND" != "none" ]]; then
        if check_debounce "$PRIMARY_BACKEND"; then
            acquire_lock || exit 0
            trap "_cleanup_push" EXIT

            # M7: Ensure backup-schema.json exists at backup root
            if [[ -f "$SCHEMA_FILE" ]]; then
                push_to_backend "$PRIMARY_BACKEND" "$SCHEMA_FILE" "backup-schema.json" 2>/dev/null || true
            fi

            if push_to_backend "$PRIMARY_BACKEND" "$FILE_PATH" "$CANONICAL"; then
                update_debounce "$PRIMARY_BACKEND"
                log_msg "OK: Pushed $CANONICAL to $PRIMARY_BACKEND"

                # Write sync status for statusline
                echo "OK: Changes Synced" > "$CLAUDE_DIR/.sync-status"
            else
                log_msg "ERROR: Failed to push $CANONICAL to $PRIMARY_BACKEND"
                echo "ERR: Sync Failed" > "$CLAUDE_DIR/.sync-status"
            fi

            release_lock
            trap - EXIT
        fi
    fi

    # Secondary backend push (high-value only, best-effort, non-blocking)
    if [[ "$SECONDARY_BACKEND" != "none" && "$SECONDARY_BACKEND" != "" ]]; then
        if is_high_value "$CANONICAL"; then
            if check_debounce "$SECONDARY_BACKEND"; then
                (
                    push_to_backend "$SECONDARY_BACKEND" "$FILE_PATH" "$CANONICAL" 2>/dev/null &&
                    update_debounce "$SECONDARY_BACKEND" &&
                    log_msg "OK: Mirrored $CANONICAL to secondary ($SECONDARY_BACKEND)"
                ) &
            fi
        fi
    fi

    exit 0
fi

# ==============================================================
# PULL mode (called by session-start)
# ==============================================================
if [[ "$MODE" == "pull" ]]; then
    [[ "$PRIMARY_BACKEND" == "none" ]] && exit 0

    # Load schema for path mappings
    [[ ! -f "$SCHEMA_FILE" ]] && { log_msg "ERROR: Schema file not found"; exit 1; }

    export DRIVE_ROOT
    export BACKUP_REPO_URL="$PRIMARY_BACKEND_REPO"
    export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo"

    load_driver "$PRIMARY_BACKEND" || { log_msg "ERROR: Cannot load $PRIMARY_BACKEND driver"; exit 1; }

    # Check backend reachable
    if ! backup_check 2>/dev/null; then
        log_msg "WARN: Primary backend ($PRIMARY_BACKEND) unreachable — skipping pull"
        exit 0
    fi

    # Pull to temp directory first (D11: safe migration)
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf '$TEMP_DIR'" EXIT

    # Pull each category
    ERRORS=0
    backup_pull "memory/" "$TEMP_DIR/memory/" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "claude-md/CLAUDE.md" "$TEMP_DIR/claude-md/CLAUDE.md" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "config/" "$TEMP_DIR/config/" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "conversations/" "$TEMP_DIR/conversations/" 2>/dev/null || ERRORS=$((ERRORS+1))
    backup_pull "encyclopedia/" "$TEMP_DIR/encyclopedia/" 2>/dev/null || ERRORS=$((ERRORS+1))

    # Check for schema migration
    if [[ -f "$TEMP_DIR/backup-schema.json" ]]; then
        BACKUP_VERSION=$(node -e "const fs=require('fs');try{console.log(JSON.parse(fs.readFileSync('$TEMP_DIR/backup-schema.json','utf8')).schema_version)}catch(e){console.log(0)}" 2>/dev/null)
        CURRENT_VERSION=$(node -e "const fs=require('fs');try{console.log(JSON.parse(fs.readFileSync('$SCHEMA_FILE','utf8')).schema_version)}catch(e){console.log(1)}" 2>/dev/null)

        if [[ "$BACKUP_VERSION" -lt "$CURRENT_VERSION" ]]; then
            log_msg "Migrating backup schema v$BACKUP_VERSION → v$CURRENT_VERSION"
            V=$BACKUP_VERSION
            while [[ $V -lt $CURRENT_VERSION ]]; do
                NEXT=$((V+1))
                MIGRATION="$TOOLKIT_ROOT/core/migrations/v${V}-to-v${NEXT}.sh"
                if [[ -f "$MIGRATION" ]]; then
                    bash "$MIGRATION" "$TEMP_DIR" || {
                        log_msg "ERROR: Migration v${V}→v${NEXT} failed — aborting pull"
                        exit 1
                    }
                fi
                V=$NEXT
            done
        fi
    fi

    # Copy from temp to final local paths (never overwrite toolkit files)
    # Memory
    if [[ -d "$TEMP_DIR/memory" ]]; then
        for PROJECT_DIR in "$TEMP_DIR"/memory/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            LOCAL_MEM="$CLAUDE_DIR/projects/$PROJECT_KEY/memory"
            mkdir -p "$LOCAL_MEM"
            cp -R "$PROJECT_DIR"* "$LOCAL_MEM/" 2>/dev/null
        done
    fi

    # CLAUDE.md (only if not a fresh install — session-start pull shouldn't overwrite wizard output)
    # Pull mode overwrites; restore mode (Phase 5R) uses merge prompt instead
    if [[ -f "$TEMP_DIR/claude-md/CLAUDE.md" ]]; then
        cp "$TEMP_DIR/claude-md/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
    fi

    # Keybindings
    if [[ -f "$TEMP_DIR/config/keybindings.json" ]]; then
        cp "$TEMP_DIR/config/keybindings.json" "$CLAUDE_DIR/keybindings.json"
    fi

    # User-choice config merge
    if [[ -f "$TEMP_DIR/config/user-choices.json" && -f "$CONFIG_FILE" ]]; then
        node -e "
            const fs = require('fs');
            const choices = JSON.parse(fs.readFileSync('$TEMP_DIR/config/user-choices.json', 'utf8'));
            const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf8'));
            // Only merge keys that aren't already set locally
            for (const [k, v] of Object.entries(choices)) {
                if (config[k] === undefined || config[k] === null || config[k] === '') {
                    config[k] = v;
                }
            }
            fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        " 2>/dev/null
    fi

    # Conversations
    if [[ -d "$TEMP_DIR/conversations" ]]; then
        for PROJECT_DIR in "$TEMP_DIR"/conversations/*/; do
            [[ ! -d "$PROJECT_DIR" ]] && continue
            PROJECT_KEY=$(basename "$PROJECT_DIR")
            LOCAL_CONV="$CLAUDE_DIR/projects/$PROJECT_KEY"
            mkdir -p "$LOCAL_CONV"
            cp "$PROJECT_DIR"*.jsonl "$LOCAL_CONV/" 2>/dev/null
        done
    fi

    # Encyclopedia
    if [[ -d "$TEMP_DIR/encyclopedia" ]]; then
        mkdir -p "$CLAUDE_DIR/encyclopedia"
        cp "$TEMP_DIR"/encyclopedia/* "$CLAUDE_DIR/encyclopedia/" 2>/dev/null
    fi

    rm -rf "$TEMP_DIR"
    trap - EXIT

    if [[ $ERRORS -eq 0 ]]; then
        log_msg "OK: Pull from $PRIMARY_BACKEND completed"
    else
        log_msg "WARN: Pull from $PRIMARY_BACKEND completed with $ERRORS errors"
    fi

    exit 0
fi

# ==============================================================
# RESTORE mode (called by setup wizard Phase 5R or /restore)
# ==============================================================
if [[ "$MODE" == "restore" ]]; then
    # Restore mode outputs JSON instructions for the calling skill/command
    # to interpret. The actual interactive prompts (CLAUDE.md merge, custom
    # skill confirmation) are handled by the skill, not this script.

    [[ "$PRIMARY_BACKEND" == "none" ]] && {
        echo '{"status":"no_backend","message":"No backup backend configured"}'
        exit 0
    }

    export DRIVE_ROOT
    export BACKUP_REPO_URL="$PRIMARY_BACKEND_REPO"
    export BACKUP_REPO_DIR="$TOOLKIT_STATE/backup-repo"

    load_driver "$PRIMARY_BACKEND" || {
        echo '{"status":"error","message":"Cannot load backend driver"}'
        exit 1
    }

    if ! backup_check 2>/dev/null; then
        echo '{"status":"unreachable","message":"Backup backend is not reachable"}'
        exit 1
    fi

    # Pull everything to temp dir
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf '$TEMP_DIR'" EXIT

    backup_pull "" "$TEMP_DIR/" 2>/dev/null

    # Read schema and report what's available
    SCHEMA_VERSION=0
    [[ -f "$TEMP_DIR/backup-schema.json" ]] && \
        SCHEMA_VERSION=$(node -e "try{console.log(require('$TEMP_DIR/backup-schema.json').schema_version)}catch(e){console.log(0)}" 2>/dev/null)

    # Enumerate available data
    HAS_MEMORY=$([[ -d "$TEMP_DIR/memory" ]] && echo "true" || echo "false")
    HAS_CLAUDE_MD=$([[ -f "$TEMP_DIR/claude-md/CLAUDE.md" ]] && echo "true" || echo "false")
    HAS_KEYBINDINGS=$([[ -f "$TEMP_DIR/config/keybindings.json" ]] && echo "true" || echo "false")
    HAS_CONVERSATIONS=$([[ -d "$TEMP_DIR/conversations" ]] && echo "true" || echo "false")
    HAS_ENCYCLOPEDIA=$([[ -d "$TEMP_DIR/encyclopedia" ]] && echo "true" || echo "false")
    HAS_EXTENSIONS=$([[ -d "$TEMP_DIR/extensions/skills" ]] && echo "true" || echo "false")
    HAS_USER_CHOICES=$([[ -f "$TEMP_DIR/config/user-choices.json" ]] && echo "true" || echo "false")

    # List custom skills
    CUSTOM_SKILLS="[]"
    if [[ -d "$TEMP_DIR/extensions/skills" ]]; then
        CUSTOM_SKILLS=$(node -e "
            const fs = require('fs');
            const dirs = fs.readdirSync('$TEMP_DIR/extensions/skills').filter(d =>
                fs.statSync('$TEMP_DIR/extensions/skills/' + d).isDirectory());
            console.log(JSON.stringify(dirs));
        " 2>/dev/null)
    fi

    # Output inventory as JSON for the calling skill to interpret
    echo "{
        \"status\": \"ok\",
        \"temp_dir\": \"$TEMP_DIR\",
        \"schema_version\": $SCHEMA_VERSION,
        \"available\": {
            \"memory\": $HAS_MEMORY,
            \"claude_md\": $HAS_CLAUDE_MD,
            \"keybindings\": $HAS_KEYBINDINGS,
            \"conversations\": $HAS_CONVERSATIONS,
            \"encyclopedia\": $HAS_ENCYCLOPEDIA,
            \"extensions\": $HAS_EXTENSIONS,
            \"user_choices\": $HAS_USER_CHOICES
        },
        \"custom_skills\": $CUSTOM_SKILLS
    }"

    # NOTE: Don't clean up temp_dir here — the calling skill needs it.
    # The skill is responsible for cleanup after interactive restore.
    trap - EXIT
    exit 0
fi
