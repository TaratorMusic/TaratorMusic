package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	githubAPI   = "https://api.github.com/repos/Victiniiiii/Linetime/releases/"
	binDir      = "."
	modelsDir   = "sounddetect_models"
	huggingFace = "https://huggingface.co/xycld/lyric-align-mms-fa/resolve/main"
	whisperHF   = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"
)

type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Digest             string `json:"digest"`
	} `json:"assets"`
}

type DownloadProgress struct {
	Total      int64
	Downloaded int64
}

func (dp *DownloadProgress) Write(p []byte) (int, error) {
	n := len(p)
	dp.Downloaded += int64(n)
	if dp.Total > 0 {
		pct := float64(dp.Downloaded) / float64(dp.Total) * 100
		fmt.Printf("\r  Downloading... %.0f%% (%.0f MB / %.0f MB)", pct, float64(dp.Downloaded)/1048576, float64(dp.Total)/1048576)
	} else {
		fmt.Printf("\r  Downloading... %.0f MB", float64(dp.Downloaded)/1048576)
	}
	return n, nil
}

func downloadFile(urlStr, dest string) error {
	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return err
	}

	// Only add GITHUB_TOKEN for GitHub API and asset downloads
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		if u, err := url.Parse(urlStr); err == nil {
			if u.Host == "api.github.com" || u.Host == "github.com" || strings.HasSuffix(u.Host, ".github.com") {
				req.Header.Set("Authorization", "Bearer "+token)
			}
		}
	}

	client := &http.Client{Timeout: 2 * time.Hour}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %s", resp.Status)
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return err
	}

	// Write to temp file first for atomic rename
	tmpDest := dest + ".part"
	outFile, err := os.Create(tmpDest)
	if err != nil {
		return err
	}

	progress := &DownloadProgress{Total: resp.ContentLength}
	_, err = io.Copy(outFile, io.TeeReader(resp.Body, progress))
	outFile.Close()
	fmt.Println()

	if err != nil {
		os.Remove(tmpDest)
		return err
	}

	// Verify download size if Content-Length was provided
	if resp.ContentLength > 0 {
		info, err := os.Stat(tmpDest)
		if err == nil && info.Size() != resp.ContentLength {
			os.Remove(tmpDest)
			return fmt.Errorf("download size mismatch: got %d, expected %d", info.Size(), resp.ContentLength)
		}
	}

	// Atomic rename
	if err := os.Rename(tmpDest, dest); err != nil {
		os.Remove(tmpDest)
		return err
	}

	return nil
}

func extractTarGz(tgzPath, destDir string) error {
	f, err := os.Open(tgzPath)
	if err != nil {
		return err
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		// Security: prevent path traversal
		if filepath.IsAbs(header.Name) {
			return fmt.Errorf("archive contains absolute path: %s", header.Name)
		}
		cleanName := filepath.Clean(header.Name)
		if strings.HasPrefix(cleanName, "..") || strings.Contains(cleanName, string(filepath.Separator)+"..") {
			return fmt.Errorf("archive contains path traversal: %s", header.Name)
		}
		// Reject symlinks and hardlinks for security
		if header.Typeflag == tar.TypeSymlink || header.Typeflag == tar.TypeLink {
			return fmt.Errorf("archive contains unsupported link type: %s", header.Name)
		}

		target := filepath.Join(destDir, cleanName)

		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
				return err
			}
			outFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(outFile, tr); err != nil {
				outFile.Close()
				return err
			}
			outFile.Close()
		}
	}
	return nil
}

type platformConfig struct {
	assetName      string
	binaryName     string
	whisperCliName string
	ffmpegName     string
	gpuSupported   bool
}

