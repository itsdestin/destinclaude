#!/bin/bash
# Claude Code status line script
# Line 1: Session name (bold, if named)
# Line 2: Sync status (from .sync-status file)
# Line 3: Model + context remaining
# Line 4: Rate limit info (from usage-fetch.js)
# Line 5: Toolkit version (if available)

STATUS_FILE="$HOME/.claude/.sync-status"

# Read session JSON from stdin and extract fields
SESSION=$(cat)

PARSED=$(echo "$SESSION" | node -e "
const SEP='\x1f';
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try{const j=JSON.parse(d);
    const name=j.session_name||'';
    const sid=j.session_id||'';
    const m=j.model?.display_name||j.model?.id||'unknown';
    const rem=j.context_window?.remaining_percentage!=null?Math.round(j.context_window.remaining_percentage):100;
    console.log(name+SEP+m+SEP+rem+SEP+sid);
  }catch(e){console.error('statusline parse error: '+e.message);console.log(SEP+'unknown'+SEP+'100'+SEP)}
})" 2>>"$HOME/.claude/statusline.log")

IFS=$'\x1f' read -r SESSION_NAME MODEL REMAINING SESSION_ID <<< "$PARSED"

# Defaults if node failed
MODEL=${MODEL:-unknown}
REMAINING=${REMAINING:-100}

# Fall back to topic file if session_name is empty, default to "New Session"
if [[ -z "$SESSION_NAME" && -n "$SESSION_ID" ]]; then
    TOPIC_FILE="$HOME/.claude/topics/topic-${SESSION_ID}"
    if [[ -f "$TOPIC_FILE" ]]; then
        SESSION_NAME=$(cat "$TOPIC_FILE" 2>/dev/null | tr -d '\n\r')
    fi
    SESSION_NAME="${SESSION_NAME:-New Session}"
fi

# ANSI colors (single-quoted for printf %b compatibility)
BOLD='\033[1m'
WHITE='\033[97m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

# --- Sync status (computed first, used for both display and announcement alignment) ---
SYNC=""
if [ -f "$STATUS_FILE" ]; then
    SYNC=$(cat "$STATUS_FILE" 2>/dev/null)
fi

if [[ "$SYNC" == OK:* ]] || [[ "$SYNC" == "Changes Synced"* ]]; then
    SYNC_DISPLAY="${GREEN}${SYNC}${RESET}"
elif [[ "$SYNC" == WARN:* ]]; then
    SYNC_DISPLAY="${YELLOW}${SYNC}${RESET}"
elif [[ "$SYNC" == ERR:* ]]; then
    SYNC_DISPLAY="${RED}${SYNC}${RESET}"
else
    SYNC_DISPLAY="${DIM}No Sync Status${RESET}"
fi

# --- Announcement fragment (right-aligned on line 1) ---
COLS=${COLUMNS:-$(tput cols 2>/dev/null)}
COLS=${COLS:-80}
CACHE_FILE="$HOME/.claude/.announcement-cache.json"

if [[ -n "$SESSION_NAME" ]]; then
    LEFT_ANSI_CONTENT="${BOLD}${WHITE}${SESSION_NAME}${RESET}"
    LEFT_PLAIN="$SESSION_NAME"
else
    LEFT_ANSI_CONTENT="$SYNC_DISPLAY"
    LEFT_PLAIN=$(printf '%b' "$SYNC_DISPLAY" | sed $'s/\033\\[[0-9;]*[A-Za-z]//g')
fi

ANNOUNCEMENT_FRAGMENT=""
if [[ -f "$CACHE_FILE" ]] && command -v node &>/dev/null; then
    ANNOUNCEMENT_FRAGMENT=$(node -e "
const fs = require('fs');
const cols = parseInt(process.argv[2], 10) || 80;
const leftPlain = process.argv[3] || '';
try {
    const cache = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    if (!cache.message) process.exit(0);
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;
    if ((Date.now() - new Date(cache.fetched_at).getTime()) >= STALE_MS) process.exit(0);
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (cache.expires && cache.expires < today) process.exit(0);
    const PREFIX = '\u2605 ';
    const MIN_PAD = 2;
    const available = cols - leftPlain.length;
    if (available < PREFIX.length + MIN_PAD + 1) process.exit(0);
    const maxMsgLen = available - PREFIX.length - MIN_PAD;
    let msg = cache.message;
    if (msg.length > maxMsgLen) msg = msg.slice(0, maxMsgLen - 1) + '\u2026';
    const pad = available - PREFIX.length - msg.length;
    process.stdout.write(' '.repeat(pad) + '\x1b[1;33m' + PREFIX + msg + '\x1b[0m');
} catch (_) {}
" "$CACHE_FILE" "$COLS" "$LEFT_PLAIN" 2>/dev/null) || ANNOUNCEMENT_FRAGMENT=""
fi

# --- Sync warnings (from session-start health check) ---
WARNINGS_FILE="$HOME/.claude/.sync-warnings"
WARN_PARTS=""
if [[ -f "$WARNINGS_FILE" ]]; then
    _SEP_D="${RESET}${DIM} | ${RESET}${RED}"
    _SEP_W="${RESET}${DIM} | ${RESET}${YELLOW}"
    while IFS= read -r _LINE; do
        case "$_LINE" in
            OFFLINE) WARN_PARTS="${WARN_PARTS:+$WARN_PARTS${_SEP_D}}${RED}No Internet Connection${RESET}" ;;
            PERSONAL:NOT_CONFIGURED) WARN_PARTS="${WARN_PARTS:+$WARN_PARTS${_SEP_D}}${RED}No Sync Act. for Personal Data${RESET}" ;;
            PERSONAL:STALE) WARN_PARTS="${WARN_PARTS:+$WARN_PARTS${_SEP_W}}${YELLOW}No Recent Personal Sync (>24h)${RESET}" ;;
            SKILLS:*) WARN_PARTS="${WARN_PARTS:+$WARN_PARTS${_SEP_D}}${RED}Unsynced Skills${RESET}" ;;
            PROJECTS:*) WARN_PARTS="${WARN_PARTS:+$WARN_PARTS${_SEP_D}}${RED}Projects Excluded From Sync${RESET}" ;;
        esac
    done < "$WARNINGS_FILE"
