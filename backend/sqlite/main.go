// ENTIRE TO DO LIST, THINGS TO SWAP FROM JS TO GO

// Move initialise database settings functions, all three
// Update database function
// getSongNameCached
// Check other renderer scripts

package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

func main() {
	// createDatabaseFiles()

	// initialiseSettingsDatabase()
	// initialiseMusicsDatabase()
	// initialisePlaylistsDatabase()
}

func createDatabaseFiles() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: app <databasesFolder>")
		os.Exit(1)
	}

	databasesFolder := os.Args[1]

	settingsDbPath := filepath.Join(databasesFolder, "settings.db")
	playlistsDbPath := filepath.Join(databasesFolder, "playlists.db")
	musicsDbPath := filepath.Join(databasesFolder, "musics.db")

	paths := []string{settingsDbPath, playlistsDbPath, musicsDbPath}

	for _, p := range paths {
		if _, err := os.Stat(p); os.IsNotExist(err) {
			f, err := os.Create(p)
			if err != nil {
				panic(err)
			}
			f.Close()
		}
	}

	fmt.Println("Databases ensured in:", databasesFolder)
}

func createTable(dbFile, tableName string, columns []Column) error {
	db, err := sql.Open("sqlite", dbFile)
	if err != nil {
		return err
	}
	defer db.Close()

	defs := []string{}
	for _, col := range columns {
		def := col.Name + " " + col.Type
		if col.Default != "" {
			def += " DEFAULT " + col.Default
		}
		defs = append(defs, def)
	}

	sqlStmt := fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s(%s);",
		tableName, strings.Join(defs, ", "))

	_, err = db.Exec(sqlStmt)
	return err
}

func initialiseSettingsDatabase() {

}

func initialiseMusicsDatabase() {
	db, err := sql.Open("sqlite", "music.db")
	if err != nil {
		panic(err)
	}
	defer db.Close()

	db.Exec("PRAGMA journal_mode=WAL;")
	db.Exec("PRAGMA synchronous=NORMAL;")

	_, err = db.Exec("CREATE TABLE IF NOT EXISTS tracks(id INTEGER PRIMARY KEY, title TEXT)")
	if err != nil {
		panic(err)
	}

}

func initialisePlaylistsDatabase() {

}
