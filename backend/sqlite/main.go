// TODO: Move initialise database settings functions, all three
// TODO: Update database function
// TODO: getSongNameCached
// TODO: Check other renderer scripts
// TODO: Dont forget the give back the data to JS as the cache

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

var databasesFolder = os.Args[1]
var settingsDbPath = filepath.Join(databasesFolder, "settings.db")
var musicsDbPath = filepath.Join(databasesFolder, "musics.db")
var playlistsDbPath = filepath.Join(databasesFolder, "playlists.db")

func main() {
	createDatabaseFiles()

	// initialiseSettingsDatabase()
	// initialiseMusicsDatabase()

	if err := initialisePlaylistsDatabase(); err != nil {
		fmt.Println("Error initializing playlists database:", err)
	} else {
		fmt.Println("Playlists database initialized successfully")
	}
}

func createDatabaseFiles() {
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

func createTable(db *sql.DB, tableName string, columns []Column) error {
	// MAYBE MOVE FIRST 3 STEPS HERE?? SINCE ITS THE SAME FOR EACH TABLE
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
	_, err := db.Exec(sqlStmt)
	return err
}

func initialiseSettingsDatabase() {

}

func initialiseMusicsDatabase() {
	// db, err := sql.Open("sqlite", "musics.db")
	// if err != nil {
	// 	panic(err)
	// }
	// defer db.Close()

	// db.Exec("PRAGMA journal_mode=WAL;")
	// db.Exec("PRAGMA synchronous=NORMAL;")

	// _, err = db.Exec("CREATE TABLE IF NOT EXISTS tracks(id INTEGER PRIMARY KEY, title TEXT)")
	// if err != nil {
	// 	panic(err)
	// }
}

func initialisePlaylistsDatabase() error {
	db, err := sql.Open("sqlite", playlistsDbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	// Step 1: create table if it doesn't exist
	if err := createTable(db, "playlists", playlistsColumns); err != nil {
		return fmt.Errorf("failed to create table: %w", err)
	}

	// Step 2: check existing columns
	rows, err := db.Query("PRAGMA table_info(playlists);")
	if err != nil {
		return fmt.Errorf("failed to get table info: %w", err)
	}
	defer rows.Close()

	existingCols := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dfltValue sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return err
		}
		existingCols[name] = true
	}

	// Step 3: add missing columns dynamically
	for _, col := range playlistsColumns {
		if !existingCols[col.Name] {
			alterStmt := fmt.Sprintf("ALTER TABLE playlists ADD COLUMN %s %s", col.Name, col.Type)
			if col.Default != "" {
				alterStmt += " DEFAULT " + col.Default
			}
			if _, err := db.Exec(alterStmt); err != nil {
				return fmt.Errorf("failed to add column %s: %w", col.Name, err)
			}
		}
	}

	// Step 4: ensure "Favorites" row exists
	var count int
	err = db.QueryRow("SELECT COUNT(*) FROM playlists WHERE name = ?", "Favorites").Scan(&count)
	if err != nil {
		return fmt.Errorf("failed to query favorites: %w", err)
	}

	if count == 0 {
		emptySongs, _ := json.Marshal([]string{})
		_, err = db.Exec("INSERT INTO playlists (id, name, songs, thumbnail_extension) VALUES (?, ?, ?, ?)",
			"Favorites", "Favorites", string(emptySongs), "svg")
		if err != nil {
			return fmt.Errorf("failed to insert favorites: %w", err)
		}
	}

	return nil
}
