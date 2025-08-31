// This file will recreate the "App Thumbnails Folder" which contains essentials images for the app

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

type GitHubFile struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	DownloadURL string `json:"download_url"`
}

func downloadFile(url, dest string) error {
	resp, err := http.Get(url)

	if err != nil {
		return err
	}

	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("failed to download %s: status code %d", filepath.Base(dest), resp.StatusCode)
	}

	out, err := os.Create(dest)

	if err != nil {
		return err
	}

	defer out.Close()

	_, err = io.Copy(out, resp.Body)

	if err != nil {
		os.Remove(dest)
		return err
	}

	fmt.Printf("Downloaded %s\n", filepath.Base(dest))
	return nil
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run main.go <appThumbnailFolder>")
		os.Exit(1)
	}

	appThumbnailFolder := os.Args[1]

	if _, err := os.Stat(appThumbnailFolder); os.IsNotExist(err) {
		os.Mkdir(appThumbnailFolder, 0755)
	}

	apiUrl := "https://api.github.com/repos/Victiniiiii/TaratorMusic/contents/assets"
	req, err := http.NewRequest("GET", apiUrl, nil)

	if err != nil {
		fmt.Println("Error creating request:", err)
		os.Exit(1)
	}

	req.Header.Set("User-Agent", "Go-http-client")

	resp, err := http.DefaultClient.Do(req)

	if err != nil {
		fmt.Println("Error fetching asset list:", err)
		os.Exit(1)
	}

	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		fmt.Printf("Failed to fetch assets list: Status code %d\n", resp.StatusCode)
		os.Exit(1)
	}

	var files []GitHubFile

	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		fmt.Println("Error decoding response:", err)
		os.Exit(1)
	}

	for _, f := range files {
		if f.Type == "file" {
			dest := filepath.Join(appThumbnailFolder, f.Name)
			if _, err := os.Stat(dest); err == nil {
				fmt.Printf("%s already exists, skipping download.\n", f.Name)
				continue
			}

			if err := downloadFile(f.DownloadURL, dest); err != nil {
				fmt.Println("Error downloading:", err)
			}
		}
	}
}
