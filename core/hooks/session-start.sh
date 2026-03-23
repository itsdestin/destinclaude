#!/bin/bash
# SessionStart hook: pull latest from Git, sync personal data, sync encyclopedia cache, extract MCP config, check inbox
set -euo pipefail

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
# Clean up session-scoped detection markers from previous sessions
rm -f "$CLAUDE_DIR"/.unsynced-warned-* 2>/dev/null
ENCYCLOPEDIA_DIR="$CLAUDE_DIR/encyclopedia"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"
MCP_CONFIG="$CLAUDE_DIR/mcp-servers/mcp-config.json"
CLAUDE_JSON="$HOME/.claude.json"

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
            # Stage and commit so git-pull doesn't conflict
            cd "$CLAUDE_DIR"
            git add "$MCP_CONFIG" 2>/dev/null && \
                git commit -m "auto: mcp-config.json" --no-gpg-sign 2>/dev/null || true
        fi
    fi
fi

# --- Git pull (cross-device sync) ---
cd "$CLAUDE_DIR"
if git remote get-url origin &>/dev/null; then
    if ! git pull --rebase origin main 2>/dev/null; then
        git rebase --abort 2>/dev/null || true
        echo '{"hookSpecificOutput": "Warning: Git pull failed on session start. Working with local state."}' >&2
    fi
fi

# --- Verify symlinks (detect broken or copy-based installs) ---
# All toolkit components should be symlinks. If any are regular files (copies from
# a pre-v1.4 install), flag them for repair via /health or /setup-wizard.
if [[ -n "$TOOLKIT_ROOT" && -d "$TOOLKIT_ROOT/core/hooks" ]]; then
    _BROKEN=""
    # Check a representative sample of toolkit files
    for _check in "$CLAUDE_DIR/hooks/session-start.sh" "$CLAUDE_DIR/statusline.sh" "$CLAUDE_DIR/commands/update.md"; do
        if [[ -f "$_check" && ! -L "$_check" ]]; then
            _BROKEN="$_BROKEN $(basename "$_check")"
        fi
    done
    if [[ -n "$_BROKEN" ]]; then
        echo "{\"hookSpecificOutput\": \"Some toolkit files are copies instead of symlinks:$_BROKEN. Run /health to repair — symlinks are required for updates to work correctly.\"}" >&2
    fi
    # Flag known orphan files from pre-v1.1.5 installs (never auto-delete)
    if [[ -f "$CLAUDE_DIR/hooks/statusline.sh" && ! -L "$CLAUDE_DIR/hooks/statusline.sh" ]]; then
        echo "{\"hookSpecificOutput\": \"Found orphan file ~/.claude/hooks/statusline.sh (stale copy — statusline lives at ~/.claude/statusline.sh). Ask the user before deleting.\"}" >&2
    fi
fi

# --- Encyclopedia cache sync ---
mkdir -p "$ENCYCLOPEDIA_DIR"
VAULT_TEMP="$HOME/.claude/.vault-temp"
VAULT_CONFIG="$HOME/.claude/journal-vault.json"

# Check for stale vault temp dir (crash recovery)
if [[ -d "$VAULT_TEMP" ]]; then
    VAULT_PS1="$HOME/.claude/plugins/destinclaude/life/hooks/journal-vault.ps1"
    pwsh -File "$VAULT_PS1" lock 2>&1 | head -1
fi

# Check if vault exists (skip rclone sync if so — cache is populated on vault unlock)
if [[ -f "$VAULT_CONFIG" ]]; then
    VAULT_REMOTE=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$(echo "$VAULT_CONFIG" | sed "s|\\\\|/|g")','utf8')).vault_remote_path)}catch{}" 2>/dev/null)
    if [[ -n "$VAULT_REMOTE" ]]; then
        VAULT_EXISTS=$(rclone lsf "$VAULT_REMOTE" 2>/dev/null)
        if [[ -n "$VAULT_EXISTS" ]]; then
            echo '{"hookSpecificOutput": "Encyclopedia sync deferred (vault mode)"}' >&2
        else
            if command -v rclone &>/dev/null; then
                rclone sync "gdrive:$DRIVE_ROOT/The Journal/System/" "$ENCYCLOPEDIA_DIR/" 2>/dev/null || \
                    echo '{"hookSpecificOutput": "Warning: Encyclopedia cache sync failed."}' >&2
            fi
        fi
    fi
else
    if command -v rclone &>/dev/null; then
        rclone sync "gdrive:$DRIVE_ROOT/The Journal/System/" "$ENCYCLOPEDIA_DIR/" 2>/dev/null || \
            echo '{"hookSpecificOutput": "Warning: Encyclopedia cache sync failed. Skills will use stale cache."}' >&2
    fi
fi

