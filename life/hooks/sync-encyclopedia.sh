#!/usr/bin/env bash
# Syncs encyclopedia files between local cache and Google Drive via rclone.
# Reads DRIVE_ROOT from toolkit config; falls back to "Claude" if unset.

set -euo pipefail

CONFIG_FILE="$HOME/.claude/toolkit-state/config.json"
DRIVE_ROOT="Claude"

if [[ -f "$CONFIG_FILE" ]]; then
    CONFIGURED_ROOT=$(grep -o '"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | sed 's/.*"DRIVE_ROOT"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
    if [[ -n "$CONFIGURED_ROOT" ]]; then
        DRIVE_ROOT="$CONFIGURED_ROOT"
    fi
fi

ENCYCLOPEDIA_DIR="encyclopedia"
if [[ -f "$CONFIG_FILE" ]]; then
    CONFIGURED_DIR=$(grep -o '"ENCYCLOPEDIA_DIR"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | sed 's/.*"ENCYCLOPEDIA_DIR"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
    if [[ -n "$CONFIGURED_DIR" ]]; then
        ENCYCLOPEDIA_DIR="$CONFIGURED_DIR"
    fi
fi

ENCYCLOPEDIA_REMOTE_PATH="The Journal/System"
if [[ -f "$CONFIG_FILE" ]]; then
    CONFIGURED_PATH=$(grep -o '"encyclopedia_remote_path"[[:space:]]*:[[:space:]]*"[^"]*"' "$CONFIG_FILE" | head -1 | sed 's/.*"encyclopedia_remote_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')
    if [[ -n "$CONFIGURED_PATH" ]]; then
        ENCYCLOPEDIA_REMOTE_PATH="$CONFIGURED_PATH"
    fi
fi

LOCAL_DIR="$HOME/.claude/$ENCYCLOPEDIA_DIR"
REMOTE_DIR="gdrive:$DRIVE_ROOT/$ENCYCLOPEDIA_REMOTE_PATH"

# Ensure local directory exists
mkdir -p "$LOCAL_DIR"

# Sync from Drive to local (Drive is source of truth)
if command -v rclone &>/dev/null; then
    rclone sync "$REMOTE_DIR/" "$LOCAL_DIR/" --update 2>/dev/null || true
fi
