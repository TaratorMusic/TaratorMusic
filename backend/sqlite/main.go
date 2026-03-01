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

	if err := initialiseSettingsDatabase(); err != nil {
		fmt.Println("Error initializing settings database:", err)
	} else {
		fmt.Println("Settings database initialized successfully")
	}

	if err := initialiseMusicsDatabase(); err != nil {
		fmt.Println("Error initializing musics database:", err)
	} else {
		fmt.Println("Musics database initialized successfully")
	}

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
	defs := []string{}
	for _, col := range columns {
		def := col.Name + " " + col.Type
		if col.Default != "" {
			def += " DEFAULT " + col.Default
		}
		defs = append(defs, def)
	}
	sqlStmt := fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (%s);",
		tableName, strings.Join(defs, ", "))
	_, err := db.Exec(sqlStmt)
	return err
}

func syncTable(db *sql.DB, tableName string, columns []Column) error {
	// Step 1: create table if it doesn't exist
	if err := createTable(db, tableName, columns); err != nil {
		return fmt.Errorf("failed to create table %q: %w", tableName, err)
	}

	// Step 2: check existing columns
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s);", tableName))
	if err != nil {
		return fmt.Errorf("failed to get table info for %q: %w", tableName, err)
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
	for _, col := range columns {
		if existingCols[col.Name] {
			continue
		}
		alterStmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", tableName, col.Name, col.Type)
		if col.Default != "" {
			alterStmt += " DEFAULT " + col.Default
		}
		if _, err := db.Exec(alterStmt); err != nil {
			return fmt.Errorf("failed to add column %q to %q: %w", col.Name, tableName, err)
		}
	}

	return nil
}

func initialiseSettingsDatabase() error {
	db, err := sql.Open("sqlite", settingsDbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	if err := syncTable(db, "settings", settingsColumns); err != nil {
		return err
	}

	if err := syncTable(db, "statistics", statsColumns); err != nil {
		return err
	}

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM settings").Scan(&count); err != nil {
		return fmt.Errorf("failed to count settings rows: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec("INSERT INTO settings DEFAULT VALUES;"); err != nil {
			return fmt.Errorf("failed to insert default settings row: %w", err)
		}
	}

	if err := db.QueryRow("SELECT COUNT(*) FROM statistics").Scan(&count); err != nil {
		return fmt.Errorf("failed to count statistics rows: %w", err)
	}

	if count == 0 {
		if _, err := db.Exec("INSERT INTO statistics DEFAULT VALUES;"); err != nil {
			return fmt.Errorf("failed to insert default statistics row: %w", err)
		}
	}

	return nil
}

func initialiseMusicsDatabase() error {
	db, err := sql.Open("sqlite", musicsDbPath)
	if err != nil {
		return err
	}
	defer db.Close()

	tables := []struct {
		name    string
		columns []Column
	}{
		{"songs", songsColumns},
		{"recommendations", recommendationsColumns},
		{"streams", streamsColumns},
		{"timers", timersColumns},
		{"not_interested", notInterestedColumns},
	}

	for _, t := range tables {
		if err := syncTable(db, t.name, t.columns); err != nil {
			return err
		}
	}

	return nil
}

func initialisePlaylistsDatabase() error {
	db, err := sql.Open("sqlite", playlistsDbPath)
	if err != nil {
		return err
	}

	defer db.Close()

	if err := syncTable(db, "playlists", playlistsColumns); err != nil {
		return err
	}

	// Ensure the "Favorites" playlist row exists.
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM playlists WHERE name = ?", "Favorites").Scan(&count); err != nil {
		return fmt.Errorf("failed to query favorites: %w", err)
	}

	if count == 0 {
		emptySongs, _ := json.Marshal([]string{})
		if _, err := db.Exec(
			"INSERT INTO playlists (id, name, songs, thumbnail_extension) VALUES (?, ?, ?, ?)",
			"Favorites", "Favorites", string(emptySongs), "svg",
		); err != nil {
			return fmt.Errorf("failed to insert favorites: %w", err)
		}
	}

	return nil
}
