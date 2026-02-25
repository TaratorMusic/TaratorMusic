// renderer.js

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { spawn } = require("child_process");
const ytdl = require("@distube/ytdl-core");
const ytsr = require("@distube/ytsr");

let taratorFolder, musicFolder, thumbnailFolder, appThumbnailFolder, databasesFolder, backendFolder;
let settingsDbPath, playlistsDbPath, musicsDbPath;
let settingsDb, playlistsDb, musicsDb, recommendationsCache;

(async () => {
	taratorFolder = await ipcRenderer.invoke("get-app-base-path");

	musicFolder = path.join(taratorFolder, "musics");
	thumbnailFolder = path.join(taratorFolder, "thumbnails");
	appThumbnailFolder = path.join(taratorFolder, "assets");
	databasesFolder = path.join(taratorFolder, "databases");
	backendFolder = path.join(taratorFolder, "bin");

	settingsDbPath = path.join(databasesFolder, "settings.db");
	playlistsDbPath = path.join(databasesFolder, "playlists.db");
	musicsDbPath = path.join(databasesFolder, "musics.db");

	if (!fs.existsSync(musicFolder)) fs.mkdirSync(musicFolder);
	if (!fs.existsSync(thumbnailFolder)) fs.mkdirSync(thumbnailFolder);
	if (!fs.existsSync(databasesFolder)) fs.mkdirSync(databasesFolder);

	if (!fs.existsSync(settingsDbPath)) fs.writeFileSync(settingsDbPath, "");
	if (!fs.existsSync(playlistsDbPath)) fs.writeFileSync(playlistsDbPath, "");
	if (!fs.existsSync(musicsDbPath)) fs.writeFileSync(musicsDbPath, "");

	settingsDb = new Database(settingsDbPath);
	playlistsDb = new Database(playlistsDbPath);
	musicsDb = new Database(musicsDbPath);
	recommendationsCache = localStorage.getItem("recommendationsCache") || null;
})();

const tabs = document.querySelectorAll(".sidebar div");
const playButton = document.getElementById("playButton");
const pauseButton = document.getElementById("pauseButton");
const tooltip = document.getElementById("tooltip");
const volumeControl = document.getElementById("volume");
const videoLength = document.getElementById("video-length");
const videoProgress = document.getElementById("video-progress");
const searchModalInput = document.getElementById("searchModalInput");
const content = document.getElementById("content");

const platform = process.platform;
let audioPlayer;
let player = null;

let playingSongsID = "";
let currentPlaylist = null; // Currently playing playlist's ID
let currentPlaylistElement = null; // The order of the currently playing song in the playlist its in
let playlistsMap = new Map(); // Full playlists cache
let playlistPlayedSongs = [];
let playedSongs = [];
let isShuffleActive = false;
let isAutoplayActive = false;
let isLooping = false;
let newPlaylistID = null;
let disableKeyPresses = 0;
let songStartTime = null;
let songPauseStartTime = 0;
let totalPausedTime = 0;
let previousVolume = null;
let timeoutId = null;
let searchedSongsUrl;
let downloadingStyle;
let discordRPCstatus;
let discordDaemon = null;
let songDuration = 0;
let isUserSeeking = false;
let playing = false;
let previousItemsPerRow;
let currentPage = 1;
let streamedSongsHtmlMap = new Map();
let notInterestedSongs;
let lastAuthoritativePosition = 0; // Playing songs position sent by miniaudio
let lastSyncTimestamp = 0; // Current predicted timestamp in JS
let isInterpolating = false; // If song is playing

const debounceMap = new Map();
let songNameCache = new Map();

let sessionTimeSpent = 0;
let rememberautoplay;
let remembershuffle;
let rememberloop;
let rememberspeed;
let volume;
let key_Rewind;
let key_Previous;
let key_PlayPause;
let key_Next;
let key_Skip;
let key_Autoplay;
let key_Shuffle;
let key_Mute;
let key_Speed;
let key_Loop;
let key_searchSong;
let key_randomSong;
let key_randomPlaylist;
let key_lastPlaylist;
let dividevolume;
let displayPage;
let stabiliseVolumeToggle;
let current_version;
let recommendationsAfterDownload;

let popularityFactor;
let artistStrengthFactor;
let similarArtistsFactor;
let userPreferenceFactor;
let artistListenTimeFactor;
let randomFactor;

const defaultSettings = {
	volume: 50,
	rememberautoplay: 1,
	remembershuffle: 1,
	rememberloop: 0,
	rememberspeed: 1,
	key_Rewind: "q",
	key_Previous: "w",
	key_PlayPause: "e",
	key_Next: "r",
	key_Skip: "t",
	key_Autoplay: "a",
	key_Shuffle: "s",
	key_Mute: "d",
	key_Speed: "f",
	key_Loop: "g",
	key_searchSong: "z",
	key_randomSong: "1",
	key_randomPlaylist: "2",
	key_lastPlaylist: "3",
	dividevolume: 1,
	displayPage: "scroll",
	musicMode: "offline",
	background: "green",
	stabiliseVolumeToggle: 1,
	dc_rpc: 0,
	dc_bot: 0,
	dc_bot_token: null,
	dc_channel_id: null,
	dc_guild_id: null,
	current_version: null,
	popularityFactor: 15,
	artistStrengthFactor: 8,
	similarArtistsFactor: 20,
	userPreferenceFactor: 17,
	artistListenTimeFactor: 25,
	randomFactor: 15,
	recommendationsAfterDownload: 1,
};

