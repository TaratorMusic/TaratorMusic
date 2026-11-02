package main

import (
	"bufio"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type savedState struct {
	Cert   []byte   `json:"cert"`
	Key    []byte   `json:"key"`
	Tokens []string `json:"tokens"`
}

type syncServer struct {
	data, origin, pageURL string
	state                 savedState
	mu                    sync.Mutex
	outputMu              sync.Mutex
	code                  string
	codeExpires           time.Time
	attempts              int
	attemptWindow         time.Time
	certMu                sync.Mutex
	cert                  *tls.Certificate
	certAddresses         string
	httpsPort, setupPort  string
}

func main() {
	data := flag.String("data", "", "TaratorMusic writable data directory")
	page := flag.String("page", "", "HTTPS phone app URL")
	flag.Parse()
	parsed, err := url.Parse(*page)
	if *data == "" || err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		fmt.Fprintln(os.Stderr, "usage: offline_sync --data <data directory> --page <HTTPS phone app URL>")
		os.Exit(1)
	}
	s := &syncServer{data: *data, origin: parsed.Scheme + "://" + parsed.Host, pageURL: parsed.String(), httpsPort: "8443", setupPort: "8444"}
	if err := s.loadState(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := s.newCode(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if _, err := s.certificate(lanIPs()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	secure, err := net.Listen("tcp4", ":"+s.httpsPort)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	setup, err := net.Listen("tcp4", ":"+s.setupPort)
	if err != nil {
		secure.Close()
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: func(*tls.ClientHelloInfo) (*tls.Certificate, error) { return s.certificate(lanIPs()) }}
	api := &http.Server{Handler: s.apiHandler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 15 * time.Second, IdleTimeout: time.Minute, ErrorLog: log.New(io.Discard, "", 0)}
	bootstrap := &http.Server{Handler: s.setupHandler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: time.Minute}
	go func() { reportServeError(api.Serve(tls.NewListener(secure, tlsConfig))) }()
	go func() { reportServeError(bootstrap.Serve(setup)) }()
	s.status()
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		command := scanner.Text()
		if command == "new-code" {
			err = s.newCode()
		} else if command == "revoke" {
			s.mu.Lock()
			previous := s.state.Tokens
			s.state.Tokens = []string{}
			err = s.saveState()
			if err != nil {
				s.state.Tokens = previous
			}
			s.mu.Unlock()
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
		}
		s.status()
	}
	api.Close()
	bootstrap.Close()
}

func reportServeError(err error) {
	if err != nil && err != http.ErrServerClosed {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func (s *syncServer) loadState() error {
	folder := filepath.Join(s.data, "config", "offline-sync")
	if err := os.MkdirAll(folder, 0700); err != nil {
		return err
	}
	data, err := os.ReadFile(filepath.Join(folder, "state.json"))
	if err == nil {
		if err := json.Unmarshal(data, &s.state); err != nil {
			return err
		}
		_, err = tls.X509KeyPair(s.state.Cert, s.state.Key)
		return err
	}
	if !os.IsNotExist(err) {
		return err
	}
	s.state.Cert, s.state.Key, err = createCA()
	if err != nil {
		return err
	}
	return s.saveState()
}

func (s *syncServer) saveState() error {
	data, err := json.Marshal(s.state)
	if err != nil {
		return err
	}
	name := filepath.Join(s.data, "config", "offline-sync", "state.json")
	if err := os.WriteFile(name+".part", data, 0600); err != nil {
		return err
	}
	return os.Rename(name+".part", name)
}

func (s *syncServer) status() {
	s.mu.Lock()
	defer s.mu.Unlock()
	addresses := []map[string]string{}
	for _, ip := range lanIPs() {
		if ip == "127.0.0.1" {
			continue
		}
		addresses = append(addresses, map[string]string{"server": "https://" + net.JoinHostPort(ip, s.httpsPort), "setup": "http://" + net.JoinHostPort(ip, s.setupPort)})
	}
	s.outputMu.Lock()
	defer s.outputMu.Unlock()
	json.NewEncoder(os.Stdout).Encode(map[string]interface{}{
		"enabled": true, "addresses": addresses, "code": s.code, "expires": s.codeExpires,
		"paired": len(s.state.Tokens), "fingerprint": s.fingerprint(), "page": s.pageURL,
	})
}

func localRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	ip := net.ParseIP(host)
	return err == nil && ip != nil && (ip.IsPrivate() || ip.IsLoopback())
}

func (s *syncServer) apiHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Vary", "Origin")
		if !localRequest(r) || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != s.origin) {
			http.Error(w, "Origin or network not allowed", http.StatusForbidden)
			return
		}
		if r.Header.Get("Origin") == s.origin {
			w.Header().Set("Access-Control-Allow-Origin", s.origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Range, If-Range")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Length, Content-Range, ETag, X-Checksum-SHA256")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.URL.Path == "/api/pair" && r.Method == http.MethodPost {
			s.pair(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Read-only server", http.StatusMethodNotAllowed)
			return
		}
		if !s.authorized(r) {
			http.Error(w, "Pair this device again", http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/api/test" {
			file := "TaratorMusic phone sync test\n"
			sum := sha256.Sum256([]byte(file))
			w.Header().Set("X-Checksum-SHA256", hex.EncodeToString(sum[:]))
			w.Header().Set("Content-Type", "application/octet-stream")
			http.ServeContent(w, r, "test.txt", time.Time{}, strings.NewReader(file))
			return
		}
		if r.URL.Path == "/api/catalog" {
			s.catalog(w, r)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/songs/") {
			s.media(w, r)
			return
		}
		http.NotFound(w, r)
	})
}