fi

# Append warnings + /sync hint to sync display
if [[ -n "$WARN_PARTS" ]]; then
    SYNC_DISPLAY="${SYNC_DISPLAY}  ${DIM}|${RESET}  ${WARN_PARTS}  ${DIM}/sync for info${RESET}"
fi

# --- Lines 1-2: Session name / sync status + announcement ---
printf '%b\n' "${LEFT_ANSI_CONTENT}${ANNOUNCEMENT_FRAGMENT}"
if [[ -n "$SESSION_NAME" ]]; then
    printf '%b\n' "$SYNC_DISPLAY"
fi

# --- Line 3: Model + Context Remaining ---
if [ "$REMAINING" -lt 20 ] 2>/dev/null; then
    CTX_COLOR="$RED"
elif [ "$REMAINING" -lt 50 ] 2>/dev/null; then
    CTX_COLOR="$YELLOW"
else
    CTX_COLOR="$GREEN"
fi

printf '%b\n' "${DIM}${MODEL}${RESET}  ${DIM}|${RESET}  ${CTX_COLOR}Context Remaining: ${REMAINING}%${RESET}"

# --- Line 4: Rate limit info (via usage-fetch.js) ---
# Find hooks directory: config-based lookup (works with copies on Windows), symlink fallback
HOOKS_DIR=""
if command -v node &>/dev/null && [[ -f "$HOME/.claude/toolkit-state/config.json" ]]; then
    _TK=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.toolkit_root)console.log(c.toolkit_root)}catch{}" "$HOME/.claude/toolkit-state/config.json" 2>/dev/null)
    [[ -n "$_TK" && -d "$_TK/core/hooks" ]] && HOOKS_DIR="$_TK/core/hooks"
fi
if [[ -z "$HOOKS_DIR" ]]; then
    _REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
    HOOKS_DIR="$(dirname "$_REAL")"
fi
USAGE_FETCH="$HOOKS_DIR/usage-fetch.js"

if [[ -f "$USAGE_FETCH" ]] && command -v node &>/dev/null; then
    USAGE_JSON=$(node "$USAGE_FETCH" 2>/dev/null) || USAGE_JSON=""
    if [[ -n "$USAGE_JSON" ]]; then
        # Each timer gets its own ANSI color based on its own utilization percentage
        USAGE_LINE=$(node -e "
            const d = JSON.parse(process.argv[1]);
            const fiveH = d.five_hour;
            const sevenD = d.seven_day;
            const GREEN = '\x1b[32m';
            const DIM = '\x1b[2m';
            const YELLOW = '\x1b[33m';
            const RED = '\x1b[31m';
            const RESET = '\x1b[0m';

            function colorFor(pct) {
                if (pct >= 80) return RED;
                if (pct >= 50) return YELLOW;
                return GREEN;
            }

            const parts = [];

            if (fiveH && fiveH.utilization != null) {
                const pct = fiveH.utilization;
                const c = colorFor(pct);
                const resetsAt = new Date(fiveH.resets_at);
                const timeStr = resetsAt.toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit', hour12: true
                });
                parts.push(c + '5h (' + pct + '%): Resets at ' + timeStr + RESET);
            }

            if (sevenD && sevenD.utilization != null) {
                const pct = sevenD.utilization;
                const c = colorFor(pct);
                const resetsAt = new Date(sevenD.resets_at);
                const dayStr = resetsAt.toLocaleDateString('en-US', { weekday: 'long' });
                const timeStr = resetsAt.toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit', hour12: true
                });
                parts.push(c + '7d (' + pct + '%): Resets on ' + dayStr + ' at ' + timeStr + RESET);
            }

            if (parts.length > 0) {
                process.stdout.write(parts.join(DIM + ' | ' + RESET));
            }
        " "$USAGE_JSON" 2>/dev/null) || USAGE_LINE=""

        if [[ -n "$USAGE_LINE" ]]; then
            printf '%b\n' "$USAGE_LINE"
        fi
    fi
fi

# --- Line 5: Toolkit version ---
UPDATE_FILE="$HOME/.claude/toolkit-state/update-status.json"
if [[ -f "$UPDATE_FILE" ]] && command -v node &>/dev/null; then
    TOOLKIT_INFO=$(node -e "
        const fs = require('fs');
        try {
            const s = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
            const ver = s.current || 'unknown';
            console.log(ver + '\t' + (s.update_available ? '1' : '0'));
        } catch { console.log('unknown\t0'); }
    " "$UPDATE_FILE" 2>/dev/null) || TOOLKIT_INFO=""
    if [[ -n "$TOOLKIT_INFO" ]]; then
        IFS=$'\t' read -r TK_VER TK_UPD <<< "$TOOLKIT_INFO"
        if [[ "$TK_UPD" == "1" ]]; then
            printf '%b\n' "${YELLOW}DestinClaude v${TK_VER} (Update Available)${RESET}"
        else
            printf '%b\n' "${DIM}DestinClaude v${TK_VER}${RESET}"
        fi
    fi
fi
