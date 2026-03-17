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
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try{const j=JSON.parse(d);
    const name=j.session_name||'';
    const m=j.model?.display_name||j.model?.id||'unknown';
    const rem=j.context_window?.remaining_percentage!=null?Math.round(j.context_window.remaining_percentage):100;
    console.log(name+'\t'+m+'\t'+rem);
  }catch(e){console.error('statusline parse error: '+e.message);console.log('\tunknown\t100')}
})" 2>>"$HOME/.claude/statusline.log")

IFS=$'\t' read -r SESSION_NAME MODEL REMAINING <<< "$PARSED"

# Defaults if node failed
MODEL=${MODEL:-unknown}
REMAINING=${REMAINING:-100}

# ANSI colors (single-quoted for printf %b compatibility)
BOLD='\033[1m'
WHITE='\033[97m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

# --- Line 1: Session name (only if named) ---
if [[ -n "$SESSION_NAME" ]]; then
    printf '%b\n' "${BOLD}${WHITE}${SESSION_NAME}${RESET}"
fi

# --- Line 2: Sync status ---
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

printf '%b\n' "$SYNC_DISPLAY"

# --- Line 3: Model + Context Remaining ---
if [ "$REMAINING" -lt 20 ] 2>/dev/null; then
    CTX_COLOR="$RED"
elif [ "$REMAINING" -lt 50 ] 2>/dev/null; then
    CTX_COLOR="$YELLOW"
else
    CTX_COLOR="$GREEN"
fi

printf '%b\n' "${DIM}${MODEL}${RESET}  ${CTX_COLOR}Context Remaining: ${REMAINING}%${RESET}"

# --- Line 4: Rate limit info (via usage-fetch.js) ---
# Resolve the real script location (follows symlinks) to find sibling usage-fetch.js
SCRIPT_REAL="$(readlink -f "${BASH_SOURCE[0]}" 2>/dev/null || realpath "${BASH_SOURCE[0]}" 2>/dev/null || python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "${BASH_SOURCE[0]}" 2>/dev/null || echo "${BASH_SOURCE[0]}")"
USAGE_FETCH="$(dirname "$SCRIPT_REAL")/usage-fetch.js"

if [[ -f "$USAGE_FETCH" ]] && command -v node &>/dev/null; then
    USAGE_JSON=$(node "$USAGE_FETCH" 2>/dev/null) || USAGE_JSON=""
    if [[ -n "$USAGE_JSON" ]]; then
        USAGE_RAW=$(node -e "
            const d = JSON.parse(process.argv[1]);
            const fiveH = d.five_hour;
            const sevenD = d.seven_day;
            const parts = [];
            let maxPct = 0;

            if (fiveH && fiveH.utilization != null) {
                const pct = fiveH.utilization;
                if (pct > maxPct) maxPct = pct;
                const resetsAt = new Date(fiveH.resets_at);
                const timeStr = resetsAt.toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit', hour12: true
                });
                parts.push('5h (' + pct + '%): Resets at ' + timeStr);
            }

            if (sevenD && sevenD.utilization != null) {
                const pct = sevenD.utilization;
                if (pct > maxPct) maxPct = pct;
                const resetsAt = new Date(sevenD.resets_at);
                const dayStr = resetsAt.toLocaleDateString('en-US', { weekday: 'long' });
                const timeStr = resetsAt.toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: '2-digit', hour12: true
                });
                parts.push('7d (' + pct + '%): Resets on ' + dayStr + ' at ' + timeStr);
            }

            process.stdout.write(maxPct + '\t' + parts.join(' | '));
        " "$USAGE_JSON" 2>/dev/null) || USAGE_RAW=""

        if [[ -n "$USAGE_RAW" ]]; then
            MAX_PCT="${USAGE_RAW%%$'\t'*}"
            USAGE_LINE="${USAGE_RAW#*$'\t'}"
            if [[ "$MAX_PCT" -ge 80 ]] 2>/dev/null; then
                printf '%b\n' "${RED}${USAGE_LINE}${RESET}"
            elif [[ "$MAX_PCT" -ge 50 ]] 2>/dev/null; then
                printf '%b\n' "${YELLOW}${USAGE_LINE}${RESET}"
            else
                printf '%b\n' "${DIM}${USAGE_LINE}${RESET}"
            fi
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
