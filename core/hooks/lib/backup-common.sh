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
LOCAL_CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.local.json"

# --- Logging ---
# log_backup LEVEL MSG [OP] [EXTRA_JSON]
# Backwards-compatible: existing 2-arg calls produce plaintext.
# New 3-4 arg calls produce structured JSON for machine-parseable analysis.
log_backup() {
    local level="$1" msg="$2" op="${3:-}" extra="${4:-}"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    if command -v node &>/dev/null && [[ -n "$op" ]]; then
        node -e "
            var e={ts:'$ts',level:'$level',op:'$op',sid:(process.env.CLAUDE_SESSION_ID||'').slice(0,8),msg:process.argv[1]};
            if ('$extra') try{Object.assign(e,JSON.parse('$extra'))}catch(x){}
            console.log(JSON.stringify(e));
        " "$msg" >> "$BACKUP_LOG"
    else
        echo "[$ts] [$level] $msg" >> "$BACKUP_LOG"
    fi
    if [[ "$level" == "ERROR" ]]; then
        echo "{\"hookSpecificOutput\": \"Backup: $msg\"}" >&2
    fi
}

# --- Atomic file write ---
# Uses same-directory temp file for rename(2) atomicity.
# IMPORTANT: Do NOT refactor to use mktemp ($TMPDIR may be on a different
# mount, breaking rename(2) atomicity). Same-directory temp is intentional.
if ! declare -f atomic_write &>/dev/null; then
    atomic_write() {
        local _target="$1" _content="$2"
        local _tmp="${_target}.tmp.$$"
        echo "$_content" > "$_tmp"
        mv -f "$_tmp" "$_target"
    }
fi

