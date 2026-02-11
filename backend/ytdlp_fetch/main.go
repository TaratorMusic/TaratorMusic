package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
)

const (
	githubAPI     = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest"
	binDir        = "bin"
	ytdlpBaseName = "yt-dlp"
)

type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

func main() {
	var assetName, outputName string
	switch runtime.GOOS {
	case "windows":
		assetName = "yt-dlp.exe"
		outputName = "yt-dlp.exe"
	case "darwin":
		assetName = "yt-dlp_macos"
		outputName = "yt-dlp_macos"
	case "linux":
		assetName = "yt-dlp_linux"
		outputName = "yt-dlp_linux"
	default:
		fmt.Printf("Unsupported platform: %s\n", runtime.GOOS)
		os.Exit(1)
	}

	outputPath := filepath.Join(binDir, outputName)

	if _, err := os.Stat(outputPath); err == nil {
		fmt.Printf("yt-dlp binary already exists at %s, skipping download\n", outputPath)
		return
	}

	fmt.Printf("Fetching latest yt-dlp release for %s...\n", runtime.GOOS)

	resp, err := http.Get(githubAPI)
	if err != nil {
		fmt.Printf("Error fetching release info: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("GitHub API returned status: %s\n", resp.Status)
		os.Exit(1)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		fmt.Printf("Error decoding release info: %v\n", err)
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
		fmt.Printf("Could not find %s in release %s\n", assetName, release.TagName)
		os.Exit(1)
	}

	fmt.Printf("Downloading yt-dlp %s from %s...\n", release.TagName, downloadURL)

	dlResp, err := http.Get(downloadURL)
	if err != nil {
		fmt.Printf("Error downloading binary: %v\n", err)
		os.Exit(1)
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != http.StatusOK {
		fmt.Printf("Download failed with status: %s\n", dlResp.Status)
		os.Exit(1)
	}

	if err := os.MkdirAll(binDir, 0755); err != nil {
		fmt.Printf("Error creating bin directory: %v\n", err)
		os.Exit(1)
	}

	outFile, err := os.Create(outputPath)
	if err != nil {
		fmt.Printf("Error creating output file: %v\n", err)
		os.Exit(1)
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, dlResp.Body)
	if err != nil {
		fmt.Printf("Error writing binary: %v\n", err)
		os.Exit(1)
	}

	// Make executable on Unix systems
	if runtime.GOOS != "windows" {
		if err := os.Chmod(outputPath, 0755); err != nil {
			fmt.Printf("Error setting executable permission: %v\n", err)
			os.Exit(1)
		}
	}

	fmt.Printf("Successfully downloaded yt-dlp to %s\n", outputPath)
}