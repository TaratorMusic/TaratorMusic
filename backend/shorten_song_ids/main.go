package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
)

type FileMapping struct {
	OldId              string `json:"oldId"`
	NewId              string `json:"newId"`
	SongExtension      string `json:"songExtension"`
	ThumbnailExtension string `json:"thumbnailExtension"`
}

func renameFile(oldPath, newPath string, wg *sync.WaitGroup) {
	defer wg.Done()
	if _, err := os.Stat(oldPath); err == nil {
		if err := os.Rename(oldPath, newPath); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to rename %s -> %s: %v\n", oldPath, newPath, err)
		}
	}
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: rename_files <musicFolder> <thumbnailFolder>")
		os.Exit(1)
	}

	musicFolder := os.Args[1]
	thumbnailFolder := os.Args[2]

	input, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Failed to read stdin:", err)
		os.Exit(1)
	}

	var mappings []FileMapping
	if err := json.Unmarshal(input, &mappings); err != nil {
		fmt.Fprintln(os.Stderr, "Failed to parse JSON mapping:", err)
		os.Exit(1)
	}

	var wg sync.WaitGroup
	for _, m := range mappings {
		wg.Add(2)
		musicOldPath := filepath.Join(musicFolder, m.OldId+"."+m.SongExtension)
		musicNewPath := filepath.Join(musicFolder, m.NewId+"."+m.SongExtension)
		go renameFile(musicOldPath, musicNewPath, &wg)

		thumbOldPath := filepath.Join(thumbnailFolder, m.OldId+"."+m.ThumbnailExtension)
		thumbNewPath := filepath.Join(thumbnailFolder, m.NewId+"."+m.ThumbnailExtension)
		go renameFile(thumbOldPath, thumbNewPath, &wg)
	}

	wg.Wait()
}
