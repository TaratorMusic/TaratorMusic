package main

import (
	"database/sql"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func makeLibrary(t *testing.T, s *syncServer) (*sql.DB, *sql.DB) {
	t.Helper()
	for _, name := range []string{"musics", "thumbnails", "taratordb"} {
		if err := os.MkdirAll(filepath.Join(s.data, name), 0700); err != nil {
			t.Fatal(err)
		}
	}
	open := func(name, query string) *sql.DB {
		db, err := sql.Open("sqlite", filepath.Join(s.data, "taratordb", name+".db"))
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Close() })
		if _, err := db.Exec(query); err != nil {
			t.Fatal(err)
		}
		return db
	}
	music := open("musics", `CREATE TABLE songs (song_id TEXT PRIMARY KEY, song_name TEXT, artist TEXT, genre TEXT, language TEXT, song_length REAL, song_extension TEXT, thumbnail_extension TEXT)`)
	playlists := open("playlists", `CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT, songs TEXT)`)
	if _, err := music.Exec(`INSERT INTO songs VALUES ('tarator-one', 'Before', 'Artist', 'Rock', 'English', 123, 'mp3', 'png')`); err != nil {
		t.Fatal(err)
	}
	if _, err := playlists.Exec(`INSERT INTO playlists VALUES ('stable-list', 'Old list', '["tarator-one","stream-only"]')`); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.data, "musics", "tarator-one.mp3"), []byte("test audio bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	file, err := os.Create(filepath.Join(s.data, "thumbnails", "tarator-one.png"))
	if err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(file, image.NewRGBA(image.Rect(0, 0, 640, 320))); err != nil {
		t.Fatal(err)
	}
	file.Close()
	return music, playlists
}

func getCatalog(t *testing.T, s *syncServer, token string) (catalogSong, catalogPlaylist) {
	t.Helper()
	w := request(s, "GET", "/api/catalog", "", token, s.origin)
	var result struct {
		Songs     []catalogSong     `json:"songs"`
		Playlists []catalogPlaylist `json:"playlists"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil || len(result.Songs) != 1 || len(result.Playlists) != 1 {
		t.Fatal("bad catalog", w.Code, w.Body.String())
	}
	return result.Songs[0], result.Playlists[0]
}

func TestCatalogVersionsAndRange(t *testing.T) {
	s := testServer(t)
	music, playlists := makeLibrary(t, s)
	token := pairDevice(t, s)
	check, err := s.openLibrary("musics")
	if err != nil {
		t.Fatal(err)
	}
	if err := check.Ping(); err != nil {
		t.Fatal("read-only library connection", err)
	}
	check.Close()
	before, playlist := getCatalog(t, s, token)
	if len(playlist.Songs) != 1 || before.ArtworkVersion == "" || before.Size != 16 {
		t.Fatal("incorrect catalog contents")
	}
	if _, err := music.Exec(`UPDATE songs SET song_name = 'After', artist = 'New artist'`); err != nil {
		t.Fatal(err)
	}
	if _, err := playlists.Exec(`UPDATE playlists SET name = 'Renamed'`); err != nil {
		t.Fatal(err)
	}
	after, renamed := getCatalog(t, s, token)
	if before.ID != after.ID || playlist.ID != renamed.ID || before.AudioVersion != after.AudioVersion || before.MetaVersion == after.MetaVersion {
		t.Fatal("rename changed identity/audio or did not change metadata")
	}
	path := "/api/songs/" + before.ID + "/file?v=" + before.AudioVersion
	r := httptest.NewRequest("GET", path, nil)
	r.RemoteAddr = "192.168.1.2:123"
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("Origin", s.origin)
	r.Header.Set("Range", "bytes=5-9")
	w := httptest.NewRecorder()
	s.apiHandler().ServeHTTP(w, r)
	if w.Code != 206 || w.Body.String() != "audio" || w.Header().Get("Content-Range") != "bytes 5-9/16" {
		t.Fatal("range failed", w.Code, w.Body.String())
	}
	info := request(s, "GET", "/api/songs/"+before.ID+"/info?v="+before.AudioVersion, "", token, s.origin)
	var checksum struct {
		SHA256 string `json:"sha256"`
	}
	if json.Unmarshal(info.Body.Bytes(), &checksum) != nil || checksum.SHA256 != digestBytes([]byte("test audio bytes")) {
		t.Fatal("checksum mismatch", info.Body.String())
	}
	art := request(s, "GET", "/api/songs/"+before.ID+"/artwork?v="+before.ArtworkVersion, "", token, s.origin)
	config, _, err := image.DecodeConfig(art.Body)
	if art.Code != 200 || err != nil || config.Width != 160 || config.Height != 80 {
		t.Fatal("artwork resize failed", err)
	}
	if err := os.WriteFile(filepath.Join(s.data, "thumbnails", "tarator-one.svg"), []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := music.Exec(`UPDATE songs SET thumbnail_extension = 'svg'`); err != nil {
		t.Fatal(err)
	}
	withArtwork, _ := getCatalog(t, s, token)
	if withArtwork.MetaVersion == after.MetaVersion || withArtwork.AudioVersion != after.AudioVersion {
		t.Fatal("artwork edit changed audio or did not change metadata")
	}
	vector := request(s, "GET", "/api/songs/"+before.ID+"/artwork?v="+withArtwork.ArtworkVersion, "", token, s.origin)
	if vector.Code != 200 || vector.Header().Get("Content-Type") != "image/svg+xml" {
		t.Fatal("SVG artwork unavailable")
	}
	if err := os.WriteFile(filepath.Join(s.data, "musics", "tarator-one.mp3"), []byte("changed audio"), 0600); err != nil {
		t.Fatal(err)
	}
	changed, _ := getCatalog(t, s, token)
	if changed.AudioVersion == before.AudioVersion || changed.MetaVersion != withArtwork.MetaVersion {
		t.Fatal("audio and metadata versions are not independent")
	}
	if stale := request(s, "GET", path, "", token, s.origin); stale.Code != 409 {
		t.Fatal("stale audio version accepted")
	}
	readOnly, err := s.openLibrary("musics")
	if err != nil {
		t.Fatal(err)
	}
	defer readOnly.Close()
	if _, err := readOnly.Exec("DELETE FROM songs"); err == nil {
		t.Fatal("sync database connection allowed writing")
	}
}

func TestSetupDoesNotExposeLibraryOrKey(t *testing.T) {
	s := testServer(t)
	for _, path := range []string{"/api/test", "/config/offline-sync/state.json", "/ca.key"} {
		r := httptest.NewRequest("GET", "http://192.168.1.1:8444"+path, nil)
		r.RemoteAddr = "192.168.1.2:1234"
		w := httptest.NewRecorder()
		s.setupHandler().ServeHTTP(w, r)
		if w.Code != 404 {
			t.Fatal("setup exposed private content")
		}
	}
	for _, path := range []string{"/", "/ca.crt", "/ca.mobileconfig"} {
		r := httptest.NewRequest("GET", "http://192.168.1.1:8444"+path, nil)
		r.RemoteAddr = "192.168.1.2:1234"
		r.Header.Set("User-Agent", "iPhone")
		w := httptest.NewRecorder()
		s.setupHandler().ServeHTTP(w, r)
		body, _ := io.ReadAll(w.Result().Body)
		if w.Code != 200 || len(body) == 0 {
			t.Fatal("setup missing", path)
		}
	}
}
