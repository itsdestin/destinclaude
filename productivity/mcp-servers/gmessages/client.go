package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"go.mau.fi/mautrix-gmessages/pkg/libgm"
	"go.mau.fi/mautrix-gmessages/pkg/libgm/events"
	"go.mau.fi/mautrix-gmessages/pkg/libgm/gmproto"
)

// GMClient wraps libgm.Client with lifecycle management.
type GMClient struct {
	client      *libgm.Client
	logger      zerolog.Logger
	store       *Store
	mu          sync.RWMutex
	connected   bool
	paired      bool
	myParticipantIDs map[string]bool // participant IDs that belong to "me"
}

// NewGMClient creates a new client. If a saved session exists, loads it.
func NewGMClient(logger zerolog.Logger, store *Store) (*GMClient, error) {
	gm := &GMClient{
		logger:           logger,
		store:            store,
		myParticipantIDs: make(map[string]bool),
	}

	auth, err := LoadSession()
	if err != nil {
		return nil, fmt.Errorf("load session: %w", err)
	}

	if auth != nil {
		gm.client = libgm.NewClient(auth, nil, logger)
		gm.paired = true
	} else {
		auth = libgm.NewAuthData()
		gm.client = libgm.NewClient(auth, nil, logger)
		gm.paired = false
	}

	gm.client.SetEventHandler(gm.handleEvent)
	return gm, nil
}

func (gm *GMClient) IsPaired() bool {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.paired
}

func (gm *GMClient) IsConnected() bool {
	gm.mu.RLock()
	defer gm.mu.RUnlock()
	return gm.connected
}

// LoadCookies loads Google auth cookies from data/cookies.json.
func LoadCookies() (map[string]string, error) {
	data, err := os.ReadFile(filepath.Join(dataDir(), "cookies.json"))
	if err != nil {
		return nil, fmt.Errorf("read cookies.json: %w", err)
	}
	var cookies map[string]string
	if err := json.Unmarshal(data, &cookies); err != nil {
		return nil, fmt.Errorf("parse cookies.json: %w", err)
	}
	return cookies, nil
}

// StartGaiaPairing initiates Gaia (Google account) pairing with emoji verification.
// Loads cookies from file (or uses provided ones), starts DoGaiaPairing in a goroutine,
// and returns the emoji string once the crypto handshake completes. The pairing finishes
// in the background when the user confirms the emoji on their phone.
func (gm *GMClient) StartGaiaPairing(cookies map[string]string) (string, error) {
	// If no cookies provided, load from file
	if len(cookies) == 0 {
		var err error
		cookies, err = LoadCookies()
		if err != nil {
			return "", fmt.Errorf("no cookies provided and %w", err)
		}
	}
	gm.client.AuthData.SetCookies(cookies)

	emojiCh := make(chan string, 1)
	errCh := make(chan error, 1)

	go func() {
		err := gm.client.DoGaiaPairing(context.Background(), func(emoji string) {
			emojiCh <- emoji
		})
		if err != nil {
			errCh <- err
		}
	}()

	// Wait for either the emoji (handshake succeeded, waiting for phone confirm)
	// or an error (handshake failed)
	select {
	case emoji := <-emojiCh:
		return emoji, nil
	case err := <-errCh:
		return "", fmt.Errorf("gaia pairing: %w", err)
	case <-time.After(30 * time.Second):
		return "", fmt.Errorf("gaia pairing timed out waiting for handshake")
	}
}

// Connect connects using saved session.
func (gm *GMClient) Connect() error {
	if !gm.paired {
		return fmt.Errorf("not paired — call StartPairing first")
	}
	err := gm.client.Connect()
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	gm.mu.Lock()
	gm.connected = true
	gm.mu.Unlock()
	return nil
}

// Disconnect cleanly disconnects.
func (gm *GMClient) Disconnect() {
	gm.client.Disconnect()
	gm.mu.Lock()
	gm.connected = false
	gm.mu.Unlock()
}

// ListConversations fetches conversations from the phone.
func (gm *GMClient) ListConversations(count int) ([]*gmproto.Conversation, error) {
	resp, err := gm.client.ListConversations(count, gmproto.ListConversationsRequest_UNKNOWN)
	if err != nil {
		return nil, err
	}
	return resp.GetConversations(), nil
}

// FetchMessages fetches message history for a conversation.
func (gm *GMClient) FetchMessages(conversationID string, count int64) ([]*gmproto.Message, error) {
	resp, err := gm.client.FetchMessages(conversationID, count, nil)
	if err != nil {
		return nil, err
	}
	return resp.GetMessages(), nil
}

