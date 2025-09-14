package main

import (
	"fmt"
	"os"

	musicbrainzWrapper "github.com/Victiniiiii/musicbrainz-wrapper/pkg"
)

type SongMetadata struct {
	Artist   string `json:"artist"`
	Genre    string `json:"genre"`
	Language string `json:"language"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run songinfo.go <song1> <song2> ...")
		return
	}

	songs := os.Args[1:]
	result := make(map[string]SongMetadata)

	for _, title := range songs {
		artist, genre, lang := musicbrainzWrapper.DetectMetadata(title)
		result[title] = SongMetadata{
			Artist:   artist,
			Genre:    genre,
			Language: lang,
		}
	}

	for title, meta := range result {
		fmt.Printf("Song: %q, Artist: %s, Genre: %s, Language: %s\n", title, meta.Artist, meta.Genre, meta.Language)
	}
}
