#!/bin/bash
# Hook: Called by session-start.sh to check for inbox items across all providers
# Outputs a systemMessage if items are found, silent otherwise
set -euo pipefail

CONFIG_FILE="$HOME/.claude/toolkit-state/config.json"
INBOX_DIR="$HOME/.claude/inbox"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
count=0

# Always check local inbox
if [[ -d "$INBOX_DIR" ]]; then
  local_count=$(find "$INBOX_DIR" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l)
  count=$((count + local_count))
fi

# Read config for additional providers
if [[ ! -f "$CONFIG_FILE" ]]; then
  # No config — only local provider
  if [[ $count -gt 0 ]]; then
    echo "{\"systemMessage\": \"[Inbox] You have $count note(s) in Claude's Inbox. Say 'check my inbox' to process.\"}"
  fi
  exit 0
fi

# Verify jq is available (required for JSON parsing)
if ! command -v jq &>/dev/null; then
  # Without jq, can only check local inbox
  if [[ $count -gt 0 ]]; then
    echo "{\"systemMessage\": \"[Inbox] You have $count note(s) in Claude's Inbox. Say 'check my inbox' to process.\"}"
  fi
  exit 0
fi

providers=$(cat "$CONFIG_FILE" | jq -r '.inbox_providers[]? // empty' 2>/dev/null)

for provider in $providers; do
  case "$provider" in
    local)
      # Already counted above
      ;;
    todoist)
      # Todoist check is handled by the skill itself (MCP call too heavy for session-start)
      ;;
    google-drive)
      if command -v rclone &>/dev/null; then
        drive_path=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["google-drive"].inbox_path // "Claude/Inbox"' 2>/dev/null)
        if command -v timeout &>/dev/null; then
          drive_count=$(timeout 5 rclone lsf "gdrive:$drive_path" 2>/dev/null | wc -l || echo 0)
        else
          drive_count=$(rclone lsf "gdrive:$drive_path" 2>/dev/null | wc -l || echo 0)
        fi
        count=$((count + drive_count))
      fi
      ;;
    gmail)
      # Gmail MCP check too heavy for session-start — handled by skill
      ;;
    apple-notes)
      if [[ "$PLATFORM" == "darwin" ]]; then
        notes_folder=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["apple-notes"].folder // "Claude"' 2>/dev/null)
        notes_count=$(timeout 5 osascript -e "tell application \"Notes\" to count notes of folder \"$notes_folder\"" 2>/dev/null || echo 0)
        count=$((count + notes_count))
      fi
      ;;
    apple-reminders)
      if [[ "$PLATFORM" == "darwin" ]]; then
        reminders_list=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["apple-reminders"].list // "Claude"' 2>/dev/null)
        reminders_count=$(timeout 5 osascript -e "tell application \"Reminders\" to count (reminders of list \"$reminders_list\" whose completed is false)" 2>/dev/null || echo 0)
        count=$((count + reminders_count))
      fi
      ;;
    icloud-drive)
      if [[ "$PLATFORM" == "darwin" ]]; then
        icloud_path=$(cat "$CONFIG_FILE" | jq -r '.inbox_provider_config["icloud-drive"].inbox_path // "Claude/Inbox"' 2>/dev/null)
        icloud_dir="$HOME/Library/Mobile Documents/com~apple~CloudDocs/$icloud_path"
        if [[ -d "$icloud_dir" ]]; then
          icloud_count=$(ls "$icloud_dir" 2>/dev/null | wc -l)
          count=$((count + icloud_count))
        fi
      fi
      ;;
  esac
done

if [[ $count -gt 0 ]]; then
  echo "{\"systemMessage\": \"[Inbox] You have $count note(s) in Claude's Inbox. Say 'check my inbox' to process.\"}"
fi