function initialiseSettingsDatabase() {
	let settingsRow;

	try {
		const columns = Object.entries(defaultSettings)
			.map(([key, value]) => {
				const type = typeof value == "number" ? "INTEGER" : "TEXT";
				return `${key} ${type}`;
			})
			.join(", ");

		settingsDb.prepare(`CREATE TABLE IF NOT EXISTS settings (${columns})`).run();
		settingsDb
			.prepare(
				`CREATE TABLE IF NOT EXISTS statistics (
                    total_time_spent INTEGER,
                    app_install_date INTEGER,
                    playlists_formed INTEGER,
                    songs_downloaded_youtube INTEGER,
                    songs_downloaded_spotify INTEGER,
                    ytdlp_last_update_date INTEGER,
                    recommendations_last_refresh INTEGER
                )`,
			)
			.run();

		const statsInfo = settingsDb.prepare("PRAGMA table_info(statistics)").all();
		const existingStatsColumns = statsInfo.map(col => col.name);
		const requiredStatsColumns = [
			{ name: "total_time_spent", type: "INTEGER", defaultVal: 0 },
			{ name: "app_install_date", type: "INTEGER", defaultVal: 0 },
			{ name: "playlists_formed", type: "INTEGER", defaultVal: 0 },
			{ name: "songs_downloaded_youtube", type: "INTEGER", defaultVal: 0 },
			{ name: "songs_downloaded_spotify", type: "INTEGER", defaultVal: 0 },
			{ name: "ytdlp_last_update_date", type: "INTEGER", defaultVal: Date.now() },
			{ name: "recommendations_last_refresh", type: "INTEGER", defaultVal: 0 },
		];

		for (const col of requiredStatsColumns) {
			if (!existingStatsColumns.includes(col.name)) {
				settingsDb.prepare(`ALTER TABLE statistics ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.defaultVal}`).run();
			}
		}

		let settingsRow = settingsDb.prepare("SELECT * FROM settings LIMIT 1").get();
		let statsRow = settingsDb.prepare("SELECT * FROM statistics LIMIT 1").get();

		if (!settingsRow) {
			const cols = Object.keys(defaultSettings).join(", ");
			const placeholders = Object.keys(defaultSettings)
				.map(() => "?")
				.join(", ");
			settingsDb.prepare(`INSERT INTO settings (${cols}) VALUES (${placeholders})`).run(...Object.values(defaultSettings));
			settingsRow = defaultSettings;
		}

		if (!statsRow) {
			settingsDb
				.prepare(
					`INSERT INTO statistics (total_time_spent, app_install_date, playlists_formed, songs_downloaded_youtube, songs_downloaded_spotify)
             VALUES (0, ?, 0, 0, 0)`,
				)
				.run(Math.floor(Date.now() / 1000));
			statsRow = settingsDb.prepare("SELECT * FROM statistics LIMIT 1").get();
		} else if (!statsRow.app_install_date || statsRow.app_install_date == 0) {
			settingsDb.prepare(`UPDATE statistics SET app_install_date = ?`).run(Math.floor(Date.now() / 1000));
		}

		const tableInfo = settingsDb.prepare("PRAGMA table_info(settings)").all();
		const existingColumns = tableInfo.map(col => col.name);

		for (const [key, value] of Object.entries(defaultSettings)) {
			if (!existingColumns.includes(key)) {
				const type = typeof value == "number" ? "INTEGER" : "TEXT";
				const defaultVal = typeof value == "number" ? value : `'${value}'`;
				settingsDb.prepare(`ALTER TABLE settings ADD COLUMN ${key} ${type} DEFAULT ${defaultVal}`).run();
			}
		}

		if (existingColumns.length == 0) {
			const cols = Object.keys(defaultSettings).join(", ");
			const placeholders = Object.keys(defaultSettings)
				.map(() => "?")
				.join(", ");
			settingsDb.prepare(`INSERT INTO settings (${cols}) VALUES (${placeholders})`).run(...Object.values(defaultSettings));
		}

		document.getElementById("settingsRewind").innerHTML = settingsRow.key_Rewind;
		document.getElementById("settingsPrevious").innerHTML = settingsRow.key_Previous;
		document.getElementById("settingsPlayPause").innerHTML = settingsRow.key_PlayPause;
		document.getElementById("settingsNext").innerHTML = settingsRow.key_Next;
		document.getElementById("settingsSkip").innerHTML = settingsRow.key_Skip;
		document.getElementById("settingsAutoplay").innerHTML = settingsRow.key_Autoplay;
		document.getElementById("settingsShuffle").innerHTML = settingsRow.key_Shuffle;
		document.getElementById("settingsMute").innerHTML = settingsRow.key_Mute;
		document.getElementById("settingsSpeed").innerHTML = settingsRow.key_Speed;
		document.getElementById("settingsLoop").innerHTML = settingsRow.key_Loop;
		document.getElementById("settingsSearchSong").innerHTML = settingsRow.key_searchSong;
		document.getElementById("settingsRandomSong").innerHTML = settingsRow.key_randomSong;
		document.getElementById("settingsRandomPlaylist").innerHTML = settingsRow.key_randomPlaylist;
		document.getElementById("settingsLastPlaylist").innerHTML = settingsRow.key_lastPlaylist;

		key_Rewind = settingsRow.key_Rewind;
		key_Previous = settingsRow.key_Previous;
		key_PlayPause = settingsRow.key_PlayPause;
		key_Next = settingsRow.key_Next;
		key_Skip = settingsRow.key_Skip;
		key_Autoplay = settingsRow.key_Autoplay;
		key_Shuffle = settingsRow.key_Shuffle;
		key_Mute = settingsRow.key_Mute;
		key_Speed = settingsRow.key_Speed;
		key_Loop = settingsRow.key_Loop;
		key_searchSong = settingsRow.key_searchSong;
		key_randomSong = settingsRow.key_randomSong;
		key_randomPlaylist = settingsRow.key_randomPlaylist;
		key_lastPlaylist = settingsRow.key_lastPlaylist;
		rememberautoplay = settingsRow.rememberautoplay;
		remembershuffle = settingsRow.remembershuffle;
		rememberloop = settingsRow.rememberloop;
		rememberspeed = settingsRow.rememberspeed;
		volume = settingsRow.volume / 100 / settingsRow.dividevolume;
		dividevolume = settingsRow.dividevolume;
		displayPage = settingsRow.displayPage;
		musicMode = settingsRow.musicMode;
		stabiliseVolumeToggle = settingsRow.stabiliseVolumeToggle;
		current_version = settingsRow.current_version;
		recommendationsAfterDownload = settingsRow.recommendationsAfterDownload;

		if (settingsRow.background.includes("#")) {
			document.body.style.background = settingsRow.background;
		} else {
			document.body.className = `bg-gradient-${settingsRow.background}`;
		}

		popularityFactor = settingsRow.popularityFactor;
		artistStrengthFactor = settingsRow.artistStrengthFactor;
		similarArtistsFactor = settingsRow.similarArtistsFactor;
		userPreferenceFactor = settingsRow.userPreferenceFactor;
		artistListenTimeFactor = settingsRow.artistListenTimeFactor;
		randomFactor = settingsRow.randomFactor;

		discordRPCstatus = settingsRow.dc_rpc == 1 ? true : false;
		discordRPCstatus ? sendCommandToDaemon("create") : updateDiscordStatus("disabled");
		document.getElementById("toggleSwitchDiscord").checked = discordRPCstatus;

		document.getElementById("weight1").value = popularityFactor;
		document.getElementById("weight2").value = artistStrengthFactor;
		document.getElementById("weight3").value = similarArtistsFactor;
		document.getElementById("weight4").value = userPreferenceFactor;
		document.getElementById("weight5").value = artistListenTimeFactor;
		document.getElementById("weight6").value = randomFactor;

		const icons = {
			backwardButton: "backward.svg",
			previousSongButton: "previous.svg",
			playButton: "play.svg",
			pauseButton: "pause.svg",
			nextSongButton: "next.svg",
			forwardButton: "forward.svg",
			autoplayButton: "redAutoplay.svg",
			shuffleButton: "redShuffle.svg",
			muteButton: "mute_on.svg",
			speedButton: "speed.svg",
			loopButton: "redLoop.svg",
			songSettingsButton: "adjustments.svg",
		};

		for (const [id, file] of Object.entries(icons)) {
			const el = document.getElementById(id);
			if (el) {
				el.innerHTML = `<img src="${path.join(appThumbnailFolder, file)}" alt="${file.split(".")[0]}">`;
			}
		}

		rememberautoplay && toggleAutoplay();
		remembershuffle && toggleShuffle();
		rememberloop && toggleLoop();

		volumeControl.value = volume * 100 * dividevolume;
	} catch (err) {
		console.log("Database error:", err.message);
		return;
	}

	setupLazyBackgrounds();
	document.getElementById("main-menu").click();

	ipcRenderer.invoke("get-app-version").then(async version => {
		const willUpdate = version != current_version;
		current_version = version;
		updateDatabase("current_version", current_version, settingsDb, "settings");
		document.getElementById("version").textContent = `Version: ${version}`;

		if (willUpdate) {
			await alertModal("Version change detected. Binaries being rebuilt...");
			ipcRenderer.send("copy-binaries");
		}
	});
}

function initialiseMusicsDatabase() {
	const requiredColumns = [
		{ name: "song_id", type: "TEXT PRIMARY KEY" },
		{ name: "song_name", type: "TEXT" },
		{ name: "song_url", type: "TEXT" },
		{ name: "song_extension", type: "TEXT" },
		{ name: "thumbnail_extension", type: "TEXT" },
		{ name: "seconds_played", type: "INTEGER" },
		{ name: "times_listened", type: "INTEGER" },
		{ name: "stabilised", type: "INTEGER" },
		{ name: "size", type: "INTEGER" },
		{ name: "speed", type: "REAL" },
		{ name: "bass", type: "REAL" },
		{ name: "treble", type: "REAL" },
		{ name: "midrange", type: "REAL" },
		{ name: "volume", type: "INTEGER" },
		{ name: "song_length", type: "INTEGER" },
		{ name: "artist", type: "TEXT" },
		{ name: "genre", type: "TEXT" },
		{ name: "language", type: "TEXT" },
	];

	musicsDb
		.prepare(
			`CREATE TABLE IF NOT EXISTS recommendations (
                artist_id INTEGER PRIMARY KEY,
                artist_name TEXT,
                artist_fan_amount INTEGER,
                similar_artists_array TEXT,
                deezer_songs_array TEXT
            )`,
		)
		.run();

	musicsDb
		.prepare(
			`CREATE TABLE IF NOT EXISTS streams (
                song_id TEXT PRIMARY KEY,
                song_name TEXT,
                thumbnail_url TEXT,
                length INTEGER,
                artist TEXT,
                genre TEXT,
                language TEXT
            )`,
		)
		.run();

	musicsDb
		.prepare(
			`CREATE TABLE IF NOT EXISTS timers (
                song_id TEXT,
                start_time INTEGER,
                end_time INTEGER
                playlist TEXT
            )`,
		)
		.run();

	musicsDb
		.prepare(
			`CREATE TABLE IF NOT EXISTS not_interested (
                song_id TEXT,
                song_name TEXT
            )`,
		)
		.run();

	musicsDb
		.prepare(
			`CREATE TABLE IF NOT EXISTS songs (
                ${requiredColumns.map(column => `${column.name} ${column.type}`).join(", ")}
            )`,
		)
		.run();

	const existingSongColumns = musicsDb
		.prepare(`PRAGMA table_info(songs)`)
		.all()
		.map(col => col.name);

	for (const col of requiredColumns) {
		if (!existingSongColumns.includes(col.name)) {
			musicsDb.prepare(`ALTER TABLE songs ADD COLUMN ${col.name} ${col.type}`).run();
		}
	}

	const existingTimerColumns = musicsDb
		.prepare(`PRAGMA table_info(timers)`)
		.all()
		.map(col => col.name);

	if (!existingTimerColumns.includes("playlist")) {
		musicsDb.prepare(`ALTER TABLE timers ADD COLUMN playlist TEXT`).run();
	}

	const rows = musicsDb.prepare("SELECT song_id, song_length, song_url, song_name, song_extension, thumbnail_extension, genre, artist, language FROM songs").all();
	for (const row of rows) {
		songNameCache.set(row.song_id, {
			song_name: row.song_name,
			song_length: row.song_length,
			song_extension: row.song_extension,
			song_url: row.song_url,
			thumbnail_extension: row.thumbnail_extension,
			genre: row.genre,
			artist: row.artist,
			language: row.language,
		});
	}

	notInterestedSongs = musicsDb.prepare("SELECT song_id FROM not_interested").all();
}

function initialisePlaylistsDatabase() {
	try {
		playlistsDb
			.prepare(
				`
			CREATE TABLE IF NOT EXISTS playlists (
				id TEXT PRIMARY KEY,
				name TEXT,
				songs TEXT,
				thumbnail_extension TEXT
			)
		`,
			)
			.run();

		playlistsDb.transaction(() => {
			const fav = playlistsDb.prepare("SELECT id FROM playlists WHERE name = ?").get("Favorites");
			if (!fav) playlistsDb.prepare("INSERT INTO playlists (id, name, songs, thumbnail_extension) VALUES (?, ?, ?, ?)").run("Favorites", "Favorites", JSON.stringify([]), "svg");
		})();
	} catch (err) {
		console.log("Error initializing playlists database:", err);
		return [];
	}
}

function updateDatabase(column, value, dbName, table) {
	const key = `${table}.${column}`;

	if (debounceMap.has(key)) clearTimeout(debounceMap.get(key));

	const timeout = setTimeout(() => {
		try {
			dbName.prepare(`UPDATE ${table} SET ${column} = ?`).run(value);
			console.log(`${table}.${column} updated to ${value}.`);
		} catch (err) {
			console.log(`Error updating ${table}.${column}:`, err.message);
		}
		debounceMap.delete(key);
	}, 300);

	debounceMap.set(key, timeout);
}