// GetOrCreateConversation finds or creates a conversation with a phone number.
func (gm *GMClient) GetOrCreateConversation(phoneNumber string) (*gmproto.Conversation, error) {
	numbers := []*gmproto.ContactNumber{{
		MysteriousInt: 7,
		Number:        phoneNumber,
		Number2:       phoneNumber,
	}}
	resp, err := gm.client.GetOrCreateConversation(&gmproto.GetOrCreateConversationRequest{
		Numbers: numbers,
	})
	if err != nil {
		return nil, err
	}
	return resp.GetConversation(), nil
}

// SendMessageResult contains details about a send attempt.
type SendMessageResult struct {
	Status     string // "SUCCESS", "FAILURE_2", "FAILURE_3", "FAILURE_4", "UNKNOWN"
	StatusCode int32
	HasSIM     bool
}

// SendTextMessage sends a text message to a conversation.
func (gm *GMClient) SendTextMessage(conversationID string, text string, conv *gmproto.Conversation) (*SendMessageResult, error) {
	tmpID := fmt.Sprintf("tmp_%d", time.Now().UnixNano())

	// Find the SIM payload from conversation participants
	var simPayload *gmproto.SIMPayload
	foundMe := false
	for _, p := range conv.GetParticipants() {
		if p.GetIsMe() {
			simPayload = p.GetSimPayload()
			foundMe = true
			break
		}
	}

	if !foundMe {
		gm.logger.Warn().Str("conv", conversationID).Msg("no 'me' participant found in conversation")
		return nil, fmt.Errorf("no 'me' participant found in conversation — session may be stale")
	}
	if simPayload == nil {
		gm.logger.Warn().Str("conv", conversationID).Msg("SIM payload is nil for 'me' participant")
		return nil, fmt.Errorf("SIM payload missing for 'me' participant — cannot send without SIM info")
	}

	req := &gmproto.SendMessageRequest{
		ConversationID: conversationID,
		MessagePayload: &gmproto.MessagePayload{
			TmpID:          tmpID,
			ConversationID: conversationID,
			MessagePayloadContent: &gmproto.MessagePayloadContent{
				MessageContent: &gmproto.MessageContent{
					Content: text,
				},
			},
			TmpID2: tmpID,
		},
		SIMPayload: simPayload,
		TmpID:      tmpID,
	}

	resp, err := gm.client.SendMessage(req)
	if err != nil {
		return nil, err
	}

	result := &SendMessageResult{
		HasSIM:     simPayload != nil,
		StatusCode: int32(resp.GetStatus()),
	}

	switch resp.GetStatus() {
	case gmproto.SendMessageResponse_SUCCESS:
		result.Status = "SUCCESS"
		gm.logger.Info().
			Str("conv", conversationID).
			Str("status", "SUCCESS").
			Str("tmpID", tmpID).
			Msg("message sent")
	case gmproto.SendMessageResponse_FAILURE_2:
		result.Status = "FAILURE_2"
		gm.logger.Error().Str("conv", conversationID).Str("status", "FAILURE_2").Msg("send failed (permanent error)")
		return result, fmt.Errorf("send failed: permanent error (status 2)")
	case gmproto.SendMessageResponse_FAILURE_3:
		result.Status = "FAILURE_3"
		gm.logger.Error().Str("conv", conversationID).Str("status", "FAILURE_3").Msg("send failed (temporary error)")
		return result, fmt.Errorf("send failed: temporary error (status 3)")
	case gmproto.SendMessageResponse_FAILURE_4:
		result.Status = "FAILURE_4"
		gm.logger.Error().Str("conv", conversationID).Str("status", "FAILURE_4").Msg("send failed (not default SMS app?)")
		return result, fmt.Errorf("send failed: Google Messages may not be the default SMS app (status 4)")
	default:
		result.Status = "UNKNOWN"
		gm.logger.Warn().Str("conv", conversationID).Int32("status", int32(resp.GetStatus())).Msg("send returned unknown status")
		return result, fmt.Errorf("send returned unknown status: %d", resp.GetStatus())
	}

	return result, nil
}

