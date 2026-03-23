#!/bin/bash
# journal-vault-watchdog.sh — Background timeout monitor
# Usage: journal-vault-watchdog.sh <vault-temp-dir> <timeout-minutes>

VAULT_TEMP="$1"
TIMEOUT_MINUTES="${2:-15}"
VAULT_PS1="$HOME/.claude/plugins/destinclaude/life/hooks/journal-vault.ps1"
POLL_INTERVAL=60  # seconds

if [[ -z "$VAULT_TEMP" ]]; then
    echo "Usage: journal-vault-watchdog.sh <vault-temp-dir> <timeout-minutes>" >&2
    exit 1
fi

# Store our PID
echo $$ > "$VAULT_TEMP/.watchdog-pid"

while true; do
    sleep $POLL_INTERVAL

    # Check if vault is still unlocked
    if [[ ! -f "$VAULT_TEMP/.unlocked" ]]; then
        exit 0  # Vault was locked externally — exit
    fi

    # Check for lock-in-progress (multi-step operation)
    if [[ -f "$VAULT_TEMP/.lock-in-progress" ]]; then
        continue  # Defer timeout
    fi

    # Check last access time
    if [[ -f "$VAULT_TEMP/.last-access" ]]; then
        LAST_ACCESS=$(cat "$VAULT_TEMP/.last-access")
        LAST_EPOCH=$(date -d "$LAST_ACCESS" +%s 2>/dev/null || date +%s)
        NOW_EPOCH=$(date +%s)
        ELAPSED_MINUTES=$(( (NOW_EPOCH - LAST_EPOCH) / 60 ))

        if [[ $ELAPSED_MINUTES -ge $TIMEOUT_MINUTES ]]; then
            # Timeout — lock the vault
            pwsh -File "$VAULT_PS1" lock 2>&1 | head -1
            exit 0
        fi
    fi
done
