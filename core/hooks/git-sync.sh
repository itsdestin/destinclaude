#!/bin/bash
# Source shared infrastructure (trap handlers, error capture, rotation)
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$HOOK_DIR/lib/hook-preamble.sh" ]] && source "$HOOK_DIR/lib/hook-preamble.sh"

# PostToolUse hook for Write|Edit
# Commits changes to Git, pushes every 15 min (Drive archive removed — personal-sync.sh handles all backend replication)
# Tracks the ~/.claude/ project repo
set -euo pipefail

# Read file path from stdin JSON
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | node -e "
  let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
    try{const j=JSON.parse(d);const p=j.tool_input&&j.tool_input.file_path||j.file_path||'';
    console.log(p.split(String.fromCharCode(92)).join('/'))}catch{console.log('')}
  })" 2>/dev/null)
[[ -z "$FILE_PATH" ]] && exit 0

# Config
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
REGISTRY="$CLAUDE_DIR/.write-registry.json"

# Source shared backup utilities
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$HOOK_DIR/lib/backup-common.sh" ]]; then
    source "$HOOK_DIR/lib/backup-common.sh"
fi

# Determine which project repo this file belongs to
REPO_DIR=""
PUSH_INTERVAL=900  # 15 minutes in seconds
PUSH_MARKER=""
REBASE_FAIL_COUNT_FILE=""
PUSH_BRANCH="main"