setInterval(() => {
	sessionTimeSpent += 60;
	settingsDb
		.prepare(
			`
                UPDATE statistics
                SET total_time_spent = total_time_spent + 60
            `,
		)
		.run();
}, 60000);

tabs.forEach(tab => {
	tab.addEventListener("click", () => {
		tabs.forEach(div => div.classList.remove("active"));
		tab.classList.add("active");

		const tabContentId = `${tab.id}-content`;
		document.querySelectorAll(".tab-content").forEach(content => {
			content.classList.add("hidden");
			if (content.id == tabContentId) {
				content.classList.remove("hidden");
				document.getElementById("main-menu-content").style.display = "none";
				document.getElementById("my-music-content").style.display = "none";
				document.getElementById("playlists-content").style.display = "none";
				document.getElementById("settings-content").style.display = "none";
				document.getElementById("statistics-content").style.display = "none";

				window.scrollTo(0, 0);
				if (content.id == "main-menu-content") {
					document.getElementById("main-menu-content").style.display = "flex";
				} else if (content.id == "my-music-content") {
					document.getElementById("my-music-content").style.display = "flex";
				} else if (content.id == "playlists-content") {
					document.getElementById("playlists-content").style.display = "grid";
				} else if (content.id == "settings-content") {
					document.getElementById("settings-content").style.display = "flex";
				} else if (content.id == "statistics-content") {
					loadNewPage("statistics");
				}
				setupLazyBackgrounds();
			}
		});
	});
});

function getSongNameCached(songId) {
	if (!songNameCache.has(songId)) {
		const stmt = musicsDb.prepare("SELECT song_name, song_length, song_url, song_extension, thumbnail_extension, genre, artist, language FROM songs WHERE song_id = ?");
		const row = stmt.get(songId);
		songNameCache.set(songId, row || { song_name: null, song_length: null, song_url: null, song_extension: null, thumbnail_extension: null, genre: null, artist: null, language: null });
	}
	return songNameCache.get(songId);
}

async function myMusicOnClick() {
	const myMusicContent = document.getElementById("my-music-content");
	myMusicContent.innerHTML = "";

	const controlsBar = document.createElement("div");
	controlsBar.id = "controlsBar";

	const musicSearchParts = document.createElement("div");
	musicSearchParts.className = "beatifullyCenteredRow";

	const musicSearchInput = document.createElement("input");
	musicSearchInput.dataset.tooltip = "Search for a song";
	musicSearchInput.type = "text";
	musicSearchInput.id = "music-search";

	musicSearchInput.addEventListener("input", () => {
		musicMode == "offline" && renderMusics();
	});

	const musicSearchInputAmount = document.createElement("input");
	musicSearchInputAmount.dataset.tooltip = "Amount of songs to search";
	musicSearchInputAmount.id = "musicSearchInputAmount";
	musicSearchInputAmount.value = "4";
	musicSearchInputAmount.style.cursor = "unset !important";
	const musicSearchEnterButton = document.createElement("button");
	musicSearchEnterButton.dataset.tooltip = "Search";
	musicSearchEnterButton.id = "musicSearchEnterButton";
	musicSearchEnterButton.innerText = "↵";
	musicSearchEnterButton.addEventListener("click", searchYoutubeInMusics);
	const musicSearchRefreshButton = document.createElement("button");
	musicSearchRefreshButton.dataset.tooltip = "Refresh Recommendations";
	musicSearchRefreshButton.id = "musicSearchRefreshButton";
	musicSearchRefreshButton.style.backgroundImage = `url("file://${path.join(appThumbnailFolder, "refresh.svg").replace(/\\/g, "/")}")`; // TODO: Move to css
	musicSearchRefreshButton.style.backgroundSize = "cover";
	musicSearchRefreshButton.style.backgroundRepeat = "no-repeat";
	musicSearchRefreshButton.style.backgroundPosition = "center";
	musicSearchRefreshButton.addEventListener("click", () => {
		localStorage.setItem("recommendationsCache", null);
		renderMusics();
	});

	const tooltipElements = [musicSearchInput, musicSearchInputAmount, musicSearchEnterButton, musicSearchRefreshButton];

	tooltipElements.forEach(el => {
		let timeoutId;

		el.addEventListener("mouseenter", e => {
			timeoutId = setTimeout(() => {
				if (!el.dataset.tooltip) return;
				tooltip.textContent = el.dataset.tooltip;
				tooltip.style.display = "block";
				tooltip.style.left = e.pageX + 5 + "px";
				tooltip.style.top = e.pageY + 5 + "px";
			}, 1000);
		});

		el.addEventListener("mousemove", e => {
			tooltip.style.left = e.pageX + 5 + "px";
			tooltip.style.top = e.pageY + 5 + "px";
		});

		el.addEventListener("mouseleave", () => {
			clearTimeout(timeoutId);
			tooltip.style.display = "none";
		});
	});

	const displayPageSelect = document.createElement("select");
	displayPageSelect.id = "display-count";

	const musicModeSelect = document.createElement("select");
	musicModeSelect.id = "music-mode-select";

	const buttonLeft = document.createElement("button");
	const buttonRight = document.createElement("button");
	buttonLeft.className = "pageScrollButtons";
	buttonRight.className = "pageScrollButtons";
	buttonLeft.innerText = "<";
	buttonRight.innerText = ">";
	buttonLeft.id = "leftPageButton";
	buttonRight.id = "rightPageButton";
	const buttonContainer = document.createElement("div");

	buttonLeft.addEventListener("click", () => {
		if (currentPage != 1) currentPage--;
		renderMusics();
	});

	buttonRight.addEventListener("click", () => {
		if (Math.ceil(songNameCache.size / (3 * previousItemsPerRow)) != currentPage) currentPage++;
		renderMusics();
	});

	const availableRowCounts = ["scroll", "page"];
	availableRowCounts.forEach(rowCount => {
		const optionElement = document.createElement("option");
		optionElement.value = rowCount;
		optionElement.innerText = rowCount == "scroll" || rowCount == null ? "Scroll Mode" : "Page Mode";
		if (rowCount == displayPage) optionElement.selected = true;
		displayPageSelect.appendChild(optionElement);
	});

	displayPageSelect.onchange = () => {
		const selectedValue = displayPageSelect.value;
		console.log("Selected:", selectedValue, "at displayPage");
		updateDatabase("displayPage", selectedValue, settingsDb, "settings");
		displayPage = selectedValue;
		renderMusics();
	};

	const availableMusicModes = ["offline", "stream", "discover"];
	availableMusicModes.forEach(mode => {
		const optionElement = document.createElement("option");
		optionElement.value = mode;
		if (mode == "offline" || mode == null) {
			optionElement.innerText = "Offline Mode";
		} else if (mode == "stream") {
			optionElement.innerText = "Stream Mode";
		} else {
			optionElement.innerText = "Discovery Mode";
		}
		if (mode == musicMode) optionElement.selected = true;
		musicModeSelect.appendChild(optionElement);
	});

	musicModeSelect.onchange = () => {
		const selectedValue = musicModeSelect.value;
		console.log("Selected:", selectedValue, "at musicMode");
		updateDatabase("musicMode", selectedValue, settingsDb, "settings");
		musicMode = selectedValue;
		changeSearchBar();
		renderMusics();
	};

	musicSearchParts.appendChild(musicSearchInput);
	musicSearchParts.appendChild(musicSearchInputAmount);
	musicSearchParts.appendChild(musicSearchEnterButton);
	musicSearchParts.appendChild(musicSearchRefreshButton);
	controlsBar.appendChild(musicSearchParts);
	controlsBar.appendChild(musicModeSelect);
	controlsBar.appendChild(buttonContainer);
	buttonContainer.appendChild(buttonLeft);
	buttonContainer.appendChild(displayPageSelect);
	buttonContainer.appendChild(buttonRight);
	myMusicContent.appendChild(controlsBar);

	const musicListContainer = document.createElement("div");
	musicListContainer.id = "music-list-container";
	musicListContainer.className = "scrollArea";
	musicListContainer.innerHTML = "";

	myMusicContent.appendChild(musicListContainer);

	renderMusics();
}

function changeSearchBar() {
	const musicSearchInputAmount = document.getElementById("musicSearchInputAmount");
	const musicSearchEnterButton = document.getElementById("musicSearchEnterButton");
	const musicSearchRefreshButton = document.getElementById("musicSearchRefreshButton");
	document.getElementById("music-search").value = "";

	if (musicMode == "offline") {
		musicSearchInputAmount.disabled = true;
		musicSearchInputAmount.style.cursor = "not-allowed";
		musicSearchInputAmount.style.backgroundColor = "rgba(80,80,80,0.95)";

		musicSearchEnterButton.disabled = true;
		musicSearchEnterButton.style.cursor = "not-allowed";
		musicSearchEnterButton.style.backgroundColor = "rgba(80,80,80,0.95)";

		musicSearchRefreshButton.disabled = true;
		musicSearchRefreshButton.style.cursor = "not-allowed";
		musicSearchRefreshButton.style.backgroundColor = "rgba(80,80,80,0.95)";
	} else {
		musicSearchInputAmount.disabled = false;
		musicSearchInputAmount.style.cursor = "unset";
		musicSearchInputAmount.style.backgroundColor = "rgba(0,0,0,0.8)";

		musicSearchEnterButton.disabled = false;
		musicSearchEnterButton.style.cursor = "pointer";
		musicSearchEnterButton.style.backgroundColor = "rgba(0,0,0,0.8)";

		musicSearchRefreshButton.disabled = false;
		musicSearchRefreshButton.style.cursor = "pointer";
		musicSearchRefreshButton.style.backgroundColor = "rgba(0,0,0,0.8)";
	}
}

