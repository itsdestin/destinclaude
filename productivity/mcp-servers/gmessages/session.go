package main

import (
	"encoding/json"
	"os"
	"path/filepath"

	"go.mau.fi/mautrix-gmessages/pkg/libgm"
)

func dataDir() string {
	exe, _ := os.Executable()
	return filepath.Join(filepath.Dir(exe), "data")
}

func sessionPath() string {
	return filepath.Join(dataDir(), "session.json")
}

// SaveSession persists auth data to disk.
func SaveSession(auth *libgm.AuthData) error {
	data, err := json.MarshalIndent(auth, "", "  ")
	if err != nil {
		return err
	}
	os.MkdirAll(filepath.Dir(sessionPath()), 0700)
	return os.WriteFile(sessionPath(), data, 0600)
}

// LoadSession restores auth data from disk. Returns nil if no session exists.
func LoadSession() (*libgm.AuthData, error) {
	data, err := os.ReadFile(sessionPath())
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	auth := libgm.NewAuthData()
	if err := json.Unmarshal(data, auth); err != nil {
		return nil, err
	}
	return auth, nil
}

// HasSession checks if a saved session exists.
func HasSession() bool {
	_, err := os.Stat(sessionPath())
	return err == nil
}
