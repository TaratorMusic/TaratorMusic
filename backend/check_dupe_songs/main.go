// This file will output the names of the duplicate songs after recieving an array of songs as an input

package main

import (
	"fmt"
	"math"
	"os"
	"strings"
	"unicode"
)

var stopwords = []string{
	"lyrics", "official", "video", "ft", "feat", "hd", "audio",
	"live", "remaster", "version", "session", "karaoke", "music",
}

var stopwordSet = func() map[string]struct{} {
	wordmap := make(map[string]struct{})
	for _, word := range stopwords {
		wordmap[word] = struct{}{}
	}
	return wordmap
}()

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

func Jaccard(a, b string) float64 {
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

func Cosine(a, b string) float64 {
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
	titles := os.Args[1:]
	// titles := []string{}

	jaccThreshold := 0.6
	cosThreshold := 0.70

	for i := 0; i < len(titles); i++ {
		for j := i + 1; j < len(titles); j++ {
			jac := Jaccard(titles[i], titles[j])
			cos := Cosine(titles[i], titles[j])
			if jac >= jaccThreshold || cos >= cosThreshold {
				fmt.Printf("Similar: %q and %q | Jaccard=%.2f, Cosine=%.2f\n",
					titles[i], titles[j], jac, cos)
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
