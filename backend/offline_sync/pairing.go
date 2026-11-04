package main

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
)

func (s *syncServer) newCode() error {
	number, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.code = fmt.Sprintf("%06d", number.Int64())
	s.codeExpires = time.Now().Add(10 * time.Minute)
	return nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *syncServer) authorized(r *http.Request) bool {
	value := r.Header.Get("Authorization")
	if !strings.HasPrefix(value, "Bearer ") {
		return false
	}
	digest := tokenHash(strings.TrimPrefix(value, "Bearer "))
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, stored := range s.state.Tokens {
		if subtle.ConstantTimeCompare([]byte(digest), []byte(stored)) == 1 {
			return true
		}
	}
	return false
}

func (s *syncServer) pair(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Code string `json:"code"`
	}
	decoded := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&input) == nil
	s.mu.Lock()
	defer s.mu.Unlock()
	if time.Since(s.attemptWindow) > time.Minute {
		s.attemptWindow, s.attempts = time.Now(), 0
	}
	if s.attempts >= 5 {
		w.Header().Set("Retry-After", "60")
		http.Error(w, "Too many attempts. Wait one minute.", http.StatusTooManyRequests)
		return
	}
	s.attempts++
	if !decoded ||
		s.code == "" || time.Now().After(s.codeExpires) || subtle.ConstantTimeCompare([]byte(input.Code), []byte(s.code)) != 1 {
		http.Error(w, "Code incorrect or expired. Generate a new code on the desktop.", http.StatusUnauthorized)
		return
	}
	if len(s.state.Tokens) >= 32 {
		http.Error(w, "Device limit reached. Forget paired devices on the desktop.", http.StatusConflict)
		return
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		http.Error(w, "Could not create token", http.StatusInternalServerError)
		return
	}
	token := base64.RawURLEncoding.EncodeToString(secret)
	s.state.Tokens = append(s.state.Tokens, tokenHash(token))
	if err := s.saveState(); err != nil {
		s.state.Tokens = s.state.Tokens[:len(s.state.Tokens)-1]
		http.Error(w, "Could not save pairing", http.StatusInternalServerError)
		return
	}
	s.codeExpires = time.Now()
	s.code = ""
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token, "desktopId": s.fingerprint()})
}
