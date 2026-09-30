package main

import (
	"archive/tar"
	"archive/zip"
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

	"github.com/Victiniiiii/TaratorMusic/backend/internal/appfiles"
)

const (
	githubAPI   = "https://api.github.com/repos/Victiniiiii/Linetime/releases/"
	binDir      = "."
	modelsDir   = appfiles.LinetimeModelsDirName
	huggingFace = "https://huggingface.co/xycld/lyric-align-mms-fa/resolve/main"
	whisperHF   = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"

	// whisper.cpp publishes prebuilt whisper-cli binaries. The macOS asset is
	// only an xcframework for embedding, so there is no CLI to download there.
	whisperCppTag  = "b5130"
	whisperCppBase = "https://github.com/ggml-org/whisper.cpp/releases/download/" + whisperCppTag
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
	assetName        string
	legacyAssetName  string
	binaryName       string
	legacyBinaryName string
	ffmpegName       string
	whisperCliName   string
	gpuSupported     bool
}

func getPlatformConfig(useGPU bool) (platformConfig, error) {
	var cfg platformConfig
	cfg.gpuSupported = useGPU && GPUSupportedOS()
	cfg.ffmpegName = appfiles.LinetimeFfmpegName()
	// The release archives name this file without a platform suffix on every
	// platform, unlike the binary and ffmpeg.
	cfg.whisperCliName = "whisper-cli"

	switch runtime.GOOS {
	case "linux":
		cfg.assetName = "linetime-linux-x64-cpu.tar.gz"
		cfg.legacyAssetName = "linetime-linux-x64.tar.gz"
		cfg.binaryName = "linetime-linux-x64-cpu"
		cfg.legacyBinaryName = "linetime-linux-x64"
		if useGPU {
			cfg.assetName = "linetime-linux-x64-gpu.tar.gz"
			cfg.binaryName = "linetime"
			cfg.legacyAssetName, cfg.legacyBinaryName = "", ""
		}
	case "darwin":
		cfg.assetName = "linetime-macos-universal.tar.gz"
		cfg.binaryName = "linetime-macos-universal"
	case "windows":
		cfg.assetName = "linetime-windows-x64-cpu.tar.gz"
		cfg.legacyAssetName = "linetime-windows-x64.tar.gz"
		cfg.binaryName = "linetime-windows-x64-cpu.exe"
		cfg.legacyBinaryName = "linetime-windows-x64.exe"
		if useGPU {
			cfg.assetName = "linetime-windows-x64-gpu.zip"
			cfg.binaryName = "linetime-windows-x64-gpu.exe"
			cfg.legacyAssetName, cfg.legacyBinaryName = "", ""
		}
	default:
		return cfg, fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
	return cfg, nil
}

// GPUSupportedOS mirrors appfiles.GPUSupported. nvcc requires MSVC, so the
// Windows bundle is a separate MSVC build, but it is still CUDA and still an
// NVIDIA requirement. macOS is excluded because there the GPU path is CoreML,
// which is driven by the aligner rather than by a CUDA bundle.
func GPUSupportedOS() bool {
	return runtime.GOOS == "linux" || runtime.GOOS == "windows"
}

func readDirNames(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			names = append(names, e.Name())
		}
	}
	return names
}

// Dest names live in the appfiles package so binary_check validates exactly what
// this tool writes.
func getBinaryName(useGPU bool) string {
	return appfiles.LinetimeBinaryName(useGPU)
}

// fetchLatestLinetimeRelease reads the release the app should install from. Shared
// with the CUDA whisper-cli download, whose asset lives in the same release.
func fetchLatestLinetimeRelease() (GitHubRelease, error) {
	var release GitHubRelease
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
		return release, fmt.Errorf("error creating request: %v", err)
	}

	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		fmt.Println("Using authenticated GitHub API request")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return release, fmt.Errorf("error fetching release info: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return release, fmt.Errorf("GitHub API returned status: %s", resp.Status)
	}

	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return release, fmt.Errorf("error decoding release info: %v", err)
	}
	return release, nil
}

