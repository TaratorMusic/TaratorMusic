package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run script.go <folder>")
		return
	}

	var files []string
	folder := os.Args[1]
	debugPattern := regexp.MustCompile(`^174655\d+-player-script\.js$`)

	filepath.WalkDir(folder, func(path string, d fs.DirEntry, err error) error {
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

		files = append(files, name)
		return nil
	})

	b, _ := json.Marshal(files)
	fmt.Println(string(b))
}
