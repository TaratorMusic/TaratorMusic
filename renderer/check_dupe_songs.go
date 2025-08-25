package main

import (
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"
)

var stopwords = []string{
	"lyrics", "official", "video", "ft", "feat", "hd", "audio",
	"live", "remaster", "version", "session", "karaoke",
}

var stopwordSet = make(map[string]struct{})

func init() {
	for _, w := range stopwords {
		stopwordSet[w] = struct{}{}
	}
}

var re = regexp.MustCompile(`\([^)]*\)|\[.*?\]|–.*$`)

func coreTitle(s string) string {
	s = strings.ToLower(s)
	s = re.ReplaceAllString(s, "")
	fields := strings.Fields(s)
	res := []string{}
	for _, f := range fields {
		if _, ok := stopwordSet[f]; !ok {
			res = append(res, f)
		}
	}
	return strings.Join(res, " ")
}

func sortedCoreTitle(s string) string {
	words := strings.Fields(coreTitle(s))
	sort.Strings(words)
	return strings.Join(words, " ")
}

func normalize(s string) []string {
	s = strings.ToLower(s)
	s = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			return r
		}
		return -1
	}, s)
	words := strings.Fields(s)
	res := []string{}
	for _, w := range words {
		if _, ok := stopwordSet[w]; !ok {
			res = append(res, w)
		}
	}
	return res
}

func levenshtein(a, b string) int {
	la, lb := len(a), len(b)
	dp := make([][]int, la+1)
	for i := range dp {
		dp[i] = make([]int, lb+1)
	}
	for i := 0; i <= la; i++ {
		dp[i][0] = i
	}
	for j := 0; j <= lb; j++ {
		dp[0][j] = j
	}
	for i := 1; i <= la; i++ {
		for j := 1; j <= lb; j++ {
			cost := 0
			if a[i-1] != b[j-1] {
				cost = 1
			}
			dp[i][j] = min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost)
		}
	}
	return dp[la][lb]
}

func min(a, b, c int) int {
	if a < b && a < c {
		return a
	}
	if b < c {
		return b
	}
	return c
}

func jaccard(a, b string) float64 {
	wa := normalize(a)
	wb := normalize(b)
	setA := make(map[string]struct{})
	setB := make(map[string]struct{})
	for _, w := range wa {
		setA[w] = struct{}{}
	}
	for _, w := range wb {
		setB[w] = struct{}{}
	}
	intersection := 0
	for w := range setA {
		if _, ok := setB[w]; ok {
			intersection++
		}
	}
	union := len(setA) + len(setB) - intersection
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

func cosine(a, b string) float64 {
	wa := normalize(a)
	wb := normalize(b)
	freqA := make(map[string]int)
	freqB := make(map[string]int)
	for _, w := range wa {
		freqA[w]++
	}
	for _, w := range wb {
		freqB[w]++
	}
	dot := 0
	normA := 0
	normB := 0
	for w, v := range freqA {
		dot += v * freqB[w]
		normA += v * v
	}
	for _, v := range freqB {
		normB += v * v
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return float64(dot) / (math.Sqrt(float64(normA)) * math.Sqrt(float64(normB)))
}

func main() {
	// titles := os.Args[1:]
	titles := []string{
		"Shadows in the Night (Official Video)",
		"(Official Video) Shadows in the Night",
		"Dancing Alone Tonight - Lyrics",
		"Lyrics: Dancing Alone Tonight",
		"Whispers of the Sea (HD Audio)",
		"Whispers of the Sea – Official Audio",
		"Lost in Forever (Live 2018)",
		"Live 2018: Lost in Forever",
		"Echoes of Silence (Official Audio)",
		"Echoes of Silence Official Audio",
		"Fire in My Soul ft. John Smith",
		"ft. John Smith – Fire in My Soul",
		"Dreaming Out Loud (Acoustic Version)",
		"Dreaming Out Loud – Acoustic Session",
		"Light Up the Sky (Official)",
		"Official Light Up the Sky",
		"Tears of Tomorrow (2015 Remaster)",
		"Tears of Tomorrow – 2015 Version",
		"Midnight Memories (Lyrics)",
		"Midnight Memories [Karaoke Lyrics]",
	}

	levThreshold := 3
	jaccThreshold := 0.5
	cosThreshold := 0.7

	for i := 0; i < len(titles); i++ {
		sortedI := sortedCoreTitle(titles[i])
		for j := i + 1; j < len(titles); j++ {
			sortedJ := sortedCoreTitle(titles[j])
			lev := levenshtein(sortedI, sortedJ)
			jac := jaccard(titles[i], titles[j])
			cos := cosine(titles[i], titles[j])
			if lev <= levThreshold || jac >= jaccThreshold || cos >= cosThreshold {
				fmt.Printf("Similar: %q and %q | Levenshtein=%d, Jaccard=%.2f, Cosine=%.2f\n",
					titles[i], titles[j], lev, jac, cos)
			}
		}
	}
}

// How to run it in node.js:

// const { spawn } = require("child_process");

// const titles = [
//     "Song of Storms",
//     "Song Of Storm",
//     "Storm Song",
//     "Another Tune",
//     "Another Tne"
// ];

// const go = spawn("./check_dupe_songs", titles);

// go.stdout.on("data", (data) => {
//     console.log(data.toString());
// });

// go.stderr.on("data", (data) => {
//     console.error("Error:", data.toString());
// });

// go.on("close", (code) => {
//     console.log("Process exited with code", code);
// });