function searchYoutubeInMusics() {
	const container = document.getElementById("music-list-container");
	const scrollPos = container.scrollTop;

	if (musicMode != "offline" && document.getElementById("music-search").value != "") {
		container.innerHTML = "Loading...";
		const searchedThing = document.getElementById("music-search").value;
		const goal = Number(document.getElementById("musicSearchInputAmount").value);

		(async () => {
			streamedSongsHtmlMap = new Map();
			const results = await ytsr(searchedThing, { safeSearch: false, limit: goal });

			container.innerHTML = "";

			for (let i = 0; i < results.items.length; i++) {
				try {
					const info = results.items[i];
					const videoTitle = info.name;
					const songID = info.id;
					const thumbnails = info.thumbnails || [];
					const songLength = parseTimeToSeconds(info.duration);
					const bestThumbnail = thumbnails.reduce((max, thumb) => {
						const size = (thumb.width || 0) * (thumb.height || 0);
						const maxSize = (max.width || 0) * (max.height || 0);
						return size > maxSize ? thumb : max;
					}, thumbnails[0] || {});

					musicsDb
						.prepare(
							`
                                INSERT OR IGNORE INTO streams (song_id, song_name, thumbnail_url, length, artist, genre, language)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            `,
						)
						.run(songID, videoTitle, bestThumbnail.url, songLength, null, null, null);

					if (Array.from(songNameCache.values()).some(song => song.song_url?.includes(songID))) {
						musicsDb.prepare("INSERT INTO not_interested (song_id, song_name) VALUES (?, ?)").run(songID, videoTitle);
						notInterestedSongs.push({ song_id: songID });
						continue;
					}

					const fullSong = {
						id: songID,
						name: videoTitle,
						thumbnail: bestThumbnail,
						length: songLength,
					};

					streamedSongsHtmlMap.set(songID, fullSong);

					const musicElement = createMusicElement(fullSong);
					if (fullSong.id == removeExtensions(playingSongsID)) musicElement.classList.add("playing");
					musicElement.addEventListener("click", () => playMusic(fullSong.id, null));
					if (musicMode == "stream") {
						container.appendChild(musicElement);
					} else {
						return;
					}
					setupLazyBackgrounds();
				} catch (error) {
					console.log(error);
					await alertModal("YouTube API limit reached! Please wait a couple of seconds.");
				}
			}
		})();
	}
	document.querySelectorAll(".pageScrollButtons").forEach(button => {
		button.disabled = displayPage == "scroll";
	});

	setupLazyBackgrounds();
	container.scrollTop = scrollPos;
}

function renderMusics() {
	const container = document.getElementById("music-list-container");
	const scrollPos = container.scrollTop;

	container.innerHTML = "";
	previousItemsPerRow = Math.floor((content.offsetWidth - 53) / 205);
	if (Math.ceil(songNameCache.size / (3 * previousItemsPerRow)) < currentPage) currentPage = Math.ceil(songNameCache.size / (3 * previousItemsPerRow));

	let filteredSongs = {};

	if (musicMode == "offline") {
		const songRows = musicsDb.prepare("SELECT song_id, song_length, song_extension, thumbnail_extension FROM songs").all();
		document.getElementById("music-search").placeholder = `Search of ${songRows.length} songs in ${taratorFolder}...`;

		filteredSongs = songRows
			.map(row => ({
				id: row.song_id,
				name: `${row.song_id}.${row.song_extension}`,
				thumbnail: `file://${row.song_id}.${row.thumbnail_extension}`,
				length: row.song_length || 0,
				info: getSongNameCached(row.song_id),
			}))
			.sort((a, b) => (a.info.song_name || "").toLowerCase().localeCompare((b.info.song_name || "").toLowerCase()))
			.filter(song => {
				let searchValue = document.getElementById("music-search").value.trim().toLowerCase();
				const exactMatch = searchValue.startsWith('"') && searchValue.endsWith('"');
				if (exactMatch) searchValue = searchValue.slice(1, -1);
				if (!searchValue) return true;

				const { song_name, artist, genre, language } = song.info;
				const id = song.id.toString();

				const compare = fieldValue => {
					if (!fieldValue) return false;
					const value = String(fieldValue).toLowerCase();
					return exactMatch ? value == searchValue : value.includes(searchValue);
				};

				return compare(song_name) || (exactMatch ? id == searchValue : id.includes(searchValue)) || compare(artist) || compare(genre) || compare(language);
			});

		const maxVisible = displayPage == "scroll" ? filteredSongs.length : parseInt(3 * previousItemsPerRow * currentPage);
		const startingSong = displayPage == "scroll" ? 0 : parseInt(3 * previousItemsPerRow * (currentPage - 1));

		filteredSongs.slice(startingSong, maxVisible).forEach(song => {
			const musicElement = createMusicElement(song);
			if (song.id == removeExtensions(playingSongsID)) musicElement.classList.add("playing");
			musicElement.addEventListener("click", () => playMusic(song.id, null));
			container.appendChild(musicElement);
		});
	} else if (musicMode == "stream") {
		document.getElementById("music-search").placeholder = `Search in Youtube or already streamed songs...`;
		// Get all songs from "streams" table
	} else if (musicMode == "discover") {
		document.getElementById("music-search").placeholder = `Search in Youtube...`;
		container.innerHTML = "Loading...";

		const recommendationsCache = localStorage.getItem("recommendationsCache");

		if (recommendationsCache != "null") {
			const cachedMap = new Map(JSON.parse(recommendationsCache));
			streamedSongsHtmlMap = cachedMap;
			container.innerHTML = "";

			for (const [id, song] of cachedMap) {
				const musicElement = createMusicElement(song);
				if (song.id == removeExtensions(playingSongsID)) musicElement.classList.add("playing");
				musicElement.addEventListener("click", () => playMusic(song.id, null));

				if (musicMode == "discover") {
					container.appendChild(musicElement);
				} else {
					return;
				}
			}

			setupLazyBackgrounds();
		} else {
			refreshRecommendations();
		}
	}

	document.querySelectorAll(".pageScrollButtons").forEach(button => {
		button.disabled = displayPage == "scroll";
	});

	setupLazyBackgrounds();
	container.scrollTop = scrollPos;
}

function refreshRecommendations() {
	const container = document.getElementById("music-list-container");
	const recommendedMusicMap = getRecommendations();
	if (recommendedMusicMap == 999) return alertModal("No songs listened yet to give recommendations of."); // TODO: Probably a problem here
	const goal = document.getElementById("musicSearchInputAmount").value;
	let count = 0;

	(async () => {
		streamedSongsHtmlMap = new Map();

		for (const [key, value] of recommendedMusicMap) {
			const ytQuery = `${key} by ${value[0]}`;
			try {
				const result = await ytsr(ytQuery, { safeSearch: false, limit: 1 });
				const info = result.items[0];
				const videoTitle = info.name;
				const songID = info.id;
				const thumbnails = info.thumbnails || [];
				const songLength = parseTimeToSeconds(info.duration);
				const bestThumbnail = thumbnails.reduce((max, thumb) => {
					const size = (thumb.width || 0) * (thumb.height || 0);
					const maxSize = (max.width || 0) * (max.height || 0);
					return size > maxSize ? thumb : max;
				}, thumbnails[0] || {});

				musicsDb
					.prepare(
						`
                            INSERT OR IGNORE INTO streams (song_id, song_name, thumbnail_url, length, artist, genre, language)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `,
					)
					.run(songID, videoTitle, bestThumbnail.url, songLength, null, null, null);

				if (Array.from(songNameCache.values()).some(song => song.song_url?.includes(songID))) {
					musicsDb.prepare("INSERT INTO not_interested (song_id, song_name) VALUES (?, ?)").run(songID, key);
					notInterestedSongs.push({ song_id: songID });
					continue;
				}

				if (notInterestedSongs.some(row => row.song_id.toLowerCase().trim() == key.toLowerCase().trim())) continue;

				const fullSong = {
					id: songID,
					name: videoTitle,
					thumbnail: bestThumbnail,
					length: songLength,
				};

				streamedSongsHtmlMap.set(songID, fullSong);

				if (count == 0) container.innerHTML = "";

				const musicElement = createMusicElement(fullSong);
				if (fullSong.id == removeExtensions(playingSongsID)) musicElement.classList.add("playing");
				musicElement.addEventListener("click", () => playMusic(fullSong.id, null));

				if (musicMode == "discover") {
					container.appendChild(musicElement);
				} else {
					return;
				}

				setupLazyBackgrounds();

				count++;
				localStorage.setItem("recommendationsCache", JSON.stringify([...streamedSongsHtmlMap]));
				if (count >= goal) break;
			} catch (error) {
				console.log(error);
				await alertModal("YouTube API limit reached! Please wait a couple of seconds.");
			}
		}
	})();
}

