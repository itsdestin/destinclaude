#!/usr/bin/env bash
# backup-common.sh — Shared utilities for backup hooks
# Sourced by git-sync.sh, personal-sync.sh, session-start.sh
# Design ref: backup-system-refactor-design (03-22-2026).md D1

# NOTE: Do not set shell options (set -euo pipefail) in sourced libraries.
# All callers already set these. Changing them here would affect the caller's
# error handling if they ever diverge.

# --- Constants ---
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
TOOLKIT_ROOT="${TOOLKIT_ROOT:-}"
BACKUP_LOG="$CLAUDE_DIR/backup.log"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"

# --- Logging ---
log_backup() {
    local level="$1" msg="$2"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] [$level] $msg" >> "$BACKUP_LOG"
    if [[ "$level" == "ERROR" ]]; then
        echo "{\"hookSpecificOutput\": \"Backup: $msg\"}" >&2
    fi
}

# --- Config reading ---
# Read a key from config.json. Falls back to grep if node unavailable.
config_get() {
    local key="$1" default="${2:-}"
    if command -v node &>/dev/null && [[ -f "$CONFIG_FILE" ]]; then
        local val
        val=$(node -e "
            try {
                const c = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                const v = c[process.argv[2]];
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " "$CONFIG_FILE" "$key" 2>/dev/null) || true
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    # Grep fallback
    if [[ -f "$CONFIG_FILE" ]]; then
        sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$CONFIG_FILE" 2>/dev/null | head -1 || echo "$default"
    else
        echo "$default"
    fi
}

# --- Symlink ownership detection (Design ref: D2) ---
# Returns 0 if the file is a symlink pointing into TOOLKIT_ROOT (toolkit-owned).
# Returns 1 otherwise (user-owned or not a symlink).
is_toolkit_owned() {
    local filepath="$1"
    [[ -z "$TOOLKIT_ROOT" ]] && return 1
    [[ ! -L "$filepath" ]] && return 1
    local target
    target=$(realpath "$filepath" 2>/dev/null || readlink -f "$filepath" 2>/dev/null || readlink "$filepath" 2>/dev/null) || return 1
    local resolved_root
    resolved_root=$(realpath "$TOOLKIT_ROOT" 2>/dev/null || readlink -f "$TOOLKIT_ROOT" 2>/dev/null || echo "$TOOLKIT_ROOT") || return 1
    [[ "$target" == "$resolved_root/"* || "$target" == "$resolved_root" ]]
}

# --- Debounce ---
# Returns 0 if enough time has passed since last marker update (should proceed).
# Returns 1 if debounce period has not elapsed (should skip).
debounce_check() {
    local marker_file="$1" interval_minutes="${2:-15}"
    if [[ ! -f "$marker_file" ]]; then
        return 0
    fi
    local last_sync now diff_seconds interval_seconds
    last_sync=$(cat "$marker_file" 2>/dev/null) || return 0
    [[ "$last_sync" =~ ^[0-9]+$ ]] || return 0
    now=$(date +%s)
    diff_seconds=$((now - last_sync))
    interval_seconds=$((interval_minutes * 60))
    [[ $diff_seconds -ge $interval_seconds ]]
}

# Update debounce marker with current epoch timestamp.
debounce_touch() {
    local marker_file="$1"
    mkdir -p "$(dirname "$marker_file")"
    date +%s > "$marker_file"
}

# --- Path normalization ---
normalize_path() {
    local path="$1"
    path="${path//\\//}"
    if command -v realpath &>/dev/null; then
        realpath "$path" 2>/dev/null || echo "$path"
    elif command -v readlink &>/dev/null; then
        readlink -f "$path" 2>/dev/null || echo "$path"
    else
        echo "$path"
    fi
}

# --- Cross-device project slug rewriting ---
# Claude Code stores sessions/memory under ~/.claude/projects/<slug>/ where
# <slug> is derived from the working directory path (slashes replaced with dashes).
# When restoring from a different device, the slug won't match the current device.
# These functions detect foreign slugs and symlink them into the current device's
# slug directory so /resume and memory lookups work transparently.

get_current_project_slug() {
    local home_path
    # Resolve symlinks to get the canonical path (important on Android where
    # /data/user/0 is a symlink to /data/data)
    home_path=$(realpath "$HOME" 2>/dev/null || readlink -f "$HOME" 2>/dev/null || echo "$HOME")
    # Replicate Claude Code's slug algorithm: replace / and \ with -
    home_path="${home_path//\\/-}"
    home_path="${home_path//\//-}"
    echo "$home_path"
}

# Symlinks foreign project slug directories into the current device's slug.
# Called after restore or pull operations to ensure cross-device continuity.
# Arguments: $1 = projects directory (e.g., ~/.claude/projects)
rewrite_project_slugs() {
    local projects_dir="$1"
    [[ ! -d "$projects_dir" ]] && return 0

    local current_slug
    current_slug=$(get_current_project_slug)
    [[ -z "$current_slug" ]] && return 0

    # Ensure current slug directory exists
    mkdir -p "$projects_dir/$current_slug"

    local foreign_count=0
    for slug_dir in "$projects_dir"/*/; do
        [[ ! -d "$slug_dir" ]] && continue
        local slug_name
        slug_name=$(basename "$slug_dir")

        # Skip the current device's slug
        [[ "$slug_name" == "$current_slug" ]] && continue

        # Skip already-symlinked directories (previous rewrite)
        [[ -L "${slug_dir%/}" ]] && continue

        # This is a foreign slug — symlink its subdirectories (memory/, etc.)
        # into the current slug. Symlinks avoid data duplication and keep
        # edits propagating to the original files.
        for subdir in "$slug_dir"*/; do
            [[ ! -d "$subdir" ]] && continue
            local subname
            subname=$(basename "$subdir")
            local target="$projects_dir/$current_slug/$subname"

            if [[ ! -e "$target" ]]; then
                # No local version — symlink the whole subdirectory
                local abs_source
                abs_source=$(cd "$subdir" && pwd)
                ln -sf "$abs_source" "$target" 2>/dev/null || \
                    cp -r "$subdir" "$target" 2>/dev/null || true
            fi
            # If local version exists, don't overwrite — user may have newer data
        done

        foreign_count=$((foreign_count + 1))
    done

    if [[ $foreign_count -gt 0 ]]; then
        log_backup "INFO" "Mapped $foreign_count foreign project slug(s) to current device slug: $current_slug"
    fi
}

# --- Multi-backend helpers ---
get_backends() {
    local backends
    backends=$(config_get "PERSONAL_SYNC_BACKEND" "")
    if [[ -z "$backends" ]]; then
        echo ""
        return
    fi
    echo "$backends" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$'
}

get_primary_backend() {
    get_backends | head -1
}
