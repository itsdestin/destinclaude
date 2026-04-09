#!/bin/bash
# SessionStart hook: rebuild machine-specific config, extract MCP config, check toolkit
# integrity, surface health warnings (unrouted skills, untracked projects), check inbox.
#
# Sync decoupling: personal-data pull and backend sync used to live here. The
# DestinCode app now owns automatic sync. CLI users who need on-demand sync can
# invoke the manual /sync skill (core/skills/sync/SKILL.md).
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
# Source shared infrastructure (trap handlers, error capture, rotation)
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HOOK_DIR/lib/hook-preamble.sh" ]] && source "$HOOK_DIR/lib/hook-preamble.sh"

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
# data remains. config.local.json now owns these. The DestinCode app picks up
# the cleaned config on its next push — toolkit no longer pushes itself.
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    node -e "
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
            }
        } catch {}
    " "$CONFIG_FILE" 2>/dev/null || true
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
    for _hook in check-inbox.sh checklist-reminder.sh contribution-detector.sh done-sound.sh session-start.sh write-registry.sh title-update.sh todo-capture.sh tool-router.sh worktree-guard.sh write-guard.sh; do
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
                        # B1 fix: clean git index for files that were inside the now-symlinked directory
                        if git -C "$CLAUDE_DIR" ls-files --error-unmatch "${_skill_link%/}" &>/dev/null 2>&1; then
                            git -C "$CLAUDE_DIR" rm -r --cached "${_skill_link%/}" 2>/dev/null || true
                        fi
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
# Phase 2: Background health check
# Sync decoupling: backend pull/push moved to the DestinCode app. This
# background block now only runs lightweight, network-light health checks
# (toolkit version, unrouted user skills, untracked git projects) so the
# session start stays snappy and the /sync skill has accurate status data.
# ===========================================================================
_session_health_background() {
    echo "checking $(date +%s)" > "$SYNC_STATUS_FILE" 2>/dev/null

    # --- Sub-function: Health warnings (unrouted skills + untracked projects) ---
    # The /sync skill reads .sync-warnings to surface "you have N skills that
    # aren't backed up" hints. Backend connectivity (OFFLINE / PERSONAL:STALE)
    # is now computed by the DestinCode app and surfaced via SyncPanel — we
    # don't probe DNS or marker files from the toolkit anymore.
    _bg_sync_health() {
        local WARNINGS_FILE="$CLAUDE_DIR/.sync-warnings"
        > "$WARNINGS_FILE" 2>/dev/null  # reset each session

        # 1. Unrouted user skills (not toolkit symlinks, not git-tracked, not in skill-routes.json)
        local _UNROUTED_SKILLS=""
        local _SKILL_ROUTES_FILE="$CLAUDE_DIR/toolkit-state/skill-routes.json"
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
                # Check if the skill directory is tracked by git (backed up out-of-band)
                if git -C "$CLAUDE_DIR" ls-files --error-unmatch "$_SKILL_DIR/SKILL.md" &>/dev/null 2>&1; then
                    continue  # tracked by git — will be backed up
                fi
                # Check skill-routes.json — any route means the skill is accounted for
                if [[ -f "$_SKILL_ROUTES_FILE" ]] && command -v node &>/dev/null; then
                    local _ROUTE=""
                    _ROUTE=$(_capture_err "skill-routes lookup: $_SKILL_NAME" \
                        node -e "try{const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
                        console.log((r[process.argv[2]]||{}).route||'')}catch{}" \
                        "$_SKILL_ROUTES_FILE" "$_SKILL_NAME") || true
                    [[ -n "$_ROUTE" ]] && continue
                fi
                # Not routed — flag for user attention
                _UNROUTED_SKILLS="${_UNROUTED_SKILLS:+$_UNROUTED_SKILLS,}$_SKILL_NAME"
            done
        fi
        if [[ -n "$_UNROUTED_SKILLS" ]]; then
            echo "SKILLS:unrouted:$_UNROUTED_SKILLS" >> "$WARNINGS_FILE"
        fi

        # 2. Unsynced projects — discover git repos not yet registered for backup
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
            # VERSION is a git-tracked file set by the /release skill and updated by
            # /update's merge step. Never overwrite it here — doing so can
            # inflate the version after git fetch --tags, making /update think
            # the user is already up to date when they aren't.
            [[ -z "$CURRENT" ]] && return 0
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
    # Launch checks in parallel
    # -----------------------------------------------------------------------
    _bg_version_check &
    wait

    # Compute warnings now that version state is fresh
    _bg_sync_health

    # -----------------------------------------------------------------------
    # Self-heal missing symlinks (e.g., after git pull removes tracked
    # symlinks before the user runs /update on this device)
    # -----------------------------------------------------------------------
    if [[ -n "${TOOLKIT_ROOT:-}" && -d "$TOOLKIT_ROOT/scripts" ]]; then
        local _cmd_count _skill_count
        _cmd_count=$(find "$CLAUDE_DIR/commands/" -maxdepth 1 -name '*.md' 2>/dev/null | wc -l)
        _skill_count=$(find "$CLAUDE_DIR/skills/" -maxdepth 1 -type l 2>/dev/null | wc -l)
        if (( _cmd_count == 0 || _skill_count == 0 )); then
            log_backup "WARN" "Missing symlinks detected — running auto-refresh" "session-start.selfheal"
            bash "$TOOLKIT_ROOT/scripts/post-update.sh" refresh >> "$BACKUP_LOG" 2>&1 || true
        fi
    fi

    # -----------------------------------------------------------------------
    # Mark health pass complete
    # -----------------------------------------------------------------------
    debounce_touch "$SYNC_DEBOUNCE_MARKER" 2>/dev/null || true
    echo "done $(date +%s)" > "$SYNC_STATUS_FILE" 2>/dev/null
}

# ===========================================================================
# Phase 2 dispatch: background health checks with debounce
# Sync decoupling: this used to launch a full personal-data pull. Now it runs
# only the lightweight version check + skill/project warning generation.
# ===========================================================================
if debounce_check "$SYNC_DEBOUNCE_MARKER" "$SYNC_DEBOUNCE_MINUTES"; then
    _session_health_background >> "$BACKUP_LOG" 2>&1 &
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
