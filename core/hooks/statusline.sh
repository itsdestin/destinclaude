#!/bin/bash
# Claude Code status line script
# Line 1: Sync status (from .sync-status file)
# Line 2: Model + context remaining
# Line 3: Toolkit version (if available)

STATUS_FILE="$HOME/.claude/.sync-status"

# Read session JSON from stdin and extract fields
SESSION=$(cat)

PARSED=$(echo "$SESSION" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  try{const j=JSON.parse(d);
    const m=j.model?.display_name||j.model?.id||'unknown';
    const rem=j.context_window?.remaining_percentage!=null?Math.round(j.context_window.remaining_percentage):100;
    console.log(m+'\t'+rem);
  }catch(e){console.error('statusline parse error: '+e.message);console.log('unknown\t100')}
})" 2>>"$HOME/.claude/statusline.log")

IFS=$'\t' read -r MODEL REMAINING <<< "$PARSED"

# Defaults if node failed
MODEL=${MODEL:-unknown}
REMAINING=${REMAINING:-100}

# ANSI colors (single-quoted for printf %b compatibility)
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
DIM='\033[2m'
RESET='\033[0m'

# Read sync status
SYNC=""
if [ -f "$STATUS_FILE" ]; then
    SYNC=$(cat "$STATUS_FILE" 2>/dev/null)
fi

# Color the sync status
if [[ "$SYNC" == OK:* ]] || [[ "$SYNC" == "Changes Synced"* ]]; then
    SYNC_DISPLAY="${GREEN}${SYNC}${RESET}"
elif [[ "$SYNC" == WARN:* ]]; then
    SYNC_DISPLAY="${YELLOW}${SYNC}${RESET}"
elif [[ "$SYNC" == ERR:* ]]; then
    SYNC_DISPLAY="${RED}${SYNC}${RESET}"
else
    SYNC_DISPLAY="${DIM}No Sync Status${RESET}"
fi

# Color context remaining (inverted — low remaining = warning)
if [ "$REMAINING" -lt 20 ] 2>/dev/null; then
    CTX_COLOR="$RED"
elif [ "$REMAINING" -lt 50 ] 2>/dev/null; then
    CTX_COLOR="$YELLOW"
else
    CTX_COLOR="$GREEN"
fi

# --- Toolkit version ---
UPDATE_FILE="$HOME/.claude/toolkit-state/update-status.json"
TOOLKIT_VERSION=""
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
            TOOLKIT_VERSION="${YELLOW}ClaudifestDestiny v${TK_VER} (Update Available)${RESET}"
        else
            TOOLKIT_VERSION="${DIM}ClaudifestDestiny v${TK_VER}${RESET}"
        fi
    fi
fi

# Output (printf %b for portable ANSI escape handling)
printf '%b\n' "$SYNC_DISPLAY"
printf '%b\n' "${DIM}${MODEL}${RESET}  ${CTX_COLOR}${REMAINING}% Remaining Context${RESET}"
if [[ -n "$TOOLKIT_VERSION" ]]; then
    printf '%b\n' "$TOOLKIT_VERSION"
fi
