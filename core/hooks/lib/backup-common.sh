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
