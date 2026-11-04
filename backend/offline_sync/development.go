package main

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func (s *syncServer) developmentHandler(folder string) (http.Handler, error) {
	page, err := url.Parse(s.pageURL)
	if err != nil || page.Scheme != "http" || page.Hostname() != "127.0.0.1" || page.User != nil || page.RawQuery != "" || page.Fragment != "" || (page.Path != "" && page.Path != "/") || page.Port() == "0" {
		return nil, fmt.Errorf("local development requires http://127.0.0.1:<port>/")
	}
	root, err := filepath.Abs(folder)
	if err != nil {
		return nil, err
	}
	index, err := os.Stat(filepath.Join(root, "index.html"))
	if err != nil || !index.Mode().IsRegular() {
		return nil, fmt.Errorf("local webapp index.html is unavailable in %s", root)
	}
	files := http.FileServer(http.Dir(root))
	api := s.apiHandler()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		ip := net.ParseIP(host)
		if err != nil || ip == nil || !ip.IsLoopback() || "http://"+r.Host != s.origin || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != s.origin) {
			http.Error(w, "Local development is only available on this PC", http.StatusForbidden)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Read-only server", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path == "/"+filepath.Base(r.URL.Path) && filepath.Ext(r.URL.Path) == ".svg" {
			http.ServeFile(w, r, filepath.Join(filepath.Dir(root), "assets", filepath.Base(r.URL.Path)))
			return
		}
		files.ServeHTTP(w, r)
	}), nil
}