// findReleaseAssetURL resolves an asset name to its download URL, trying each
// candidate in order so a rename does not break an existing install.
func findReleaseAssetURL(release GitHubRelease, candidates ...string) string {
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		for _, asset := range release.Assets {
			if asset.Name == candidate {
				return asset.BrowserDownloadURL
			}
		}
	}
	return ""
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

	release, err := fetchLatestLinetimeRelease()
	if err != nil {
		return err
	}

	// The CPU archives were renamed to ...-x64-cpu so the name says which one
	// they are, but releases published before that rename still use the old
	// names. Both are tried, newest naming first, so the download keeps working
	// against whatever release is actually current.
	candidates := []string{cfg.assetName}
	if cfg.legacyAssetName != "" {
		candidates = append(candidates, cfg.legacyAssetName)
	}

	var downloadURL string
	var assetDigest string
	var assetName string
	for _, candidate := range candidates {
		for _, asset := range release.Assets {
			if asset.Name == candidate {
				downloadURL = asset.BrowserDownloadURL
				assetDigest = asset.Digest
				assetName = candidate
				break
			}
		}
		if downloadURL != "" {
			break
		}
	}

	if downloadURL == "" {
		gpuHint := ""
		if useGPU {
			gpuHint = " (GPU)"
		}
		return fmt.Errorf("could not find %s%s in release %s", cfg.assetName, gpuHint, release.TagName)
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

	if strings.HasSuffix(tmpFile, ".zip") {
		if err := extractZip(tmpFile, stagingDir); err != nil {
			return fmt.Errorf("error extracting archive: %v", err)
		}
	} else if err := extractTarGz(tmpFile, stagingDir); err != nil {
		return fmt.Errorf("error extracting archive: %v", err)
	}

	// An archive that predates the rename carries the old binary name inside it.
	binaryInArchive := cfg.binaryName
	if assetName == cfg.legacyAssetName {
		binaryInArchive = cfg.legacyBinaryName
	}

	// Find and move the binary
	extractedBinary := filepath.Join(stagingDir, binaryInArchive)
	if _, err := os.Stat(extractedBinary); err != nil {
		return fmt.Errorf("extracted binary not found: %s", binaryInArchive)
	}
	if err := os.Rename(extractedBinary, binaryPath); err != nil {
		return fmt.Errorf("error moving binary: %v", err)
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
		// On Windows the CUDA DLLs are flat in the archive and have to stay flat:
		// the loader searches the executable's own directory, and there is no
		// LD_LIBRARY_PATH to point elsewhere before the image is mapped.
		if runtime.GOOS == "windows" {
			moved := 0
			for _, entry := range readDirNames(stagingDir) {
				if !strings.HasSuffix(strings.ToLower(entry), ".dll") {
					continue
				}
				if err := os.Rename(filepath.Join(stagingDir, entry), filepath.Join(binDir, entry)); err != nil {
					return fmt.Errorf("error moving %s next to the binary: %v", entry, err)
				}
				moved++
			}
			if moved == 0 {
				return fmt.Errorf("the GPU archive contained no DLLs, so the CUDA provider cannot load")
			}
			fmt.Printf("%d GPU DLLs extracted next to the binary.\n", moved)
		} else {
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

		// The GPU archive's whisper-cli is the CUDA build. It goes in its own
		// folder rather than over the CPU one, so the CPU CLI stays usable when
		// the aligner is switched back. This file used to be left in the staging
		// directory and deleted with it, which is why whisper kept running on the
		// CPU even with the GPU aligner selected.
		srcCli := filepath.Join(stagingDir, cfg.whisperCliName)
		if _, err := os.Stat(srcCli); err == nil {
			dstCliFolder := filepath.Join(binDir, appfiles.LinetimeWhisperCliGPUDir)
			if err := os.MkdirAll(dstCliFolder, 0755); err != nil {
				return fmt.Errorf("error creating whisper_cli_gpu: %v", err)
			}
			dstCli := filepath.Join(dstCliFolder, appfiles.LinetimeWhisperCliExecName())
			os.Remove(dstCli)
			if err := os.Rename(srcCli, dstCli); err != nil {
				return fmt.Errorf("error moving CUDA whisper-cli: %v", err)
			}
			if runtime.GOOS != "windows" {
				if err := os.Chmod(dstCli, 0755); err != nil {
					return fmt.Errorf("error setting executable permission: %v", err)
				}
			}
			fmt.Println("CUDA whisper-cli extracted to bin/whisper_cli_gpu/")
		}
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(binaryPath, 0755); err != nil {
			return fmt.Errorf("error setting executable permission: %v", err)
		}
		if err := os.Chmod(ffmpegDst, 0755); err != nil {
			// Ignore error if ffmpeg doesn't exist
		}
	}

	fmt.Printf("Successfully downloaded Linetime %s (%s) to %s\n", release.TagName, gpuLabel, binaryPath)
	return nil
}

// extractTarGzLinks extracts an archive that uses symlinks to provide
// versioned shared library names (libfoo.so -> libfoo.so.1 -> libfoo.so.1.2).
// Links are resolved into real file copies so the result has no dangling
// links, and any link pointing outside the destination is rejected.
func extractTarGzLinks(tgzPath, destDir string) error {
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

	type pendingLink struct {
		path   string
		target string
	}
	var links []pendingLink

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if filepath.IsAbs(header.Name) {
			return fmt.Errorf("archive contains absolute path: %s", header.Name)
		}
		cleanName := filepath.Clean(header.Name)
		if strings.HasPrefix(cleanName, "..") || strings.Contains(cleanName, string(filepath.Separator)+"..") {
			return fmt.Errorf("archive contains path traversal: %s", header.Name)
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
		case tar.TypeSymlink:
			links = append(links, pendingLink{path: target, target: header.Linkname})
		default:
			return fmt.Errorf("archive contains unsupported entry type: %s", header.Name)
		}
	}

	// Resolve links in passes so chains such as .so -> .so.1 -> .so.1.2 work
	// regardless of the order they appear in the archive.
	for pass := 0; pass < 8 && len(links) > 0; pass++ {
		var unresolved []pendingLink
		for _, l := range links {
			if filepath.IsAbs(l.target) {
				return fmt.Errorf("archive symlink is absolute: %s", l.path)
			}
			resolved := filepath.Clean(filepath.Join(filepath.Dir(l.path), l.target))
			rel, err := filepath.Rel(destDir, resolved)
			if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return fmt.Errorf("archive symlink escapes destination: %s -> %s", l.path, l.target)
			}
			data, err := os.ReadFile(resolved)
			if err != nil {
				unresolved = append(unresolved, l)
				continue
			}
			if err := os.WriteFile(l.path, data, 0644); err != nil {
				return err
			}
		}
		if len(unresolved) == len(links) {
			return fmt.Errorf("could not resolve %d symlink(s) in archive", len(unresolved))
		}
		links = unresolved
	}
	if len(links) > 0 {
		return fmt.Errorf("could not resolve %d symlink(s) in archive", len(links))
	}
	return nil
}

func extractZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		if filepath.IsAbs(f.Name) {
			return fmt.Errorf("archive contains absolute path: %s", f.Name)
		}
		cleanName := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanName, "..") || strings.Contains(cleanName, string(filepath.Separator)+"..") {
			return fmt.Errorf("archive contains path traversal: %s", f.Name)
		}
		target := filepath.Join(destDir, cleanName)

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		outFile, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func getWhisperCliAsset() (string, error) {
	if runtime.GOOS == "linux" {
		if runtime.GOARCH == "arm64" {
			return "whisper-bin-ubuntu-arm64.tar.gz", nil
		}
		return "whisper-bin-ubuntu-x64.tar.gz", nil
	}
	if runtime.GOOS == "windows" {
		if runtime.GOARCH == "386" {
			return "whisper-bin-Win32.zip", nil
		}
		return "whisper-bin-x64.zip", nil
	}
	if runtime.GOOS == "darwin" {
		return "", fmt.Errorf("whisper.cpp does not publish a macOS whisper-cli build, only an xcframework for embedding")
	}
	return "", fmt.Errorf("no whisper-cli build available for %s/%s", runtime.GOOS, runtime.GOARCH)
}

// largeExecutable reports whether a file is big enough to be a statically linked
// build. A dynamically linked whisper-cli is around a megabyte; the static CUDA
// one is over 100 MB because the CUDA code is linked in. The threshold sits well
// clear of both so a normal build is never mistaken for either.
func largeExecutable(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Size() > 32*1024*1024
}

func isWhisperCliSharedLib(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".dll") || strings.Contains(lower, ".so")
}

