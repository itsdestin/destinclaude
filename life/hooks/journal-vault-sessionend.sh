#!/bin/bash
# journal-vault-sessionend.sh — SessionEnd hook
# Ensures vault is locked when Claude session exits.

VAULT_TEMP="$HOME/.claude/.vault-temp"
VAULT_PS1="$HOME/.claude/plugins/destinclaude/life/hooks/journal-vault.ps1"

# Only act if vault is unlocked
if [[ -f "$VAULT_TEMP/.unlocked" ]]; then
    pwsh -File "$VAULT_PS1" lock 2>&1 | head -1
fi
