#!/bin/bash
# Stop hook — remind Claude to verify system change checklist
# Fires on every Stop event; exits silently unless system files were touched
#
# PID assumption: Both git-sync.sh and this hook use $PPID to identify the
# Claude Code process. This works because Claude Code spawns hook subprocesses
# as direct children. If PIDs don't match in practice, fall back to
# timestamp-based filtering (entries within last 12 hours).
#
# Advisory only: Stop hooks cannot block — this is a best-effort reminder.
# The CLAUDE.md hard gate and system.md checklist are the primary enforcement.

# Source shared infrastructure (trap handlers, error capture, rotation)
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HOOK_DIR/lib/hook-preamble.sh" ]] && source "$HOOK_DIR/lib/hook-preamble.sh"

REGISTRY="$HOME/.claude/.write-registry.json"
[[ ! -f "$REGISTRY" ]] && exit 0

# System path patterns that trigger the reminder
# Includes all directories/files referenced by the System Change Checklist
SYSTEM_PATTERNS="skills/|hooks/|specs/|plans/|mcp-servers/|docs/|memory/|CLAUDE.md|settings.json|\.gitignore|restore\.sh|statusline\.sh|RESTORE\.md|README\.md"

if _capture_err "checklist-reminder: registry check" node -e "
  const reg = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
  const pat = new RegExp(process.argv[2]);
  const pid = parseInt(process.argv[3]);
  const found = Object.entries(reg).some(([path, entry]) => entry.pid === pid && pat.test(path));
  process.exit(found ? 0 : 1);
" "$REGISTRY" "$SYSTEM_PATTERNS" "$PPID"; then
  echo '{"stopReason": "REMINDER: You modified system files this session. Before finishing, verify you have followed every item in the System Change Checklist (docs/system-architecture.md in the toolkit repo). This is mandatory per CLAUDE.md System Change Protocol.", "continue": true}'
fi

exit 0
