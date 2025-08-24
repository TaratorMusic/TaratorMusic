package main

import (
    "fmt"
    "math"
    "os"
)

func levenshtein(a, b string) int {
    la := len(a)
    lb := len(b)
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
            dp[i][j] = min(
                dp[i-1][j]+1,
                dp[i][j-1]+1,
                dp[i-1][j-1]+cost,
            )
        }
    }
    return dp[la][lb]
}

func min(a, b, c int) int {
    return int(math.Min(float64(a), math.Min(float64(b), float64(c))))
}

func main() {
    titles := os.Args[1:]
    threshold := 3
    for i := 0; i < len(titles); i++ {
        for j := i + 1; j < len(titles); j++ {
            dist := levenshtein(titles[i], titles[j])
            if dist <= threshold {
                fmt.Printf("Similar: %q and %q (distance %d)\n", titles[i], titles[j], dist)
            }
        }
    }
}

// TODO: Add other ways to recognise similar titles apart from just "distance"

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
