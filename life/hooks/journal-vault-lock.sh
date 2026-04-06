#!/usr/bin/env bash
# journal-vault-lock.sh — SessionEnd hook
# Locks vault on session exit. Spec: core/specs/journal-vault-spec.md

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
VAULT_STATE="$CLAUDE_DIR/.vault-state"
VAULT_JS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/journal-vault.js"

# Only act if vault is unlocked
if [[ -f "$VAULT_STATE/.unlocked" ]]; then
    node "$VAULT_JS" lock 2>&1 | head -1
fi
