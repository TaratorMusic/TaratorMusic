// Package appfiles is the single source of truth for the names and locations of
// the files this app ships and downloads. The tools that write these files and
// the tool that verifies them all read from here, so a rename cannot leave the
// checker validating a filename nothing produces anymore.
//
// No main.go in this directory on purpose: compiler.js discovers tools by
// looking for files named main.go, so a library package is invisible to it and
// gets linked in through the import instead.
package appfiles

import (
	"runtime"
)

// State values reported by binary_check. Unsupported is distinct from Missing on
// purpose: the GPU bundle is linux only and whisper.cpp publishes no macOS CLI,
// so reporting those as missing would cry wolf on every launch there.
const (
	StatePresent     = "present"
	StateMissing     = "missing"
	StateUnsupported = "unsupported"
)

// Component is one thing the app needs on disk to work. Parts names the
// individual files so callers can ask for one by role, and Files is the derived
// list used for the all-or-nothing state check. A component is only present when
// every part is, which is what makes the ONNX graph plus its external weights
// report as one thing rather than two.
type Component struct {
	ID          string            `json:"id"`
	Group       string            `json:"group"`
	Label       string            `json:"label"`
	Parts       map[string]string `json:"parts"`
	Files       []string          `json:"files"`
	State       string            `json:"state"`
	Optional    bool              `json:"optional,omitempty"`
	Unsupported bool              `json:"unsupported,omitempty"`
}

// NewComponent builds a component from its named parts.
func NewComponent(id, group, label string, parts map[string]string) Component {
	files := make([]string, 0, len(parts))
	for _, v := range parts {
		files = append(files, v)
	}
	return Component{ID: id, Group: group, Label: label, Parts: parts, Files: files}
}

func execSuffix() string {
	if runtime.GOOS == "windows" {
		return ".exe"
	}
	return ""
}

// PlatformSupported reports whether the app ships on this OS.
func PlatformSupported() bool {
	return runtime.GOOS == "linux" || runtime.GOOS == "darwin" || runtime.GOOS == "windows"
}

// GPUSupported reports whether the CUDA build exists for this platform. The
// release only publishes it for linux.
func GPUSupported() bool {
	return runtime.GOOS == "linux"
}

// WhisperCliSupported reports whether whisper.cpp publishes a CLI build here.
// The macOS asset is only an xcframework for embedding, so there is no CLI.
func WhisperCliSupported() bool {
	return runtime.GOOS != "darwin"
}

// CoreBinaries are the tools built by compiler.js into the app bin folder. The
// directory names under backend/ are the source of truth for these, except for
// player which comes from cBuild.
func CoreBinaries() []string {
	names := []string{
		"check_dupe_songs",
		"dc_rich_presence",
		"linetime_fetch",
		"musicbrainz_fetch",
		"shorten_song_ids",
		"sqlite",
		"startup_check",
		"ytdlp_fetch",
		"player",
	}
	out := make([]string, 0, len(names)+1)
	for _, n := range names {
		out = append(out, n+execSuffix())
	}
	return append(out, "binary_check"+execSuffix())
}

// YtdlpName is the yt-dlp filename for this platform. It is both the upstream
// release asset name and the name we store it under.
func YtdlpName() string {
	if runtime.GOOS == "windows" {
		return "yt-dlp.exe"
	}
	if runtime.GOOS == "darwin" {
		return "yt-dlp_macos"
	}
	return "yt-dlp_linux"
}

// LinetimeFfmpegName is the ffmpeg the Linetime release ships and we store on
// disk. It is the name inside the release tarball, so it is not appfiles' to
// invent, but both the writer and the checker need to agree on it.
func LinetimeFfmpegName() string {
	if runtime.GOOS == "windows" {
		return "ffmpeg.exe"
	}
	return "ffmpeg"
}