# --- Personal data pull (cross-device sync for memory, CLAUDE.md, config) ---
if [[ -f "$CONFIG_FILE" ]]; then
    PS_BACKEND=""
    PS_DRIVE_ROOT="Claude"
    PS_REPO=""

    if command -v node &>/dev/null; then
        read -r PS_BACKEND PS_DRIVE_ROOT PS_REPO < <(node -e "
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
        PS_BACKEND=$(grep -o '"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"PERSONAL_SYNC_BACKEND"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "none")
        PS_DRIVE_ROOT=$(grep -o '"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" 2>/dev/null | head -1 | sed 's/.*"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//' || echo "Claude")
    fi

    if [[ "$PS_BACKEND" == "drive" ]] && command -v rclone &>/dev/null; then
        REMOTE_BASE="gdrive:$PS_DRIVE_ROOT/Backup/personal"
        # Pull memory files
        if rclone lsd "$REMOTE_BASE/memory/" 2>/dev/null | grep -q .; then
            for REMOTE_PROJECT in $(rclone lsd "$REMOTE_BASE/memory/" 2>/dev/null | awk '{print $NF}'); do
                LOCAL_MEMORY="$CLAUDE_DIR/projects/$REMOTE_PROJECT/memory"
                mkdir -p "$LOCAL_MEMORY"
                rclone sync "$REMOTE_BASE/memory/$REMOTE_PROJECT/" "$LOCAL_MEMORY/" --update 2>/dev/null || true
            done
        fi
        # Pull CLAUDE.md
        rclone copyto "$REMOTE_BASE/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" --update 2>/dev/null || true
        # Pull config (careful: don't overwrite if local is newer)
        rclone copyto "$REMOTE_BASE/toolkit-state/config.json" "$CONFIG_FILE" --update 2>/dev/null || true
    elif [[ "$PS_BACKEND" == "github" ]] && command -v git &>/dev/null; then
        REPO_DIR="$CLAUDE_DIR/toolkit-state/personal-sync-repo"
        if [[ -d "$REPO_DIR/.git" ]]; then
            (cd "$REPO_DIR" && git pull personal-sync main 2>/dev/null) || true
            # Copy pulled data to local paths
            if [[ -d "$REPO_DIR/memory" ]]; then
                for PROJECT_DIR in "$REPO_DIR"/memory/*/; do
                    [[ ! -d "$PROJECT_DIR" ]] && continue
                    PROJECT_KEY=$(basename "$PROJECT_DIR")
                    LOCAL_MEMORY="$CLAUDE_DIR/projects/$PROJECT_KEY/memory"
                    mkdir -p "$LOCAL_MEMORY"
                    cp -r "$PROJECT_DIR"* "$LOCAL_MEMORY/" 2>/dev/null || true
                done
            fi
            [[ -f "$REPO_DIR/CLAUDE.md" ]] && cp "$REPO_DIR/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true
            [[ -f "$REPO_DIR/toolkit-state/config.json" ]] && cp "$REPO_DIR/toolkit-state/config.json" "$CONFIG_FILE" 2>/dev/null || true
        fi
    fi
fi

# --- Sync health check (writes ~/.claude/.sync-warnings for statusline) ---
# Detects unprotected personal data, unbackedup skills, and stale syncs.
# Advisory only — warns the user so they never lose information unknowingly.
WARNINGS_FILE="$CLAUDE_DIR/.sync-warnings"
> "$WARNINGS_FILE" 2>/dev/null  # reset each session

# 0. Internet connectivity (DNS lookup via node — fast, no HTTP overhead)
if ! node -e "require('dns').lookup('github.com',e=>{process.exit(e?1:0)})" 2>/dev/null; then
    echo "OFFLINE" >> "$WARNINGS_FILE"
fi

# 1. Personal data sync status
_PS_BACKEND=""
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    _PS_BACKEND=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.PERSONAL_SYNC_BACKEND||'none')}catch{console.log('none')}" "$CONFIG_FILE" 2>/dev/null) || _PS_BACKEND="none"
fi
# Auto-detect backend: if flag is unset but a known sync provider works, self-heal the config
if [[ -z "$_PS_BACKEND" || "$_PS_BACKEND" == "none" ]]; then
    _DETECTED=""
    # Check Google Drive (rclone + gdrive remote)
    if [[ -z "$_DETECTED" ]] && command -v rclone &>/dev/null && rclone lsd "gdrive:$DRIVE_ROOT/Backup/" &>/dev/null; then
        _DETECTED="drive"
    fi
    # Check iCloud Drive (macOS: ~/Library/Mobile Documents/com~apple~CloudDocs/)
    if [[ -z "$_DETECTED" ]]; then
        _ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs"
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
    _PS_MARKER="$CLAUDE_DIR/toolkit-state/.personal-sync-marker"
    if [[ -f "$_PS_MARKER" ]]; then
        _PS_LAST=$(cat "$_PS_MARKER" 2>/dev/null || echo 0)
        _PS_NOW=$(date +%s)
        _PS_AGE=$((_PS_NOW - _PS_LAST))
        if [[ $_PS_AGE -ge 86400 ]]; then
            echo "PERSONAL:STALE" >> "$WARNINGS_FILE"
        fi
    fi
fi

# 2. Unbackedup user skills (not toolkit symlinks, not in a git-tracked backup)
_UNBACKEDUP_SKILLS=""
if [[ -d "$CLAUDE_DIR/skills" ]]; then
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

# 3. Unsynced projects (dedup, filter blanks, filter ignored/registered paths from registry)
if [[ -s "$CLAUDE_DIR/.unsynced-projects" ]]; then
    _REGISTRY="$CLAUDE_DIR/tracked-projects.json"
    if [[ -f "$_REGISTRY" ]] && command -v node &>/dev/null; then
        _UP_COUNT=$(sort -u "$CLAUDE_DIR/.unsynced-projects" 2>/dev/null | grep -c '.' 2>/dev/null | tr -d ' ')
        if [[ "$_UP_COUNT" -gt 0 ]]; then
            _UP_COUNT=$(sort -u "$CLAUDE_DIR/.unsynced-projects" | grep '.' | node -e '
                const fs=require("fs"),rl=require("readline");
                try{const reg=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
                const skip=new Set([...(reg.ignored||[]),...(reg.projects||[]).map(p=>p.path)]);
                const iface=rl.createInterface({input:process.stdin});let c=0;
                iface.on("line",l=>{const t=l.trim();if(t&&!skip.has(t))c++});
                iface.on("close",()=>console.log(c))}catch{const i=require("readline").createInterface({input:process.stdin});let c=0;
                i.on("line",l=>{if(l.trim())c++});i.on("close",()=>console.log(c))}
            ' "$_REGISTRY" 2>/dev/null | tr -d ' ')
        fi
    else
        _UP_COUNT=$(sort -u "$CLAUDE_DIR/.unsynced-projects" 2>/dev/null | grep -c '.' 2>/dev/null | tr -d ' ')
    fi
    [[ "$_UP_COUNT" -gt 0 ]] && echo "PROJECTS:$_UP_COUNT" >> "$WARNINGS_FILE"
fi

# Remove warnings file if empty (no warnings = no statusline clutter)
[[ ! -s "$WARNINGS_FILE" ]] && rm -f "$WARNINGS_FILE" 2>/dev/null

# --- Toolkit version check (uses TOOLKIT_ROOT resolved at script start) ---
if [[ -n "$TOOLKIT_ROOT" && -f "$TOOLKIT_ROOT/VERSION" ]]; then
    STATE_DIR="$CLAUDE_DIR/toolkit-state"
    mkdir -p "$STATE_DIR"
    CURRENT=$(cat "$TOOLKIT_ROOT/VERSION" 2>/dev/null | tr -d '[:space:]')
    # Fallback: if VERSION file is stale/missing, use git describe for the real version
    if [[ -z "$CURRENT" ]] || ! (cd "$TOOLKIT_ROOT" && git describe --tags --exact-match "HEAD" 2>/dev/null | grep -q "v${CURRENT}$"); then
        _GIT_VER=$(cd "$TOOLKIT_ROOT" && git describe --tags --abbrev=0 HEAD 2>/dev/null) || _GIT_VER=""
        if [[ -n "$_GIT_VER" ]]; then
            CURRENT="${_GIT_VER#v}"
            # Self-heal: update the VERSION file so future reads are correct
            echo "$CURRENT" > "$TOOLKIT_ROOT/VERSION" 2>/dev/null || true
        fi
    fi
    CURRENT_TAG="v${CURRENT}"

    # Fetch tags silently (fail silently if offline)
    (cd "$TOOLKIT_ROOT" && git fetch --tags origin 2>/dev/null) || true

    LATEST_TAG=$(cd "$TOOLKIT_ROOT" && git tag --sort=-v:refname 2>/dev/null | head -1)
    LATEST=${LATEST_TAG#v}

    # Semver-aware comparison: only flag update if LATEST is strictly newer than CURRENT
    # Uses node for portable semver compare (sort -V is GNU-only, fails on macOS stock)
    UPDATE_AVAILABLE=false
    if [[ -n "$LATEST" && "$CURRENT" != "$LATEST" ]]; then
        _IS_NEWER=$(node -e "const[a,b]=[process.argv[1],process.argv[2]].map(v=>v.split('.').map(Number));console.log((a[0]-b[0]||a[1]-b[1]||a[2]-b[2])<0?'yes':'no')" "$CURRENT" "$LATEST" 2>/dev/null) || _IS_NEWER="no"
        if [[ "$_IS_NEWER" == "yes" ]]; then
            UPDATE_AVAILABLE=true
        fi
    fi

    cat > "$STATE_DIR/update-status.json" << VEREOF
{"current": "${CURRENT:-unknown}", "latest": "${LATEST:-unknown}", "update_available": ${UPDATE_AVAILABLE}}
VEREOF
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
        nohup node "$ANNOUNCEMENT_FETCH" >/dev/null 2>&1 &
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