// getGpuWhisperCliAsset names the CUDA whisper-cli published by the Linetime
// release. Upstream whisper.cpp ships a cublas build for Windows but none for
// Linux, so the release has to carry its own. Both archives were built by the
// same GPU jobs that build the aligner, so they match the CUDA version it was
// compiled against.
func getGpuWhisperCliAsset() (string, error) {
	if runtime.GOOS == "linux" && runtime.GOARCH == "amd64" {
		return "linetime-whisper-cli-cuda-x64.tar.gz", nil
	}
	if runtime.GOOS == "windows" && runtime.GOARCH == "amd64" {
		return "linetime-whisper-cli-cuda-x64-windows.zip", nil
	}
	return "", fmt.Errorf("no CUDA whisper-cli is published for %s/%s", runtime.GOOS, runtime.GOARCH)
}

// downloadWhisperCli installs the CPU or the CUDA build. The two differ only in
// the asset and the destination folder, and the install is the same atomic
// staging-and-swap in both cases, so they share one implementation.
func downloadWhisperCli(force bool) error {
	return installWhisperCli(downloadWhisperCliSpec(force))
}

func downloadGpuWhisperCli(force bool) error {
	spec := downloadGpuWhisperCliSpec(force)
	if spec.asset == "" {
		return fmt.Errorf("no CUDA whisper-cli asset for this platform")
	}
	// The CUDA CLI is published by the Linetime release, not by upstream
	// whisper.cpp, so it is resolved through the same release lookup the aligner
	// uses rather than a hardcoded URL.
	release, err := fetchLatestLinetimeRelease()
	if err != nil {
		return err
	}
	url := findReleaseAssetURL(release, spec.asset)
	if url == "" {
		return fmt.Errorf("could not find %s in release %s. It ships with the GPU build, "+
			"so a release made before it was published will not have it",
			spec.asset, release.TagName)
	}
	spec.url = url
	return installWhisperCli(spec)
}

type whisperCliSpec struct {
	asset    string
	url      string
	execName string
	finalDir string
	force    bool
}

func downloadWhisperCliSpec(force bool) whisperCliSpec {
	asset, err := getWhisperCliAsset()
	if err != nil {
		asset = ""
	}
	return whisperCliSpec{
		asset:    asset,
		url:      whisperCppBase + "/" + asset,
		execName: whisperCliExecName(),
		finalDir: filepath.Join(binDir, appfiles.LinetimeWhisperCliDir),
		force:    force,
	}
}

func downloadGpuWhisperCliSpec(force bool) whisperCliSpec {
	asset, err := getGpuWhisperCliAsset()
	if err != nil {
		asset = ""
	}
	return whisperCliSpec{
		asset: asset,
		// The CUDA CLI is a Linetime release asset, not an upstream whisper.cpp one.
		url:      "",
		execName: whisperCliExecName(),
		finalDir: filepath.Join(binDir, appfiles.LinetimeWhisperCliGPUDir),
		force:    force,
	}
}

func whisperCliExecName() string {
	if runtime.GOOS == "windows" {
		return "whisper-cli.exe"
	}
	return "whisper-cli"
}

