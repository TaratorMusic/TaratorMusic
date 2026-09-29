package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"github.com/Victiniiiii/TaratorMusic/backend/internal/appfiles"
)

const (
	githubAPI = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"
	binDir    = "bin"
)

type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

func main() {
	force := false
	for _, arg := range os.Args[1:] {
		if arg == "--force" {
			force = true
		}
	}

	// The name is both the upstream release asset and our stored name, and it
	// lives in appfiles so binary_check resolves the same file we write.
	if !appfiles.PlatformSupported() {
		fmt.Fprintf(os.Stderr, "Unsupported platform: %s\n", runtime.GOOS)
		os.Exit(1)
	}
	assetName := appfiles.YtdlpName()
	outputName := assetName

	outputPath := filepath.Join(binDir, outputName)
	// A zero length file is a leftover from an interrupted download. Reuse the same
	// check linetime_fetch uses so a partial install is repaired rather than kept.
	if !force {
		if info, err := os.Stat(outputPath); err == nil && info.Size() > 0 {
			fmt.Printf("yt-dlp binary already exists at %s, skipping download\n", outputPath)
			return
		}
	} else {
		fmt.Println("Force mode: downloading latest...")
	}

	fmt.Printf("Fetching latest yt-dlp release for %s...\n", runtime.GOOS)
	
	req, err := http.NewRequest("GET", githubAPI, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating request: %v\n", err)
		os.Exit(1)
	}
	
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		fmt.Println("Using authenticated GitHub API request")
	}
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error fetching release info: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "GitHub API returned status: %s\n", resp.Status)
		os.Exit(1)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		fmt.Fprintf(os.Stderr, "Error decoding release info: %v\n", err)
		os.Exit(1)
	}

	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == assetName {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		fmt.Fprintf(os.Stderr, "Could not find %s in release %s\n", assetName, release.TagName)
		os.Exit(1)
	}

	fmt.Printf("Downloading yt-dlp %s from %s...\n", release.TagName, downloadURL)
	dlResp, err := http.Get(downloadURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error downloading binary: %v\n", err)
		os.Exit(1)
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "Download failed with status: %s\n", dlResp.Status)
		os.Exit(1)
	}

	if err := os.MkdirAll(binDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "Error creating bin directory: %v\n", err)
		os.Exit(1)
	}

	// Write to a temp file and rename, so a failure part way through leaves the
	// working binary in place instead of deleting it.
	tmpPath := outputPath + ".part"
	outFile, err := os.Create(tmpPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating output file: %v\n", err)
		os.Exit(1)
	}

	written, err := io.Copy(outFile, dlResp.Body)
	outFile.Close()
	if err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "Error writing binary: %v\n", err)
		os.Exit(1)
	}

	// GitHub redirects the asset to a CDN. Without this a proxy or captive portal
	// returning 200 with an HTML page would be installed as yt-dlp and reported
	// as a success.
	if dlResp.ContentLength > 0 && written != dlResp.ContentLength {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "Download incomplete: got %d bytes, expected %d\n", written, dlResp.ContentLength)
		os.Exit(1)
	}
	if written == 0 {
		os.Remove(tmpPath)
		fmt.Fprintln(os.Stderr, "Downloaded file was empty")
		os.Exit(1)
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(tmpPath, 0755); err != nil {
			os.Remove(tmpPath)
			fmt.Fprintf(os.Stderr, "Error setting executable permission: %v\n", err)
			os.Exit(1)
		}
	}

	if err := os.Rename(tmpPath, outputPath); err != nil {
		os.Remove(tmpPath)
		fmt.Fprintf(os.Stderr, "Error installing binary: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Successfully downloaded yt-dlp %s to %s\n", release.TagName, outputPath)
}