if [[ "$FILE_PATH" == */.claude/* || "$FILE_PATH" == "$CLAUDE_DIR"/* ]]; then
    REPO_DIR="$CLAUDE_DIR"
    PUSH_MARKER="$CLAUDE_DIR/.push-marker"
    REBASE_FAIL_COUNT_FILE="$CLAUDE_DIR/.rebase-fail-count"
else
    exit 0
fi

cd "$REPO_DIR"

# Bail if this directory is not a git repo (Design ref: D8)
if [[ ! -d "$REPO_DIR/.git" ]]; then
    if type log_backup &>/dev/null; then
        log_backup "WARN" "git-sync: $REPO_DIR is not a git repo — skipping"
    fi
    exit 0
fi

# Detect the default branch for this repo
PUSH_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
# Validate the detected branch exists on the remote; fall back to main if not
if ! git rev-parse --verify "origin/$PUSH_BRANCH" &>/dev/null; then
    PUSH_BRANCH="main"
fi

# Is this file ignored by .gitignore? If so, skip.
if git check-ignore -q "$FILE_PATH" 2>/dev/null; then
    exit 0
fi

# Skip toolkit-owned files (symlinks into toolkit repo) — Design ref: D2
if type is_toolkit_owned &>/dev/null && is_toolkit_owned "$FILE_PATH"; then
    exit 0
fi

# --- Git commit (immediate, local) ---
git add "$FILE_PATH" 2>/dev/null || true
BASENAME=$(basename "$FILE_PATH")

# Only commit if there are staged changes
if ! git diff --cached --quiet 2>/dev/null; then
    # --no-gpg-sign approved for auto-commits (hook-generated, not user-authored)
    git commit -m "auto: $BASENAME" --no-gpg-sign 2>/dev/null || true
    echo "OK: System Changes Synced" > "$CLAUDE_DIR/.sync-status"
fi

# --- Write registry update (for write-guard) ---
if [[ -n "$PPID" ]]; then
    CONTENT_HASH=""
    if [[ -f "$FILE_PATH" ]]; then
        CONTENT_HASH=$( (sha256sum "$FILE_PATH" 2>/dev/null || shasum -a 256 "$FILE_PATH" 2>/dev/null) | awk '{print substr($1,1,16)}')
    fi
    TIMESTAMP=$(date +%s)

    # Read existing registry or create empty
    if [[ -f "$REGISTRY" ]]; then
        REG_CONTENT=$(cat "$REGISTRY")
    else
        REG_CONTENT="{}"
    fi

    # Update registry entry for this file (simple JSON manipulation)
    NORM_PATH="${FILE_PATH//\\//}"
    # Use node for reliable JSON manipulation
    REG_CONTENT=$(node -e "
        const reg = JSON.parse(process.argv[1]);
        reg[process.argv[2]] = {pid: parseInt(process.argv[3]), timestamp: parseInt(process.argv[4]), content_hash: process.argv[5]};
        console.log(JSON.stringify(reg, null, 2));
    " "$REG_CONTENT" "$NORM_PATH" "$PPID" "$TIMESTAMP" "$CONTENT_HASH" 2>/dev/null) || true

    atomic_write "$REGISTRY" "$REG_CONTENT"
fi

# --- Debounced push (every 15 min) ---
if type debounce_check &>/dev/null; then
    debounce_check "$PUSH_MARKER" 15 || exit 0
else
    # Fallback if lib not available
    if [[ -f "$PUSH_MARKER" ]]; then
        LAST_PUSH=$(cat "$PUSH_MARKER" 2>/dev/null || echo 0)
        NOW=$(date +%s)
        ELAPSED=$((NOW - LAST_PUSH))
        [[ $ELAPSED -lt $PUSH_INTERVAL ]] && exit 0
    fi
fi

# Stash any dirty/untracked files so pull --rebase can proceed
STASHED=false
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    git stash push -q --include-untracked -m "git-sync: auto-stash before pull" 2>/dev/null && STASHED=true
    register_cleanup 'cd "'"$REPO_DIR"'" && git stash pop -q 2>/dev/null || true'
fi

# Pull + rebase
register_cleanup 'cd "'"$REPO_DIR"'" && git rebase --abort 2>/dev/null || true'
if ! git pull --rebase origin "$PUSH_BRANCH" 2>/dev/null; then
    git rebase --abort 2>/dev/null || true

    # Track consecutive rebase failures
    FAIL_COUNT=0
    [[ -f "$REBASE_FAIL_COUNT_FILE" ]] && FAIL_COUNT=$(cat "$REBASE_FAIL_COUNT_FILE")
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "$FAIL_COUNT" > "$REBASE_FAIL_COUNT_FILE"

    if [[ $FAIL_COUNT -ge 3 ]]; then
        echo "{\"hookSpecificOutput\": \"ERROR: Git rebase conflict persisted across 3 push cycles in $REPO_DIR. Manual resolution needed: cd $REPO_DIR && git status\"}" >&2
        echo 0 > "$REBASE_FAIL_COUNT_FILE"
        echo "ERR: Rebase conflict (3 cycles)" > "$CLAUDE_DIR/.sync-status"
    fi

    # Restore stashed changes on failure path
    if [[ "$STASHED" == "true" ]]; then
        if ! git stash pop -q 2>/dev/null; then
            # Abort any conflicted merge state so the working tree is clean
            git checkout -- . 2>/dev/null || true
            echo '{"hookSpecificOutput": "Warning: git stash pop failed after pull. Orphaned changes in stash — run `cd ~/.claude && git stash list` to inspect."}' >&2
            log_backup "WARN" "Stash pop failed in $REPO_DIR — orphaned stash entry"
        fi
    fi
else
    # Rebase succeeded — reset fail counter
    [[ -f "$REBASE_FAIL_COUNT_FILE" ]] && rm -f "$REBASE_FAIL_COUNT_FILE"

    # Push
    if _capture_err "git push" git push origin "$PUSH_BRANCH"; then
        echo "OK: System Changes Synced" > "$CLAUDE_DIR/.sync-status"
        log_backup "INFO" "Push completed" "sync.push.git"
    else
        echo "ERR: Git push failed" > "$CLAUDE_DIR/.sync-status"
        log_backup "WARN" "Git push failed" "sync.push.git"
    fi

    # Drive archive removed — personal-sync.sh handles all backend replication (D4)

    # Update push marker
    date +%s > "$PUSH_MARKER"

    # Restore stashed changes on success path
    if [[ "$STASHED" == "true" ]]; then
        if ! git stash pop -q 2>/dev/null; then
            git checkout -- . 2>/dev/null || true
            echo '{"hookSpecificOutput": "Warning: git stash pop failed after pull. Orphaned changes in stash — run `cd ~/.claude && git stash list` to inspect."}' >&2
            log_backup "WARN" "Stash pop failed in $REPO_DIR — orphaned stash entry"
        fi
    fi
fi

exit 0
