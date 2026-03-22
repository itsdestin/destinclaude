package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

// Tool definitions for MCP tools/list response.
var toolDefinitions = []map[string]any{
	{
		"name":        "gmessages_status",
		"description": "Check the connection status of Google Messages. Returns whether the client is paired and connected.",
		"inputSchema": map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		},
	},
	{
		"name":        "gmessages_pair",
		"description": "Initiate Gaia (Google account) pairing with Google Messages via emoji verification. Requires Google auth cookies from the user's browser session at messages.google.com. Returns an emoji string — the user must confirm the matching emoji on their phone to complete pairing. Call gmessages_status first to check if already paired.",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"cookies": map[string]any{
					"type":        "object",
					"description": "Google auth cookies (SID, HSID, SSID, OSID, APISID, SAPISID, etc.) extracted from the user's browser session at messages.google.com. Pass as {\"cookie_name\": \"cookie_value\", ...}.",
				},
			},
			// cookies optional — auto-loads from data/cookies.json if not provided
		},
	},
	{
		"name":        "gmessages_conversations",
		"description": "List recent text message conversations. Returns conversation names, participants, and last message times.",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"limit": map[string]any{
					"type":        "number",
					"description": "Max conversations to return (default 20)",
				},
			},
		},
	},
	{
		"name":        "gmessages_messages",
		"description": "Get messages from a specific conversation. Search by contact name or conversation ID.",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"contact": map[string]any{
					"type":        "string",
					"description": "Contact name or phone number to search for",
				},
				"conversation_id": map[string]any{
					"type":        "string",
					"description": "Exact conversation ID (from gmessages_conversations)",
				},
				"limit": map[string]any{
					"type":        "number",
					"description": "Max messages to return (default 50)",
				},
			},
		},
	},
	{
		"name":        "gmessages_search",
		"description": "Search across all text messages for a keyword or phrase.",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"query": map[string]any{
					"type":        "string",
					"description": "Search query to match against message content",
				},
				"limit": map[string]any{
					"type":        "number",
					"description": "Max results to return (default 50)",
				},
			},
			"required": []string{"query"},
		},
	},
	{
		"name":        "gmessages_recent",
		"description": "Get all messages received since a given time. Useful for checking what's come in recently.",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"since": map[string]any{
					"type":        "string",
					"description": "ISO 8601 timestamp (e.g. '2026-03-14T10:00:00Z'). Defaults to last 1 hour.",
				},
				"limit": map[string]any{
					"type":        "number",
					"description": "Max messages to return (default 100)",
				},
			},
		},
	},
	{
		"name":        "gmessages_send",
		"description": "Send a text message. Requires a phone number or conversation ID and the message text. Use with care — this sends a real text message.",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"to": map[string]any{
					"type":        "string",
					"description": "Phone number (e.g. '+16025551234') or contact name",
				},
				"conversation_id": map[string]any{
					"type":        "string",
					"description": "Conversation ID (alternative to 'to')",
				},
				"message": map[string]any{
					"type":        "string",
					"description": "Message text to send",
				},
			},
			"required": []string{"message"},
		},
	},
}

