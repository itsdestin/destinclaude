#!/bin/bash
# PostToolUse hook for Write|Edit
# Commits changes to Git, pushes every 15 min, archives to Drive on push
# Supports multiple project repos: ~/.claude/ and ~/claude-mobile/
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
CLAUDE_MOBILE_DIR="$HOME/claude-mobile"
REGISTRY="$CLAUDE_DIR/.write-registry.json"

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
elif [[ "$FILE_PATH" == */claude-mobile/* || "$FILE_PATH" == "$CLAUDE_MOBILE_DIR"/* ]]; then
    REPO_DIR="$CLAUDE_MOBILE_DIR"
    PUSH_MARKER="$CLAUDE_DIR/.push-marker-claude-mobile"
    REBASE_FAIL_COUNT_FILE="$CLAUDE_DIR/.rebase-fail-count-claude-mobile"
else
    exit 0
fi

cd "$REPO_DIR"

# Detect the default branch for this repo
PUSH_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Is this file ignored by .gitignore? If so, skip.
if git check-ignore -q "$FILE_PATH" 2>/dev/null; then
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
        CONTENT_HASH=$( (sha256sum "$FILE_PATH" 2>/dev/null || shasum -a 256 "$FILE_PATH" 2>/dev/null) | cut -c1-16)
    fi
    TIMESTAMP=$(date +%s)

    # Read existing registry or create empty
    if [[ -f "$REGISTRY" ]]; then
        REG_CONTENT=$(cat "$REGISTRY")
    else
        REG_CONTENT="{}"
    fi

    # Update registry entry for this file (simple JSON manipulation)
    NORM_PATH="${FILE_PATH//\\/\/}"
    # Use node for reliable JSON manipulation
    REG_CONTENT=$(node -e "
        const reg = JSON.parse(process.argv[1]);
        reg[process.argv[2]] = {pid: parseInt(process.argv[3]), timestamp: parseInt(process.argv[4]), content_hash: process.argv[5]};
        console.log(JSON.stringify(reg, null, 2));
    " "$REG_CONTENT" "$NORM_PATH" "$PPID" "$TIMESTAMP" "$CONTENT_HASH" 2>/dev/null) || true

    echo "$REG_CONTENT" > "$REGISTRY"
fi

# --- Debounced push (every 15 min) ---
SHOULD_PUSH=false
if [[ ! -f "$PUSH_MARKER" ]]; then
    SHOULD_PUSH=true
else
    LAST_PUSH=$(cat "$PUSH_MARKER" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    ELAPSED=$((NOW - LAST_PUSH))
    if [[ $ELAPSED -ge $PUSH_INTERVAL ]]; then
        SHOULD_PUSH=true
    fi
fi

if [[ "$SHOULD_PUSH" == "true" ]]; then
    # Stash any dirty/untracked files so pull --rebase can proceed
    STASHED=false
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        git stash push -q --include-untracked -m "git-sync: auto-stash before pull" 2>/dev/null && STASHED=true
    fi

    # Pull + rebase
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
            git stash pop -q 2>/dev/null || echo "Warning: stash pop failed — check 'git stash list'" >&2
        fi
    else
        # Rebase succeeded — reset fail counter
        [[ -f "$REBASE_FAIL_COUNT_FILE" ]] && rm -f "$REBASE_FAIL_COUNT_FILE"

        # Push
        git push origin "$PUSH_BRANCH" 2>/dev/null || true

        # Drive archive (best-effort, claude config repo only)
        if [[ "$REPO_DIR" == "$CLAUDE_DIR" ]]; then
            # Read DRIVE_ROOT from config
            _DRIVE_ROOT="Claude"
            if command -v node &>/dev/null && [[ -f "$CLAUDE_DIR/toolkit-state/config.json" ]]; then
                _DR=$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(c.DRIVE_ROOT)console.log(c.DRIVE_ROOT)}catch{}" "$CLAUDE_DIR/toolkit-state/config.json" 2>/dev/null)
                [[ -n "$_DR" ]] && _DRIVE_ROOT="$_DR"
            fi
            TIMESTAMP_FOLDER=$(date +"(%m-%d-%Y @ %I%M%p)")
            ARCHIVE_BASE="gdrive:$_DRIVE_ROOT/Backup/$TIMESTAMP_FOLDER"
            {
                rclone copy "$CLAUDE_DIR/specs/" "$ARCHIVE_BASE/specs/" 2>/dev/null
                rclone copy "$CLAUDE_DIR/skills/" "$ARCHIVE_BASE/skills/" \
                    --exclude "node_modules/**" --exclude "__pycache__/**" --exclude "*.exe" --exclude "*.db" 2>/dev/null
                rclone copyto "$CLAUDE_DIR/CLAUDE.md" "$ARCHIVE_BASE/claude-md/CLAUDE.md" 2>/dev/null
                # Transcripts go to stable path (not inside timestamped folder) for restore.sh
                rclone copy "$HOME/.claude/projects/" "gdrive:$_DRIVE_ROOT/Backup/conversations/" \
                    --include "*.jsonl" --size-only 2>/dev/null
            } || true  # Best-effort: don't fail if rclone errors
        fi

        # Update push marker and sync status
        date +%s > "$PUSH_MARKER"
        echo "OK: System Changes Synced" > "$CLAUDE_DIR/.sync-status"

        # Restore stashed changes on success path
        if [[ "$STASHED" == "true" ]]; then
            git stash pop -q 2>/dev/null || echo "Warning: stash pop failed — check 'git stash list'" >&2
        fi
    fi
fi

exit 0