// handleEvent dispatches libgm events.
func (gm *GMClient) handleEvent(rawEvt any) {
	switch evt := rawEvt.(type) {
	case *events.ClientReady:
		gm.logger.Info().Str("session", evt.SessionID).Msg("connected to Google Messages")
		gm.mu.Lock()
		gm.connected = true
		gm.mu.Unlock()
		// Store initial conversations
		for _, conv := range evt.Conversations {
			gm.storeConversation(conv)
		}

	case *libgm.WrappedMessage:
		body := extractMessageBody(evt.Message)
		gm.logger.Info().
			Str("from", evt.GetParticipantID()).
			Str("conv", evt.GetConversationID()).
			Bool("isOld", evt.IsOld).
			Str("body_preview", truncate(body, 50)).
			Msg("message received")
		gm.storeMessage(evt.Message)

	case *events.AuthTokenRefreshed:
		gm.logger.Info().Msg("auth token refreshed — saving session")
		if err := SaveSession(gm.client.AuthData); err != nil {
			gm.logger.Error().Err(err).Msg("failed to save refreshed session")
		}

	case *events.PairSuccessful:
		gm.logger.Info().Msg("pairing successful")
		gm.mu.Lock()
		gm.paired = true
		gm.connected = true
		gm.mu.Unlock()
		if err := SaveSession(gm.client.AuthData); err != nil {
			gm.logger.Error().Err(err).Msg("failed to save session after pairing")
		}

	case *events.ListenFatalError:
		errMsg := evt.Error.Error()
		if strings.Contains(errMsg, "401") || strings.Contains(errMsg, "SESSION_COOKIE_INVALID") {
			gm.logger.Error().Err(evt.Error).Msg("session cookies expired — attempting re-auth")
			gm.mu.Lock()
			gm.connected = false
			gm.mu.Unlock()
			go gm.reauthWithBackoff()
			return
		}
		gm.logger.Error().Err(evt.Error).Msg("fatal listen error — will attempt reconnect")
		gm.mu.Lock()
		gm.connected = false
		gm.mu.Unlock()
		go gm.reconnect()

	case *events.ListenTemporaryError:
		gm.logger.Warn().Err(evt.Error).Msg("temporary listen error")

	case *events.PhoneNotResponding:
		gm.logger.Warn().Msg("phone not responding")

	case *events.PhoneRespondingAgain:
		gm.logger.Info().Msg("phone responding again")

	case *gmproto.Conversation:
		gm.storeConversation(evt)
	}
}

func (gm *GMClient) storeConversation(conv *gmproto.Conversation) {
	name := conv.GetName()
	participants := extractParticipantNames(conv)
	if name == "" {
		name = participants
	}
	isGroup := conv.GetIsGroupChat()
	convID := conv.GetConversationID()
	gm.store.UpsertConversation(
		convID,
		name,
		participants,
		conv.GetLastMessageTimestamp(),
		isGroup,
	)
	// Store participant ID → name mappings for sender resolution
	for _, p := range conv.GetParticipants() {
		pid := ""
		if id := p.GetID(); id != nil {
			pid = id.GetParticipantID()
		}
		if pid == "" {
			continue
		}
		if p.GetIsMe() {
			gm.mu.Lock()
			gm.myParticipantIDs[pid] = true
			gm.mu.Unlock()
			continue
		}
		pName := p.GetFullName()
		if pName == "" {
			pName = p.GetFirstName()
		}
		if pName == "" {
			pName = p.GetFormattedNumber()
		}
		if pName == "" {
			continue
		}
		gm.store.UpsertParticipant(convID, pid, pName)
	}
}

func (gm *GMClient) storeMessage(msg *gmproto.Message) {
	body := extractMessageBody(msg)
	sender := msg.GetParticipantID()

	gm.mu.RLock()
	isFromMe := gm.myParticipantIDs[sender]
	gm.mu.RUnlock()

	gm.store.InsertMessage(
		msg.GetMessageID(),
		msg.GetConversationID(),
		sender,
		body,
		msg.GetTimestamp(),
		isFromMe,
	)
}

// reconnect attempts to reconnect with exponential backoff.
func (gm *GMClient) reconnect() {
	delays := []time.Duration{5 * time.Second, 15 * time.Second, 30 * time.Second, 60 * time.Second}
	for i, delay := range delays {
		time.Sleep(delay)
		gm.logger.Info().Int("attempt", i+1).Msg("attempting reconnect")
		if err := gm.client.Connect(); err == nil {
			gm.mu.Lock()
			gm.connected = true
			gm.mu.Unlock()
			gm.logger.Info().Msg("reconnected successfully")
			return
		}
	}
	gm.logger.Error().Msg("reconnect failed after 4 attempts — restart MCP server to retry")
}