// handleToolCall dispatches a tool call to the appropriate handler.
func handleToolCall(gm *GMClient, store *Store, name string, args json.RawMessage) (any, error) {
	var params map[string]any
	if len(args) > 0 {
		json.Unmarshal(args, &params)
	}
	if params == nil {
		params = map[string]any{}
	}

	switch name {
	case "gmessages_status":
		return handleStatus(gm)
	case "gmessages_pair":
		return handlePair(gm, params)
	case "gmessages_conversations":
		return handleConversations(gm, store, params)
	case "gmessages_messages":
		return handleMessages(gm, store, params)
	case "gmessages_search":
		return handleSearch(store, params)
	case "gmessages_recent":
		return handleRecent(store, params)
	case "gmessages_send":
		return handleSend(gm, store, params)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

func handleStatus(gm *GMClient) (any, error) {
	return map[string]any{
		"paired":    gm.IsPaired(),
		"connected": gm.IsConnected(),
	}, nil
}

func handlePair(gm *GMClient, params map[string]any) (any, error) {
	if gm.IsPaired() && gm.IsConnected() {
		return map[string]any{
			"status":  "already_paired",
			"message": "Already paired and connected.",
		}, nil
	}

	// Extract cookies from params, or auto-load from file
	var cookies map[string]string
	if cookiesRaw, ok := params["cookies"]; ok {
		if cookiesMap, ok := cookiesRaw.(map[string]any); ok {
			cookies = make(map[string]string, len(cookiesMap))
			for k, v := range cookiesMap {
				if s, ok := v.(string); ok {
					cookies[k] = s
				}
			}
		}
	}
	// If no cookies in params, StartGaiaPairing will auto-load from data/cookies.json

	emoji, err := gm.StartGaiaPairing(cookies)
	if err != nil {
		return nil, fmt.Errorf("gaia pairing: %w", err)
	}

	return map[string]any{
		"status":  "emoji_verification",
		"emoji":   emoji,
		"message": fmt.Sprintf("Pairing emoji: %s — Check your phone's Google Messages app. You should see a prompt to confirm this emoji matches. Tap 'Confirm' on your phone to complete pairing. The pairing will finish automatically in the background.", emoji),
	}, nil
}

func handleConversations(gm *GMClient, store *Store, params map[string]any) (any, error) {
	limit := intParam(params, "limit", 20)

	// Refresh from phone if connected
	if gm.IsConnected() {
		convs, err := gm.ListConversations(limit)
		if err == nil {
			for _, c := range convs {
				gm.storeConversation(c)
			}
		}
	}

	return store.GetConversations(limit)
}

func handleMessages(gm *GMClient, store *Store, params map[string]any) (any, error) {
	limit := intParam(params, "limit", 50)
	convID := strParam(params, "conversation_id")
	contact := strParam(params, "contact")

	// Resolve contact name to conversation ID
	if convID == "" && contact != "" {
		convs, err := store.FindConversationByName(contact)
		if err != nil {
			return nil, err
		}
		if len(convs) == 0 {
			return map[string]any{
				"error":   "no_match",
				"message": fmt.Sprintf("No conversation found matching '%s'. Use gmessages_conversations to see available conversations.", contact),
			}, nil
		}
		if len(convs) > 1 {
			return map[string]any{
				"error":   "ambiguous",
				"message": fmt.Sprintf("Multiple conversations match '%s'. Pick one and use conversation_id.", contact),
				"matches": convs,
			}, nil
		}
		convID = convs[0].ID
	}

	if convID == "" {
		return nil, fmt.Errorf("provide either 'contact' or 'conversation_id'")
	}

	// Fetch fresh messages from phone if connected
	if gm.IsConnected() {
		msgs, err := gm.FetchMessages(convID, int64(limit))
		if err == nil {
			for _, m := range msgs {
				gm.storeMessage(m)
			}
		}
	}

	return store.GetMessages(convID, limit)
}

func handleSearch(store *Store, params map[string]any) (any, error) {
	query := strParam(params, "query")
	if query == "" {
		return nil, fmt.Errorf("'query' is required")
	}
	limit := intParam(params, "limit", 50)
	return store.SearchMessages(query, limit)
}

func handleRecent(store *Store, params map[string]any) (any, error) {
	limit := intParam(params, "limit", 100)
	sinceStr := strParam(params, "since")

	var since time.Time
	if sinceStr != "" {
		var err error
		since, err = time.Parse(time.RFC3339, sinceStr)
		if err != nil {
			return nil, fmt.Errorf("invalid 'since' format — use ISO 8601 (e.g. '2026-03-14T10:00:00Z')")
		}
	} else {
		since = time.Now().Add(-1 * time.Hour)
	}

	return store.GetMessagesSince(since, limit)
}

func handleSend(gm *GMClient, store *Store, params map[string]any) (any, error) {
	if !gm.IsConnected() {
		return nil, fmt.Errorf("not connected to Google Messages")
	}
	message := strParam(params, "message")
	if message == "" {
		return nil, fmt.Errorf("'message' is required")
	}

	convID := strParam(params, "conversation_id")
	to := strParam(params, "to")

	// Resolve recipient
	if convID == "" && to != "" {
		// Try as phone number first (starts with +)
		if len(to) > 0 && to[0] == '+' {
			conv, err := gm.GetOrCreateConversation(to)
			if err != nil {
				return nil, fmt.Errorf("get/create conversation for %s: %w", to, err)
			}
			convID = conv.GetConversationID()
		} else {
			// Try as contact name
			convs, err := store.FindConversationByName(to)
			if err != nil {
				return nil, err
			}
			if len(convs) == 0 {
				return nil, fmt.Errorf("no conversation found for '%s'", to)
			}
			if len(convs) > 1 {
				return map[string]any{
					"error":   "ambiguous",
					"message": fmt.Sprintf("Multiple conversations match '%s'. Use conversation_id or phone number.", to),
					"matches": convs,
				}, nil
			}
			convID = convs[0].ID
		}
	}

	if convID == "" {
		return nil, fmt.Errorf("provide 'to' (phone number or contact name) or 'conversation_id'")
	}

	// Get conversation details for SIM payload
	conv, err := gm.client.GetConversation(convID)
	if err != nil {
		return nil, fmt.Errorf("get conversation: %w", err)
	}

	result, err := gm.SendTextMessage(convID, message, conv)
	if err != nil {
		resp := map[string]any{
			"status":  "failed",
			"error":   err.Error(),
			"message": fmt.Sprintf("Failed to send message to conversation %s", convID),
		}
		if result != nil {
			resp["send_status"] = result.Status
			resp["has_sim"] = result.HasSIM
		}
		return resp, nil // Return as result, not error, so caller gets details
	}

	return map[string]any{
		"status":      "sent",
		"send_status": result.Status,
		"has_sim":     result.HasSIM,
		"message":     fmt.Sprintf("Message sent to conversation %s (status: %s)", convID, result.Status),
	}, nil
}

// Helper functions for parameter extraction
func strParam(params map[string]any, key string) string {
	if v, ok := params[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func intParam(params map[string]any, key string, defaultVal int) int {
	if v, ok := params[key]; ok {
		switch n := v.(type) {
		case float64:
			return int(n)
		case string:
			if i, err := strconv.Atoi(n); err == nil {
				return i
			}
		}
	}
	return defaultVal
}
