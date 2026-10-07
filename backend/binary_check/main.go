// Command binary_check reports which of the files the app needs are actually on
// disk. It reads the expected names from the appfiles package, the same place
// linetime_fetch and ytdlp_fetch get theirs, so a rename cannot leave the
// checker validating a file nothing produces.
//
// Its output is a flat report of its own. It deliberately shares no code path
// with startup_check: that tool's output is a song map whose key count the
// renderer compares against the song count, so adding a key there would make it
// think new songs appeared and try to insert a junk row for the key.
//
// Usage: binary_check <appBinFolder> <userDataBinFolder>
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"

	"github.com/Victiniiiii/TaratorMusic/backend/internal/appfiles"
)

type report struct {
	Components []appfiles.Component `json:"components"`
}

func exists(path string) bool {
	if path == "" {
		return false
	}
	if _, err := os.Stat(path); err != nil {
		return false
	}
	return true
}

// resolve fills in State. Unsupported components are left alone so the renderer
// can tell "impossible on this OS" apart from "missing and fixable".
func resolve(c appfiles.Component) appfiles.Component {
	if c.Unsupported {
		c.State = appfiles.StateUnsupported
		return c
	}
	for _, f := range c.Files {
		if !exists(f) {
			c.State = appfiles.StateMissing
			return c
		}
	}
	c.State = appfiles.StatePresent
	return c
}

// firstPresent resolves a component whose file may live in more than one place,
// such as yt-dlp which is either the user-updated copy or the bundled one.
func firstPresent(c appfiles.Component) appfiles.Component {
	for _, f := range c.Files {
		if exists(f) {
			c.State = appfiles.StatePresent
			return c
		}
	}
	c.State = appfiles.StateMissing
	return c
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: binary_check <appBinFolder> <userDataBinFolder>")
		os.Exit(2)
	}
	appBin := os.Args[1]
	userDataBin := os.Args[2]

	comps := make([]appfiles.Component, 0, 16)

	// Core tools
	for _, name := range appfiles.CoreBinaries() {
		comps = append(comps, resolve(appfiles.NewComponent(name, "core", name, map[string]string{
			"binary": filepath.Join(appBin, name),
		})))
	}

	comps = append(comps, firstPresent(appfiles.NewComponent("ytdlp", "core", "yt-dlp", map[string]string{
		"updated": filepath.Join(userDataBin, appfiles.YtdlpName()),
		"bundled": filepath.Join(appBin, appfiles.YtdlpName()),
	})))

	// Linetime components: check userData first, then appBin, for each part.
	linetimeApp := appfiles.LinetimeComponents(appBin)
	linetimeUser := appfiles.LinetimeComponents(userDataBin)
	for i, c := range linetimeApp {
		user := linetimeUser[i]
		mergedParts := make(map[string]string)
		for part, appPath := range c.Parts {
			userPath := user.Parts[part]
			if exists(userPath) {
				mergedParts[part] = userPath
			} else if exists(appPath) {
				mergedParts[part] = appPath
			}
		}
		c.Parts = mergedParts
		// Update Files to match merged parts for resolve()
		c.Files = make([]string, 0, len(mergedParts))
		for _, p := range mergedParts {
			if p != "" {
				c.Files = append(c.Files, p)
			}
		}
		c = resolve(c)
		if c.Group == "binary" && c.State == appfiles.StatePresent {
			c.Version = probeVersion(c.Parts["binary"], c.Parts["lib"])
		}
		comps = append(comps, c)
	}

	out, err := json.Marshal(report{Components: comps})
	if err != nil {
		fmt.Fprintf(os.Stderr, "error encoding report: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(out))
}

var versionPattern = regexp.MustCompile(`(?i)\bv?(\d+\.\d+(?:\.\d+)?)\b`)

// probeVersion runs --help and reads the version off the first line. It has to
// stay cheap and silent: this runs at every launch, and a binary that cannot
// start is not an error here, it is already reported as missing or broken
// elsewhere.
func probeVersion(binary, libDir string) string {
	if binary == "" || !exists(binary) {
		return ""
	}
	cmd := exec.Command(binary, "--help")
	if libDir != "" {
		env := os.Environ()
		separator := ":"
		if runtime.GOOS == "windows" {
			separator = ";"
		}
		cmd.Env = append(env, "LD_LIBRARY_PATH="+libDir+separator+os.Getenv("LD_LIBRARY_PATH"))
	}
	output, err := cmd.CombinedOutput()
	if err != nil && len(output) == 0 {
		return ""
	}
	text := string(output)
	if idx := strings.IndexByte(text, '\n'); idx != -1 {
		text = text[:idx]
	}
	match := versionPattern.FindStringSubmatch(text)
	if len(match) < 2 {
		return ""
	}
	return match[1]
}
