package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	_ "modernc.org/sqlite"
)

var databasesFolder = os.Args[1]
var settingsDbPath = filepath.Join(databasesFolder, "settings.db")
var musicsDbPath = filepath.Join(databasesFolder, "musics.db")
var playlistsDbPath = filepath.Join(databasesFolder, "playlists.db")
var logsDbPath = filepath.Join(databasesFolder, "logs.db")

var databases = map[string]*sql.DB{}

type IPCRequest struct {
	ID    string        `json:"id"`
	DB    string        `json:"db"`
	Query string        `json:"query"`
	Args  []interface{} `json:"args"`
	Fetch bool          `json:"fetch"`
}

type IPCResponse struct {
	Rows  []map[string]interface{} `json:"rows,omitempty"`
	Error string                   `json:"error,omitempty"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: sqlite <databases-folder>")
		os.Exit(1)
	}

	for name, path := range map[string]string{
		"settings":  settingsDbPath,
		"musics":    musicsDbPath,
		"playlists": playlistsDbPath,
		"logs":      logsDbPath,
	} {
		database, err := sql.Open("sqlite", path)
		if err != nil {
			fmt.Fprintln(os.Stderr, "failed to open db:", name, err)
			os.Exit(1)
		}
		defer database.Close()
		databases[name] = database
	}

	if err := initialiseSettingsDatabase(); err != nil {
		fmt.Fprintln(os.Stderr, "failed to init settings db:", err)
		os.Exit(1)
	}

	if err := initialiseMusicsDatabase(); err != nil {
		fmt.Fprintln(os.Stderr, "failed to init musics db:", err)
		os.Exit(1)
	}

	if err := initialisePlaylistsDatabase(); err != nil {
		fmt.Fprintln(os.Stderr, "failed to init playlists db:", err)
		os.Exit(1)
	}

	if err := initialiseLogsDatabase(); err != nil {
		fmt.Fprintln(os.Stderr, "failed to init logs db:", err)
		os.Exit(1)
	}

	decoder := json.NewDecoder(os.Stdin)
	encoder := json.NewEncoder(os.Stdout)

	for {
		var req IPCRequest
		if err := decoder.Decode(&req); err != nil {
			if err == io.EOF {
				break
			}
			continue
		}
		encoder.Encode(dispatch(req))
	}
}

func dispatch(req IPCRequest) (resp IPCResponse) {
	defer func() {
		if recoveryValue := recover(); recoveryValue != nil {
			resp = IPCResponse{Error: fmt.Sprintf("panic: %v", recoveryValue)}
		}
	}()

	database, ok := databases[req.DB]
	if !ok {
		return IPCResponse{Error: "unknown db: " + req.DB}
	}

	if req.Fetch {
		rows, err := database.Query(req.Query, req.Args...)
		if err != nil {
			return IPCResponse{Error: err.Error()}
		}
		defer rows.Close()
		results, err := scanRows(rows)
		if err != nil {
			return IPCResponse{Error: err.Error()}
		}
		return IPCResponse{Rows: results}
	}

	if _, err := database.Exec(req.Query, req.Args...); err != nil {
		return IPCResponse{Error: err.Error()}
	}
	return IPCResponse{}
}

func scanRows(rows *sql.Rows) ([]map[string]interface{}, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var results []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for index := range values {
			valuePtrs[index] = &values[index]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}
		row := map[string]interface{}{}
		for index, col := range cols {
			row[col] = values[index]
		}
		results = append(results, row)
	}
	return results, rows.Err()
}

func createTable(database *sql.DB, tableName string, columns []Column) error {
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
	_, err := database.Exec(sqlStmt)
	return err
}

func syncTable(database *sql.DB, tableName string, columns []Column) error {
	rows, err := database.Query(fmt.Sprintf("PRAGMA table_info(%s);", tableName))
	if err != nil {
		return fmt.Errorf("failed to get table info for %q: %w", tableName, err)
	}

	existingCols := map[string]bool{}
	existingPKs := map[string]bool{}
	var hasRows bool

	for rows.Next() {
		hasRows = true
		var cid int
		var name, ctype string
		var notnull, pk int
		var dfltValue sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			rows.Close()
			return err
		}
		existingCols[name] = true
		if pk > 0 {
			existingPKs[name] = true
		}
	}
	rows.Close()

	if !hasRows {
		if err := createTable(database, tableName, columns); err != nil {
			return fmt.Errorf("failed to create table %q: %w", tableName, err)
		}
		return nil
	}

	migrationNeeded := false
	for _, col := range columns {
		isExpectedPK := strings.Contains(strings.ToUpper(col.Type), "PRIMARY KEY")
		isCurrentPK := existingPKs[col.Name]
		if isExpectedPK != isCurrentPK {
			migrationNeeded = true
			break
		}
	}

	if migrationNeeded {
		tx, err := database.Begin()
		if err != nil {
			return err
		}

		oldTableName := tableName + "_old"
		if _, err := tx.Exec(fmt.Sprintf("ALTER TABLE %s RENAME TO %s;", tableName, oldTableName)); err != nil {
			tx.Rollback()
			return err
		}

		defs := []string{}
		for _, col := range columns {
			def := col.Name + " " + col.Type
			if col.Default != "" {
				def += " DEFAULT " + col.Default
			}
			defs = append(defs, def)
		}
		sqlStmt := fmt.Sprintf("CREATE TABLE %s (%s);", tableName, strings.Join(defs, ", "))
		if _, err := tx.Exec(sqlStmt); err != nil {
			tx.Rollback()
			return err
		}

		commonCols := []string{}
		for _, col := range columns {
			if existingCols[col.Name] {
				commonCols = append(commonCols, col.Name)
			}
		}

		if len(commonCols) > 0 {
			colsStr := strings.Join(commonCols, ", ")
			copyStmt := fmt.Sprintf("INSERT INTO %s (%s) SELECT %s FROM %s;", tableName, colsStr, colsStr, oldTableName)
			if _, err := tx.Exec(copyStmt); err != nil {
				tx.Rollback()
				return err
			}
		}

		if _, err := tx.Exec(fmt.Sprintf("DROP TABLE %s;", oldTableName)); err != nil {
			tx.Rollback()
			return err
		}

		if err := tx.Commit(); err != nil {
			return err
		}
		return nil
	}

	for _, col := range columns {
		if existingCols[col.Name] {
			continue
		}
		alterStmt := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", tableName, col.Name, col.Type)
		if col.Default != "" {
			alterStmt += " DEFAULT " + col.Default
		}
		if _, err := database.Exec(alterStmt); err != nil {
			return fmt.Errorf("failed to add column %q to %q: %w", col.Name, tableName, err)
		}
	}

	return nil
}

func initialiseSettingsDatabase() error {
	database := databases["settings"]

	if err := syncTable(database, "settings", settingsColumns); err != nil {
		return err
	}
	if err := syncTable(database, "statistics", statsColumns); err != nil {
		return err
	}

	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM settings").Scan(&count); err != nil {
		return fmt.Errorf("failed to count settings rows: %w", err)
	}
	if count == 0 {
		if _, err := database.Exec("INSERT INTO settings DEFAULT VALUES;"); err != nil {
			return fmt.Errorf("failed to insert default settings row: %w", err)
		}
	}

	if err := database.QueryRow("SELECT COUNT(*) FROM statistics").Scan(&count); err != nil {
		return fmt.Errorf("failed to count statistics rows: %w", err)
	}
	if count == 0 {
		if _, err := database.Exec("INSERT INTO statistics DEFAULT VALUES;"); err != nil {
			return fmt.Errorf("failed to insert default statistics row: %w", err)
		}
	}

	return nil
}

func initialiseMusicsDatabase() error {
	database := databases["musics"]

	tables := []struct {
		name    string
		columns []Column
	}{
		{"songs", songsColumns},
		{"recommendations", recommendationsColumns},
		{"streams", streamsColumns},
		{"timers", timersColumns},
		{"not_interested", notInterestedColumns},
		{"lyrics", lyricsColumns},
	}

	for _, tableItem := range tables {
		if err := syncTable(database, tableItem.name, tableItem.columns); err != nil {
			return err
		}
	}

	return nil
}

func initialisePlaylistsDatabase() error {
	database := databases["playlists"]

	if err := syncTable(database, "playlists", playlistsColumns); err != nil {
		return err
	}

	var count int
	if err := database.QueryRow("SELECT COUNT(*) FROM playlists WHERE name = ?", "Favorites").Scan(&count); err != nil {
		return fmt.Errorf("failed to query favorites: %w", err)
	}

	if count == 0 {
		emptySongs, _ := json.Marshal([]string{})
		if _, err := database.Exec(
			"INSERT INTO playlists (id, name, songs, thumbnail_extension) VALUES (?, ?, ?, ?)",
			"Favorites", "Favorites", string(emptySongs), "svg",
		); err != nil {
			return fmt.Errorf("failed to insert favorites: %w", err)
		}
	}

	return nil
}

func initialiseLogsDatabase() error {
	return syncTable(databases["logs"], "logs", logsColumns)
}