function createMusicElement(songFile) {
	const musicElement = document.createElement("div");
	musicElement.classList.add("music-item");
	musicElement.setAttribute("alt", songFile.name);
	musicElement.setAttribute("data-file-name", songFile.id);

	const songNameElement = document.createElement("div");

	let fileNameWithoutExtension;

	if (songFile.id.includes("tarator")) {
		fileNameWithoutExtension = path.parse(songFile.name).name;
		const thumbnailPath = path.join(thumbnailFolder, fileNameWithoutExtension + "." + getSongNameCached(fileNameWithoutExtension).thumbnail_extension);

		if (fs.existsSync(thumbnailPath)) {
			const backgroundElement = document.createElement("div");
			backgroundElement.classList.add("background-element");
			backgroundElement.dataset.bg = `file://${thumbnailPath.replace(/\\/g, "/")}?t=${Date.now()}`;
			musicElement.appendChild(backgroundElement);
		}

		songNameElement.classList.add("song-name");
		songNameElement.innerText = getSongNameCached(fileNameWithoutExtension).song_name;
	} else {
		const backgroundElement = document.createElement("div");
		backgroundElement.classList.add("background-element");
		backgroundElement.dataset.bg = songFile.thumbnail.url || songFile.thumbnail;
		musicElement.appendChild(backgroundElement);

		songNameElement.classList.add("song-name");
		songNameElement.innerText = songFile.name;
		fileNameWithoutExtension = songFile.name;
	}

	const songLengthElement = document.createElement("div");
	songLengthElement.classList.add("song-length");
	songLengthElement.innerText = formatTime(songFile.length);

	const customiseButtonElement = document.createElement("button");

	customiseButtonElement.classList.add("customise-button");
	customiseButtonElement.addEventListener("click", event => {
		event.stopPropagation();
		opencustomiseModal(songFile.id);
	});

	const addToPlaylistButtonElement = document.createElement("button");
	addToPlaylistButtonElement.classList.add("add-to-playlist-button");
	addToPlaylistButtonElement.addEventListener("click", event => {
		event.stopPropagation();
		openAddToPlaylistModal(fileNameWithoutExtension);
	});

	customiseButtonElement.innerHTML = `<img src="${path.join(appThumbnailFolder, "customise.svg")}" alt="Customise">`;
	addToPlaylistButtonElement.innerHTML = `<img src="${path.join(appThumbnailFolder, "addtoplaylist.svg")}" alt="Add To Playlist">`;

	musicElement.appendChild(songLengthElement);
	musicElement.appendChild(songNameElement);
	musicElement.appendChild(customiseButtonElement);
	musicElement.appendChild(addToPlaylistButtonElement);
	return musicElement;
}

async function playMusic(songId, playlistId) {
	await saveUserProgress();

	try {
		const offlineMode = !!songId.includes("tarator");
		const songName = document.getElementById("song-name");
		songName.setAttribute("data-file-name", playingSongsID);
		songName.textContent = offlineMode ? getSongNameById(songId) : streamedSongsHtmlMap.get(songId)?.name;
		playingSongsID = songId;
		currentPlaylist = playlistId || null;

		lastAuthoritativePosition = 0;
		lastSyncTimestamp = performance.now();
		isInterpolating = true;

		videoProgress.value = 0;
		songDuration = offlineMode ? getSongNameCached(songId).song_length : streamedSongsHtmlMap.get(songId)?.length;
		videoLength.innerText = `00:00 / ${formatTime(songDuration)}`;

		document.getElementById("addToFavoritesButtonBottomRight").style.color = "white";
		document.getElementById("addToPlaylistButtonBottomRight").style.color = "white";
		document.getElementById("customiseButtonBottomRight").style.color = "white";

		if (!!playlistsDb.prepare("SELECT 1 FROM playlists WHERE name=? AND EXISTS (SELECT 1 FROM json_each(songs) WHERE value=?)").get("Favorites", songId)) {
			addToFavoritesButtonBottomRight.style.color = "red";
		}

		const songPath = offlineMode ? path.join(musicFolder, `${playingSongsID}.${getSongNameCached(songId).song_extension}`) : `https://www.youtube.com/watch?v=${songId}`;
		offlineMode ? audioPlayer.stdin.write(`play ${songPath}\n`) : audioPlayer.stdin.write(`stream ${songPath} \n`);
		audioPlayer.stdin.write(`volume ${volume}\n`);
		audioPlayer.stdin.write(`speed ${rememberspeed}\n`);

		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";

		let thumbnailUrl;

		if (offlineMode) {
			const thumbnailPath = path.join(thumbnailFolder, `${songId}.${getSongNameCached(songId).thumbnail_extension}`.replace(/%20/g, " "));
			thumbnailUrl = path.join(appThumbnailFolder, "placeholder.jpg".replace(/%20/g, " "));

			if (fs.existsSync(thumbnailPath)) {
				thumbnailUrl = `file://${thumbnailPath.replace(/\\/g, "/")}`;
			} else {
				console.log("Tried to get thumbnail from", thumbnailPath, "but failed. Used", thumbnailUrl, "instead.");
			}
		} else {
			thumbnailUrl = streamedSongsHtmlMap.get(songId)?.thumbnail.url;
		}

		document.getElementById("videothumbnailbox").style.backgroundImage = `url('${thumbnailUrl}')`;

		document.querySelectorAll(".music-item.playing").forEach(el => el.classList.remove("playing"));
		document.querySelectorAll(".music-item").forEach(musicElement => {
			if (removeExtensions(musicElement.getAttribute("data-file-name")) == playingSongsID) musicElement.classList.add("playing");
		});

		if (player) {
			editMPRIS();
			player.playbackStatus = "Playing";
		}

		playing = true;

		if (playlistId) {
			if (newPlaylistID != playlistId.id) {
				newPlaylistID = playlistId.id;
				playlistPlayedSongs.splice(0, 9999);
			}
			playlistPlayedSongs.unshift(playingSongsID);
			if (playlistPlayedSongs.length > 9999) playlistPlayedSongs.pop();
		} else {
			playedSongs.unshift(playingSongsID);
			if (playedSongs.length > 9999) playedSongs.pop();
		}
	} catch (error) {
		console.log("Error:", error);
	}
}

async function playPlaylist(playlist, startingIndex = 0) {
	if (!playlist.songs || playlist.songs.length == 0) {
		return console.log(`Playlist ${playlist.name} is empty.`);
	}

	currentPlaylistElement = startingIndex;
	localStorage.setItem("lastPlaylist", playlist.id);
	await playMusic(playlist.songs[startingIndex], playlist);
}

async function playPreviousSong() {
	if (!playingSongsID) return;

	const allMusics = musicsDb.prepare("SELECT song_id, song_name FROM songs").all();
	const songMap = new Map();
	allMusics.forEach(song => songMap.set(song.song_id, song.song_name));

	const sortedEntries = [...songMap.entries()].sort((a, b) => {
		const nameA = a[1] || "";
		const nameB = b[1] || "";
		return nameA.localeCompare(nameB);
	});
	const sortedSongIds = sortedEntries.map(entry => entry[0]);

	if (isShuffleActive) {
		if (currentPlaylist) {
			if (playlistPlayedSongs.length > 1) {
				playMusic(playlistPlayedSongs[1], currentPlaylist);
				playlistPlayedSongs.splice(0, 2);
			}
		} else {
			if (playedSongs.length > 1) {
				playMusic(playedSongs[1], null);
				playedSongs.splice(0, 2);
			}
		}
	} else {
		if (currentPlaylist) {
			if (currentPlaylistElement > 0) {
				playMusic(currentPlaylist.songs[currentPlaylistElement - 1], currentPlaylist);
				currentPlaylistElement--;
			}
		} else {
			const currentFileName = getSongNameById(playingSongsID);
			const currentIndex = sortedSongIds.indexOf(playingSongsID);

			if (currentIndex == -1) return;

			const previousIndex = currentIndex > 0 ? currentIndex - 1 : sortedSongIds.length - 1;

			playMusic(sortedSongIds[previousIndex], null);
		}
	}
}

async function playNextSong() {
	if (!playingSongsID) return;
	if (isLooping) return playMusic(playingSongsID, null);

	const notInterestedIds = notInterestedSongs.map(song => song.song_id);
	const sortedSongIds = [...songNameCache.entries()]
		.filter(([id]) => !notInterestedIds.includes(id))
		.sort((a, b) => (a[1].song_name || "").localeCompare(b[1].song_name || ""))
		.map(entry => entry[0]);

	let nextSongId;

	if (isShuffleActive) {
		if (currentPlaylist) {
			const validSongs = currentPlaylist.songs.filter(id => !notInterestedIds.includes(id));
			const currentSongId = currentPlaylist.songs[currentPlaylistElement];

			if (validSongs.length == 0) return;
			if (validSongs.length == 1) {
				nextSongId = validSongs[0];
			} else {
				let randomIndex = Math.floor(Math.random() * validSongs.length);
				while (validSongs[randomIndex] == currentSongId) {
					randomIndex = Math.floor(Math.random() * validSongs.length);
				}
				nextSongId = validSongs[randomIndex];
				currentPlaylistElement = currentPlaylist.songs.indexOf(nextSongId);
			}
		} else {
			if (sortedSongIds.length == 0) return;
			if (sortedSongIds.length == 1) {
				nextSongId = sortedSongIds[0];
			} else {
				let randomIndex = Math.floor(Math.random() * sortedSongIds.length);
				while (sortedSongIds[randomIndex] == playingSongsID) {
					randomIndex = Math.floor(Math.random() * sortedSongIds.length);
				}
				nextSongId = sortedSongIds[randomIndex];
			}
		}
	} else {
		if (currentPlaylist) {
			const validSongs = currentPlaylist.songs.filter(id => !notInterestedIds.includes(id));
			const currentIndex = validSongs.indexOf(currentPlaylist.songs[currentPlaylistElement]);
			if (currentIndex >= 0 && currentIndex < validSongs.length - 1) {
				nextSongId = validSongs[currentIndex + 1];
				currentPlaylistElement = currentPlaylist.songs.indexOf(nextSongId);
			}
		} else {
			const currentIndex = sortedSongIds.indexOf(playingSongsID);
			const nextIndex = currentIndex < sortedSongIds.length - 1 ? currentIndex + 1 : 0;
			nextSongId = sortedSongIds[nextIndex];
		}
	}

	if (nextSongId) {
		playMusic(nextSongId, currentPlaylist);
	}
}

async function randomSongFunctionMainMenu() {
	const notInterestedIds = notInterestedSongs.map(song => song.song_id);
	const musicItems = musicsDb
		.prepare("SELECT song_id, song_name FROM songs")
		.all()
		.filter(song => !notInterestedIds.includes(song.song_id));

	if (musicItems.length == 0) return;
	if (musicItems.length == 1) return playMusic(musicItems[0].song_id, null);

	let randomIndex;

	do {
		randomIndex = Math.floor(Math.random() * musicItems.length);
	} while (playingSongsID && removeExtensions(musicItems[randomIndex].song_name) == document.getElementById("song-name").innerText);

	playMusic(musicItems[randomIndex].song_id, null);
}

