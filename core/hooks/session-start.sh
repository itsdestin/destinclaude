#!/bin/bash
# SessionStart hook: pull latest from Git, sync personal data, sync encyclopedia cache, extract MCP config, check inbox
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
# Clean up session-scoped detection markers from previous sessions
rm -f "$CLAUDE_DIR"/.unsynced-warned-* 2>/dev/null
ENCYCLOPEDIA_DIR="$CLAUDE_DIR/encyclopedia"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"
MCP_CONFIG="$CLAUDE_DIR/mcp-servers/mcp-config.json"
SYNC_STATUS_FILE="$CLAUDE_DIR/toolkit-state/.session-sync-status"
SYNC_DEBOUNCE_MARKER="$CLAUDE_DIR/toolkit-state/.session-sync-marker"
SYNC_DEBOUNCE_MINUTES=10
CLAUDE_JSON="$HOME/.claude.json"
# Source shared backup utilities
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
fi
# Source migration runner
if [[ -f "$HOOK_DIR/lib/migrate.sh" ]]; then
    source "$HOOK_DIR/lib/migrate.sh"
fi

# --- Resolve TOOLKIT_ROOT once (used by auto-refresh, version check, announcements) ---
TOOLKIT_ROOT=""
if command -v node &>/dev/null && [[ -f "$CONFIG_FILE" ]]; then
    TOOLKIT_ROOT=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" "$CONFIG_FILE" 2>/dev/null) || TOOLKIT_ROOT=""
fi
# Fallback: walk up from this script's real path to find VERSION file
if [[ -z "$TOOLKIT_ROOT" || ! -f "$TOOLKIT_ROOT/VERSION" ]]; then
    TOOLKIT_ROOT=""
    _REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
    SEARCH_DIR="$(cd "$(dirname "$_REAL")" && pwd)"
    for _ in 1 2 3 4 5; do
        if [[ -f "$SEARCH_DIR/VERSION" ]]; then
            TOOLKIT_ROOT="$SEARCH_DIR"
            break
        fi
        SEARCH_DIR="$(dirname "$SEARCH_DIR")"
    done
fi
# Auto-create config.json if toolkit was found via fallback (self-healing)
if [[ -n "$TOOLKIT_ROOT" && -f "$TOOLKIT_ROOT/VERSION" && ! -f "$CONFIG_FILE" ]]; then
    mkdir -p "$(dirname "$CONFIG_FILE")"
    echo "{\"toolkit_root\": \"$TOOLKIT_ROOT\"}" > "$CONFIG_FILE"
fi

# --- Rebuild machine-specific config (Design ref: cross-device-sync D1) ---
# Detects platform, toolkit root, and binary availability.
# Writes config.local.json — never synced, rebuilt every session start.
rebuild_local_config() {
    local local_config="$CLAUDE_DIR/toolkit-state/config.local.json"

    # Detect platform
    local platform="linux"
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) platform="windows" ;;
        Darwin) platform="macos" ;;
        Linux)
            if [[ -d "/data/data/com.termux" || -d "/data/data/com.destin.code" ]]; then
                platform="android"
            fi
            ;;
    esac

    # toolkit_root already resolved above
    local tk_root="${TOOLKIT_ROOT:-}"

    # Detect gmessages binary
    local gmessages_bin=""
    if command -v gmessages &>/dev/null; then
        gmessages_bin=$(command -v gmessages)
    elif [[ -f "$CLAUDE_DIR/mcp-servers/gmessages/gmessages.exe" ]]; then
        gmessages_bin="$CLAUDE_DIR/mcp-servers/gmessages/gmessages.exe"
    elif [[ -f "$CLAUDE_DIR/mcp-servers/gmessages/gmessages" ]]; then
        gmessages_bin="$CLAUDE_DIR/mcp-servers/gmessages/gmessages"
    fi

    # Detect gcloud
    local gcloud_installed=false
    command -v gcloud &>/dev/null && gcloud_installed=true

    # Write config.local.json
    mkdir -p "$CLAUDE_DIR/toolkit-state"
    if command -v node &>/dev/null; then
        node -e "
            const fs = require('fs');
            const data = {
                platform: process.argv[1],
                toolkit_root: process.argv[2] || null,
                gmessages_binary: process.argv[3] || null,
                gcloud_installed: process.argv[4] === 'true'
            };
            fs.writeFileSync(process.argv[5], JSON.stringify(data, null, 2) + '\n');
        " "$platform" "$tk_root" "$gmessages_bin" "$gcloud_installed" "$local_config" 2>/dev/null
    else
        cat > "$local_config" << LOCALEOF
{
  "platform": "$platform",
  "toolkit_root": ${tk_root:+\"$tk_root\"}${tk_root:-null},
  "gmessages_binary": ${gmessages_bin:+\"$gmessages_bin\"}${gmessages_bin:-null},
  "gcloud_installed": $gcloud_installed
}
LOCALEOF
    fi
}
rebuild_local_config

# --- One-time migration: strip machine-specific keys from config.json ---
# If config.json still has machine-specific keys, remove them so only portable
# data remains. config.local.json now owns these. Also push cleaned config
# to preferred backend so next pull doesn't re-introduce stale values.
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    _CLEANED=$(node -e "
        const fs = require('fs');
        const path = process.argv[1];
        try {
            const c = JSON.parse(fs.readFileSync(path, 'utf8'));
            const localKeys = ['platform', 'toolkit_root', 'gmessages_binary', 'gcloud_installed'];
            let changed = false;
            for (const k of localKeys) {
                if (k in c) { delete c[k]; changed = true; }
            }
            if (changed) {
                fs.writeFileSync(path, JSON.stringify(c, null, 2) + '\n');
                console.log('cleaned');
            }
        } catch {}
    " "$CONFIG_FILE" 2>/dev/null) || true
    # If we cleaned, push to preferred backend so next pull doesn't re-introduce stale keys
    if [[ "$_CLEANED" == "cleaned" ]]; then
        _MIG_BACKEND=""
        type get_preferred_backend &>/dev/null && _MIG_BACKEND=$(get_preferred_backend)
        case "$_MIG_BACKEND" in
            drive)
                if command -v rclone &>/dev/null; then
                    _DR=$(config_get "DRIVE_ROOT" "Claude")
                    rclone copyto "$CONFIG_FILE" "gdrive:$_DR/Backup/personal/toolkit-state/config.json" 2>/dev/null || true
                fi
                ;;
            github)
                _MIG_REPO="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
                if [[ -d "$_MIG_REPO/.git" ]]; then
                    mkdir -p "$_MIG_REPO/toolkit-state"
                    cp "$CONFIG_FILE" "$_MIG_REPO/toolkit-state/config.json" 2>/dev/null || true
                fi
                ;;
            icloud)
                _MIG_ICLOUD=$(config_get "ICLOUD_PATH" "")
                if [[ -n "$_MIG_ICLOUD" && -d "$_MIG_ICLOUD" ]]; then
                    mkdir -p "$_MIG_ICLOUD/toolkit-state"
                    cp "$CONFIG_FILE" "$_MIG_ICLOUD/toolkit-state/config.json" 2>/dev/null || true
                fi
                ;;
        esac
    fi
