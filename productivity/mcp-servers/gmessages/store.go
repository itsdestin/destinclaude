package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func NewStore() (*Store, error) {
	dir := dataDir()
	os.MkdirAll(dir, 0700)
	path := filepath.Join(dir, "messages.db")
	db, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS conversations (
			id TEXT PRIMARY KEY,
			name TEXT,
			participants TEXT,
			last_message_time INTEGER,
			is_group INTEGER DEFAULT 0
		);
		CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			conversation_id TEXT,
			sender TEXT,
			body TEXT,
			timestamp INTEGER,
			is_from_me INTEGER DEFAULT 0,
			FOREIGN KEY (conversation_id) REFERENCES conversations(id)
		);
		CREATE INDEX IF NOT EXISTS idx_messages_conv_time
			ON messages(conversation_id, timestamp DESC);
		CREATE INDEX IF NOT EXISTS idx_messages_body
			ON messages(body);
		CREATE INDEX IF NOT EXISTS idx_messages_timestamp
			ON messages(timestamp DESC);
		CREATE TABLE IF NOT EXISTS participants (
			conversation_id TEXT,
			participant_id TEXT,
			name TEXT,
			PRIMARY KEY (conversation_id, participant_id)
		);
	`)
	return err
}

// UpsertParticipant stores a participant ID to name mapping.
func (s *Store) UpsertParticipant(conversationID, participantID, name string) error {
	_, err := s.db.Exec(`
		INSERT INTO participants (conversation_id, participant_id, name)
		VALUES (?, ?, ?)
		ON CONFLICT(conversation_id, participant_id) DO UPDATE SET name=excluded.name
	`, conversationID, participantID, name)
	return err
}

// UpsertConversation stores or updates a conversation from a protobuf.
func (s *Store) UpsertConversation(id, name, participants string, lastMessageTime int64, isGroup bool) error {
	groupInt := 0
	if isGroup {
		groupInt = 1
	}
	_, err := s.db.Exec(`
		INSERT INTO conversations (id, name, participants, last_message_time, is_group)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name,
			participants=excluded.participants,
			last_message_time=excluded.last_message_time,
			is_group=excluded.is_group
	`, id, name, participants, lastMessageTime, groupInt)
	return err
}

// InsertMessage stores a message.
func (s *Store) InsertMessage(id, conversationID, sender, body string, timestamp int64, isFromMe bool) error {
	fromMeInt := 0
	if isFromMe {
		fromMeInt = 1
	}
	_, err := s.db.Exec(`
		INSERT INTO messages (id, conversation_id, sender, body, timestamp, is_from_me)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET is_from_me=excluded.is_from_me
	`, id, conversationID, sender, body, timestamp, fromMeInt)
	return err
}

// ConversationSummary is a simplified conversation for tool output.
type ConversationSummary struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Participants string `json:"participants"`
	LastMessage  string `json:"last_message_time"`
	IsGroup      bool   `json:"is_group"`
}

// MessageSummary is a simplified message for tool output.
type MessageSummary struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversation_id,omitempty"`
	Sender         string `json:"sender"`
	Body           string `json:"body"`
	Timestamp      string `json:"timestamp"`
	IsFromMe       bool   `json:"is_from_me"`
}

// GetConversations returns recent conversations.
func (s *Store) GetConversations(limit int) ([]ConversationSummary, error) {
	rows, err := s.db.Query(`
		SELECT id, name, participants, last_message_time, is_group
		FROM conversations
		ORDER BY last_message_time DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanConversations(rows)
}

// GetMessages returns messages for a conversation, newest first.
func (s *Store) GetMessages(conversationID string, limit int) ([]MessageSummary, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.conversation_id, COALESCE(p.name, m.sender), m.body, m.timestamp, m.is_from_me
		FROM messages m
		LEFT JOIN participants p ON p.conversation_id = m.conversation_id AND p.participant_id = m.sender
		WHERE m.conversation_id = ?
		ORDER BY m.timestamp DESC
		LIMIT ?
	`, conversationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// SearchMessages searches message bodies across all conversations.
func (s *Store) SearchMessages(query string, limit int) ([]MessageSummary, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.conversation_id, COALESCE(p.name, m.sender), m.body, m.timestamp, m.is_from_me
		FROM messages m
		LEFT JOIN participants p ON p.conversation_id = m.conversation_id AND p.participant_id = m.sender
		WHERE m.body LIKE ?
		ORDER BY m.timestamp DESC
		LIMIT ?
	`, "%"+query+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// GetMessagesSince returns messages newer than the given time.
func (s *Store) GetMessagesSince(since time.Time, limit int) ([]MessageSummary, error) {
	rows, err := s.db.Query(`
		SELECT m.id, m.conversation_id, COALESCE(p.name, m.sender), m.body, m.timestamp, m.is_from_me
		FROM messages m
		LEFT JOIN participants p ON p.conversation_id = m.conversation_id AND p.participant_id = m.sender
		WHERE m.timestamp > ?
		ORDER BY m.timestamp DESC
		LIMIT ?
	`, since.UnixMicro(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// FindConversationByName searches conversations by name (partial match).
func (s *Store) FindConversationByName(name string) ([]ConversationSummary, error) {
	// Search both name and participants fields
	pattern := "%" + strings.ToLower(name) + "%"
	rows, err := s.db.Query(`
		SELECT id, name, participants, last_message_time, is_group
		FROM conversations
		WHERE LOWER(name) LIKE ? OR LOWER(participants) LIKE ?
		ORDER BY last_message_time DESC
		LIMIT 10
	`, pattern, pattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanConversations(rows)
}

func scanConversations(rows *sql.Rows) ([]ConversationSummary, error) {
	var results []ConversationSummary
	for rows.Next() {
		var c ConversationSummary
		var ts int64
		var isGroup int
		if err := rows.Scan(&c.ID, &c.Name, &c.Participants, &ts, &isGroup); err != nil {
			return nil, err
		}
		c.LastMessage = time.UnixMicro(ts).Format(time.RFC3339)
		c.IsGroup = isGroup == 1
		results = append(results, c)
	}
	if results == nil {
		results = []ConversationSummary{}
	}
	return results, nil
}

func scanMessages(rows *sql.Rows) ([]MessageSummary, error) {
	var results []MessageSummary
	for rows.Next() {
		var m MessageSummary
		var ts int64
		var isFromMe int
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.Sender, &m.Body, &ts, &isFromMe); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		m.Timestamp = time.UnixMicro(ts).Format(time.RFC3339)
		m.IsFromMe = isFromMe == 1
		if m.IsFromMe {
			m.Sender = "me"
		}
		results = append(results, m)
	}
	if results == nil {
		results = []MessageSummary{}
	}
	return results, nil
}