async function randomPlaylistFunctionMainMenu() {
	const playlistsList = Array.from(playlistsMap.keys()).filter(p => playlistsMap.get(p).songs.length > 0);

	if (playlistsList.length == 0) return;
	if (playlistsList.length == 1) return playPlaylist(playlistsMap.get(playlistsList[0]), 0);

	let randomIndex;

	do {
		randomIndex = Math.floor(Math.random() * playlistsList.length);
	} while (currentPlaylist == playlistsList[randomIndex]);

	playPlaylist(playlistsMap.get(playlistsList[randomIndex]), 0);
}

function playPause() {
	if (!audioPlayer) return;

	audioPlayer.stdin.write("pause\n");

	if (playing) {
		playButton.style.display = "inline-block";
		pauseButton.style.display = "none";
		if (playingSongsID) songPauseStartTime = Math.floor(Date.now() / 1000);
		if (player) player.playbackStatus = "Paused";
		playing = false;
	} else {
		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";
		if (playingSongsID) totalPausedTime += Math.floor(Date.now() / 1000) - songPauseStartTime;
		if (player) player.playbackStatus = "Playing";
		playing = true;
	}
}

function toggleAutoplay() {
	isAutoplayActive = !isAutoplayActive;
	const autoplayButton = document.getElementById("autoplayButton");
	if (isAutoplayActive) {
		autoplayButton.classList.add("active");
		autoplayButton.innerHTML = `<img src="${path.join(appThumbnailFolder, "greenAutoplay.svg")}" alt="Autoplay Active">`;
		updateDatabase("rememberautoplay", 1, settingsDb, "settings");
	} else {
		autoplayButton.classList.remove("active");
		autoplayButton.innerHTML = `<img src="${path.join(appThumbnailFolder, "redAutoplay.svg")}" alt="Autoplay Disabled">`;
		updateDatabase("rememberautoplay", 0, settingsDb, "settings");
	}
}

function toggleShuffle() {
	isShuffleActive = !isShuffleActive;
	const shuffleButton = document.getElementById("shuffleButton");
	if (isShuffleActive) {
		shuffleButton.classList.add("active");
		shuffleButton.innerHTML = `<img src="${path.join(appThumbnailFolder, "greenShuffle.svg")}" alt="Shuffle Active">`;
		updateDatabase("remembershuffle", 1, settingsDb, "settings");
	} else {
		shuffleButton.classList.remove("active");
		shuffleButton.innerHTML = `<img src="${path.join(appThumbnailFolder, "redShuffle.svg")}" alt="Shuffle Disabled">`;
		updateDatabase("remembershuffle", 0, settingsDb, "settings");
	}
}

function toggleLoop() {
	isLooping = !isLooping;
	const loopButton = document.getElementById("loopButton");
	if (isLooping) {
		loopButton.classList.add("active");
		loopButton.innerHTML = `<img src="${path.join(appThumbnailFolder, "greenLoop.svg")}" alt="Loop Enabled">`;
		updateDatabase("rememberloop", 1, settingsDb, "settings");
	} else {
		loopButton.classList.remove("active");
		loopButton.innerHTML = `<img src="${path.join(appThumbnailFolder, "redLoop.svg")}" alt="Loop Disabled">`;
		updateDatabase("rememberloop", 0, settingsDb, "settings");
	}
}

function mute() {
	if (volumeControl.value != 0) {
		previousVolume = volumeControl.value;
		volumeControl.value = 0;
		document.getElementById("muteButton").innerHTML = `<img src="${path.join(appThumbnailFolder, `mute_off.svg`)}" alt="Mute Active">`;
		document.getElementById("muteButton").classList.add("active");
	} else {
		volumeControl.value = previousVolume;
		document.getElementById("muteButton").innerHTML = `<img src="${path.join(appThumbnailFolder, `mute_on.svg`)}" alt="Mute Deactive">`;
		document.getElementById("muteButton").classList.remove("active");
	}
	if (audioPlayer) audioPlayer.stdin.write(`volume ${volumeControl.value / 100 / dividevolume}\n`);
	updateDatabase("volume", volumeControl.value, settingsDb, "settings");
}

function speed() {
	document.getElementById("speedOptions").innerHTML = "";
	document.getElementById("speedModal").style.display = "block";
	const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

	speeds.forEach(speed => {
		const speedOption = document.createElement("div");
		speedOption.classList.add("speed-option");
		speedOption.textContent = `${speed}x`;
		if (speed == rememberspeed) {
			speedOption.style.color = "red";
		}
		speedOption.addEventListener("click", () => {
			rememberspeed = speed;
			updateDatabase("rememberspeed", speed, settingsDb, "settings");
			if (audioPlayer) audioPlayer.stdin.write(`speed ${rememberspeed}\n`);

			closeModal();
		});
		document.getElementById("speedOptions").appendChild(speedOption);
	});
}

function skipForward() {
	const newTime = Math.min(songDuration, (Number(videoProgress.value) / 100) * songDuration + 5);
	videoProgress.value = String((newTime / songDuration) * 100);
	if (audioPlayer) audioPlayer.stdin.write(`seek ${newTime}\n`);
}

function skipBackward() {
	const newTime = Math.max(0, (Number(videoProgress.value) / 100) * songDuration - 5);
	videoProgress.value = String((newTime / songDuration) * 100);
	if (audioPlayer) audioPlayer.stdin.write(`seek ${newTime}\n`);
}

function opencustomiseModal(songsId) {
	let song_name, stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language, song_url, thumbnailPath;

	let ifSongInNotInterested = !!notInterestedSongs.map(song => song.song_id).includes(songsId);
	document.getElementById("notInterestedToggle").innerText = ifSongInNotInterested ? "Not Interested" : "Interested";

	if (songsId.includes("tarator")) {
		const stmt = musicsDb.prepare(`
            SELECT song_name, stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language, song_url
            FROM songs
            WHERE song_id = ?
        `);
		({ song_name, stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language, song_url } = stmt.get(songsId));
		thumbnailPath = path.join(thumbnailFolder, songsId + "." + thumbnail_extension);

		document.getElementById("downloadThisSong").disabled = true;
		document.getElementById("stabiliseSongButton").disabled = stabilised == 1;
		document.getElementById("fetchSongInfoButton").disabled = false;
		document.getElementById("removeSongButton").disabled = false;
		document.getElementById("customiseSongLink").disabled = false;
		document.getElementById("customiseThumbnail").disabled = false;
	} else {
		// The song is not downloaded
		const stmt = musicsDb.prepare(`SELECT song_name, thumbnail_url, artist, genre, language FROM streams WHERE song_id = ?`);
		({ song_name, thumbnail_url, artist, genre, language } = stmt.get(songsId));

		thumbnailPath = thumbnail_url;
		song_url = `https://www.youtube.com/watch?v=${songsId}`;

		stabilised = null;
		size = null;
		speed = null;
		bass = null;
		treble = null;
		midrange = null;
		volume = null;

		document.getElementById("downloadThisSong").disabled = false;
		document.getElementById("stabiliseSongButton").disabled = true;
		document.getElementById("fetchSongInfoButton").disabled = true; // TODO: Make the fetch song function work for streams table too (But it would fetch too many songs)
		document.getElementById("removeSongButton").disabled = true;
		document.getElementById("customiseSongLink").disabled = true;
		document.getElementById("customiseThumbnail").disabled = true;
	}

    document.getElementById("customiseSongIdArea").innerHTML = "&nbsp" + songsId;
	document.getElementById("customiseSongName").value = song_name;
	document.getElementById("customiseImage").src = thumbnailPath;
	document.getElementById("customiseSongLink").value = song_url;

	document.getElementById("customiseSongGenre").value = genre;
	document.getElementById("customiseSongArtist").value = artist;
	document.getElementById("customiseSongLanguage").value = language;

	document.getElementById("modalStabilised").innerText = `Song Sound Stabilised: ${stabilised != null ? stabilised == 1 : "Not downloaded"}`;
	document.getElementById("modalFileSize").innerText = `File Size: ${size != null ? (size / 1048576).toFixed(2) + " MBs" : "Not downloaded"}`;
	// document.getElementById("modalPlaySpeed").innerText = `Play Speed: ${playSpeed != null ? playSpeed + "x" : "Not downloaded"}`;
	// document.getElementById("modalBass").innerText = `Bass: ${bass != null ? bass : "Not downloaded"}`;
	// document.getElementById("modalTreble").innerText = `Treble: ${treble != null ? treble : "Not downloaded"}`;
	// document.getElementById("modalMidrange").innerText = `Midrange: ${midrange != null ? midrange : "Not downloaded"}`;
	// document.getElementById("modalVolume").innerText = `Volume: ${volume != null ? volume : "Not downloaded"}`;

	document.getElementById("removeSongButton").dataset.songId = songsId;
	document.getElementById("stabiliseSongButton").dataset.songId = songsId;
	document.getElementById("notInterestedToggle").dataset.songId = songsId;
	document.getElementById("downloadThisSong").dataset.songId = songsId;

	const customiseDiv = document.getElementById("customiseModal");
	customiseDiv.dataset.oldThumbnailPath = thumbnailPath;
	customiseDiv.dataset.songID = songsId;
	customiseDiv.style.display = "block";
}

