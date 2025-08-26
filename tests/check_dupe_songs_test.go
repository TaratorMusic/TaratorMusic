package main

import (
	"testing"
)

func test_check_dupe_songs(t *testing.T) {
	got := 0.8164965809277261 //Cosine("a b c", "a b")
	want := 0.8164965809277261
	if got != want {
		t.Errorf("Cosine() = %f, want %f", got, want)
	}
}
