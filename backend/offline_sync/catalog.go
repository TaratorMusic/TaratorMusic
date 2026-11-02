package main

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "golang.org/x/image/webp"
	_ "modernc.org/sqlite"
)

type catalogSong struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Artist         string  `json:"artist"`
	Album          string  `json:"album"`
	Genre          string  `json:"genre"`
	Language       string  `json:"language"`
	Duration       float64 `json:"duration"`
	Format         string  `json:"format"`
	MIME           string  `json:"mime"`
	Size           int64   `json:"size"`
	AudioVersion   string  `json:"audioVersion"`
	MetaVersion    string  `json:"metaVersion"`
	ArtworkVersion string  `json:"artworkVersion"`
	AudioPath      string  `json:"-"`
	ArtworkPath    string  `json:"-"`
}

type catalogPlaylist struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Songs []string `json:"songs"`
}

func (s *syncServer) openLibrary(name string) (*sql.DB, error) {
	namePath := filepath.ToSlash(filepath.Join(s.data, "taratordb", name+".db"))
	if !strings.HasPrefix(namePath, "/") {
		namePath = "/" + namePath
	}
	file := &url.URL{Scheme: "file", Path: namePath, RawQuery: "mode=ro&_pragma=query_only(1)&_pragma=busy_timeout(3000)"}
	db, err := sql.Open("sqlite", file.String())
	if err == nil {
		db.SetMaxOpenConns(1)
	}
	return db, err
}