// reauthWithBackoff attempts re-auth with increasing delays, giving the Chrome
// extension time to push fresh cookies. Tries 5 times over ~10 minutes.
func (gm *GMClient) reauthWithBackoff() {
	delays := []time.Duration{
		10 * time.Second,  // quick first try — cookies may already be fresh
		1 * time.Minute,   // wait for extension's next cycle
		2 * time.Minute,
		3 * time.Minute,
		5 * time.Minute,
	}
	for i, delay := range delays {
		time.Sleep(delay)
		gm.logger.Info().Int("attempt", i+1).Msg("attempting cookie re-auth")

		cookies, err := LoadCookies()
		if err != nil {
			gm.logger.Warn().Err(err).Msg("no cookies file available")
			continue
		}

		gm.client.AuthData.SetCookies(cookies)

		if err := gm.client.Connect(); err != nil {
			gm.logger.Warn().Err(err).Int("attempt", i+1).Msg("re-auth connect failed")
			continue
		}

		gm.mu.Lock()
		gm.connected = true
		gm.mu.Unlock()
		gm.logger.Info().Msg("re-auth successful — reconnected with fresh cookies")
		return
	}

	gm.logger.Error().Msg("re-auth failed after 5 attempts — use gmessages_pair to re-pair, or ensure Chrome extension is running")
	gm.mu.Lock()
	gm.paired = false
	gm.mu.Unlock()
}

// reauth attempts to re-authenticate using the latest cookies without re-pairing.
// Called when a 401 indicates the session cookies have expired.
func (gm *GMClient) reauth() {
	gm.logger.Info().Msg("attempting re-auth with latest cookies")

	// Load cookies from file (refreshed by Chrome extension)
	cookies, err := LoadCookies()
	if err != nil {
		gm.logger.Error().Err(err).Msg("re-auth failed — no cookies available")
		return
	}

	gm.client.AuthData.SetCookies(cookies)

	// Reconnect with fresh cookies
	if err := gm.client.Connect(); err != nil {
		gm.logger.Error().Err(err).Msg("re-auth connect failed")
		return
	}

	gm.mu.Lock()
	gm.connected = true
	gm.paired = true
	gm.mu.Unlock()
	gm.logger.Info().Msg("re-auth successful — reconnected with fresh cookies")
}

// StartCookieEndpoint launches an HTTP server on localhost:9595 that accepts
// cookie updates from the Chrome extension. POST /cookies with JSON body.
func (gm *GMClient) StartCookieEndpoint() {
	mux := http.NewServeMux()
	mux.HandleFunc("/cookies", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", http.StatusMethodNotAllowed)
			return
		}

		var cookies map[string]string
		if err := json.NewDecoder(r.Body).Decode(&cookies); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		if len(cookies) == 0 {
			http.Error(w, "empty cookies", http.StatusBadRequest)
			return
		}

		// Save to file for persistence across restarts
		data, _ := json.MarshalIndent(cookies, "", "  ")
		cookiePath := filepath.Join(dataDir(), "cookies.json")
		if err := os.WriteFile(cookiePath, data, 0600); err != nil {
			gm.logger.Error().Err(err).Msg("failed to write cookies.json")
			http.Error(w, "write failed", http.StatusInternalServerError)
			return
		}

		// Update in-memory cookies on the client
		gm.client.AuthData.SetCookies(cookies)

		// NOTE: Do NOT call SaveSession here. Multiple MCP instances share session.json
		// but only one has a valid pairing. Writing from an unpaired instance would
		// overwrite the good session with empty AuthData. Cookies are persisted to
		// cookies.json above; session.json is only written by pairing and token refresh.

		gm.logger.Info().Int("count", len(cookies)).Msg("cookies refreshed via HTTP endpoint")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	server := &http.Server{Addr: "127.0.0.1:9595", Handler: mux}
	go func() {
		gm.logger.Info().Str("addr", "127.0.0.1:9595").Msg("cookie refresh endpoint started")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			gm.logger.Error().Err(err).Msg("cookie endpoint failed")
		}
	}()
}

// extractMessageBody gets the text content from a Message protobuf.
func extractMessageBody(msg *gmproto.Message) string {
	for _, info := range msg.GetMessageInfo() {
		if content := info.GetMessageContent(); content != nil {
			return content.GetContent()
		}
	}
	return ""
}

// extractParticipantNames gets a comma-separated list of non-self participant names.
func extractParticipantNames(conv *gmproto.Conversation) string {
	var names []string
	for _, p := range conv.GetParticipants() {
		if p.GetIsMe() {
			continue
		}
		name := p.GetFullName()
		if name == "" {
			name = p.GetFirstName()
		}
		if name == "" {
			name = p.GetFormattedNumber()
		}
		if name != "" {
			names = append(names, name)
		}
	}
	return strings.Join(names, ", ")
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