async function saveEditedSong() {
	const customiseDiv = document.getElementById("customiseModal");

	const songID = removeExtensions(customiseDiv.dataset.songID);
	const newNameInput = document.getElementById("customiseSongName").value.trim();
	const songsUrl = document.getElementById("customiseSongLink").value;
	const songsGenre = document.getElementById("customiseSongGenre").value;
	const songsArtist = document.getElementById("customiseSongArtist").value;
	const songsLanguage = document.getElementById("customiseSongLanguage").value;

	if (newNameInput.length < 1) return await alertModal("Please do not set a song name empty.");

	let element, thumbnailPath;

	if (songID.includes("tarator")) {
		const row = musicsDb.prepare("SELECT song_extension, thumbnail_extension FROM songs WHERE song_id = ?").get(songID);
		if (!row) return await alertModal("Song not found in database.");

		element = document.querySelector(`.music-item[data-file-name="${songID}"]`);
		if (!element) return await alertModal("Song element not found.");

		thumbnailPath = path.join(thumbnailFolder, `${songID}.${row.thumbnail_extension}`);

		const newThumbFile = document.getElementById("customiseThumbnail").files[0];
		if (newThumbFile && newThumbFile.path && fs.existsSync(newThumbFile.path)) fs.writeFileSync(thumbnailPath, fs.readFileSync(newThumbFile.path));

		const updated = musicsDb
			.prepare(
				`
                    UPDATE songs 
                    SET song_name = ?, song_url = ?, genre = ?, artist = ?, language = ?
                    WHERE song_id = ?
                    RETURNING song_name, song_extension, song_length, song_url, thumbnail_extension, genre, artist, language
                `,
			)
			.get(newNameInput, songsUrl, songsGenre, songsArtist, songsLanguage, songID);

		if (updated) songNameCache.set(songID, updated);
	} else {
		musicsDb
			.prepare(
				`
                    UPDATE streams 
                    SET song_name = ?, genre = ?, artist = ?, language = ? 
                    WHERE song_id = ?
                `,
			)
			.run(newNameInput, songsGenre, songsArtist, songsLanguage, songID);

		element = document.querySelector(`div[data-file-name="${songID}"]`);
		if (element) {
			const nameEl = element.querySelector(".song-name");
			if (nameEl) nameEl.textContent = newNameInput;
		}
	}

	customiseDiv.style.display = "none";
	document.getElementById("my-music").click();

	if (playingSongsID == customiseDiv.dataset.songID) document.getElementById("song-name").innerText = newNameInput;

	try {
		const updatedElement = await new Promise((resolve, reject) => {
			// TODO: Get rid of this
			// When the new box in the new menu gets initialised, this will run, aims to add "Playing" text on the playing song
			const timeout = 5000;
			const start = Date.now();
			const interval = setInterval(() => {
				if (element) {
					clearInterval(interval);
					resolve(element);
				} else if (Date.now() - start > timeout) {
					clearInterval(interval);
					reject(new Error("Element not found in time"));
				}
			}, 50);
		});

		if (newNameInput == removeExtensions(playingSongsID)) {
			updatedElement.classList.add("playing");
			if (songID.includes("tarator")) document.getElementById("videothumbnailbox").style.backgroundImage = `url("${thumbnailPath}?t=${Date.now()}")`;
		}

		const nameEl = updatedElement.querySelector(".song-name");
		if (nameEl) nameEl.textContent = newNameInput;

		if (songID.includes("tarator")) {
			const bgEl = updatedElement.querySelector(".background-element");
			if (bgEl) bgEl.style.backgroundImage = `url("${thumbnailPath}?t=${Date.now()}")`;
		}
	} catch (err) {
		console.log(err);
	}
}

async function removeSong(fileToDelete) {
	if (!(await confirmModal("Delete this song?", "Delete", "Keep"))) return;

	const row = musicsDb.prepare("SELECT song_extension, thumbnail_extension FROM songs WHERE song_id = ?").get(fileToDelete);

	const musicFilePath = path.join(musicFolder, fileToDelete + "." + row.song_extension);
	const thumbnailFilePath = path.join(thumbnailFolder, fileToDelete + "." + row.thumbnailExtension);

	if (fs.existsSync(musicFilePath)) fs.unlinkSync(musicFilePath);
	if (fs.existsSync(thumbnailFilePath)) fs.unlinkSync(thumbnailFilePath);

	const playlists = playlistsDb.prepare("SELECT * FROM playlists WHERE JSON_EXTRACT(songs, '$') LIKE ?").all(`%${fileToDelete}%`);

	playlists.forEach(playlist => {
		const songs = JSON.parse(playlist.songs);
		const updatedSongs = songs.filter(song => song != fileToDelete);
		playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE id = ?").run(JSON.stringify(updatedSongs), playlist.id);
	});

	musicsDb.prepare("DELETE FROM songs WHERE song_id = ?").run(fileToDelete);
	songNameCache.delete(fileToDelete);

	closeModal();
	document.getElementById("customiseModal").style.display = "none";
	const divToRemove = document.querySelector(`div[alt="${fileToDelete}.${row.song_extension}"]`);
	if (divToRemove) divToRemove.remove();
	if (document.getElementById("my-music-content").style.display == "block") renderMusics();
}

async function updateThumbnailImage(event, mode) {
	try {
		const file = event.target.files[0];
		const reader = new FileReader();
		reader.onload = e => {
			if (typeof mode == "number") {
				const id = mode == 1 ? "customiseImage" : mode == 2 ? "editPlaylistThumbnail" : mode == 3 ? "thumbnailImage" : null;
				if (id) document.getElementById(id).src = e.target.result;
			} else if (mode instanceof HTMLElement) {
				mode.style.backgroundImage = `url(${e.target.result})`;
			}
		};
		reader.readAsDataURL(file);
	} catch (error) {
		await alertModal("Error changing thumbnail:", error);
	}
}

function searchSong() {
	try {
		const stmt = musicsDb.prepare(`
            SELECT song_id
            FROM songs
            WHERE song_name LIKE ? COLLATE NOCASE
            ORDER BY LENGTH(song_name)
            LIMIT 1
        `);

		const row = stmt.get(`%${searchModalInput.value}%`);
		searchModalInput.value = "";
		searchModalInput.classList.add("red-placeholder");
		searchModalInput.placeholder = "Song not found.";
		playMusic(row.song_id, null);
		document.getElementById("searchModal").style.display = "none";
	} catch {
		// To prevent console errors
	}
}

function playLastPlaylist() {
	const lastPlaylistId = localStorage.getItem("lastPlaylist");
	playPlaylist(playlistsMap.get(lastPlaylistId), 0);
}

document.querySelectorAll('input[type="range"]').forEach(range => {
	range.tabIndex = -1;
	range.addEventListener("focus", () => range.blur());
	range.addEventListener(
		"keydown",
		e => {
			e.preventDefault();
			e.stopImmediatePropagation();
		},
		true,
	);
});

document.addEventListener("keydown", event => {
	if (event.key == "Escape") closeModal();
	if (event.key == "Tab") event.preventDefault();
	if (event.key == "Enter" && document.getElementById("downloadModal").style.display == "block") return loadNewPage("download");
	if (event.key == "Enter" && document.activeElement == document.getElementById("music-search") && musicMode != "offline") searchYoutubeInMusics();
	if (event.key == "Enter" && document.getElementById("searchModal").style.display == "flex") return searchSong();

	if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA" || disableKeyPresses == 1) {
		return;
	}

	if (event.key == key_Rewind) {
		skipBackward();
	} else if (event.key == key_Previous) {
		playPreviousSong();
	} else if (event.key == key_PlayPause) {
		playPause();
	} else if (event.key == key_Next) {
		playNextSong();
	} else if (event.key == key_Skip) {
		skipForward();
	} else if (event.key == key_Autoplay) {
		toggleAutoplay();
	} else if (event.key == key_Shuffle) {
		toggleShuffle();
	} else if (event.key == key_Mute) {
		mute();
	} else if (event.key == key_Speed) {
		document.getElementById("speedModal").style.display == "block" ? closeModal() : speed();
	} else if (event.key == key_Loop) {
		toggleLoop();
	} else if (event.key == key_searchSong) {
		event.preventDefault();
		searchModalInput.classList.remove("red-placeholder");
		searchModalInput.placeholder = "Type a song name, and press Enter";
		document.getElementById("searchModal").style.display = "flex";
		document.getElementById("searchModalInput").focus();
	} else if (event.key == key_randomSong) {
		randomSongFunctionMainMenu();
	} else if (event.key == key_randomPlaylist) {
		randomPlaylistFunctionMainMenu();
	} else if (event.key == key_lastPlaylist) {
		playLastPlaylist();
	}
});

function setupLazyBackgrounds() {
	const bgElements = document.querySelectorAll(".background-element[data-bg]");
	const vh = window.innerHeight;
	const margin = `${4 * vh}px 0px`;

	if ("IntersectionObserver" in window) {
		const observer = new IntersectionObserver(
			(entries, obs) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						const el = entry.target;
						const realBg = el.dataset.bg;
						if (realBg) {
							const img = new Image();
							img.onload = () => {
								el.style.backgroundImage = `url('${realBg}')`;
								el.classList.add("loaded-bg");
								obs.unobserve(el);
							};
							img.src = realBg;
						}
					}
				});
			},
			{
				rootMargin: margin,
			},
		);

		bgElements.forEach(el => observer.observe(el));
	} else {
		bgElements.forEach(el => {
			const bg = el.dataset.bg;
			if (bg) {
				el.style.backgroundImage = `url('${bg}')`;
				el.classList.add("loaded-bg");
			}
		});
	}
}

function handleDropdownChange(option, selectElement) {
	const selectedValue = Number(selectElement.value);
	console.log("Selected:", selectedValue, "at", option);
	updateDatabase(option, selectedValue, settingsDb, "settings");
	dividevolume = selectedValue;
	if (audioPlayer) audioPlayer.stdin.write(`volume ${volumeControl.value / 100 / dividevolume}\n`);
}

function getSongNameById(songId) {
	const stmt = musicsDb.prepare("SELECT song_name FROM songs WHERE song_id = ?");
	const row = stmt.get(songId);
	return row ? row.song_name : null;
}

