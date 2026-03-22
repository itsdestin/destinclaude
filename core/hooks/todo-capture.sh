#!/bin/bash
# Hook: UserPromptSubmit — intercept /todo messages and pass to Claude
# for capture via Todoist MCP, without interrupting current task flow.
set -euo pipefail

input=$(cat)
prompt=$(echo "$input" | jq -r '.user_prompt // ""')

# Only act on messages starting with /todo (case-insensitive first match)
if [[ ! "$prompt" =~ ^/todo[[:space:]] ]]; then
  exit 0
fi

# Extract the note (everything after "/todo ")
note="${prompt#/todo }"
note=$(echo "$note" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

if [[ -z "$note" ]]; then
  echo '{"systemMessage": "The user typed /todo with no note. Ask what they want to capture, then continue your previous task."}' >&2
  exit 2
fi

# Pass to Claude to create via Todoist MCP tools
echo "{\"systemMessage\": \"[Todo Hook] Use the Todoist MCP add-tasks tool to add this note to the Claude's Inbox project: \\\"$note\\\". Briefly confirm capture, then seamlessly continue your previous task. Do NOT invoke the todo skill.\"}"
