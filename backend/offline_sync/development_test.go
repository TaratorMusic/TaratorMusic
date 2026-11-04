package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDevelopmentPairingAndTransfers(t *testing.T) {
	s := testServer(t)
	makeLibrary(t, s)
	server := httptest.NewUnstartedServer(nil)
	defer server.Close()
	s.origin = "http://" + server.Listener.Addr().String()
	s.pageURL = s.origin + "/"
	handler, err := s.developmentHandler(filepath.Join("..", "..", "web"))
	if err != nil {
		t.Fatal(err)
	}
	server.Config.Handler = handler
	server.Start()
	fetch := func(method, path, body, token string, headers map[string]string) (int, http.Header, []byte) {
		t.Helper()
		r, err := http.NewRequest(method, server.URL+path, strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		r.Header.Set("Origin", s.origin)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		for key, value := range headers {
			r.Header.Set(key, value)
		}
		response, err := server.Client().Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		data, err := io.ReadAll(response.Body)
		if err != nil {
			t.Fatal(err)
		}
		return response.StatusCode, response.Header, data
	}
	if status, headers, body := fetch("GET", "/", "", "", nil); status != 200 || !strings.Contains(string(body), "TaratorMusic") || headers.Get("Cache-Control") != "no-store" {
		t.Fatal("local webapp did not load", status)
	}
	if status, headers, _ := fetch("GET", "/app.js", "", "", nil); status != 200 || !strings.Contains(headers.Get("Content-Type"), "javascript") {
		t.Fatal("local webapp script did not load", status)
	}
	for _, name := range []string{"play.svg", "pause.svg", "next.svg", "previous.svg", "settings.svg", "queue.svg", "refresh.svg"} {
		original, err := os.ReadFile(filepath.Join("..", "..", "assets", name))
		if err != nil {
			t.Fatal(err)
		}
		if status, headers, body := fetch("GET", "/"+name, "", "", nil); status != 200 || string(body) != string(original) || !strings.Contains(headers.Get("Content-Type"), "image/svg+xml") {
			t.Fatal("shared icon did not load", name, status)
		}
	}
	if status, _, _ := fetch("GET", "/api/catalog", "", "", nil); status != 401 {
		t.Fatal("local catalog did not require pairing", status)
	}
	status, _, body := fetch("POST", "/api/pair", `{"code":"`+s.code+`"}`, "", map[string]string{"Content-Type": "application/json"})
	var paired struct{ Token string }
	if status != 200 || json.Unmarshal(body, &paired) != nil || paired.Token == "" {
		t.Fatal("local browser could not pair", status, string(body))
	}
	if status, headers, body := fetch("GET", "/api/test", "", paired.Token, nil); status != 200 || headers.Get("X-Checksum-SHA256") != digestBytes(body) {
		t.Fatal("local transfer test failed", status)
	}
	status, _, body = fetch("GET", "/api/catalog", "", paired.Token, nil)
	var catalog struct{ Songs []catalogSong }
	if status != 200 || json.Unmarshal(body, &catalog) != nil || len(catalog.Songs) != 1 {
		t.Fatal("local paired catalog failed", status, string(body))
	}
	song := catalog.Songs[0]
	if status, headers, body := fetch("GET", "/api/songs/"+song.ID+"/file?v="+song.AudioVersion, "", paired.Token, map[string]string{"Range": "bytes=5-9"}); status != 206 || string(body) != "audio" || headers.Get("Content-Range") != "bytes 5-9/16" {
		t.Fatal("local song range transfer failed", status, string(body))
	}
}

func TestDevelopmentBoundaries(t *testing.T) {
	s := testServer(t)
	s.origin = "http://127.0.0.1:8080"
	s.pageURL = s.origin + "/"
	folder := filepath.Join("..", "..", "web")
	handler, err := s.developmentHandler(folder)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		host, remote, origin, method, path string
		status                             int
	}{
		{"127.0.0.1:8080", "127.0.0.1:1234", "", "GET", "/", 200},
		{"127.0.0.1:8080", "192.168.1.20:1234", "", "GET", "/", 403},
		{"evil.example:8080", "127.0.0.1:1234", "", "GET", "/", 403},
		{"127.0.0.1:8080", "127.0.0.1:1234", "https://evil.example", "GET", "/", 403},
		{"127.0.0.1:8080", "127.0.0.1:1234", "https://evil.example", "POST", "/api/pair", 403},
		{"127.0.0.1:8080", "127.0.0.1:1234", s.origin, "POST", "/index.html", 405},
		{"127.0.0.1:8080", "127.0.0.1:1234", s.origin, "GET", "/../config/offline-sync/state.json", 404},
		{"127.0.0.1:8080", "127.0.0.1:1234", s.origin, "GET", "/../assets/play.svg", 404},
		{"127.0.0.1:8080", "127.0.0.1:1234", s.origin, "GET", "/tarator_icon.png", 404},
	} {
		r := httptest.NewRequest(test.method, s.origin+test.path, nil)
		r.Host = test.host
		r.RemoteAddr = test.remote
		r.Header.Set("Origin", test.origin)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != test.status {
			t.Fatalf("%+v returned %d", test, w.Code)
		}
	}
	for _, page := range []string{"http://192.168.1.20:8080/", "http://localhost:8080/", "https://127.0.0.1:8080/", s.origin + "/other", s.origin + "/?token=test", "http://user:password@127.0.0.1:8080/", "http://127.0.0.1:0/"} {
		s.pageURL = page
		if _, err := s.developmentHandler(folder); err == nil {
			t.Fatal("invalid development URL accepted", page)
		}
	}
	s.pageURL = s.origin + "/"
	if _, err := s.developmentHandler(t.TempDir()); err == nil {
		t.Fatal("missing webapp accepted")
	}
}