func getPlatformConfig(useGPU bool) (platformConfig, error) {
	var cfg platformConfig
	cfg.gpuSupported = useGPU && runtime.GOOS == "linux"

	switch runtime.GOOS {
	case "linux":
		cfg.assetName = "linetime-linux-x64"
		if useGPU {
			cfg.assetName += "-gpu"
		}
		cfg.assetName += ".tar.gz"
		cfg.binaryName = "linetime-linux-x64"
		if useGPU {
			cfg.binaryName = "linetime"
		}
		cfg.whisperCliName = "whisper-cli"
		cfg.ffmpegName = "ffmpeg"
	case "darwin":
		cfg.assetName = "linetime-macos-universal.tar.gz"
		cfg.binaryName = "linetime-macos-universal"
		cfg.whisperCliName = "whisper-cli"
		cfg.ffmpegName = "ffmpeg"
	case "windows":
		cfg.assetName = "linetime-windows-x64.tar.gz"
		cfg.binaryName = "linetime-windows-x64.exe"
		cfg.whisperCliName = "whisper-cli.exe"
		cfg.ffmpegName = "ffmpeg.exe"
		if useGPU {
			return cfg, fmt.Errorf("GPU variant not available for Windows")
		}
	default:
		return cfg, fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
	return cfg, nil
}

func getBinaryName(useGPU bool) string {
	cfg, _ := getPlatformConfig(useGPU)
	base := strings.TrimSuffix(cfg.binaryName, ".exe")
	if runtime.GOOS == "windows" {
		base += ".exe"
	}
	if useGPU {
		return base + "_gpu"
	}
	return base + "_cpu"
}

func downloadBinary(useGPU, force bool) error {
	cfg, err := getPlatformConfig(useGPU)
	if err != nil {
		return err
	}

	binaryName := getBinaryName(useGPU)
	binaryPath := filepath.Join(binDir, binaryName)

	if !force {
		if _, err := os.Stat(binaryPath); err == nil {
			fmt.Printf("Linetime binary (%s) already exists at %s, skipping download (use --force to re-download)\n", binaryName, binaryPath)
			return nil
		}
	} else {
		if err := os.Remove(binaryPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("error removing old binary: %v", err)
		}
		fmt.Println("Force mode: removed existing binary, downloading latest...")
	}

	fmt.Println("Fetching Linetime release from GitHub...")

	releaseTag := os.Getenv("LINETIME_RELEASE_TAG")
	if releaseTag == "" {
		releaseTag = "latest"
	}
	apiURL := githubAPI
	if releaseTag != "latest" {
		apiURL += "tags/" + url.PathEscape(releaseTag)
	} else {
		apiURL += "latest"
	}

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return fmt.Errorf("error creating request: %v", err)
	}

	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		fmt.Println("Using authenticated GitHub API request")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("error fetching release info: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GitHub API returned status: %s", resp.Status)
	}

	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return fmt.Errorf("error decoding release info: %v", err)
	}

	assetName := cfg.assetName
	var downloadURL string
	var assetDigest string
	for _, asset := range release.Assets {
		if asset.Name == assetName {
			downloadURL = asset.BrowserDownloadURL
			assetDigest = asset.Digest
			break
		}
	}

	if downloadURL == "" {
		gpuHint := ""
		if useGPU {
			gpuHint = " (GPU)"
		}
		return fmt.Errorf("could not find %s%s in release %s", assetName, gpuHint, release.TagName)
	}

	gpuLabel := "CPU"
	if useGPU {
		gpuLabel = "GPU"
	}
	fmt.Printf("Downloading Linetime %s (%s) from %s...\n", release.TagName, gpuLabel, downloadURL)

	tmpFile := filepath.Join(binDir, ".linetime_download.tar.gz")
	if err := downloadFile(downloadURL, tmpFile); err != nil {
		return fmt.Errorf("error downloading binary: %v", err)
	}
	defer os.Remove(tmpFile)

	// Verify SHA256 if digest available
	if assetDigest != "" {
		// TODO: implement SHA256 verification
	}

	fmt.Println("Extracting...")
	// Extract to temporary staging directory first
	stagingDir := filepath.Join(binDir, ".linetime_staging")
	os.RemoveAll(stagingDir)
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(stagingDir)

	if err := extractTarGz(tmpFile, stagingDir); err != nil {
		return fmt.Errorf("error extracting archive: %v", err)
	}

	// Find and move the binary
	extractedBinary := filepath.Join(stagingDir, cfg.binaryName)
	if _, err := os.Stat(extractedBinary); err != nil {
		return fmt.Errorf("extracted binary not found: %s", cfg.binaryName)
	}
	if err := os.Rename(extractedBinary, binaryPath); err != nil {
		return fmt.Errorf("error moving binary: %v", err)
	}

	// Move whisper-cli if present
	whisperCliSrc := filepath.Join(stagingDir, cfg.whisperCliName)
	whisperCliDst := filepath.Join(binDir, cfg.whisperCliName)
	if _, err := os.Stat(whisperCliSrc); err == nil {
		if err := os.Rename(whisperCliSrc, whisperCliDst); err != nil {
			return fmt.Errorf("error moving whisper-cli: %v", err)
		}
	}

	// Move ffmpeg if present
	ffmpegSrc := filepath.Join(stagingDir, cfg.ffmpegName)
	ffmpegDst := filepath.Join(binDir, cfg.ffmpegName)
	if _, err := os.Stat(ffmpegSrc); err == nil {
		if err := os.Rename(ffmpegSrc, ffmpegDst); err != nil {
			return fmt.Errorf("error moving ffmpeg: %v", err)
		}
	}

	// Move lib directory for GPU
	if useGPU {
		srcLib := filepath.Join(stagingDir, "lib")
		dstLib := filepath.Join(binDir, "lib_gpu")
		if _, err := os.Stat(srcLib); err == nil {
			os.RemoveAll(dstLib)
			if err := os.Rename(srcLib, dstLib); err != nil {
				return fmt.Errorf("error moving lib to lib_gpu: %v", err)
			}
			fmt.Println("GPU libraries extracted to bin/lib_gpu/")
		}
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(binaryPath, 0755); err != nil {
			return fmt.Errorf("error setting executable permission: %v", err)
		}
		if err := os.Chmod(whisperCliDst, 0755); err != nil {
			// Ignore error if whisper-cli doesn't exist
		}
		if err := os.Chmod(ffmpegDst, 0755); err != nil {
			// Ignore error if ffmpeg doesn't exist
		}
	}

	fmt.Printf("Successfully downloaded Linetime %s (%s) to %s\n", release.TagName, gpuLabel, binaryPath)
	return nil
}