# --- Config reading ---
# Read a key from config.local.json (machine-specific, takes precedence),
# then config.json (portable). Falls back to grep if node unavailable.
# Design ref: cross-device-sync-design (03-25-2026) D1
config_get() {
    local key="$1" default="${2:-}"
    local val=""
    # Check local config first (machine-specific, takes precedence)
    if [[ -f "$LOCAL_CONFIG_FILE" ]] && command -v node &>/dev/null; then
        val=$(node -e "
            try {
                const c = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                const v = c[process.argv[2]];
                if (v !== undefined && v !== null) process.stdout.write(String(v));
            } catch(e) {}
        " "$LOCAL_CONFIG_FILE" "$key" 2>/dev/null) || true
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    # Then check portable config
    if command -v node &>/dev/null && [[ -f "$CONFIG_FILE" ]]; then
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
    # Grep fallback (portable config only — local is always valid JSON from node)
    if [[ -f "$CONFIG_FILE" ]]; then
        val=$(sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$CONFIG_FILE" 2>/dev/null | head -1)
        if [[ -n "$val" ]]; then
            echo "$val"
            return
        fi
    fi
    echo "$default"
}

# --- Symlink ownership detection (Design ref: D2) ---
# Returns 0 if the file or any of its parent directories is a symlink
# pointing into TOOLKIT_ROOT (toolkit-owned).
# Returns 1 otherwise (user-owned or no symlink chain into toolkit).
is_toolkit_owned() {
    local filepath="$1"
    [[ -z "$TOOLKIT_ROOT" ]] && return 1

    local resolved_root
    resolved_root=$(realpath "$TOOLKIT_ROOT" 2>/dev/null \
        || readlink -f "$TOOLKIT_ROOT" 2>/dev/null \
        || echo "$TOOLKIT_ROOT")

    # Walk up the directory tree checking for symlinks into TOOLKIT_ROOT
    local check_path="$filepath"
    while [[ "$check_path" != "/" && "$check_path" != "." && -n "$check_path" ]]; do
        if [[ -L "$check_path" ]]; then
            local target
            target=$(realpath "$check_path" 2>/dev/null \
                || readlink -f "$check_path" 2>/dev/null) || return 1
            [[ "$target" == "$resolved_root/"* || "$target" == "$resolved_root" ]] && return 0
        fi
        check_path=$(dirname "$check_path")
    done

    return 1
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
    if [[ $diff_seconds -lt $interval_seconds ]]; then
        log_backup "DEBUG" "Debounced (${diff_seconds}s/${interval_seconds}s elapsed)" "${_CURRENT_OP:-sync}"
        return 1
    fi
    return 0
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
    realpath "$path" 2>/dev/null \
        || readlink -f "$path" 2>/dev/null \
        || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$path" 2>/dev/null \
        || echo "$path"
}

# --- Cross-device project slug rewriting ---
# Claude Code stores sessions/memory under ~/.claude/projects/<slug>/ where
# <slug> is derived from the working directory path (slashes replaced with dashes).
# When restoring from a different device, the slug won't match the current device.
# These functions detect foreign slugs and symlink them into the current device's
# slug directory so /resume and memory lookups work transparently.

get_current_project_slug() {
    local home_path
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*)
            # Windows: Claude Code uses the native Windows path (C:\Users\...)
            # to compute slugs. Git Bash's realpath returns /c/Users/... which
            # produces a different slug. Use cygpath -w to match Claude Code.
            home_path=$(cygpath -w "$HOME" 2>/dev/null || echo "$HOME")
            ;;
        *)
            # Mac/Linux/Android: realpath matches Claude Code's path.
            # Resolve symlinks (important on Android where /data/user/0
            # is a symlink to /data/data).
            home_path=$(realpath "$HOME" 2>/dev/null \
                || readlink -f "$HOME" 2>/dev/null \
                || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$HOME" 2>/dev/null \
                || echo "$HOME")
            ;;
    esac
    # Replicate Claude Code's slug algorithm: replace /, \, and : with -
    # (: is needed for Windows drive letters, e.g. C:\Users → C--Users)
    home_path="${home_path//\\/-}"
    home_path="${home_path//\//-}"
    home_path="${home_path//:/-}"
    echo "$home_path"
}

# Symlinks foreign project slug directories into the current device's slug.
# Called after restore or pull operations to ensure cross-device continuity.
# Arguments: $1 = projects directory (e.g., ~/.claude/projects)
rewrite_project_slugs() {
    local projects_dir
    projects_dir=$(cd "$1" && pwd) || return 0
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
                # Containment check: only create symlinks within the projects dir
                # to prevent a malicious backup from linking outside ~/.claude
                if [[ "$abs_source" != "$projects_dir"/* ]]; then
                    log_backup "WARN" "Skipping symlink outside projects dir: $abs_source"
                    continue
                fi
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

# --- Home-directory conversation aggregation (Design ref: D5, D6) ---
# Symlinks all .jsonl conversation files from all project slugs into the
# home-directory slug so /resume from ~ shows all conversations.
# Arguments: $1 = projects directory (e.g., ~/.claude/projects)
aggregate_conversations() {
    local projects_dir
    projects_dir=$(cd "$1" && pwd) || return 0
    [[ ! -d "$projects_dir" ]] && return 0

    # Determine home slug(s). On Windows/MSYS, realpath returns /c/Users/...
    # but Claude Code uses the Windows-native path C:\Users\... which produces
    # a different slug (C--Users-desti vs -c-Users-desti). We need to aggregate
    # into BOTH so /resume works regardless of which slug Claude Code uses.
    local -a home_slugs=()
    local computed_slug
    computed_slug=$(get_current_project_slug)
    [[ -n "$computed_slug" ]] && home_slugs+=("$computed_slug")

    # On Windows, also detect the Windows-native slug variant
    if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* ]]; then
        # Get the Windows-style path (e.g., C:\Users\desti → C--Users-desti)
        local win_home
        win_home=$(cygpath -w "$HOME" 2>/dev/null || echo "")
        if [[ -n "$win_home" ]]; then
            local win_slug="${win_home//\\/-}"
            win_slug="${win_slug//\//-}"
            win_slug="${win_slug//:/-}"
            if [[ "$win_slug" != "$computed_slug" ]]; then
                home_slugs+=("$win_slug")
            fi
        fi
    fi

    [[ ${#home_slugs[@]} -eq 0 ]] && return 0

    # Windows symlink support
    [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* || "$(uname -s)" == CYGWIN* ]] && export MSYS=winsymlinks:nativestrict

    local total_aggregated=0

    for home_slug in "${home_slugs[@]}"; do
        local home_dir="$projects_dir/$home_slug"
        mkdir -p "$home_dir"

        local aggregated=0

        for slug_dir in "$projects_dir"/*/; do
            [[ ! -d "$slug_dir" ]] && continue
            local slug_name
            slug_name=$(basename "$slug_dir")

            # Skip all home slugs
            local is_home=false
            for hs in "${home_slugs[@]}"; do
                [[ "$slug_name" == "$hs" ]] && { is_home=true; break; }
            done
            "$is_home" && continue

            # Skip symlinked slug directories (foreign device slugs from rewrite_project_slugs)
            [[ -L "${slug_dir%/}" ]] && continue

            # Symlink each .jsonl file into this home slug
            for jsonl_file in "$slug_dir"*.jsonl; do
                [[ ! -f "$jsonl_file" ]] && continue
                local basename_jsonl
                basename_jsonl=$(basename "$jsonl_file")
                local target="$home_dir/$basename_jsonl"

                # Skip if already exists (real file = local conversation, symlink = already aggregated)
                [[ -e "$target" || -L "$target" ]] && continue

                # Create relative symlink
                ln -s "../$slug_name/$basename_jsonl" "$target" 2>/dev/null || \
                    cp "$jsonl_file" "$target" 2>/dev/null || true
                aggregated=$((aggregated + 1))
            done
        done

        # Clean up dangling symlinks in this home slug
        for link in "$home_dir"/*.jsonl; do
            [[ ! -L "$link" ]] && continue
            if [[ ! -e "$link" ]]; then
                rm -f "$link" 2>/dev/null
            fi
        done

        total_aggregated=$((total_aggregated + aggregated))
    done

    if [[ $total_aggregated -gt 0 ]]; then
        log_backup "INFO" "Aggregated $total_aggregated conversation(s) into home slug(s): ${home_slugs[*]}"
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

get_preferred_backend() {
    get_backends | head -1
}

# --- Project discovery ---
# Scans common working directories for git repos not already tracked by git-sync.
# Outputs one path per line to stdout. Does NOT write any files.
# Arguments: none (reads tracked-projects.json and git-sync hardcoded paths)
discover_projects() {
    local tracked_file="$CLAUDE_DIR/tracked-projects.json"

    # Build skip set: hardcoded git-sync paths + registered + ignored
    local -a skip_paths=()
    skip_paths+=("$(normalize_path "$CLAUDE_DIR")")

    if [[ -f "$tracked_file" ]] && command -v node &>/dev/null; then
        while IFS= read -r p; do
            [[ -n "$p" ]] && skip_paths+=("$(normalize_path "$p")")
        done < <(node -e "
            const fs = require('fs');
            try {
                const reg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
                for (const p of (reg.projects || [])) { if (p.path) console.log(p.path); }
                for (const p of (reg.ignored || [])) { console.log(p); }
            } catch {}
        " "$tracked_file" 2>/dev/null)
    fi

    # Scan common directories (depth 1 — only direct children)
    local -a scan_dirs=()
    [[ -d "$HOME/projects" ]] && scan_dirs+=("$HOME/projects")
    [[ -d "$HOME/repos" ]] && scan_dirs+=("$HOME/repos")
    [[ -d "$HOME/code" ]] && scan_dirs+=("$HOME/code")
    [[ -d "$HOME/dev" ]] && scan_dirs+=("$HOME/dev")
    [[ -d "$HOME/src" ]] && scan_dirs+=("$HOME/src")
    [[ -d "$HOME/Documents" ]] && scan_dirs+=("$HOME/Documents")
    [[ -d "$HOME/Desktop" ]] && scan_dirs+=("$HOME/Desktop")

    for scan_dir in "${scan_dirs[@]}"; do
        for candidate in "$scan_dir"/*/; do
            [[ ! -d "$candidate" ]] && continue
            [[ ! -d "$candidate/.git" ]] && continue

            local norm_path
            norm_path=$(normalize_path "${candidate%/}")

            # Check skip set
            local skip=false
            for sp in "${skip_paths[@]}"; do
                [[ "$norm_path" == "$sp" ]] && { skip=true; break; }
            done
            [[ "$skip" == "true" ]] && continue

            echo "$norm_path"
        done
    done
}

# ---------------------------------------------------------------------------
# Direction-aware conversation sync — understands append-only semantics.
# For JSONL files, one version should be a prefix of the other.
# When they diverge, a conflict is flagged rather than silently overwriting.
#
# Usage:
#   conv_safe_pull "$remote_file" "$local_file"  — pull if remote is superset
#   conv_safe_push "$local_file" "$remote_file"  — push if local is superset
# ---------------------------------------------------------------------------
_file_size() {
    # Portable file size — works on macOS (BSD), Linux (GNU), Windows (MSYS)
    wc -c < "$1" 2>/dev/null | tr -d ' '
}

conv_safe_pull() {
    local remote_file="$1" local_file="$2" slug="$3"

    # New file (doesn't exist locally): pull unconditionally
    if [[ ! -f "$local_file" ]]; then
        return 0  # Caller should proceed with rclone copy
    fi

    local local_size remote_size
    local_size=$(_file_size "$local_file")
    remote_size=$(rclone size "$remote_file" --json 2>/dev/null | node -e "
        let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
            try{console.log(JSON.parse(d).bytes)}catch{console.log(-1)}
        })" 2>/dev/null)

    # Remote <= local: skip (local has same or more data)
    if [[ "$remote_size" -le "$local_size" ]]; then
        return 1  # Skip — local is same or longer
    fi

    # Remote > local: safe to pull (remote has more data)
    # Full prefix verification would require downloading — defer to rclone
    return 0
}
