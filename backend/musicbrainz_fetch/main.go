package main

import (
	"encoding/json"
	"fmt"
	"os"

	musicbrainzWrapper "github.com/Victiniiiii/musicbrainz-wrapper/pkg"
)

type SongMetadata struct {
	Artist   string `json:"artist"`
	Genre    string `json:"genre"`
	Language string `json:"language"`
	Title    string `json:"title"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "no songs given")
		os.Exit(1)
	}
	enc := json.NewEncoder(os.Stdout)
	for _, title := range os.Args[1:] {
		artist, genre, lang := musicbrainzWrapper.DetectMetadata(title)
		enc.Encode(SongMetadata{
			Title:    title,
			Artist:   artist,
			Genre:    genre,
			Language: lang,
		})
	}
}
