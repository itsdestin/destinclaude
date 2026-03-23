# Gmail Provider

**Platform:** all

Reads emails from a configured Gmail label. Intended for self-emails and forwarded items captured from mobile.

Uses `mcp__claude_ai_Gmail__*` cloud-hosted Anthropic MCP connector tools. These are always available when the Gmail MCP connector is enabled — no local installation required.

## Configuration

Reads `inbox_provider_config.gmail.label` from `~/.claude/toolkit-state/config.json`. Default label: `"Claude Inbox"`.

## Setup Requirements

The Gmail MCP connector must be enabled. Additionally, the user should create a Gmail filter that auto-labels self-sent emails (from yourself to yourself) with the configured label. The inbox setup wizard guides this configuration.

## List

1. Call `gmail_search_messages` with query:
   ```
   label:<configured_label> -label:Claude-Processed -label:Claude-Presented
   ```
   Set limit to 50 messages. The `-label` exclusions filter out messages already handled in prior runs.

2. If the search fails (MCP unavailable, label not found), skip this provider and report it as unavailable.

3. Return messages sorted by `internalDate`, newest first.

## Read

For each message ID from the List step:

1. Call `gmail_read_message` with the message ID.
2. Extract:
   - **Title:** subject line
   - **Content:** body text (prefer plain text part; fall back to HTML with tags stripped)
   - **Timestamp:** `internalDate` field
   - **Attachments:** note any attachment names found in the message. Do not attempt to download attachments — Gmail MCP attachment handling varies and binary downloads are unreliable. Note each as `"has Gmail attachment: <filename> (not downloaded)"`.

## Mark Processed

Apply the `"Claude-Processed"` label to the message. If that label does not exist in the user's Gmail account, archive the message instead (remove the Inbox label).

Use the Gmail MCP tools to modify labels. The `List` query excludes `Claude-Processed` messages, so this acts as a permanent "done" marker.

## Mark Presented

Apply the `"Claude-Presented"` label to the message.

The `List` query excludes `Claude-Presented` messages, so this prevents re-presentation on subsequent same-day runs. When the item is later resolved, replace `Claude-Presented` with `Claude-Processed`.

## Notes

- The `Claude-Processed` and `Claude-Presented` labels must exist in the user's Gmail account for label-based marking to work. If they do not exist, the skill should note this and fall back to archiving for processed items and skipping the presentation guard for presented items.
- Gmail MCP tools are prefixed `mcp__claude_ai_Gmail__` and operate on the authenticated Google account linked to Claude.
