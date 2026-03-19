#!/bin/bash
# fork-file-inbox.sh: SessionStart hook — check iMessages self-thread for unprocessed food photos.
# If new images are found since the last processed timestamp, emit a hookSpecificOutput that
# instructs Claude to automatically run the fork-file food photo flow.
#
# Requires: sqlite3, Full Disk Access for your terminal app
# State file: ~/.claude/fork-file/last_image_timestamp (created by fork-file skill on first save)

DB="$HOME/Library/Messages/chat.db"
STATE_FILE="$HOME/.claude/fork-file/last_image_timestamp"

# Ensure sqlite3 is available and DB is accessible
if ! command -v sqlite3 &>/dev/null; then exit 0; fi
if [[ ! -f "$DB" ]]; then exit 0; fi
if [[ ! -f "$STATE_FILE" ]]; then exit 0; fi

LAST_TS=$(cat "$STATE_FILE" 2>/dev/null | tr -d '[:space:]')
[[ -z "$LAST_TS" || ! "$LAST_TS" =~ ^[0-9]+$ ]] && LAST_TS=0

# Dynamically find the self-thread: a single-handle chat with messages in both directions
# (is_from_me=1 and is_from_me=0). Works regardless of chat ROWID — survives new Mac,
# iCloud restore, or Messages DB rebuild.
CHAT_ID=$(sqlite3 "$DB" "
  SELECT c.ROWID
  FROM chat c
  JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
  JOIN message m ON cmj.message_id = m.ROWID
  JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
  GROUP BY c.ROWID
  HAVING COUNT(DISTINCT chj.handle_id) = 1
     AND SUM(CASE WHEN m.is_from_me = 1 THEN 1 ELSE 0 END) > 0
     AND SUM(CASE WHEN m.is_from_me = 0 THEN 1 ELSE 0 END) > 0
  ORDER BY MAX(m.date) DESC
  LIMIT 1;
" 2>/dev/null) || CHAT_ID=""

CHAT_ID=$(echo "$CHAT_ID" | tr -d '[:space:]')
[[ -z "$CHAT_ID" || ! "$CHAT_ID" =~ ^[0-9]+$ ]] && exit 0

# Count new images in the self-thread since last processed timestamp
COUNT=$(sqlite3 "$DB" "
  SELECT COUNT(DISTINCT a.ROWID)
  FROM attachment a
  JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
  JOIN message m ON maj.message_id = m.ROWID
  JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
  WHERE cmj.chat_id = ${CHAT_ID}
    AND a.mime_type LIKE 'image%'
    AND m.date > ${LAST_TS};
" 2>/dev/null) || COUNT=0

COUNT=$(echo "$COUNT" | tr -d '[:space:]')
[[ -z "$COUNT" || ! "$COUNT" =~ ^[0-9]+$ ]] && COUNT=0

if [[ "$COUNT" -gt 0 ]]; then
  if [[ "$COUNT" -eq 1 ]]; then
    LABEL="1 new food photo"
  else
    LABEL="${COUNT} new food photos"
  fi
  printf '{"hookSpecificOutput": "Fork File inbox: %s found in your iMessages self-thread. Process them now using the fork-file skill — identify each item, ask for location and price, then save to pantry.csv. Update ~/.claude/fork-file/last_image_timestamp after processing."}' "$LABEL" >&2
fi

exit 0