func downloadModel(modelType string, force bool, downloadTokenizer bool) error {
	if err := os.MkdirAll(modelsDir, 0755); err != nil {
		return fmt.Errorf("error creating models directory: %v", err)
	}

	if downloadTokenizer {
		tokenizerPath := filepath.Join(modelsDir, "mms_multilingual_tokenizer.json")
		if _, err := os.Stat(tokenizerPath); err != nil || force {
			fmt.Println("Downloading tokenizer...")
			tokenizerURL := huggingFace + "/tokenizer.json"
			if err := downloadFile(tokenizerURL, tokenizerPath); err != nil {
				return fmt.Errorf("error downloading tokenizer: %v", err)
			}
		} else {
			fmt.Println("Tokenizer already present, skipping")
		}
	}

	switch modelType {
	case "standard":
		return downloadModelFP32(force)
	case "fast":
		return downloadModelUINT8(force)
	case "whisper":
		return downloadWhisperModel("standard", force)
	case "whisper-q5":
		return downloadWhisperModel("q5", force)
	case "whisper-q8":
		return downloadWhisperModel("q8", force)
	default:
		return fmt.Errorf("unknown model type: %s (expected 'standard', 'fast', 'whisper', 'whisper-q5', 'whisper-q8')", modelType)
	}
}

