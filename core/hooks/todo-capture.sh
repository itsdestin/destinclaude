#!/bin/bash
# Hook: UserPromptSubmit — capture /todo notes to local inbox
set -euo pipefail

input=$(cat)
prompt=$(echo "$input" | jq -r '.user_prompt // ""')

if [[ ! "$prompt" =~ ^/todo[[:space:]] ]]; then
  exit 0
fi

note="${prompt#/todo }"
note=$(echo "$note" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [[ -z "$note" ]]; then
  echo '{"systemMessage": "The user typed /todo with no note. Ask what they want to capture."}'
  exit 0
fi

# Write to local inbox
inbox_dir="$HOME/.claude/inbox"
mkdir -p "$inbox_dir"
timestamp=$(date +%Y-%m-%dT%H-%M-%S)
filename="${timestamp}_todo.md"

cat > "$inbox_dir/$filename" << ENDOFFILE
---
source: local
captured: $(date +%Y-%m-%dT%H:%M:%S%z)
origin: todo
---
$note
ENDOFFILE

echo '{"systemMessage": "[Todo] Note captured to local inbox. Briefly confirm, then continue your previous task."}'