function bottomRightFunctions(input) {
	if (!playingSongsID) return;
	if (input == "addToPlaylist") {
		openAddToPlaylistModal(playingSongsID);
	} else if (input == "addToFavorites") {
		let songs = [];

		const fav = playlistsDb.prepare("SELECT songs FROM playlists WHERE id = ?").get("Favorites");
		if (fav && fav.songs) songs = JSON.parse(fav.songs);

		if (!songs.includes(playingSongsID)) {
			songs.push(playingSongsID);
			playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE id = ?").run(JSON.stringify(songs), "Favorites");

			if (getComputedStyle(document.getElementById("playlists-content")).display == "grid") getPlaylists(true);
			addToFavoritesButtonBottomRight.style.color = "red";
		}
	} else if (input == "customise") {
		opencustomiseModal(playingSongsID);
	}
}

async function saveUserProgress() {
	if (songPauseStartTime) totalPausedTime += Math.floor(Date.now() / 1000 - songPauseStartTime);

	if (songStartTime && Math.floor(Date.now() / 1000) - songStartTime - totalPausedTime >= 1) {
		const theId = removeExtensions(playingSongsID).replace("tarator", "").replace("-", "");
		const currentTimeUnix = Math.floor(Date.now() / 1000 - totalPausedTime);
		const playlist = currentPlaylist ? currentPlaylist.id.replace("tarator-", "") : null;

		musicsDb.prepare("INSERT INTO timers (song_id, start_time, end_time, playlist) VALUES (?, ?, ?, ?)").run(theId, songStartTime, currentTimeUnix, playlist);
		console.log(`New listen data: ${theId} --> ${songStartTime} - ${currentTimeUnix}, ${currentTimeUnix - songStartTime} seconds. Playlist: ${playlist}`);
	}

	songStartTime = Math.floor(Date.now() / 1000);
	songPauseStartTime = null;
	totalPausedTime = 0;
}

async function stabiliseThisSong(songId) {
	const stmt = musicsDb.prepare("SELECT song_name, song_extension, stabilised FROM songs WHERE song_id = ?").get(songId);
	if (stmt.stabilised == 1) return await alertModal("You have this song already stabilised.");
	document.getElementById("stabiliseSongButton").disabled = true;
	await normalizeAudio(path.join(musicFolder, songId + "." + stmt.song_extension));
	musicsDb.prepare("UPDATE songs SET stabilised = 1 WHERE song_id = ?").run(songId);
	await alertModal(`Song "${stmt.song_name}" successfully stabilised.`);
	document.getElementById("stabiliseSongButton").disabled = false;
}

function getInterpolatedPosition() {
	if (!isInterpolating || lastSyncTimestamp == 0) return lastAuthoritativePosition;
	const elapsed = (performance.now() - lastSyncTimestamp) / 1000;
	return lastAuthoritativePosition + elapsed;
}

function tick() {
	if (!isUserSeeking && songDuration > 0) {
		const pos = getInterpolatedPosition();
		const clamped = Math.min(pos, songDuration);
		videoLength.textContent = `${formatTime(clamped)} / ${formatTime(songDuration)}`;
		videoProgress.value = (clamped / songDuration) * 100;
		if (player && playingSongsID) player.getPosition = () => Math.floor(clamped * 1e6);
	}

	requestAnimationFrame(tick);
}

document.addEventListener("DOMContentLoaded", function () {
	initialiseSettingsDatabase();
	initialiseMusicsDatabase();
	initialisePlaylistsDatabase();

	ipcRenderer.send("renderer-domready");

	if (platform == "linux") loadJSFile("mpris");

	const divideVolumeSelect = document.getElementById("dividevolume");
	for (let i = 0; i < divideVolumeSelect.options.length; i++) {
		if (divideVolumeSelect.options[i].value == dividevolume) {
			divideVolumeSelect.selectedIndex = i;
			break;
		}
	}

	document.getElementById("picker").addEventListener("input", color => {
		changeBackground(color.target.value);
	});

	document.getElementById("stabiliseVolumeToggle").checked = stabiliseVolumeToggle == 1 ? true : false;
	document.getElementById("recommendationsToggle").checked = recommendationsAfterDownload == 1 ? true : false;
	document.getElementById("removeSongButton").addEventListener("click", e => removeSong(e.currentTarget.dataset.songId));
	document.getElementById("stabiliseSongButton").addEventListener("click", e => stabiliseThisSong(e.currentTarget.dataset.songId));
	document.getElementById("downloadThisSong").addEventListener("click", e => loadNewPage("downloadStreamedSong", e.currentTarget.dataset.songId));
	document.getElementById("notInterestedToggle").addEventListener("click", e => {
		if (!!notInterestedSongs.map(song => song.song_id).includes(e.currentTarget.dataset.songId)) {
			notInterestedSongs = notInterestedSongs.filter(s => s.song_id != e.currentTarget.dataset.songId);
			document.getElementById("notInterestedToggle").innerText = "Interested";
		} else {
			notInterestedSongs.push({ song_id: e.currentTarget.dataset.songId });
			musicsDb.prepare("INSERT INTO not_interested (song_id, song_name) VALUES (?, ?)").run(e.currentTarget.dataset.songId, document.getElementById("customiseSongName").value);
			document.getElementById("notInterestedToggle").innerText = " Not Interested";
		}
	});

	document.querySelectorAll("[data-tooltip]").forEach(el => {
		el.addEventListener("mouseenter", e => {
			timeoutId = setTimeout(() => {
				tooltip.textContent = el.dataset.tooltip;
				tooltip.style.display = "block";
				tooltip.style.left = e.pageX + "px";
				tooltip.style.top = e.pageY + "px";
			}, 1000);
		});
		el.addEventListener("mousemove", e => {
			tooltip.style.left = e.pageX + 5 + "px";
			tooltip.style.top = e.pageY + 5 + "px";
		});
		el.addEventListener("mouseleave", () => {
			clearTimeout(timeoutId);
			tooltip.style.display = "none";
		});
	});

	document.getElementById("debugButton").addEventListener("click", () => {
		ipcRenderer.send("debug-mode");
	});

	document.getElementById("version").addEventListener("click", () => {
		document.getElementById("updateModal").style.display = "block";
	});

	document.getElementById("installBtn").addEventListener("click", () => {
		if (platform == "win32" || platform == "darwin") {
			window.open("https://github.com/Victiniiiii/TaratorMusic/releases/latest", "_blank");
			return;
		}

		document.getElementById("progressContainer").style.display = "block";
		document.getElementById("installBtn").disabled = true;
		ipcRenderer.send("download-update");
	});

	startupCheck();

	audioPlayer = spawn(path.join(backendFolder, "player"), [], { stdio: ["pipe", "pipe", "pipe"] });
	audioPlayer.stdout.on("data", data => {
		const lines = data.toString().split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			if (trimmed.startsWith("EV_POSITION ")) {
				const pos = parseFloat(trimmed.slice(12));
				if (!Number.isNaN(pos) && !isUserSeeking) {
					lastAuthoritativePosition = pos;
					lastSyncTimestamp = performance.now();
					isInterpolating = true;
				}
			} else if (trimmed == "EV_ENDED") {
				isInterpolating = false;
				if (isAutoplayActive) {
					playNextSong();
				} else {
					playButton.style.display = "inline-block";
					pauseButton.style.display = "none";
					if (playingSongsID) songPauseStartTime = Math.floor(Date.now() / 1000);
					if (player) player.playbackStatus = "Paused";
					playing = false;
				}
			} else if (trimmed == "EV_PAUSED") {
				isInterpolating = false;
				playButton.style.display = "inline-block";
				pauseButton.style.display = "none";
				playing = false;
			} else if (trimmed == "EV_RESUMED") {
				lastSyncTimestamp = performance.now();
				isInterpolating = true;
				playButton.style.display = "none";
				pauseButton.style.display = "inline-block";
				playing = true;
			}

			updateDiscordPresence();
		}
	});

	requestAnimationFrame(tick);

	volumeControl.addEventListener("input", () => {
		volume = volumeControl.value / 100 / dividevolume;
		if (audioPlayer) audioPlayer.stdin.write(`volume ${volume}\n`);
		document.getElementById("muteButton").innerHTML = `<img src="${path.join(appThumbnailFolder, `mute_o${volume == 0 ? "ff" : "n"}.svg`)}" alt="Mute ${volume == 0 ? "A" : "Dea"}ctive">`;
		updateDatabase("volume", volumeControl.value, settingsDb, "settings");
	});

	playButton.addEventListener("click", () => {
		playPause();
	});

	pauseButton.addEventListener("click", () => {
		playPause();
	});

	videoProgress.addEventListener("mousedown", () => {
		isUserSeeking = true;
	});

	videoProgress.addEventListener("mouseup", () => {
		isUserSeeking = false;
	});

	videoProgress.addEventListener("input", () => {
		if (!isUserSeeking) return;
		const seekPercent = parseFloat(videoProgress.value);
		if (!Number.isNaN(seekPercent) && audioPlayer && songDuration > 0) {
			const seekTime = (songDuration * seekPercent) / 100;
			lastAuthoritativePosition = seekTime;
			lastSyncTimestamp = performance.now();
			audioPlayer.stdin.write(`seek ${seekTime}\n`);
		}
	});

	window.addEventListener("resize", () => {
		if (document.getElementById("music-list-container")) {
			if (previousItemsPerRow != Math.floor((content.offsetWidth - 53) / 205)) {
				renderMusics();
			}
			previousItemsPerRow = Math.floor((content.offsetWidth - 53) / 205);
		}

		document.querySelectorAll(".hourChart").forEach(chart => {
			chart.width = window.innerWidth * 0.7;
			chart.height = window.innerWidth * 0.0525;
		});
	});

	previousItemsPerRow = Math.floor((content.offsetWidth - 53) / 205);
	getPlaylists(false);
});