func downloadWhisperModel(quant string, force bool) error {
	var modelName, modelURL string
	var expectedSize int64

	switch quant {
	case "standard":
		modelName = "ggml-large-v3.bin"
		modelURL = whisperHF + "/ggml-large-v3.bin"
		expectedSize = 3095033483
	case "q5":
		modelName = "ggml-large-v3-q5_0.bin"
		modelURL = whisperHF + "/ggml-large-v3-q5_0.bin"
		expectedSize = 2100000000
	case "q8":
		modelName = "ggml-large-v3-q8_0.bin"
		modelURL = whisperHF + "/ggml-large-v3-q8_0.bin"
		expectedSize = 2600000000
	default:
		return fmt.Errorf("unknown whisper quantization: %s", quant)
	}

	modelPath := filepath.Join(modelsDir, modelName)

	if !force {
		if info, err := os.Stat(modelPath); err == nil {
			if info.Size() >= expectedSize*9/10 {
				fmt.Printf("Whisper model (%s, ~%.0fMB) already exists, skipping\n", quant, float64(expectedSize)/1048576)
				return nil
			}
		}
	}

	fmt.Printf("Downloading Whisper large-v3 model (%s, ~%.0fMB)...\n", quant, float64(expectedSize)/1048576)

	if err := downloadFile(modelURL, filepath.Join(modelsDir, modelName+".part")); err != nil {
		return fmt.Errorf("error downloading whisper model: %v", err)
	}

	finalPath := filepath.Join(modelsDir, modelName)
	if info, err := os.Stat(filepath.Join(modelsDir, modelName+".part")); err == nil && info.Size() < expectedSize*8/10 {
		os.Remove(filepath.Join(modelsDir, modelName+".part"))
		return fmt.Errorf("downloaded model seems incomplete (%d bytes, expected ~%d)", info.Size(), expectedSize)
	}

	if err := os.Rename(filepath.Join(modelsDir, modelName+".part"), finalPath); err != nil {
		return fmt.Errorf("error moving whisper model: %v", err)
	}

	fmt.Printf("Whisper model (%s) downloaded successfully\n", quant)
	return nil
}

func downloadModelFP32(force bool) error {
	onnxPath := filepath.Join(modelsDir, "mms_multilingual_standard.onnx")
	dataPath := filepath.Join(modelsDir, "mms_multilingual_standard.onnx.data")

	if !force {
		if _, err := os.Stat(onnxPath); err == nil {
			if _, err := os.Stat(dataPath); err == nil {
				fmt.Println("Standard model (FP32, 1.2GB) already exists, skipping")
				return nil
			}
		}
	}

	fmt.Println("Downloading standard CTC model (FP32, ~1.2GB)...")

	onnxURL := huggingFace + "/mms_fa.onnx"
	if err := downloadFile(onnxURL, onnxPath+".part"); err != nil {
		return fmt.Errorf("error downloading model: %v", err)
	}
	if err := os.Rename(onnxPath+".part", onnxPath); err != nil {
		return fmt.Errorf("error moving model: %v", err)
	}

	dataURL := huggingFace + "/mms_fa.onnx.data"
	if err := downloadFile(dataURL, dataPath+".part"); err != nil {
		return fmt.Errorf("error downloading model data: %v", err)
	}
	if err := os.Rename(dataPath+".part", dataPath); err != nil {
		return fmt.Errorf("error moving model data: %v", err)
	}

	fmt.Println("Standard model downloaded successfully")
	return nil
}

func downloadModelUINT8(force bool) error {
	onnxPath := filepath.Join(modelsDir, "mms_multilingual_fast.onnx")

	if !force {
		if _, err := os.Stat(onnxPath); err == nil {
			info, err := os.Stat(onnxPath)
			if err == nil && info.Size() >= 250*1048576 && info.Size() <= 500*1048576 {
				fmt.Println("Fast model (UINT8, 303MB) already exists, skipping")
				return nil
			}
		}
	}

	fmt.Println("Downloading fast CTC model (UINT8, ~303MB)...")

	onnxURL := huggingFace + "/mms_fa_uint8.onnx"
	if err := downloadFile(onnxURL, onnxPath+".part"); err != nil {
		return fmt.Errorf("error downloading model: %v", err)
	}

	if err := os.Rename(onnxPath+".part", onnxPath); err != nil {
		return fmt.Errorf("error moving model: %v", err)
	}

	// Do NOT remove standard model's .data file - they are independent
	fmt.Println("Fast model downloaded successfully")
	return nil
}

func getOSName() string {
	switch runtime.GOOS {
	case "linux":
		return "linux"
	case "darwin":
		return "macos"
	case "windows":
		return "windows"
	default:
		return runtime.GOOS
	}
}

func getArchName() string {
	switch runtime.GOARCH {
	case "amd64":
		return "x64"
	case "arm64":
		return "arm64"
	default:
		return runtime.GOARCH
	}
}

