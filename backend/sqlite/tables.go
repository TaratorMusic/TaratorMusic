package main

type Column struct {
	Name    string
	Type    string
	Default string
}

// settings.db tables

var settingsColumns = []Column{
	{Name: "volume", Type: "INTEGER", Default: "50"},
	{Name: "rememberautoplay", Type: "INTEGER", Default: "1"},
	{Name: "remembershuffle", Type: "INTEGER", Default: "1"},
	{Name: "rememberloop", Type: "INTEGER", Default: "0"},
	{Name: "rememberspeed", Type: "INTEGER", Default: "1"},
	{Name: "key_Rewind", Type: "TEXT", Default: "'q'"},
	{Name: "key_Previous", Type: "TEXT", Default: "'w'"},
	{Name: "key_PlayPause", Type: "TEXT", Default: "'e'"},
	{Name: "key_Next", Type: "TEXT", Default: "'r'"},
	{Name: "key_Skip", Type: "TEXT", Default: "'t'"},
	{Name: "key_Autoplay", Type: "TEXT", Default: "'a'"},
	{Name: "key_Shuffle", Type: "TEXT", Default: "'s'"},
	{Name: "key_Mute", Type: "TEXT", Default: "'d'"},
	{Name: "key_Speed", Type: "TEXT", Default: "'f'"},
	{Name: "key_Loop", Type: "TEXT", Default: "'g'"},
	{Name: "key_searchSong", Type: "TEXT", Default: "'z'"},
	{Name: "key_randomSong", Type: "TEXT", Default: "'1'"},
	{Name: "key_randomPlaylist", Type: "TEXT", Default: "'2'"},
	{Name: "key_lastPlaylist", Type: "TEXT", Default: "'3'"},
	{Name: "dividevolume", Type: "INTEGER", Default: "1"},
	{Name: "displayPage", Type: "TEXT", Default: "'scroll'"},
	{Name: "musicMode", Type: "TEXT", Default: "'offline'"},
	{Name: "background", Type: "TEXT", Default: "'green'"},
	{Name: "stabiliseVolumeToggle", Type: "INTEGER", Default: "1"},
	{Name: "dc_rpc", Type: "INTEGER", Default: "0"},
	{Name: "dc_bot", Type: "INTEGER", Default: "0"},
	{Name: "dc_bot_token", Type: "TEXT", Default: "NULL"},
	{Name: "dc_channel_id", Type: "TEXT", Default: "NULL"},
	{Name: "dc_guild_id", Type: "TEXT", Default: "NULL"},
	{Name: "current_version", Type: "TEXT", Default: "NULL"},
	{Name: "popularityFactor", Type: "INTEGER", Default: "15"},
	{Name: "artistStrengthFactor", Type: "INTEGER", Default: "8"},
	{Name: "similarArtistsFactor", Type: "INTEGER", Default: "20"},
	{Name: "userPreferenceFactor", Type: "INTEGER", Default: "17"},
	{Name: "artistListenTimeFactor", Type: "INTEGER", Default: "25"},
	{Name: "randomFactor", Type: "INTEGER", Default: "15"},
	{Name: "recommendationsAfterDownload", Type: "INTEGER", Default: "1"},
}

var statsColumns = []Column{
	{Name: "total_time_spent", Type: "INTEGER", Default: "0"},
	{Name: "app_install_date", Type: "INTEGER", Default: "0"},
	{Name: "playlists_formed", Type: "INTEGER", Default: "0"},
	{Name: "songs_downloaded_youtube", Type: "INTEGER", Default: "0"},
	{Name: "songs_downloaded_spotify", Type: "INTEGER", Default: "0"},
	{Name: "ytdlp_last_update_date", Type: "INTEGER", Default: "(strftime('%s','now'))"},
	{Name: "recommendations_last_refresh", Type: "INTEGER", Default: "0"},
}

// musics.db tables

var songsColumns = []Column{
	{Name: "song_id", Type: "TEXT PRIMARY KEY"},
	{Name: "song_name", Type: "TEXT"},
	{Name: "song_url", Type: "TEXT"},
	{Name: "song_extension", Type: "TEXT"},
	{Name: "thumbnail_extension", Type: "TEXT"},
	{Name: "seconds_played", Type: "INTEGER"},
	{Name: "times_listened", Type: "INTEGER"},
	{Name: "stabilised", Type: "INTEGER"},
	{Name: "size", Type: "INTEGER"},
	{Name: "speed", Type: "REAL"},
	{Name: "bass", Type: "REAL"},
	{Name: "treble", Type: "REAL"},
	{Name: "midrange", Type: "REAL"},
	{Name: "volume", Type: "INTEGER"},
	{Name: "song_length", Type: "INTEGER"},
	{Name: "artist", Type: "TEXT"},
	{Name: "genre", Type: "TEXT"},
	{Name: "language", Type: "TEXT"},
}

var recommendationsColumns = []Column{
	{Name: "artist_id", Type: "INTEGER PRIMARY KEY"},
	{Name: "artist_name", Type: "TEXT"},
	{Name: "artist_fan_amount", Type: "INTEGER"},
	{Name: "similar_artists_array", Type: "TEXT"},
	{Name: "deezer_songs_array", Type: "TEXT"},
}

var streamsColumns = []Column{
	{Name: "song_id", Type: "TEXT PRIMARY KEY"},
	{Name: "song_name", Type: "TEXT"},
	{Name: "thumbnail_url", Type: "TEXT"},
	{Name: "length", Type: "INTEGER"},
	{Name: "artist", Type: "TEXT"}, {Name: "genre", Type: "TEXT"},
	{Name: "language", Type: "TEXT"},
}

var timersColumns = []Column{
	{Name: "song_id", Type: "TEXT"},
	{Name: "start_time", Type: "INTEGER"},
	{Name: "end_time", Type: "INTEGER"},
	{Name: "playlist", Type: "TEXT"},
}

var notInterestedColumns = []Column{
	{Name: "song_id", Type: "TEXT"},
	{Name: "song_name", Type: "TEXT"},
}

// playlists.db tables

var playlistsColumns = []Column{
	{Name: "id", Type: "TEXT PRIMARY KEY"},
	{Name: "name", Type: "TEXT"},
	{Name: "songs", Type: "TEXT"},
	{Name: "thumbnail_extension", Type: "TEXT"},
}
