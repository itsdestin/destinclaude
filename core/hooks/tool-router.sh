#!/bin/bash
# PreToolUse hook: blocks Claude.ai native Gmail and Google Calendar MCP tools
# and redirects to equivalent GWS CLI commands.
#
# Claude.ai MCP tools blocked:
#   mcp__claude_ai_Gmail__gmail_search_messages  → gws gmail users messages list
#   mcp__claude_ai_Gmail__gmail_read_message      → gws gmail users messages get
#   mcp__claude_ai_Google_Calendar__gcal_list_calendars → gws calendar calendarList list
#   mcp__claude_ai_Google_Calendar__gcal_create_event   → gws calendar events insert
#   mcp__claude_ai_Google_Calendar__gcal_list_events    → gws calendar events list

STDIN_JSON=$(cat)
TOOL_NAME=$(echo "$STDIN_JSON" | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).tool_name||''); }
    catch { console.log(''); }
  });
" 2>/dev/null)

# Only act on Claude.ai Gmail and Google Calendar MCP tools
case "$TOOL_NAME" in
  mcp__claude_ai_Gmail__gmail_search_messages)
    echo "BLOCKED: Claude.ai Gmail MCP is disabled. Use GWS CLI instead:"
    echo "  gws gmail users messages list --user-id me --q 'search query' --format json"
    echo ""
    echo "Common flags: --q (Gmail search syntax), --max-results N, --label-ids LABEL"
    exit 1
    ;;
  mcp__claude_ai_Gmail__gmail_read_message)
    echo "BLOCKED: Claude.ai Gmail MCP is disabled. Use GWS CLI instead:"
    echo "  gws gmail users messages get --user-id me --id MESSAGE_ID --format json"
    echo ""
    echo "Use --format full for headers+body, --format metadata for headers only."
    exit 1
    ;;
  mcp__claude_ai_Google_Calendar__gcal_list_calendars)
    echo "BLOCKED: Claude.ai Google Calendar MCP is disabled. Use GWS CLI instead:"
    echo "  gws calendar calendarList list --format json"
    exit 1
    ;;
  mcp__claude_ai_Google_Calendar__gcal_create_event)
    echo "BLOCKED: Claude.ai Google Calendar MCP is disabled. Use GWS CLI instead:"
    echo "  gws calendar events insert --calendar-id primary --fields 'summary,start,end,description'"
    echo "  gws calendar events quickAdd --calendar-id primary --text 'Meeting tomorrow at 3pm'"
    echo ""
    echo "For structured events, pipe JSON body via stdin or use individual flags."
    exit 1
    ;;
  mcp__claude_ai_Google_Calendar__gcal_list_events)
    echo "BLOCKED: Claude.ai Google Calendar MCP is disabled. Use GWS CLI instead:"
    echo "  gws calendar events list --calendar-id primary --time-min 2024-01-01T00:00:00Z --format json"
    echo ""
    echo "Common flags: --time-min, --time-max, --q 'search', --max-results N, --single-events"
    exit 1
    ;;
  mcp__claude_ai_Gmail__*|mcp__claude_ai_Google_Calendar__*)
    # Catch-all for any future Claude.ai Gmail/Calendar tools
    echo "BLOCKED: Claude.ai Gmail/Calendar MCP tools are disabled."
    echo "Use the GWS CLI instead: gws gmail --help / gws calendar --help"
    exit 1
    ;;
esac

# Not a blocked tool — allow
exit 0
