#!/usr/bin/env bash
# SessionStart hook (v3, post-decomposition)
#
# Responsibilities: toolkit root discovery, VERSION migration trigger,
# branch safety warning, and lightweight session context injection.
#
# What used to live here but was moved to the host app (DestinCode
# desktop/Android): sync-health checks, announcement fetch, update
# checks, integrity/symlink repair, plugin/MCP registration, DestinTip
# selection, layer enumeration. The app runs reconcilers on launch —
# do NOT reintroduce those responsibilities here.
set -u

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
TOOLKIT_ROOT="$HOME/.claude/plugins/destinclaude-core"
STATE_DIR="$CLAUDE_DIR/toolkit-state"
VERSION_FILE="$TOOLKIT_ROOT/VERSION"
LAST_RUN_FILE="$STATE_DIR/.last-run-version"

mkdir -p "$STATE_DIR" 2>/dev/null || true

# Accumulate context lines; emit as a single SessionStart JSON payload at the end.
_CTX=""
_append_ctx() {
    # Append a line to the session context buffer.
    [[ -z "${1:-}" ]] && return 0
    if [[ -z "$_CTX" ]]; then
        _CTX="$1"
    else
        _CTX="$_CTX"$'\n'"$1"
    fi
}

# --- VERSION migration trigger ----------------------------------------------
# If the toolkit VERSION changed since we last recorded it, run post-update.sh
# once to let the toolkit migrate any on-disk state. The app handles registry
# reconciliation separately; this is purely for toolkit-owned migrations.
if [[ -f "$VERSION_FILE" ]]; then
    _CURRENT_VERSION=$(tr -d '[:space:]' < "$VERSION_FILE" 2>/dev/null || echo "")
    _LAST_VERSION=""
    [[ -f "$LAST_RUN_FILE" ]] && _LAST_VERSION=$(tr -d '[:space:]' < "$LAST_RUN_FILE" 2>/dev/null || echo "")

    if [[ -n "$_CURRENT_VERSION" && "$_CURRENT_VERSION" != "$_LAST_VERSION" ]]; then
        if [[ -x "$TOOLKIT_ROOT/scripts/post-update.sh" ]]; then
            # Run migration in background; don't block session start. Errors are
            # non-fatal — the app's reconciler will catch anything critical.
            bash "$TOOLKIT_ROOT/scripts/post-update.sh" migrate >/dev/null 2>&1 &
            disown 2>/dev/null || true
        fi
        # Record the new version regardless, so we don't re-trigger on every session
        # if post-update.sh is missing or failing.
        echo "$_CURRENT_VERSION" > "$LAST_RUN_FILE" 2>/dev/null || true
    fi
fi

# --- Branch safety warning --------------------------------------------------
# If the toolkit root is a git repo on a non-default branch, surface a warning.
# This catches cases where a worktree or manual checkout left the toolkit on
# a feature branch that future /update runs would refuse to touch.
if [[ -d "$TOOLKIT_ROOT/.git" ]] || ( cd "$TOOLKIT_ROOT" 2>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null ); then
    _BRANCH=$(cd "$TOOLKIT_ROOT" 2>/dev/null && git branch --show-current 2>/dev/null || echo "")
    _DEFAULT=$(cd "$TOOLKIT_ROOT" 2>/dev/null && git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "")
    # Fallback: probe master then main
    if [[ -z "$_DEFAULT" ]]; then
        if (cd "$TOOLKIT_ROOT" 2>/dev/null && git rev-parse --verify master &>/dev/null); then
            _DEFAULT="master"
        else
            _DEFAULT="main"
        fi
    fi
    if [[ -n "$_BRANCH" && -n "$_DEFAULT" && "$_BRANCH" != "$_DEFAULT" ]]; then
        _append_ctx "WARNING: destinclaude-core toolkit is on branch '$_BRANCH' (default: '$_DEFAULT'). Switch branches before running /update unless this checkout is intentional."
    fi
fi

# --- Encyclopedia context injection ----------------------------------------
# The encyclopedia package (destinclaude-encyclopedia) writes user data to
# ~/.claude/encyclopedia. We don't inspect the package directory — only the
# user-data dir — so this hook stays agnostic of which packages are installed.
if [[ -d "$CLAUDE_DIR/encyclopedia" ]]; then
    _append_ctx "Personal encyclopedia is available at ~/.claude/encyclopedia — reference it when the user asks about their own notes, facts, or history."
fi

# --- Emit SessionStart JSON context ----------------------------------------
# Only emit when there's something worth injecting — empty output keeps the
# session start clean.
if [[ -n "$_CTX" ]]; then
    # JSON-escape: replace backslashes, double quotes, and newlines.
    _ESC=${_CTX//\\/\\\\}
    _ESC=${_ESC//\"/\\\"}
    _ESC=${_ESC//$'\n'/\\n}
    printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$_ESC"
fi

exit 0