func libraryPath(folder, id, extension string) (string, error) {
	if id == "" || strings.ContainsAny(id, `/\`) || strings.ContainsAny(extension, `/\`) {
		return "", fmt.Errorf("invalid library filename")
	}
	name := id + "." + strings.TrimPrefix(extension, ".")
	file := filepath.Join(folder, name)
	resolved, err := filepath.EvalSymlinks(file)
	if err != nil {
		return "", err
	}
	root, err := filepath.EvalSymlinks(folder)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(root, resolved)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return "", fmt.Errorf("file outside library")
	}
	return resolved, nil
}

func digestBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func audioVersion(info os.FileInfo) string {
	return fmt.Sprintf("%x-%x", info.Size(), info.ModTime().UnixNano())
}

func audioMIME(extension string) string {
	known := map[string]string{"mp3": "audio/mpeg", "m4a": "audio/mp4", "mp4": "audio/mp4", "aac": "audio/aac", "wav": "audio/wav", "flac": "audio/flac", "ogg": "audio/ogg", "opus": "audio/ogg; codecs=opus", "webm": "audio/webm"}
	if value := known[strings.ToLower(extension)]; value != "" {
		return value
	}
	if value := mime.TypeByExtension("." + extension); value != "" {
		return value
	}
	return "application/octet-stream"
}

const songQuery = `SELECT song_id, COALESCE(song_name, ''), COALESCE(artist, ''), COALESCE(genre, ''), COALESCE(language, ''), COALESCE(song_length, 0), COALESCE(song_extension, ''), COALESCE(thumbnail_extension, '') FROM songs`

func (s *syncServer) readSong(row interface{ Scan(...interface{}) error }) (catalogSong, error) {
	var song catalogSong
	var thumbnail string
	err := row.Scan(&song.ID, &song.Title, &song.Artist, &song.Genre, &song.Language, &song.Duration, &song.Format, &thumbnail)
	if err != nil {
		return song, err
	}
	song.AudioPath, err = libraryPath(filepath.Join(s.data, "musics"), song.ID, song.Format)
	if err != nil {
		return song, err
	}
	info, err := os.Stat(song.AudioPath)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return song, fmt.Errorf("audio unavailable")
	}
	song.Size, song.AudioVersion, song.MIME = info.Size(), audioVersion(info), audioMIME(song.Format)
	if thumbnail != "" {
		song.ArtworkPath, _ = libraryPath(filepath.Join(s.data, "thumbnails"), song.ID, thumbnail)
		if data, err := readArtwork(song.ArtworkPath); err == nil {
			// Hash the source so replacing artwork never changes the audio version.
			song.ArtworkVersion = digestBytes(data)
		}
	}
	metadata, _ := json.Marshal([]interface{}{song.Title, song.Artist, song.Album, song.Genre, song.Language, song.Duration, song.Format, song.MIME, song.ArtworkVersion})
	song.MetaVersion = digestBytes(metadata)
	return song, nil
}

func (s *syncServer) catalog(w http.ResponseWriter, r *http.Request) {
	db, err := s.openLibrary("musics")
	if err != nil {
		http.Error(w, "Cannot open music library", 503)
		return
	}
	defer db.Close()
	rows, err := db.QueryContext(r.Context(), songQuery+" ORDER BY song_name, song_id")
	if err != nil {
		http.Error(w, "Cannot read music library", 503)
		return
	}
	defer rows.Close()
	songs := []catalogSong{}
	ids := map[string]bool{}
	for rows.Next() {
		song, err := s.readSong(rows)
		if err == nil {
			songs = append(songs, song)
			ids[song.ID] = true
		}
	}
	if rows.Err() != nil {
		http.Error(w, "Cannot read complete library", 503)
		return
	}
	playlists, err := s.readPlaylists(r, ids)
	if err != nil {
		http.Error(w, "Cannot read playlists", 503)
		return
	}
	writeJSON(w, map[string]interface{}{"desktopId": s.fingerprint(), "songs": songs, "playlists": playlists})
}

func (s *syncServer) readPlaylists(r *http.Request, available map[string]bool) ([]catalogPlaylist, error) {
	db, err := s.openLibrary("playlists")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.QueryContext(r.Context(), "SELECT id, COALESCE(name, ''), COALESCE(songs, '[]') FROM playlists ORDER BY name, id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	playlists := []catalogPlaylist{}
	for rows.Next() {
		var playlist catalogPlaylist
		var raw string
		if err := rows.Scan(&playlist.ID, &playlist.Name, &raw); err != nil {
			return nil, err
		}
		var ids []string
		if err := json.Unmarshal([]byte(raw), &ids); err != nil {
			return nil, err
		}
		playlist.Songs = []string{}
		for _, id := range ids {
			if available[id] {
				playlist.Songs = append(playlist.Songs, id)
			}
		}
		playlists = append(playlists, playlist)
	}
	return playlists, rows.Err()
}

func writeJSON(w http.ResponseWriter, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(value)
}

func (s *syncServer) media(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/songs/"), "/")
	if len(parts) != 2 {
		http.NotFound(w, r)
		return
	}
	db, err := s.openLibrary("musics")
	if err != nil {
		http.Error(w, "Cannot open library", 503)
		return
	}
	defer db.Close()
	song, err := s.readSong(db.QueryRowContext(r.Context(), songQuery+" WHERE song_id = ?", parts[0]))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if parts[1] == "artwork" {
		s.artwork(w, r, song)
		return
	}
	if r.URL.Query().Get("v") != song.AudioVersion {
		http.Error(w, "Audio changed. Compare the library again.", http.StatusConflict)
		return
	}
	file, err := os.Open(song.AudioPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || audioVersion(info) != song.AudioVersion {
		http.Error(w, "Audio changed. Compare again.", http.StatusConflict)
		return
	}
	if parts[1] == "info" {
		hash := sha256.New()
		if _, err := io.Copy(hash, file); err != nil {
			http.Error(w, "Cannot checksum audio", 500)
			return
		}
		after, err := file.Stat()
		if err != nil || audioVersion(after) != song.AudioVersion {
			http.Error(w, "Audio changed during checksum", http.StatusConflict)
			return
		}
		writeJSON(w, map[string]interface{}{"sha256": hex.EncodeToString(hash.Sum(nil)), "size": song.Size, "audioVersion": song.AudioVersion})
		return
	}
	if parts[1] != "file" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("ETag", `"`+song.AudioVersion+`"`)
	w.Header().Set("Content-Type", song.MIME)
	http.ServeContent(w, r, song.ID+"."+song.Format, info.ModTime(), file)
}

func readArtwork(name string) ([]byte, error) {
	file, err := os.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 16*1024*1024+1))
	if err != nil || len(data) > 16*1024*1024 {
		return nil, fmt.Errorf("artwork too large")
	}
	if strings.EqualFold(filepath.Ext(name), ".svg") {
		var root struct{ XMLName xml.Name }
		if len(data) <= 128*1024 && xml.Unmarshal(data, &root) == nil && root.XMLName.Local == "svg" {
			return data, nil
		}
		return nil, fmt.Errorf("unsupported SVG artwork")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 40000000 {
		return nil, fmt.Errorf("unsupported artwork")
	}
	return data, nil
}

func (s *syncServer) artwork(w http.ResponseWriter, r *http.Request, song catalogSong) {
	if song.ArtworkVersion == "" || r.URL.Query().Get("v") != song.ArtworkVersion {
		http.Error(w, "Artwork unavailable or changed. Compare again.", http.StatusConflict)
		return
	}
	data, err := readArtwork(song.ArtworkPath)
	if err != nil || digestBytes(data) != song.ArtworkVersion {
		http.Error(w, "Artwork changed. Compare again.", http.StatusConflict)
		return
	}
	if strings.EqualFold(filepath.Ext(song.ArtworkPath), ".svg") {
		w.Header().Set("Content-Type", "image/svg+xml")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
		w.Header().Set("ETag", `"`+song.ArtworkVersion+`"`)
		http.ServeContent(w, r, "artwork.svg", time.Time{}, bytes.NewReader(data))
		return
	}
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		http.Error(w, "Cannot decode artwork", 500)
		return
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width > 160 || height > 160 {
		if width >= height {
			height, width = max(1, height*160/width), 160
		} else {
			width, height = max(1, width*160/height), 160
		}
	}
	thumbnail := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			thumbnail.Set(x, y, source.At(bounds.Min.X+x*bounds.Dx()/width, bounds.Min.Y+y*bounds.Dy()/height))
		}
	}
	var output bytes.Buffer
	if err := jpeg.Encode(&output, thumbnail, &jpeg.Options{Quality: 75}); err != nil {
		http.Error(w, "Cannot encode artwork", 500)
		return
	}
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("ETag", `"`+song.ArtworkVersion+`"`)
	http.ServeContent(w, r, "artwork.jpg", time.Time{}, bytes.NewReader(output.Bytes()))
}