fi

# --- Read DRIVE_ROOT from config (used for encyclopedia sync and backup paths) ---
DRIVE_ROOT="Claude"
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    _DR=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.DRIVE_ROOT)console.log(c.DRIVE_ROOT)}catch{}" "$CONFIG_FILE" 2>/dev/null)
    [[ -n "$_DR" ]] && DRIVE_ROOT="$_DR"
fi

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
            # Note: mcp-config.json is machine-specific (contains absolute paths,
            # platform-specific servers). NOT git-committed. See cross-device-sync design D2.
        fi
    fi
fi

# --- Toolkit integrity check (Design ref: D8) ---
# Verify toolkit repo exists and is complete. If broken, offer to fix.
if [[ -n "$TOOLKIT_ROOT" ]]; then
    _INTEGRITY_OK=true
    _INTEGRITY_MSG=""

    [[ ! -d "$TOOLKIT_ROOT" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit directory missing: $TOOLKIT_ROOT"; }
    [[ "$_INTEGRITY_OK" == true && ! -d "$TOOLKIT_ROOT/.git" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit .git directory missing"; }
    [[ "$_INTEGRITY_OK" == true && ! -f "$TOOLKIT_ROOT/VERSION" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit VERSION file missing"; }
    [[ "$_INTEGRITY_OK" == true && ! -f "$TOOLKIT_ROOT/plugin.json" ]] && { _INTEGRITY_OK=false; _INTEGRITY_MSG="Toolkit plugin.json missing"; }

    if [[ "$_INTEGRITY_OK" == false ]]; then
        echo "{\"hookSpecificOutput\": \"Toolkit integrity check failed: $_INTEGRITY_MSG. Run /setup-wizard to repair, or run: git clone https://github.com/itsdestin/destinclaude.git \\\"$TOOLKIT_ROOT\\\" to restore the toolkit repo.\"}" >&2
    fi
fi

# --- Auto-repair legacy copies to symlinks (Design ref: D3) ---
# Pre-v1.3.1 installs used file copies. Replace identical copies with symlinks.
# Modified copies are warned about but NOT replaced (non-destructive mandate).
if [[ -n "$TOOLKIT_ROOT" && -d "$TOOLKIT_ROOT/core/hooks" ]]; then
    [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]] && export MSYS=winsymlinks:nativestrict

    _REPAIRED=""
    _MODIFIED=""

    # Check all expected toolkit hook files
    for _hook in check-inbox.sh checklist-reminder.sh contribution-detector.sh done-sound.sh git-sync.sh personal-sync.sh session-start.sh title-update.sh todo-capture.sh tool-router.sh worktree-guard.sh write-guard.sh; do
        _installed="$CLAUDE_DIR/hooks/$_hook"
        _source="$TOOLKIT_ROOT/core/hooks/$_hook"
        if [[ -f "$_installed" && ! -L "$_installed" && -f "$_source" ]]; then
            # Diff before replacing (Design ref: D3 safety check)
            if diff -q "$_installed" "$_source" >/dev/null 2>&1; then
                ln -sf "$_source" "$_installed" 2>/dev/null && _REPAIRED="$_REPAIRED $_hook"
            else
                _MODIFIED="$_MODIFIED $_hook"
            fi
        fi
    done

    # Check statusline
    if [[ -f "$CLAUDE_DIR/statusline.sh" && ! -L "$CLAUDE_DIR/statusline.sh" && -f "$TOOLKIT_ROOT/core/hooks/statusline.sh" ]]; then
        if diff -q "$CLAUDE_DIR/statusline.sh" "$TOOLKIT_ROOT/core/hooks/statusline.sh" >/dev/null 2>&1; then
            ln -sf "$TOOLKIT_ROOT/core/hooks/statusline.sh" "$CLAUDE_DIR/statusline.sh" 2>/dev/null && _REPAIRED="$_REPAIRED statusline.sh"
        else
            _MODIFIED="$_MODIFIED statusline.sh"
        fi
    fi

    # Check skills
    for _skill_link in "$CLAUDE_DIR/skills"/*/; do
        [[ ! -d "$_skill_link" ]] && continue
        _skill_name=$(basename "$_skill_link")
        if [[ ! -L "${_skill_link%/}" ]]; then
            # Find matching source in toolkit layers
            for _layer in core life productivity; do
                _skill_source="$TOOLKIT_ROOT/$_layer/skills/$_skill_name"
                if [[ -d "$_skill_source" ]]; then
                    if diff -rq "${_skill_link%/}" "$_skill_source" >/dev/null 2>&1; then
                        rm -rf "${_skill_link%/}"
                        ln -sf "$_skill_source" "${_skill_link%/}" 2>/dev/null && _REPAIRED="$_REPAIRED skill:$_skill_name"
                    else
                        _MODIFIED="$_MODIFIED skill:$_skill_name"
                    fi
                    break
                fi
            done
        fi
    done

    [[ -n "$_REPAIRED" ]] && echo "{\"hookSpecificOutput\": \"Auto-repaired copy-based files to symlinks:$_REPAIRED\"}" >&2
    [[ -n "$_MODIFIED" ]] && echo "{\"hookSpecificOutput\": \"Found modified copies (not auto-repaired, run /health to review):$_MODIFIED\"}" >&2
fi

# --- Encyclopedia cache sync ---
# Handled by personal data pull (Phase 2) from Backup/personal/encyclopedia/.
# Previously had a standalone sync here using ENCYCLOPEDIA_DRIVE_PATH config,
# but the default path ("The Journal/System") doesn't exist for most users,
# causing rclone to retry 3x (~20s wasted). Deduplicated per optimization design D3.
mkdir -p "$ENCYCLOPEDIA_DIR"

# ===========================================================================
# Phase 2: Background network sync function
# Design ref: session-start-optimization-design D1, D2
# All network operations are grouped here and run in a single background
# process. Independent operations launch in parallel; sequential post-pull
# operations (slug rewriting, aggregation, migrations) run after all
# parallel work completes.
# ===========================================================================
_session_sync_background() {
    # Signal that sync is in progress
    echo "syncing $(date +%s)" > "$SYNC_STATUS_FILE" 2>/dev/null

    # Sync errors file — parallel sub-functions write failure warnings here.
    # _bg_sync_health merges these into .sync-warnings after all parallel work completes.
    local SYNC_ERRORS_FILE="$CLAUDE_DIR/toolkit-state/.session-sync-errors"
    > "$SYNC_ERRORS_FILE" 2>/dev/null

    # --- Sub-function: Git pull (cross-device sync) ---
    _bg_git_pull() {
        cd "$CLAUDE_DIR"
        if git remote get-url origin &>/dev/null; then
            _GIT_DEFAULT=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||') || true
            [[ -z "$_GIT_DEFAULT" ]] && _GIT_DEFAULT="main"
            if ! git pull --rebase origin "$_GIT_DEFAULT" 2>/dev/null; then
                git rebase --abort 2>/dev/null || true
                log_backup "WARN" "Git pull failed on session start. Working with local state."
                echo "GIT:PULL_FAILED" >> "$SYNC_ERRORS_FILE"
            fi
        fi
    }

    # --- Sub-function: Personal data pull (Design ref: D6) ---
    _bg_personal_data_pull() {
        local _PULL_BACKEND=""
        if type get_preferred_backend &>/dev/null; then
            _PULL_BACKEND=$(get_preferred_backend)
        fi

        if [[ -n "$_PULL_BACKEND" ]]; then
            case "$_PULL_BACKEND" in
                drive)
                    local _DR
                    _DR=$(config_get "DRIVE_ROOT" "Claude")
                    local DRIVE_SOURCE="gdrive:$_DR/Backup/personal"
                    if command -v rclone &>/dev/null; then
                        local _drive_pull_ok=true
                        # Memory files — iterate per project key so files land in
                        # projects/{key}/memory/ (not at the project root).
                        # Uses rclone copy, NOT sync — sync deletes local files
                        # like conversation .jsonl that don't exist on the remote.
                        while IFS= read -r _mem_key; do
                            _mem_key="${_mem_key%/}"
                            [[ -z "$_mem_key" ]] && continue
                            mkdir -p "$CLAUDE_DIR/projects/$_mem_key/memory"
                            rclone copy "$DRIVE_SOURCE/memory/$_mem_key/" \
                                "$CLAUDE_DIR/projects/$_mem_key/memory/" \
                                --update --exclude '.DS_Store' 2>/dev/null || {
                                log_backup "WARN" "Drive pull (memory/$_mem_key) failed"
                                _drive_pull_ok=false
                            }
                        done < <(rclone lsf "$DRIVE_SOURCE/memory/" --dirs-only 2>/dev/null)

                        # Parallel rclone calls for independent data categories
                        rclone copy "$DRIVE_SOURCE/CLAUDE.md" "$CLAUDE_DIR/" \
                            --update 2>/dev/null &
                        rclone copy "$DRIVE_SOURCE/toolkit-state/config.json" "$CLAUDE_DIR/toolkit-state/" \
                            --update 2>/dev/null &
                        rclone sync "$DRIVE_SOURCE/encyclopedia/" "$CLAUDE_DIR/encyclopedia/" \
                            --update --exclude '.DS_Store' 2>/dev/null &
                        # Conversations — pull per-slug (Design ref: D3)
                        {
                            log_backup "INFO" "Pulling conversations from Drive..."
                            rclone copy "$DRIVE_SOURCE/conversations/" "$CLAUDE_DIR/projects/" \
                                --checksum --include '*.jsonl' 2>/dev/null || {
                                log_backup "WARN" "Drive pull (conversations) failed"
                                _drive_pull_ok=false
                            }
                        } &
                        wait
                        if [[ "$_drive_pull_ok" == false ]]; then
                            echo "PERSONAL:PULL_FAILED:drive" >> "$SYNC_ERRORS_FILE"
                        fi
                    fi
                    ;;
                github)
                    local SYNC_REPO REPO_DIR
                    SYNC_REPO=$(config_get "PERSONAL_SYNC_REPO" "")
                    REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
                    if [[ -n "$SYNC_REPO" && -d "$REPO_DIR/.git" ]]; then
                        if ! (cd "$REPO_DIR" && git pull personal-sync main 2>/dev/null); then
                            log_backup "WARN" "GitHub personal-sync pull failed"
                            echo "PERSONAL:PULL_FAILED:github" >> "$SYNC_ERRORS_FILE"
                        fi
                        # Copy restored files to live locations
                        [[ -d "$REPO_DIR/memory" ]] && rsync -a --update "$REPO_DIR/memory/" "$CLAUDE_DIR/projects/" 2>/dev/null || true
                        [[ -f "$REPO_DIR/CLAUDE.md" ]] && rsync -a --update "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/" 2>/dev/null || true
                        [[ -f "$REPO_DIR/toolkit-state/config.json" ]] && rsync -a --update "$REPO_DIR/toolkit-state/config.json" "$CLAUDE_DIR/toolkit-state/" 2>/dev/null || true
                        [[ -d "$REPO_DIR/encyclopedia" ]] && rsync -a --update "$REPO_DIR/encyclopedia/" "$CLAUDE_DIR/encyclopedia/" 2>/dev/null || true
                        # Conversations
                        if [[ -d "$REPO_DIR/conversations" ]]; then
                            local _conv_slug _cs_name
                            for _conv_slug in "$REPO_DIR/conversations"/*/; do
                                [[ ! -d "$_conv_slug" ]] && continue
                                _cs_name=$(basename "$_conv_slug")
                                mkdir -p "$CLAUDE_DIR/projects/$_cs_name"
                                cp -n "$_conv_slug"*.jsonl "$CLAUDE_DIR/projects/$_cs_name/" 2>/dev/null || true
                            done
                        fi
                    fi
                    ;;
                icloud)
                    local ICLOUD_PATH
                    ICLOUD_PATH=$(config_get "ICLOUD_PATH" "")
                    # Auto-detect if not configured
                    if [[ -z "$ICLOUD_PATH" ]]; then
                        local _try
                        for _try in "$HOME/Library/Mobile Documents/com~apple~CloudDocs/DestinClaude" \
                                    "$HOME/iCloudDrive/DestinClaude" \
                                    "$HOME/Apple/CloudDocs/DestinClaude"; do
                            [[ -d "$_try" ]] && { ICLOUD_PATH="$_try"; break; }
                        done
                    fi
                    if [[ -n "$ICLOUD_PATH" && -d "$ICLOUD_PATH" ]]; then
                        [[ -d "$ICLOUD_PATH/memory" ]] && rsync -a --update "$ICLOUD_PATH/memory/" "$CLAUDE_DIR/projects/" 2>/dev/null || true
                        [[ -f "$ICLOUD_PATH/CLAUDE.md" ]] && rsync -a --update "$ICLOUD_PATH/CLAUDE.md" "$CLAUDE_DIR/" 2>/dev/null || true
                        [[ -f "$ICLOUD_PATH/toolkit-state/config.json" ]] && rsync -a --update "$ICLOUD_PATH/toolkit-state/config.json" "$CLAUDE_DIR/toolkit-state/" 2>/dev/null || true
                        [[ -d "$ICLOUD_PATH/encyclopedia" ]] && rsync -a --update "$ICLOUD_PATH/encyclopedia/" "$CLAUDE_DIR/encyclopedia/" 2>/dev/null || true
                        # Conversations
                        if [[ -d "$ICLOUD_PATH/conversations" ]]; then
                            local _conv_slug _cs_name
                            for _conv_slug in "$ICLOUD_PATH/conversations"/*/; do
                                [[ ! -d "$_conv_slug" ]] && continue
                                _cs_name=$(basename "$_conv_slug")
                                mkdir -p "$CLAUDE_DIR/projects/$_cs_name"
                                rsync -a --update "$_conv_slug"*.jsonl "$CLAUDE_DIR/projects/$_cs_name/" 2>/dev/null || \
                                    cp -n "$_conv_slug"*.jsonl "$CLAUDE_DIR/projects/$_cs_name/" 2>/dev/null || true
                            done
                        fi
                    fi
                    ;;
            esac
        fi
    }

    # --- Sub-function: Legacy conversation migration (Design ref: D9) ---
    _bg_legacy_migration() {
        local _LEGACY_MARKER="$CLAUDE_DIR/toolkit-state/.legacy-conversations-migrated"
        if [[ ! -f "$_LEGACY_MARKER" ]] && command -v rclone &>/dev/null; then
            local _DR
            _DR=$(config_get "DRIVE_ROOT" "Claude")
            local _LEGACY_PATH="gdrive:$_DR/Backup/conversations/"
            # Check if legacy path exists
            if rclone lsd "$_LEGACY_PATH" &>/dev/null; then
                log_backup "INFO" "Migrating legacy conversations from $_LEGACY_PATH..."
                rclone copy "$_LEGACY_PATH" "gdrive:$_DR/Backup/personal/conversations/" \
                    --checksum 2>/dev/null && {
                    date +%s > "$_LEGACY_MARKER"
                    log_backup "INFO" "Legacy conversation migration complete"
                } || log_backup "WARN" "Legacy conversation migration failed (will retry next session)"
            else
                # No legacy path — mark as done
                date +%s > "$_LEGACY_MARKER"
            fi
        fi
    }

    # --- Sub-function: Sync health check ---
    _bg_sync_health() {
        local WARNINGS_FILE="$CLAUDE_DIR/.sync-warnings"
        > "$WARNINGS_FILE" 2>/dev/null  # reset each session

        # 0. Internet connectivity (DNS lookup via node — fast, no HTTP overhead)
        local dns_check='require("dns").lookup("github.com",e=>{process.exit(e?1:0)})'
        local dns_ok=true
        if command -v timeout &>/dev/null; then
            timeout 5 node -e "$dns_check" 2>/dev/null || dns_ok=false
        else
            node -e "setTimeout(()=>{process.exit(1)},5000);$dns_check" 2>/dev/null || dns_ok=false
        fi
        if ! "$dns_ok"; then
            echo "OFFLINE" >> "$WARNINGS_FILE"
        fi

        # 1. Personal data sync status
        local _PS_BACKEND=""
        if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
            _PS_BACKEND=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_SYNC_BACKEND||'none')}catch{console.log('none')}" "$CONFIG_FILE" 2>/dev/null) || _PS_BACKEND="none"
        fi
        # Auto-detect backend: if flag is unset but a known sync provider works, self-heal the config
        if [[ -z "$_PS_BACKEND" || "$_PS_BACKEND" == "none" ]]; then
            local _DETECTED=""
            # Check Google Drive (rclone + gdrive remote)
            if [[ -z "$_DETECTED" ]] && command -v rclone &>/dev/null && rclone lsd "gdrive:$DRIVE_ROOT/Backup/" &>/dev/null; then
                _DETECTED="drive"
            fi
            # Check iCloud Drive (macOS: ~/Library/Mobile Documents/com~apple~CloudDocs/)
            if [[ -z "$_DETECTED" ]]; then
                local _ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
                if [[ -d "$_ICLOUD" ]]; then
                    # Look for an existing Claude backup folder, or the iCloud root itself
                    if [[ -d "$_ICLOUD/Claude/Backup" ]] || [[ -d "$_ICLOUD/Claude" ]]; then
                        _DETECTED="icloud"
                    fi
                fi
            fi
            # Self-heal: write detected backend so this check doesn't repeat every session
            if [[ -n "$_DETECTED" ]]; then
                _PS_BACKEND="$_DETECTED"
                if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
                    node -e "const fs=require('fs');try{const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));c.PERSONAL_SYNC_BACKEND=process.argv[2];fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+'\n')}catch{}" "$CONFIG_FILE" "$_DETECTED" 2>/dev/null
                fi
            fi
        fi
        if [[ -z "$_PS_BACKEND" || "$_PS_BACKEND" == "none" ]]; then
            echo "PERSONAL:NOT_CONFIGURED" >> "$WARNINGS_FILE"
        else
            # Check if last sync is stale (>24 hours)
            local _PS_MARKER="$CLAUDE_DIR/toolkit-state/.personal-sync-marker"
            if [[ -f "$_PS_MARKER" ]]; then
                local _PS_LAST _PS_NOW _PS_AGE
                _PS_LAST=$(cat "$_PS_MARKER" 2>/dev/null || echo 0)
                _PS_NOW=$(date +%s)
                _PS_AGE=$((_PS_NOW - _PS_LAST))
                if [[ $_PS_AGE -ge 86400 ]]; then
                    echo "PERSONAL:STALE" >> "$WARNINGS_FILE"
                fi
            fi
        fi

        # 1b. Git repo health (Design ref: D8)
        local _GIT_REMOTE=""
        if type config_get &>/dev/null; then
            _GIT_REMOTE=$(config_get "GIT_REMOTE" "")
        fi
        if [[ -n "$_GIT_REMOTE" && "$_GIT_REMOTE" != "none" && ! -d "$CLAUDE_DIR/.git" ]]; then
            echo "GIT:NOT_INITIALIZED" >> "$WARNINGS_FILE"
        fi

        # 2. Unbackedup user skills (not toolkit symlinks, not in a git-tracked backup)
        local _UNBACKEDUP_SKILLS=""
        if [[ -d "$CLAUDE_DIR/skills" ]]; then
            local _SKILL_DIR _SKILL_NAME _IS_TOOLKIT_COPY _LAYER_DIR
            for _SKILL_DIR in "$CLAUDE_DIR"/skills/*/; do
                [[ ! -d "$_SKILL_DIR" ]] && continue
                _SKILL_NAME=$(basename "$_SKILL_DIR")
                # Skip toolkit-managed skills (symlinks OR copies from the toolkit repo)
                if [[ -L "$_SKILL_DIR" ]] || [[ -L "${_SKILL_DIR%/}" ]]; then
                    continue
                fi
                if [[ -n "$TOOLKIT_ROOT" && -d "$TOOLKIT_ROOT" ]]; then
                    _IS_TOOLKIT_COPY=false
                    for _LAYER_DIR in "$TOOLKIT_ROOT"/core/skills "$TOOLKIT_ROOT"/productivity/skills "$TOOLKIT_ROOT"/life/skills; do
                        if [[ -d "$_LAYER_DIR/$_SKILL_NAME" ]]; then
                            _IS_TOOLKIT_COPY=true
                            break
                        fi
                    done
                    if [[ "$_IS_TOOLKIT_COPY" == "true" ]]; then
                        continue  # copy from toolkit repo — canonical source is the repo itself
                    fi
                fi
                # Check if the skill directory is inside the ~/.claude/ git repo (backed up by git-sync)
                if git -C "$CLAUDE_DIR" ls-files --error-unmatch "$_SKILL_DIR/SKILL.md" &>/dev/null 2>&1; then
                    continue  # tracked by git — will be backed up
                fi
                # Not a symlink and not git-tracked — unbackedup
                _UNBACKEDUP_SKILLS="${_UNBACKEDUP_SKILLS:+$_UNBACKEDUP_SKILLS,}$_SKILL_NAME"
            done
        fi
        if [[ -n "$_UNBACKEDUP_SKILLS" ]]; then
            echo "SKILLS:$_UNBACKEDUP_SKILLS" >> "$WARNINGS_FILE"
        fi

        # 3. Unsynced projects — discover git repos not tracked by git-sync or registered
        if type discover_projects &>/dev/null; then
            local _DISCOVERED
            _DISCOVERED=$(discover_projects 2>/dev/null) || {
                _DISCOVERED=""
                log_backup "WARN" "discover_projects() failed — project discovery skipped"
            }
            if [[ -n "$_DISCOVERED" ]]; then
                # Write discovered paths for the /sync skill to consume
                echo "$_DISCOVERED" | sort -u > "$CLAUDE_DIR/.unsynced-projects"
                local _UP_COUNT
                _UP_COUNT=$(echo "$_DISCOVERED" | wc -l | tr -d ' ')
                [[ "$_UP_COUNT" -gt 0 ]] && echo "PROJECTS:$_UP_COUNT" >> "$WARNINGS_FILE"
            else
                rm -f "$CLAUDE_DIR/.unsynced-projects" 2>/dev/null
            fi
        fi

        # Merge sync errors from parallel network operations (B1 mandate compliance)
        local _ERRORS_FILE="$CLAUDE_DIR/toolkit-state/.session-sync-errors"
        if [[ -s "$_ERRORS_FILE" ]]; then
            cat "$_ERRORS_FILE" >> "$WARNINGS_FILE" 2>/dev/null
            rm -f "$_ERRORS_FILE" 2>/dev/null
        fi

        # Remove warnings file if empty (no warnings = no statusline clutter)
        [[ ! -s "$WARNINGS_FILE" ]] && rm -f "$WARNINGS_FILE" 2>/dev/null
    }

    # --- Sub-function: Toolkit version check ---
    _bg_version_check() {
        if [[ -n "$TOOLKIT_ROOT" && -f "$TOOLKIT_ROOT/VERSION" ]]; then
            local STATE_DIR="$CLAUDE_DIR/toolkit-state"
            mkdir -p "$STATE_DIR"
            local CURRENT
            CURRENT=$(cat "$TOOLKIT_ROOT/VERSION" 2>/dev/null | tr -d '[:space:]')
            # Fallback: if VERSION file is stale/missing, use git describe for the real version
            if [[ -z "$CURRENT" ]] || ! (cd "$TOOLKIT_ROOT" && git describe --tags --exact-match "HEAD" 2>/dev/null | grep -q "v${CURRENT}$"); then
                local _GIT_VER
                _GIT_VER=$(cd "$TOOLKIT_ROOT" && git describe --tags --abbrev=0 HEAD 2>/dev/null) || _GIT_VER=""
                if [[ -n "$_GIT_VER" ]]; then
                    CURRENT="${_GIT_VER#v}"
                    # Self-heal: update the VERSION file so future reads are correct
                    echo "$CURRENT" > "$TOOLKIT_ROOT/VERSION" 2>/dev/null || true
                fi
            fi
            local CURRENT_TAG="v${CURRENT}"

            # Fetch tags silently (fail silently if offline)
            (cd "$TOOLKIT_ROOT" && git fetch --tags origin 2>/dev/null) || true

            local LATEST_TAG LATEST
            LATEST_TAG=$(cd "$TOOLKIT_ROOT" && git tag --sort=-v:refname 2>/dev/null | head -1)
            LATEST=${LATEST_TAG#v}

            # Semver-aware comparison: only flag update if LATEST is strictly newer than CURRENT
            # Uses node for portable semver compare (sort -V is GNU-only, fails on macOS stock)
            local UPDATE_AVAILABLE=false
            if [[ -n "$LATEST" && "$CURRENT" != "$LATEST" ]]; then
                local _IS_NEWER
                _IS_NEWER=$(node -e "const[a,b]=[process.argv[1],process.argv[2]].map(v=>v.split('.').map(Number));console.log((a[0]-b[0]||a[1]-b[1]||a[2]-b[2])<0?'yes':'no')" "$CURRENT" "$LATEST" 2>/dev/null) || _IS_NEWER="no"
                if [[ "$_IS_NEWER" == "yes" ]]; then
                    UPDATE_AVAILABLE=true
                fi
            fi

            cat > "$STATE_DIR/update-status.json" << VEREOF
{"current": "${CURRENT:-unknown}", "latest": "${LATEST:-unknown}", "update_available": ${UPDATE_AVAILABLE}}
VEREOF
        fi
    }

    # -----------------------------------------------------------------------
    # Launch network operations in parallel
    # -----------------------------------------------------------------------
    _bg_git_pull &
    _bg_personal_data_pull &
    _bg_legacy_migration &
    _bg_version_check &
    wait

    # -----------------------------------------------------------------------
    # Sync health check runs AFTER network operations so it can merge
    # failure warnings from git pull, personal data pull, and migrations
    # into .sync-warnings for statusline and /sync visibility.
    # -----------------------------------------------------------------------
    _bg_sync_health

    # -----------------------------------------------------------------------
    # Sequential post-pull operations (depend on data pulled above)
    # -----------------------------------------------------------------------

    # Cross-device project slug rewriting (after pull)
    if type rewrite_project_slugs &>/dev/null; then
        rewrite_project_slugs "$CLAUDE_DIR/projects"
    fi

    # Home-directory conversation aggregation (Design ref: D5)
    if type aggregate_conversations &>/dev/null; then
        aggregate_conversations "$CLAUDE_DIR/projects"
    fi

    # Migration check (Design ref: D7)
    if type run_migrations &>/dev/null && [[ -f "$CLAUDE_DIR/backup-meta.json" ]]; then
        run_migrations "$CLAUDE_DIR" || {
            log_backup "WARN" "Backup migration failed. Some restored data may be in an old format."
            echo "MIGRATION:FAILED" >> "$SYNC_ERRORS_FILE"
        }
    fi

    # -----------------------------------------------------------------------
    # Mark sync complete
    # -----------------------------------------------------------------------
    debounce_touch "$SYNC_DEBOUNCE_MARKER" 2>/dev/null || true
    echo "done $(date +%s)" > "$SYNC_STATUS_FILE" 2>/dev/null
}

# ===========================================================================
# Phase 2 dispatch: background network sync with debounce
# Design ref: session-start-optimization-design D1, D2
# ===========================================================================
if debounce_check "$SYNC_DEBOUNCE_MARKER" "$SYNC_DEBOUNCE_MINUTES"; then
    _session_sync_background >> "$BACKUP_LOG" 2>&1 &
    disown
else
    echo "skipped $(date +%s)" > "$SYNC_STATUS_FILE" 2>/dev/null
fi

# --- Announcement fetch (background) ---
if command -v node &>/dev/null; then
    # Use toolkit root (already resolved above) to find announcement-fetch.js
    ANNOUNCEMENT_FETCH=""
    [[ -n "$TOOLKIT_ROOT" ]] && ANNOUNCEMENT_FETCH="$TOOLKIT_ROOT/core/hooks/announcement-fetch.js"
    # Fallback: check sibling in same directory as this script
    if [[ -z "$ANNOUNCEMENT_FETCH" || ! -f "$ANNOUNCEMENT_FETCH" ]]; then
        ANNOUNCEMENT_FETCH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/announcement-fetch.js"
    fi
    if [[ -f "$ANNOUNCEMENT_FETCH" ]]; then
        node "$ANNOUNCEMENT_FETCH" >/dev/null 2>&1 & disown
    fi
fi

# --- Branch safety check ---
# Warn if the current working directory is a git repo and not on the default branch
if git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    _CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
    _DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@') || _DEFAULT_BRANCH=""
    # Fallback: check for master or main
    if [[ -z "$_DEFAULT_BRANCH" ]]; then
        git rev-parse --verify master &>/dev/null && _DEFAULT_BRANCH="master" || _DEFAULT_BRANCH="main"
    fi
    if [[ -n "$_CURRENT_BRANCH" && "$_CURRENT_BRANCH" != "$_DEFAULT_BRANCH" ]]; then
        _REPO_NAME=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
        echo "{\"hookSpecificOutput\": {\"hookEventName\": \"SessionStart\", \"additionalContext\": \"WARNING: You are on branch '$_CURRENT_BRANCH' in repo '$_REPO_NAME', NOT the default branch '$_DEFAULT_BRANCH'. Switch to '$_DEFAULT_BRANCH' before making changes unless you intentionally checked out this branch.\"}}"
    fi
fi

# --- Check inbox ---
if [[ -f "$CLAUDE_DIR/hooks/check-inbox.sh" ]]; then
    bash "$CLAUDE_DIR/hooks/check-inbox.sh" 2>/dev/null || true
fi

# Clean up subsumed toolkit-reminder state
rm -f "$CLAUDE_DIR/toolkit-state/toolkit-reminder.json" 2>/dev/null

# --- DestinTip selection ---
# Adaptive toolkit hints: select tips based on comfort level, usage history, and rotation
if command -v node &>/dev/null; then
    _DESTINTIP_CATALOG=""
    [[ -n "$TOOLKIT_ROOT" ]] && _DESTINTIP_CATALOG="$TOOLKIT_ROOT/core/data/destintip-catalog.json"
    if [[ -z "$_DESTINTIP_CATALOG" || ! -f "$_DESTINTIP_CATALOG" ]]; then
        # Fallback: check relative to this script
        _DESTINTIP_CATALOG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/destintip-catalog.json"
    fi
    if [[ -f "$_DESTINTIP_CATALOG" ]]; then
        node -e '
const fs = require("fs");
const configPath = process.argv[1];
const catalogPath = process.argv[2];
const statePath = process.argv[3];

// Read config
let comfortLevel = "intermediate";
try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (config.comfort_level) comfortLevel = config.comfort_level;
} catch {}

// Read catalog
let tips;
try {
    tips = JSON.parse(fs.readFileSync(catalogPath, "utf8")).tips;
} catch { process.exit(0); }
if (!tips || tips.length === 0) process.exit(0);

// Read or create state
let state = { session_count: 0, discovered_features: [], shown_tips: {} };
try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
} catch {}
state.session_count = (state.session_count || 0) + 1;
if (!state.discovered_features) state.discovered_features = [];
if (!state.shown_tips) state.shown_tips = {};
const sc = state.session_count;
const disc = new Set(state.discovered_features);

// Filter
const filtered = tips.filter(t => {
    if (!t.comfort_levels.includes(comfortLevel)) return false;
    if (t.requires_discovered.some(r => !disc.has(r))) return false;
    const shown = state.shown_tips[t.id];
    if (shown && (sc - shown.last_shown_session) <= 5) return false;
    return true;
});

if (filtered.length === 0) {
    // Still write state (session_count increment) even with no tips
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
    process.exit(0);
}

// Score (stable: array order preserved for ties)
const scored = filtered.map(t => {
    let score = 0;
    if (!disc.has(t.feature)) score += 10;
    const shown = state.shown_tips[t.id];
    if (!shown) score += 5;
    score += shown ? (sc - shown.last_shown_session) : sc;
    return { tip: t, score };
});
scored.sort((a, b) => b.score - a.score);

// Select top 4
const selected = scored.slice(0, 4).map(s => s.tip);

// Update state
for (const t of selected) {
    if (!state.shown_tips[t.id]) state.shown_tips[t.id] = { times_shown: 0, last_shown_session: 0 };
    state.shown_tips[t.id].times_shown++;
    state.shown_tips[t.id].last_shown_session = sc;
}
// Mark features as discovered if shown 3+ times
for (const [id, info] of Object.entries(state.shown_tips)) {
    if (info.times_shown >= 3) {
        const tip = tips.find(t => t.id === id);
        if (tip && !disc.has(tip.feature)) {
            state.discovered_features.push(tip.feature);
            disc.add(tip.feature);
        }
    }
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");

// Build prompt
// NOTE: The '\''  sequences below are bash single-quote escapes (end quote, literal quote,
// resume quote). They MUST be preserved exactly — the entire node -e block is single-quoted in bash.
let prompt = "You have the DestinTip system active. Throughout this session, naturally weave toolkit hints into your responses when relevant. Use this exact format (with backticks):\n\n";
prompt += "\"`★ DestinTip ────────────────────────────────────`\n[tip content here]\n`──────────────────────────────────────────────────`\"\n\n";
prompt += "Rules:\n";
prompt += "- Maximum 1 tip per response — do not overwhelm the user\n";
prompt += "- Only surface a tip when it is genuinely relevant to what the user is doing\n";
prompt += "- If nothing is relevant, do not force a tip — silence is fine\n";
prompt += "- Keep tips conversational and brief (1-2 sentences)\n";
prompt += "- Frame tips as helpful discovery, never prescriptive\n\n";
prompt += "The user'\''s comfort level is: " + comfortLevel + "\n";
prompt += "- beginner: Focus on basic features, explain what things do\n";
prompt += "- intermediate: Assume familiarity with basics, highlight deeper features\n";
prompt += "- power_user: Power-user tips, feature combinations, advanced workflows\n\n";
prompt += "Tips available this session:\n\n";
selected.forEach((t, i) => {
    prompt += (i + 1) + ". " + t.text + "\n";
    prompt += "   When to suggest: " + t.context_hint + "\n\n";
});

// Output
const output = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: prompt } };
console.log(JSON.stringify(output));
        ' "$CONFIG_FILE" "$_DESTINTIP_CATALOG" "$CLAUDE_DIR/toolkit-state/destintip-state.json" 2>/dev/null || true
    else
        echo '{"hookSpecificOutput": "Warning: DestinTip catalog not found."}' >&2
    fi
fi

exit 0
