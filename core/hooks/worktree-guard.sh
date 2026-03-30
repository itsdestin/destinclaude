#!/bin/bash
# PreToolUse hook for Bash
# Blocks git checkout (branch switches) in the main destinclaude plugin directory.
# The main plugin dir must stay on master. Feature work uses worktrees.
set -euo pipefail

# Source shared infrastructure (trap handlers, error capture, rotation)
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HOOK_DIR/lib/hook-preamble.sh" ]] && source "$HOOK_DIR/lib/hook-preamble.sh"

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{const j=JSON.parse(d);console.log(j.tool_input&&j.tool_input.command||'')}catch{console.log('')}
  })" 2>>"$HOME/.claude/backup.log")

[[ -z "$COMMAND" ]] && exit 0

PLUGIN_DIR="$HOME/.claude/plugins/destinclaude"

# Strip quoted strings (single and double) to avoid matching text inside
# commit messages, echo statements, heredocs, etc.
# This ensures we only match actual git commands, not prose about them.
STRIPPED=$(echo "$COMMAND" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")

# Only care about commands that touch the plugin repo
if ! echo "$STRIPPED" | grep -qiE "(destinclaude|plugins/destinclaude)" 2>/dev/null; then
    exit 0
fi

# Now check for actual git checkout/switch commands in the stripped version
if echo "$STRIPPED" | grep -qE "git (checkout|switch)" 2>/dev/null; then
    # Allow checking out master/main (getting back to safe state)
    if echo "$STRIPPED" | grep -qE "git (checkout|switch)\s+(master|main|origin/master|origin/main)\b" 2>/dev/null; then
        exit 0
    fi
    # Allow file restores (git checkout -- <file>)
    if echo "$STRIPPED" | grep -qE "git checkout\s+--\s+" 2>/dev/null; then
        exit 0
    fi
    # Allow creating new branches (but warn — they should use worktrees)
    if echo "$STRIPPED" | grep -qE "git (checkout|switch)\s+-[bB]" 2>/dev/null; then
        echo '{"decision":"block","reason":"BLOCKED: Do not create branches in the main plugin directory. Use a git worktree instead:\n\n  cd '"$PLUGIN_DIR"' && git worktree add ~/destinclaude-worktrees/<branch-name> -b <branch-name>\n\nThen work in that directory. The main plugin directory must stay on master."}'
        exit 0
    fi
    # Block all other branch switches
    echo '{"decision":"block","reason":"BLOCKED: Do not switch branches in the main destinclaude directory (~/.claude/plugins/destinclaude/). It must stay on master.\n\nMultiple Claude sessions share this directory. Switching branches causes cross-session conflicts.\n\nUse a git worktree instead:\n\n  cd '"$PLUGIN_DIR"' && git worktree add ~/destinclaude-worktrees/<branch-name> <branch-name>\n\nThen work in ~/destinclaude-worktrees/<branch-name>/ instead."}'
    exit 0
fi

exit 0
