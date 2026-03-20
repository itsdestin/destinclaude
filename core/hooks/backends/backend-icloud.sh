#!/usr/bin/env bash
# backend-icloud.sh — iCloud Drive backend driver for backup engine
# Implements: backup_push, backup_pull, backup_check
# macOS only — uses iCloud Drive path directly

ICLOUD_BASE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Claude/Backup"

backup_check() {
    if [[ "$(uname)" != "Darwin" ]]; then
        echo "iCloud backend is macOS only" >&2
        return 1
    fi
    # Check if iCloud Drive path exists
    if [[ ! -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs/" ]]; then
        echo "iCloud Drive not available" >&2
        return 1
    fi
    mkdir -p "$ICLOUD_BASE"
    return 0
}

backup_push() {
    local LOCAL_PATH="$1"
    local REMOTE_PATH="$2"
    local TARGET="$ICLOUD_BASE/$REMOTE_PATH"

    local TARGET_DIR
    if [[ -d "$LOCAL_PATH" ]]; then
        TARGET_DIR="$TARGET"
    else
        TARGET_DIR=$(dirname "$TARGET")
    fi
    mkdir -p "$TARGET_DIR"

    if [[ -d "$LOCAL_PATH" ]]; then
        rsync -a --delete "$LOCAL_PATH/" "$TARGET/" 2>/dev/null || cp -R "$LOCAL_PATH/." "$TARGET/"
    else
        cp "$LOCAL_PATH" "$TARGET"
    fi
}

backup_pull() {
    local REMOTE_PATH="$1"
    local LOCAL_PATH="$2"
    local SOURCE="$ICLOUD_BASE/$REMOTE_PATH"

    [[ ! -e "$SOURCE" ]] && return 0  # Nothing to pull

    local LOCAL_DIR
    if [[ "$REMOTE_PATH" == */ ]]; then
        LOCAL_DIR="$LOCAL_PATH"
    else
        LOCAL_DIR=$(dirname "$LOCAL_PATH")
    fi
    mkdir -p "$LOCAL_DIR"

    if [[ -d "$SOURCE" ]]; then
        rsync -a "$SOURCE/" "$LOCAL_PATH/" 2>/dev/null || cp -R "$SOURCE/." "$LOCAL_PATH/"
    else
        cp "$SOURCE" "$LOCAL_PATH"
    fi
}
