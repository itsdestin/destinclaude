#!/usr/bin/env bash
# journal-vault-watchdog.sh — Background idle timeout monitor
# Usage: journal-vault-watchdog.sh <vault-state-dir> <timeout-minutes>
# Spec: core/specs/journal-vault-spec.md

VAULT_STATE="$1"
TIMEOUT_MINUTES="${2:-15}"
VAULT_JS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/journal-vault.js"
POLL_INTERVAL=60

[[ -z "$VAULT_STATE" ]] && exit 1

echo $$ > "$VAULT_STATE/.watchdog-pid"

while true; do
    sleep $POLL_INTERVAL

    # Exit if vault was locked externally
    [[ ! -f "$VAULT_STATE/.unlocked" ]] && exit 0

    # Check last access time
    if [[ -f "$VAULT_STATE/.last-access" ]]; then
        LAST_ACCESS=$(cat "$VAULT_STATE/.last-access")
        if command -v node &>/dev/null; then
            ELAPSED_MINUTES=$(node -e "
                const la = new Date(process.argv[1]);
                console.log(Math.floor((Date.now() - la.getTime()) / 60000));
            " "$LAST_ACCESS" 2>/dev/null) || continue

            if [[ "$ELAPSED_MINUTES" -ge "$TIMEOUT_MINUTES" ]]; then
                node "$VAULT_JS" lock 2>&1 | head -1
                exit 0
            fi
        fi
    fi
done
