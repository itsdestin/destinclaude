#!/usr/bin/env bash
# Migration 2.2.0: Stop tracking toolkit-managed symlinks in git.
#
# .gitignore changes are committed and pushed (tells all devices to stop tracking).
# git rm --cached runs device-locally (each device cleans its own index on /update).
# This prevents cross-device deletion cascades.
#
# Must be idempotent — safe to run multiple times.
set -euo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
GITIGNORE="$CLAUDE_HOME/.gitignore"

# Exit early if not a git repo
if ! git -C "$CLAUDE_HOME" rev-parse --is-inside-work-tree &>/dev/null; then
    echo "[SKIP] Not a git repo — nothing to migrate"
    exit 0
fi

cd "$CLAUDE_HOME"

# --- Step 1: Update .gitignore (committed, propagates to all devices) ---
_changed=false
for pattern in "commands/" "plugins/installed_plugins.json"; do
    if ! grep -qxF "$pattern" "$GITIGNORE" 2>/dev/null; then
        echo "$pattern" >> "$GITIGNORE"
        _changed=true
    fi
done

if [[ "$_changed" == "true" ]]; then
    git add .gitignore
    git diff --cached --quiet .gitignore || \
        git commit -m "chore: update .gitignore for toolkit-managed paths"
    echo "[OK] .gitignore updated"
else
    echo "[SKIP] .gitignore already up to date"
fi

# --- Step 2: Untrack toolkit-managed paths (device-local, NOT committed) ---

# Untrack commands/ (always symlinks)
if git ls-files --error-unmatch commands/ &>/dev/null 2>&1; then
    git rm --cached -r commands/ 2>/dev/null || true
    echo "[OK] Untracked commands/"
fi

# Untrack ONLY symlinked skills (preserve user-authored directories)
for skill in skills/*/; do
    [[ ! -d "$skill" ]] && continue
    if [[ -L "${skill%/}" ]]; then
        if git ls-files --error-unmatch "$skill" &>/dev/null 2>&1; then
            git rm --cached -r "$skill" 2>/dev/null || true
            echo "[OK] Untracked symlinked skill: $skill"
        fi
    fi
done

# Untrack plugin state file
if git ls-files --error-unmatch plugins/installed_plugins.json &>/dev/null 2>&1; then
    git rm --cached plugins/installed_plugins.json 2>/dev/null || true
    echo "[OK] Untracked plugins/installed_plugins.json"
fi

# --- Step 3: Clean up files beyond symlinks (from auto-repair bug B1) ---
# If any tracked files are "beyond a symbolic link" (the root cause of the
# 115+ hour sync outage), remove them from the index.
_beyond_symlink=$(git ls-files 2>/dev/null | while IFS= read -r f; do
    dir=$(dirname "$f")
    while [[ "$dir" != "." && "$dir" != "/" ]]; do
        if [[ -L "$dir" ]]; then
            echo "$f"
            break
        fi
        dir=$(dirname "$dir")
    done
done)

if [[ -n "$_beyond_symlink" ]]; then
    echo "$_beyond_symlink" | while IFS= read -r f; do
        git rm --cached "$f" 2>/dev/null || true
        echo "[OK] Removed beyond-symlink file from index: $f"
    done
fi

echo "[DONE] Migration 2.2.0 complete"
