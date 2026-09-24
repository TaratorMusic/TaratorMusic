package main

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	githubAPI      = "https://api.github.com/repos/Victiniiiii/Linetime/releases/latest"
	binDir         = "bin"
	modelsDir      = "bin/sounddetect_models"
	huggingFace    = "https://huggingface.co/xycld/lyric-align-mms-fa/resolve/main"
	whisperHF      = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"
)

type GitHubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

type DownloadProgress struct {
	Total     int64
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

func downloadFile(url, dest string) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}

	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{}
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

	outFile, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer outFile.Close()

	progress := &DownloadProgress{Total: resp.ContentLength}
	_, err = io.Copy(outFile, io.TeeReader(resp.Body, progress))
	fmt.Println()
	return err
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

		target := filepath.Join(destDir, header.Name)

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

func getAssetName(useGPU bool) string {
	var osPart, archPart string

	switch runtime.GOOS {
	case "linux":
		osPart = "linux"
	case "darwin":
		osPart = "macos"
	case "windows":
		osPart = "windows"
	default:
		return ""
	}

	switch runtime.GOARCH {
	case "amd64":
		archPart = "x64"
	case "arm64":
		archPart = "arm64"
	default:
		return ""
	}

	name := fmt.Sprintf("linetime-%s-%s", osPart, archPart)
	if useGPU {
		name += "-gpu"
	}
	if runtime.GOOS == "windows" {
		name += ".tar.gz"
	} else {
		name += ".tar.gz"
	}
	return name
}

func getBinaryName() string {
	if runtime.GOOS == "windows" {
		return "sounddetect.exe"
	}
	return "sounddetect"
}

