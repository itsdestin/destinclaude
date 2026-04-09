#!/usr/bin/env bash
# write-registry.sh — PostToolUse hook for Write|Edit
#
# Records {pid, timestamp, content_hash} for every write in
# ~/.claude/.write-registry.json. The registry is consumed by:
#   - write-guard.sh    (PreToolUse) — blocks same-machine concurrent writes
#   - checklist-reminder.sh (Stop)   — detects which files were touched this session
#
# Extracted from sync.sh as part of sync-decoupling: the toolkit no longer
# orchestrates automatic backup, but the write-guard registry is still required
# regardless of whether sync runs. This hook is intentionally tiny — no network,
# no debounce, no backend logic.
#
# Spec: core/specs/write-guard-spec.md

set -euo pipefail

# --- Parse stdin JSON to extract file_path ---
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{const j=JSON.parse(d);const p=j.tool_input&&j.tool_input.file_path||j.file_path||'';
    console.log(p.split(String.fromCharCode(92)).join('/'))}catch{console.log('')}
  })" 2>/dev/null)
[[ -z "$FILE_PATH" ]] && exit 0

# Source shared preamble for atomic_write (and log rotation)
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HOOK_DIR/lib/hook-preamble.sh" ]] && source "$HOOK_DIR/lib/hook-preamble.sh"

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
REGISTRY="${REGISTRY:-$CLAUDE_DIR/.write-registry.json}"

# PPID is required — write-guard checks the parent shell PID for liveness
[[ -z "${PPID:-}" ]] && exit 0

CONTENT_HASH=""
if [[ -f "$FILE_PATH" ]]; then
    CONTENT_HASH=$( (sha256sum "$FILE_PATH" 2>/dev/null || shasum -a 256 "$FILE_PATH" 2>/dev/null) | awk '{print substr($1,1,16)}')
fi
TIMESTAMP=$(date +%s)

if [[ -f "$REGISTRY" ]]; then
    REG_CONTENT=$(cat "$REGISTRY")
else
    REG_CONTENT="{}"
fi

NORM_PATH="${FILE_PATH//\\//}"
REG_CONTENT=$(node -e "
    const reg = JSON.parse(process.argv[1]);
    reg[process.argv[2]] = {pid: parseInt(process.argv[3]), timestamp: parseInt(process.argv[4]), content_hash: process.argv[5]};
    console.log(JSON.stringify(reg, null, 2));
" "$REG_CONTENT" "$NORM_PATH" "$PPID" "$TIMESTAMP" "$CONTENT_HASH" 2>/dev/null) || exit 0

if type atomic_write &>/dev/null; then
    atomic_write "$REGISTRY" "$REG_CONTENT"
else
    echo "$REG_CONTENT" > "$REGISTRY"
fi

exit 0
