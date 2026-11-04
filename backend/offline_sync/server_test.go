package main

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T) *syncServer {
	t.Helper()
	s := &syncServer{data: filepath.Join(t.TempDir(), "Phone data"), origin: "https://example.github.io", pageURL: "https://example.github.io/TaratorMusic/", httpsPort: "8443"}
	if err := s.loadState(); err != nil {
		t.Fatal(err)
	}
	if err := s.newCode(); err != nil {
		t.Fatal(err)
	}
	return s
}

func request(s *syncServer, method, path, body, token, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "192.168.1.2:12345"
	r.Header.Set("Origin", origin)
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	s.apiHandler().ServeHTTP(w, r)
	return w
}

func pairDevice(t *testing.T, s *syncServer) string {
	t.Helper()
	w := request(s, "POST", "/api/pair", `{"code":"`+s.code+`"}`, "", s.origin)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct{ Token string }
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || result.Token == "" {
		t.Fatal("missing token", err)
	}
	return result.Token
}

func TestPairingAndAccess(t *testing.T) {
	s := testServer(t)
	if w := request(s, "GET", "/api/test", "", "", s.origin); w.Code != 401 {
		t.Fatal("unpaired access", w.Code)
	}
	if w := request(s, "OPTIONS", "/api/test", "", "", "https://evil.example"); w.Code != 403 || w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("foreign origin accepted")
	}
	if w := request(s, "OPTIONS", "/api/test", "", "", s.origin); w.Code != 204 || w.Header().Get("Access-Control-Allow-Origin") != s.origin {
		t.Fatal("preflight failed")
	}
	token := pairDevice(t, s)
	if w := request(s, "POST", "/api/pair", `{"code":"`+s.code+`"}`, "", s.origin); w.Code != 401 {
		t.Fatal("code was reusable")
	}
	w := request(s, "GET", "/api/test", "", token, s.origin)
	if w.Code != 200 || w.Body.String() != "TaratorMusic phone sync test\n" || w.Header().Get("X-Checksum-SHA256") == "" {
		t.Fatal("test file transfer failed")
	}
	reloaded := &syncServer{data: s.data}
	if err := reloaded.loadState(); err != nil || reloaded.fingerprint() != s.fingerprint() {
		t.Fatal("CA not persistent", err)
	}
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	if !reloaded.authorized(r) || strings.Contains(strings.Join(s.state.Tokens, ""), token) {
		t.Fatal("token persistence or hashing failed")
	}
	s.state.Tokens = nil
	if s.authorized(r) {
		t.Fatal("revoked token accepted")
	}
}

func TestPairingLimits(t *testing.T) {
	s := testServer(t)
	s.codeExpires = time.Now().Add(-time.Second)
	for i := 0; i < 5; i++ {
		if w := request(s, "POST", "/api/pair", `{"code":"`+s.code+`"}`, "", s.origin); w.Code != 401 {
			t.Fatal("expired code accepted")
		}
	}
	if w := request(s, "POST", "/api/pair", "{}", "", s.origin); w.Code != 429 {
		t.Fatal("no rate limit")
	}
}

func TestTrustedTLSAndAddressRenewal(t *testing.T) {
	s := testServer(t)
	cert, err := s.certificate([]string{"127.0.0.1", "192.168.1.20"})
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	roots.AppendCertsFromPEM(s.state.Cert)
	server := httptest.NewUnstartedServer(s.apiHandler())
	server.TLS = &tls.Config{Certificates: []tls.Certificate{*cert}, MinVersion: tls.VersionTLS12}
	server.StartTLS()
	defer server.Close()
	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}}}
	r, _ := http.NewRequest("GET", server.URL+"/api/test", nil)
	r.Header.Set("Authorization", "Bearer "+pairDevice(t, s))
	response, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	content, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 || string(content) != "TaratorMusic phone sync test\n" {
		t.Fatal("trusted TLS transfer failed")
	}
	renewed, err := s.certificate([]string{"192.168.1.21"})
	if err != nil || renewed == cert {
		t.Fatal("IP change did not renew certificate", err)
	}
	if _, err := renewed.Leaf.Verify(x509.VerifyOptions{Roots: roots, DNSName: "192.168.1.21"}); err != nil {
		t.Fatal(err)
	}
	if renewed.Leaf.VerifyHostname("192.168.1.20") == nil {
		t.Fatal("old IP remained in certificate")
	}
}