func downloadBinary(useGPU, force bool) error {
	binaryPath := filepath.Join(binDir, getBinaryName())

	if !force {
		if _, err := os.Stat(binaryPath); err == nil {
			fmt.Printf("Linetime binary already exists at %s, skipping download (use --force to re-download)\n", binaryPath)
			return nil
		}
	} else {
		if err := os.Remove(binaryPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("error removing old binary: %v", err)
		}
		fmt.Println("Force mode: removed existing binary, downloading latest...")
	}

	fmt.Println("Fetching latest Linetime release from GitHub...")

	req, err := http.NewRequest("GET", githubAPI, nil)
	if err != nil {
		return fmt.Errorf("error creating request: %v", err)
	}

	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		fmt.Println("Using authenticated GitHub API request")
	}

	client := &http.Client{}
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

	assetName := getAssetName(useGPU)
	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == assetName {
			downloadURL = asset.BrowserDownloadURL
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

	fmt.Println("Extracting...")
	if err := extractTarGz(tmpFile, binDir); err != nil {
		return fmt.Errorf("error extracting archive: %v", err)
	}

	// The extracted binary might have a platform-specific name, rename to sounddetect
	extractedNames := []string{
		fmt.Sprintf("linetime-%s-%s", getOSName(), getArchName()),
		fmt.Sprintf("linetime-%s-%s.exe", getOSName(), getArchName()),
	}
	for _, name := range extractedNames {
		extracted := filepath.Join(binDir, name)
		if _, err := os.Stat(extracted); err == nil {
			if extracted != binaryPath {
				os.Rename(extracted, binaryPath)
			}
			break
		}
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(binaryPath, 0755); err != nil {
			return fmt.Errorf("error setting executable permission: %v", err)
		}
	}

	// If GPU build, the lib/ directory should already be extracted from the tar.gz
	if useGPU {
		fmt.Println("GPU libraries extracted to bin/lib/")
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
	case "whisper-q4":
		return downloadWhisperModel("q4", force)
	case "whisper-q5":
		return downloadWhisperModel("q5", force)
	case "whisper-q8":
		return downloadWhisperModel("q8", force)
	default:
		return fmt.Errorf("unknown model type: %s (expected 'standard', 'fast', 'whisper', 'whisper-q4', 'whisper-q5', 'whisper-q8')", modelType)
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
	case "q4":
		modelName = "ggml-large-v3-q4_0.bin"
		modelURL = whisperHF + "/ggml-large-v3-q4_0.bin"
		expectedSize = 1900000000
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

	if err := downloadFile(modelURL, modelPath); err != nil {
		return fmt.Errorf("error downloading whisper model: %v", err)
	}

	if info, err := os.Stat(modelPath); err == nil && info.Size() < expectedSize*8/10 {
		return fmt.Errorf("downloaded model seems incomplete (%d bytes, expected ~%d)", info.Size(), expectedSize)
	}

	fmt.Printf("Whisper model (%s) downloaded successfully\n", quant)
	return nil
}

func downloadModelFP32(force bool) error {
	onnxPath := filepath.Join(modelsDir, "mms_multilingual.onnx")
	dataPath := filepath.Join(modelsDir, "mms_multilingual.onnx.data")

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
	if err := downloadFile(onnxURL, onnxPath); err != nil {
		return fmt.Errorf("error downloading model: %v", err)
	}

	dataURL := huggingFace + "/mms_fa.onnx.data"
	if err := downloadFile(dataURL, dataPath); err != nil {
		return fmt.Errorf("error downloading model data: %v", err)
	}

	// Rename to expected names for linetime compatibility
	expectedOnnx := filepath.Join(modelsDir, "mms_multilingual.onnx")
	expectedData := filepath.Join(modelsDir, "mms_multilingual.onnx.data")
	if onnxPath != expectedOnnx {
		os.Rename(onnxPath, expectedOnnx)
	}
	if dataPath != expectedData {
		os.Rename(dataPath, expectedData)
	}

	fmt.Println("Standard model downloaded successfully")
	return nil
}

func downloadModelUINT8(force bool) error {
	onnxPath := filepath.Join(modelsDir, "mms_multilingual.onnx")

	if !force {
		if _, err := os.Stat(onnxPath); err == nil {
			// Check if it's the small version (under 500MB)
			info, err := os.Stat(onnxPath)
			if err == nil && info.Size() < 500*1048576 {
				fmt.Println("Fast model (UINT8, 303MB) already exists, skipping")
				return nil
			}
		}
	}

	fmt.Println("Downloading fast CTC model (UINT8, ~303MB)...")

	onnxURL := huggingFace + "/mms_fa_uint8.onnx"
	if err := downloadFile(onnxURL, onnxPath); err != nil {
		return fmt.Errorf("error downloading model: %v", err)
	}

	// Remove the large .data file if present (UINT8 model is self-contained)
	dataPath := filepath.Join(modelsDir, "mms_multilingual.onnx.data")
	os.Remove(dataPath)

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
		case arg == "--model-whisper-q4":
			modelType = "whisper-q4"
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
		case arg == "--help" || arg == "-h":
			fmt.Println("Linetime fetcher - downloads Linetime binary, CTC alignment model, and Whisper model")
			fmt.Println()
			fmt.Println("Usage: linetime_fetch [options]")
			fmt.Println()
			fmt.Println("Options:")
			fmt.Println("  --force              Re-download even if files exist")
			fmt.Println("  --gpu                Download GPU variant (requires NVIDIA CUDA 12)")
			fmt.Println("  --model-standard     Download standard CTC FP32 model (~1.2GB, default)")
			fmt.Println("  --model-fast         Download fast CTC UINT8 model (~303MB)")
			fmt.Println("  --model-whisper      Download Whisper large-v3 fp16 (~3.1GB)")
			fmt.Println("  --model-whisper-q4   Download Whisper large-v3 q4_0 (~1.9GB)")
			fmt.Println("  --model-whisper-q5   Download Whisper large-v3 q5_0 (~2.1GB)")
			fmt.Println("  --model-whisper-q8   Download Whisper large-v3 q8_0 (~2.6GB)")
			fmt.Println("  --skip-binary        Skip binary download")
			fmt.Println("  --skip-model         Skip CTC model download")
			fmt.Println("  --skip-tokenizer     Skip tokenizer download")
			fmt.Println("  -h, --help           Show this help")
			fmt.Println()
			fmt.Println("Environment:")
			fmt.Println("  GITHUB_TOKEN         GitHub API token (optional, avoids rate limits)")
			os.Exit(0)
		}
	}

	fmt.Println("=== Linetime Fetcher ===")
	fmt.Println()

	changed := false

	if !skipBinary {
		if err := downloadBinary(useGPU, force); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading binary: %v\n", err)
			os.Exit(1)
		}
		changed = true
	}

	if !skipModel || !skipTokenizer {
		if err := downloadModel(modelType, force, !skipTokenizer); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading CTC model: %v\n", err)
			os.Exit(1)
		}
		changed = true
	}

	if !skipWhisper && strings.HasPrefix(modelType, "whisper") {
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