func main() {
	force := false
	useGPU := false
	modelType := "standard"
	skipBinary := false
	skipModel := false
	skipTokenizer := false
	skipWhisper := false
	tokenizerOnly := false
	assetDir := "."

	for _, arg := range os.Args[1:] {
		switch {
		case arg == "--force":
			force = true
		case arg == "--gpu":
			useGPU = true
		case arg == "--model-standard":
			modelType = "standard"
		case arg == "--model-fast":
			modelType = "fast"
		case arg == "--model-whisper":
			modelType = "whisper"
		case arg == "--model-whisper-q5":
			modelType = "whisper-q5"
		case arg == "--model-whisper-q8":
			modelType = "whisper-q8"
		case arg == "--skip-binary":
			skipBinary = true
		case arg == "--skip-model":
			skipModel = true
		case arg == "--skip-tokenizer":
			skipTokenizer = true
		case arg == "--skip-whisper":
			skipWhisper = true
		case arg == "--tokenizer-only":
			tokenizerOnly = true
		case strings.HasPrefix(arg, "--asset-dir="):
			assetDir = strings.TrimPrefix(arg, "--asset-dir=")
		case strings.HasPrefix(arg, "--release="):
			os.Setenv("LINETIME_RELEASE_TAG", strings.TrimPrefix(arg, "--release="))
		case arg == "--help" || arg == "-h":
			fmt.Println("Linetime fetcher - downloads Linetime binary, CTC alignment model, and Whisper model")
			fmt.Println()
			fmt.Println("Usage: linetime_fetch [options]")
			fmt.Println()
			fmt.Println("Options:")
			fmt.Println("  --force               Re-download even if files exist")
			fmt.Println("  --gpu                 Download GPU variant (requires NVIDIA CUDA 12, Linux only)")
			fmt.Println("  --model-standard      Download standard CTC FP32 model (~1.2GB, default)")
			fmt.Println("  --model-fast          Download fast CTC UINT8 model (~303MB)")
			fmt.Println("  --model-whisper       Download Whisper large-v3 fp16 (~3.1GB)")
			fmt.Println("  --model-whisper-q5    Download Whisper large-v3 q5_0 (~2.1GB)")
			fmt.Println("  --model-whisper-q8    Download Whisper large-v3 q8_0 (~2.6GB)")
			fmt.Println("  --skip-binary         Skip binary download")
			fmt.Println("  --skip-model          Skip CTC model download")
			fmt.Println("  --skip-tokenizer      Skip tokenizer download")
			fmt.Println("  --skip-whisper        Skip Whisper model download")
			fmt.Println("  --tokenizer-only      Download only the tokenizer (skips binary, model, whisper)")
			fmt.Println("  --asset-dir=<path>    Set asset directory (default: current directory)")
			fmt.Println("  --release=<tag>       GitHub release tag (default: latest, env LINETIME_RELEASE_TAG)")
			fmt.Println("  -h, --help            Show this help")
			fmt.Println()
			fmt.Println("Environment:")
			fmt.Println("  GITHUB_TOKEN          GitHub API token (optional, avoids rate limits)")
			fmt.Println("  LINETIME_RELEASE_TAG  Release tag to download (default: latest)")
			os.Exit(0)
		}
	}

	// Change to asset directory
	if assetDir != "." {
		if err := os.Chdir(assetDir); err != nil {
			fmt.Fprintf(os.Stderr, "Error changing to asset directory: %v\n", err)
			os.Exit(1)
		}
	}

	fmt.Println("=== Linetime Fetcher ===")
	fmt.Println()

	changed := false

	if !skipBinary && !tokenizerOnly {
		if err := downloadBinary(useGPU, force); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading binary: %v\n", err)
			os.Exit(1)
		}
		changed = true
	}

	if tokenizerOnly {
		if err := downloadModel("standard", force, true); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading tokenizer: %v\n", err)
			os.Exit(1)
		}
		changed = true
	} else if !skipModel || !skipTokenizer {
		if err := downloadModel(modelType, force, !skipTokenizer); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading CTC model: %v\n", err)
			os.Exit(1)
		}
		changed = true
	}

	if !skipWhisper && strings.HasPrefix(modelType, "whisper") && !tokenizerOnly {
		if err := downloadModel(modelType, force, false); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading Whisper model: %v\n", err)
			os.Exit(1)
		}
		changed = true
	}

	if !changed {
		fmt.Println("Nothing to download.")
	}

	fmt.Println()
	fmt.Println("Done!")
}
