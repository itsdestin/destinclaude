#!/usr/bin/env bash
# journal-vault-guard.sh — PreToolUse hook (Bash|Read)
# Intercepts encyclopedia/journal access when vault is locked. Triggers unlock.
# Spec: core/specs/journal-vault-spec.md

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
VAULT_STATE="$CLAUDE_DIR/.vault-state"
CONFIG_FILE="$CLAUDE_DIR/toolkit-state/config.json"
VAULT_JS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/journal-vault.js"

# --- Check if vault is enabled ---
VAULT_ENABLED="false"
if [[ -f "$CONFIG_FILE" ]] && command -v node &>/dev/null; then
    VAULT_ENABLED=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(c.vault_enabled===true?'true':'false')}catch{console.log('false')}" "$CONFIG_FILE" 2>/dev/null) || VAULT_ENABLED="false"
fi
[[ "$VAULT_ENABLED" != "true" ]] && exit 0

# --- Parse stdin ---
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_name||'')}catch{console.log('')}})" 2>/dev/null)

# --- Check if the tool targets journal/encyclopedia paths ---
TARGETS_VAULT="false"

if [[ "$TOOL_NAME" == "Read" ]]; then
    FILE_PATH=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.tool_input?.file_path||'')}catch{console.log('')}})" 2>/dev/null)
    FILE_PATH_UNIX="${FILE_PATH//\\//}"
    case "$FILE_PATH_UNIX" in
        */.claude/encyclopedia/*|*/.claude/journals/*) TARGETS_VAULT="true" ;;
    esac
elif [[ "$TOOL_NAME" == "Bash" ]]; then
    COMMAND=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.tool_input?.command||'')}catch{console.log('')}})" 2>/dev/null)
    if echo "$COMMAND" | grep -qE 'encyclopedia|journals|The Journal'; then
        TARGETS_VAULT="true"
    fi
fi

[[ "$TARGETS_VAULT" != "true" ]] && exit 0

# --- Vault is targeted. Check state. ---
if [[ -f "$VAULT_STATE/.unlocked" ]]; then
    # Vault is unlocked — update last-access and allow
    date -Iseconds > "$VAULT_STATE/.last-access" 2>/dev/null
    exit 0
fi

# --- Vault is locked — trigger unlock ---
RESULT=$(node "$VAULT_JS" unlock 2>&1)
EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
    exit 0  # Unlocked — allow the original tool call
else
    echo "Journal vault is locked. Unlock cancelled or failed."
    echo "Say \"unlock the vault\" to try again."
    exit 1
fi
