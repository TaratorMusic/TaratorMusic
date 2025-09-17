package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Println("Usage: go run script.go <musicFolder> <thumbnailFolder>")
		return
	}

	musicFolder := os.Args[1]
	thumbnailFolder := os.Args[2]
	debugPattern := regexp.MustCompile(`^174655\d+-player-script\.js$`)

	musicMap := make(map[string]string)
	filepath.WalkDir(musicFolder, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() == 0 {
			return nil
		}
		name := d.Name()
		for _, c := range name {
			if c == '!' {
				return nil
			}
		}
		if debugPattern.MatchString(name) {
			return nil
		}
		ext := filepath.Ext(name)
		id := strings.TrimSuffix(name, ext)
		musicMap[id] = ext
		return nil
	})

	thumbMap := make(map[string]string)
	filepath.WalkDir(thumbnailFolder, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}

		ext := filepath.Ext(d.Name())
		id := strings.TrimSuffix(d.Name(), ext)
		if _, ok := musicMap[id]; ok {
			thumbMap[id] = ext
		} else {
			os.Remove(path)
		}

		return nil
	})

	result := make(map[string]map[string]*string)
	for id, musicExt := range musicMap {
		var thumbExt *string
		if t, ok := thumbMap[id]; ok {
			thumbExt = &t
		} else {
			thumbExt = nil
		}

		result[id] = map[string]*string{
			"song_extension":      &musicExt,
			"thumbnail_extension": thumbExt,
		}
	}

	b, _ := json.Marshal(result)
	fmt.Println(string(b))
}
