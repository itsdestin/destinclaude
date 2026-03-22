package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/rs/zerolog"
)

type jsonRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonRPCResponse struct {
	JSONRPC string `json:"jsonrpc"`
	ID      any    `json:"id,omitempty"`
	Result  any    `json:"result,omitempty"`
	Error   any    `json:"error,omitempty"`
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println("gmessages-mcp v0.1.0")
		return
	}

	// Log to a file (stdout is reserved for MCP protocol)
	exe, _ := os.Executable()
	logPath := filepath.Join(filepath.Dir(exe), "data", "gmessages.log")
	os.MkdirAll(filepath.Dir(logPath), 0700)
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open log file: %v\n", err)
		os.Exit(1)
	}
	defer logFile.Close()

	logger := zerolog.New(zerolog.ConsoleWriter{Out: logFile, NoColor: true}).
		With().Timestamp().Str("component", "gmessages").Logger()

	logger.Info().Msg("starting gmessages MCP server")

	// Initialize SQLite store
	store, err := NewStore()
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to initialize store")
	}

	// Initialize libgm client
	gm, err := NewGMClient(logger, store)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to initialize client")
	}

	// Start cookie refresh HTTP endpoint (Chrome extension pushes cookies here)
	gm.StartCookieEndpoint()

	// Auto-connect if we have a saved session
	if gm.IsPaired() {
		logger.Info().Msg("saved session found — connecting...")
		if err := gm.Connect(); err != nil {
			errMsg := err.Error()
			if strings.Contains(errMsg, "no auth token") || strings.Contains(errMsg, "not logged in") {
				logger.Error().Err(err).Msg("session incomplete (missing auth token or device) — use gmessages_pair to re-pair")
			} else {
				logger.Error().Err(err).Msg("auto-connect failed — retrying in background")
				go gm.reconnect()
			}
		} else {
			logger.Info().Msg("connected to Google Messages")
		}
	} else {
		logger.Info().Msg("no saved session — use gmessages_pair to pair")
	}

	// MCP stdio loop
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req jsonRPCRequest
		if err := json.Unmarshal(line, &req); err != nil {
			logger.Error().Err(err).Msg("invalid JSON-RPC request")
			continue
		}

		logger.Debug().Str("method", req.Method).Msg("received request")

		resp := handleRequest(gm, store, &req, logger)
		if resp != nil {
			out, _ := json.Marshal(resp)
			fmt.Println(string(out))
		}
	}

	if err := scanner.Err(); err != nil {
		logger.Error().Err(err).Msg("stdin scanner error")
	}

	logger.Info().Msg("MCP server shutting down")
	gm.Disconnect()
}

func handleRequest(gm *GMClient, store *Store, req *jsonRPCRequest, logger zerolog.Logger) *jsonRPCResponse {
	switch req.Method {
	case "initialize":
		return &jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]any{
				"protocolVersion": "2024-11-05",
				"capabilities": map[string]any{
					"tools": map[string]any{},
				},
				"serverInfo": map[string]any{
					"name":    "gmessages",
					"version": "0.1.0",
				},
			},
		}

	case "notifications/initialized":
		return nil

	case "tools/list":
		return &jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]any{
				"tools": toolDefinitions,
			},
		}

	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return errorResponse(req.ID, -32602, "invalid params")
		}

		logger.Info().Str("tool", params.Name).Msg("tool call")

		result, err := handleToolCall(gm, store, params.Name, params.Arguments)
		if err != nil {
			logger.Error().Err(err).Str("tool", params.Name).Msg("tool call failed")
			return &jsonRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result: map[string]any{
					"content": []map[string]any{
						{"type": "text", "text": fmt.Sprintf("Error: %s", err.Error())},
					},
					"isError": true,
				},
			}
		}

		text, _ := json.MarshalIndent(result, "", "  ")
		return &jsonRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]any{
				"content": []map[string]any{
					{"type": "text", "text": string(text)},
				},
			},
		}

	default:
		logger.Warn().Str("method", req.Method).Msg("unknown method")
		return errorResponse(req.ID, -32601, "method not found")
	}
}

func errorResponse(id any, code int, msg string) *jsonRPCResponse {
	return &jsonRPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error: map[string]any{
			"code":    code,
			"message": msg,
		},
	}
}
