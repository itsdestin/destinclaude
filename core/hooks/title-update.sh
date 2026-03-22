#!/bin/bash
# PostToolUse hook: reminds Claude to update the conversation topic periodically.
# Fires on every tool use but only emits output when >=10 minutes have passed
# since the last topic update (or no topic has been set yet).
# Uses per-session files so multiple sessions don't clobber each other.
# Self-throttles by updating the marker when it emits a reminder.
# Topic files stored in $HOME/.claude/topics/ to avoid ~/.claude/ permission issues.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" 2>/dev/null)

if [ -z "$SESSION_ID" ]; then
    exit 0  # Can't do anything without a session ID
fi

TOPIC_DIR="$HOME/.claude/topics"
mkdir -p "$TOPIC_DIR"

# Prune topic files older than 7 days (at most once per day)
PRUNE_MARKER="$TOPIC_DIR/.prune-marker"
NOW=$(date +%s)
DO_PRUNE=false
if [ ! -f "$PRUNE_MARKER" ]; then
    DO_PRUNE=true
else
    LAST_PRUNE=$(head -1 "$PRUNE_MARKER" 2>/dev/null)
    if [ $((NOW - ${LAST_PRUNE:-0})) -ge 86400 ]; then
        DO_PRUNE=true
    fi
fi
if [ "$DO_PRUNE" = true ]; then
    find "$TOPIC_DIR" -name "topic-*" -mtime +7 -delete 2>/dev/null
    find "$TOPIC_DIR" -name "marker-*" -mtime +7 -delete 2>/dev/null
    echo "$NOW" > "$PRUNE_MARKER"
fi

MARKER="$TOPIC_DIR/marker-$SESSION_ID"
TOPIC_FILE="$TOPIC_DIR/topic-$SESSION_ID"

# Shorter interval if topic was never set (still "New Session"), longer once set
CURRENT_TOPIC=""
[ -f "$TOPIC_FILE" ] && CURRENT_TOPIC=$(head -1 "$TOPIC_FILE" 2>/dev/null)
if [ "$CURRENT_TOPIC" = "New Session" ] || [ -z "$CURRENT_TOPIC" ]; then
    INTERVAL=120  # 2 minutes — keep nagging until titled
else
    INTERVAL=600  # 10 minutes — occasional refresh
fi

if [ -f "$MARKER" ]; then
    LAST=$(head -1 "$MARKER")
    ELAPSED=$((NOW - LAST))
    if [ "$ELAPSED" -lt "$INTERVAL" ]; then
        exit 0  # Silent — too soon
    fi
fi

# Update marker NOW so subsequent tool uses don't re-trigger
echo "$NOW" > "$MARKER"

# Pre-seed with a default topic if no topic file exists yet (first tool use)
if [ ! -f "$TOPIC_FILE" ] || [ ! -s "$TOPIC_FILE" ]; then
    echo "New Session" > "$TOPIC_FILE"
fi

# Use hookSpecificOutput JSON format so the message appears in Claude's context
# NOTE: Do NOT delete the topic file — Claude overwrites it in place. Deleting
# creates a race where the statusline has nothing to display if Claude doesn't
# respond to the reminder before the next statusline poll.
MSG="[Auto-Title] Run this Bash command NOW before doing anything else: echo \"Topic Here\" > $TOPIC_FILE — replace Topic Here with a 3-5 word Title Case summary of this conversation. Do NOT skip this."
ESCAPED=$(echo "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g')
echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"$ESCAPED\"}}"