// installWhisperCli downloads, stages and swaps the CLI into place. The previous
// working install is only removed once the new one is fully written beside it, so
// a failure partway cannot leave the user with no CLI at all.
func installWhisperCli(spec whisperCliSpec) error {
	if spec.asset == "" {
		return fmt.Errorf("no whisper-cli asset for this platform")
	}
	assetName := spec.asset
	execName := spec.execName
	finalDir := spec.finalDir
	force := spec.force

	// The executable cannot start without its shared libraries, so both must be
	// present or a partial install is repaired.
	if !force {
		entries, err := os.ReadDir(finalDir)
		if err == nil {
			hasExec := false
			hasLib := false
			for _, e := range entries {
				if e.IsDir() {
					continue
				}
				if isWhisperCliSharedLib(e.Name()) {
					hasLib = true
				}
				if e.Name() != execName {
					continue
				}
				if info, err := e.Info(); err == nil && info.Size() > 0 {
					hasExec = true
				}
			}
			// A large executable means a statically linked build, which is how the
			// CUDA CLI is published on Linux: one file with nothing beside it. The
			// CPU build links libwhisper dynamically, so it does have libraries.
			// Judging by size keeps the skip working for both instead of demanding a
			// library the static build never ships.
			if hasExec && (hasLib || largeExecutable(filepath.Join(finalDir, execName))) {
				fmt.Printf("%s already exists, skipping\n", spec.url)
				return nil
			}
		}
	}

	url := whisperCppBase + "/" + assetName
	fmt.Printf("Downloading Whisper CLI (%s)...\n", assetName)

	archivePath := filepath.Join(os.TempDir(), "tarator_whisper_cli_archive")
	if err := downloadFile(url, archivePath); err != nil {
		return fmt.Errorf("error downloading whisper-cli: %v", err)
	}
	defer os.Remove(archivePath)

	stagingDir := filepath.Join(os.TempDir(), "tarator_whisper_cli_staging")
	os.RemoveAll(stagingDir)
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(stagingDir)

	var err error
	if strings.HasSuffix(assetName, ".zip") {
		err = extractZip(archivePath, stagingDir)
	} else {
		err = extractTarGzLinks(archivePath, stagingDir)
	}
	if err != nil {
		return fmt.Errorf("error extracting whisper-cli: %v", err)
	}

	// Build beside the target so a failure here never destroys a working install.
	// A sibling keeps the swap on one filesystem so the rename cannot fail late.
	nextDir := finalDir + ".new"
	os.RemoveAll(nextDir)
	if err := os.MkdirAll(nextDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(nextDir)

	foundExec := false
	walkErr := filepath.Walk(stagingDir, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		base := info.Name()
		isExec := base == execName
		if !isExec && !isWhisperCliSharedLib(base) {
			return nil
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		mode := os.FileMode(0644)
		if isExec {
			mode = 0755
			foundExec = true
		}
		return os.WriteFile(filepath.Join(nextDir, base), data, mode)
	})
	if walkErr != nil {
		return walkErr
	}
	if !foundExec {
		return fmt.Errorf("%s not found inside %s", execName, assetName)
	}

	if err := os.RemoveAll(finalDir); err != nil {
		return err
	}
	if err := os.Rename(nextDir, finalDir); err != nil {
		return err
	}

	fmt.Println("Whisper CLI downloaded successfully")
	return nil
}

func downloadTokenizerFile(force bool) error {
	if err := os.MkdirAll(modelsDir, 0755); err != nil {
		return fmt.Errorf("error creating models directory: %v", err)
	}

	tokenizerPath := filepath.Join(modelsDir, appfiles.LinetimeTokenizerName)
	if _, err := os.Stat(tokenizerPath); err == nil && !force {
		fmt.Println("Tokenizer already present, skipping")
		return nil
	}

	fmt.Println("Downloading tokenizer...")
	tokenizerURL := huggingFace + "/tokenizer.json"
	if err := downloadFile(tokenizerURL, tokenizerPath); err != nil {
		return fmt.Errorf("error downloading tokenizer: %v", err)
	}
	return nil
}

func downloadModel(modelType string, force bool, downloadTokenizer bool) error {
	if err := os.MkdirAll(modelsDir, 0755); err != nil {
		return fmt.Errorf("error creating models directory: %v", err)
	}

	if downloadTokenizer {
		if err := downloadTokenizerFile(force); err != nil {
			return err
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
	default:
		return fmt.Errorf("unknown model type: %s (expected 'standard', 'fast', 'whisper', 'whisper-q5')", modelType)
	}
}

func downloadWhisperModel(quant string, force bool) error {
	var modelName, modelURL string
	var expectedSize int64

	switch quant {
	case "standard":
		modelName = appfiles.LinetimeWhisperFP16
		modelURL = whisperHF + "/ggml-large-v3.bin"
		expectedSize = 3095033483
	case "q5":
		modelName = appfiles.LinetimeWhisperQ5
		modelURL = whisperHF + "/ggml-large-v3-q5_0.bin"
		expectedSize = 1081140203
	case "q8":
		return fmt.Errorf("ggml-large-v3 q8_0 is not published in %s, only large-v3 fp16 and large-v3 q5_0 exist", whisperHF)
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
	// Keep the upstream filenames: the ONNX graph references its external
	// weights as "mms_fa.onnx.data", so renaming either file breaks loading.
	onnxPath := filepath.Join(modelsDir, appfiles.LinetimeModelStandard)
	dataPath := filepath.Join(modelsDir, appfiles.LinetimeModelStandardDta)

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
	onnxPath := filepath.Join(modelsDir, appfiles.LinetimeModelFast)

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
	skipWhisperCli := false
	onlyWhisperCli := false
	gpuWhisperCliOnly := false
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
		case arg == "--skip-binary":
			skipBinary = true
		case arg == "--skip-model":
			skipModel = true
		case arg == "--skip-tokenizer":
			skipTokenizer = true
		case arg == "--skip-whisper":
			skipWhisper = true
		case arg == "--skip-whisper-cli":
			skipWhisperCli = true
		case arg == "--whisper-cli-only":
			onlyWhisperCli = true
		case arg == "--whisper-cli-gpu-only":
			gpuWhisperCliOnly = true
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
			fmt.Println("  --model-whisper       Download Whisper large-v3 fp16 (~2.9GB)")
			fmt.Println("  --model-whisper-q5    Download Whisper large-v3 q5_0 (~1GB)")
			fmt.Println("  --skip-binary         Skip binary download")
			fmt.Println("  --skip-model          Skip CTC model download")
			fmt.Println("  --skip-tokenizer      Skip tokenizer download")
			fmt.Println("  --skip-whisper        Skip Whisper model download")
			fmt.Println("  --skip-whisper-cli    Skip Whisper CLI download (needed to transcribe lyrics)")
			fmt.Println("  --whisper-cli-only    Download only the Whisper CLI")
			fmt.Println("  --whisper-cli-gpu-only  Download only the CUDA Whisper CLI (requires NVIDIA CUDA 12)")
			fmt.Println("  --tokenizer-only      Download only the tokenizer (skips binary, model, whisper)")
			fmt.Println("  --asset-dir=<path>    Set asset directory (default: current directory)")
			fmt.Println("  --release=<tag>       GitHub release tag (default: latest, env LINETIME_RELEASE_TAG)")
			fmt.Println("  -h, --help            Show this help")
			fmt.Println()
			fmt.Println("Environment:")
			fmt.Println("  GITHUB_TOKEN          GitHub API token (optional, avoids rate limits)")
			fmt.Println("  LINETIME_RELEASE_TAG  Release tag to download (default: latest)")
			os.Exit(0)
		default:
			if strings.HasPrefix(arg, "--model-") {
				fmt.Fprintf(os.Stderr, "Unknown option: %s\n\n", arg)
				fmt.Fprintln(os.Stderr, "Available models: --model-standard, --model-fast, --model-whisper, --model-whisper-q5")
				fmt.Fprintln(os.Stderr, "There is no large-v3 q8_0 model published upstream, only large-v3 fp16 and large-v3 q5_0.")
				os.Exit(1)
			}
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

	onlyOneComponent := tokenizerOnly || onlyWhisperCli

	if !skipBinary && !onlyOneComponent {
		if err := downloadBinary(useGPU, force); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading binary: %v\n", err)
			os.Exit(1)
		}
		changed = true
	}

	// The CUDA CLI is a separate download from the CPU one, so it is only ever
	// fetched when asked for. It is not part of the default fetch because a user
	// without an NVIDIA card should not pay for it.
	if gpuWhisperCliOnly {
		if err := downloadGpuWhisperCli(force); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading CUDA whisper-cli: %v\n", err)
			os.Exit(1)
		}
		return
	}

	if !skipWhisperCli && !tokenizerOnly {
		// whisper.cpp ships no macOS CLI build, so treat it as optional there
		// instead of failing the whole fetch. The app disables the row anyway.
		if _, err := getWhisperCliAsset(); err != nil {
			if onlyWhisperCli {
				fmt.Fprintf(os.Stderr, "Error downloading whisper-cli: %v\n", err)
				os.Exit(1)
			}
			fmt.Fprintf(os.Stderr, "Skipping whisper-cli: %v\n", err)
		} else if err := downloadWhisperCli(force); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading whisper-cli: %v\n", err)
			os.Exit(1)
		} else {
			changed = true
		}
	}

	if tokenizerOnly {
		if err := downloadTokenizerFile(force); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading tokenizer: %v\n", err)
			os.Exit(1)
		}
		changed = true
	} else if !onlyWhisperCli && (!skipModel || !skipTokenizer) {
		if err := downloadModel(modelType, force, !skipTokenizer); err != nil {
			fmt.Fprintf(os.Stderr, "Error downloading CTC model: %v\n", err)
			os.Exit(1)
		}
		changed = true
	}

	if !skipWhisper && strings.HasPrefix(modelType, "whisper") && !onlyOneComponent {
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
