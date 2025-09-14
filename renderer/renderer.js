// renderer.js

const { ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { spawn } = require("child_process");

let taratorFolder, musicFolder, thumbnailFolder, appThumbnailFolder, databasesFolder, backendFolder;
let settingsDbPath, playlistsDbPath, musicsDbPath;
let settingsDb, playlistsDb, musicsDb;

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
})();

const tabs = document.querySelectorAll(".sidebar div");
const playButton = document.getElementById("playButton");
const pauseButton = document.getElementById("pauseButton");
const tooltip = document.getElementById("tooltip");
const volumeControl = document.getElementById("volume");
const videoLength = document.getElementById("video-length");
const videoProgress = document.getElementById("video-progress");
const searchModalInput = document.getElementById("searchModalInput");

volumeControl.addEventListener("change", () => {
	updateDatabase("volume", volumeControl.value, settingsDb, "settings");
	if (audioElement) audioElement.volume = volumeControl.value / 100 / dividevolume;
});

let currentPlayingElement = null;
let audioElement = null;
let secondfilename = "";
let currentPlaylist = null;
let currentPlaylistElement = null;
let playlistPlayedSongs = [];
let isShuffleActive = false;
let isAutoplayActive = false;
let isLooping = false;
let playedSongs = [];
let newPlaylistID = null;
let disableKeyPresses = 0;
let songStartTime = null;
let songPauseStartTime = null;
let totalPausedTime = 0;
let previousVolume = null;
let timeoutId = null;
let audioContext;
let audioSource;
let searchedSongsUrl;
let downloadingStyle;
let discordRPCstatus;
let discordDaemon = null;
const debounceMap = new Map();
const songNameCache = new Map();

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
let key_randomSong;
let key_randomPlaylist;
let dividevolume;
let displayCount;
let stabiliseVolumeToggle;
let current_version;

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
	key_randomSong: "1",
	key_randomPlaylist: "2",
	dividevolume: 1,
	displayCount: 4,
	background: "green",
	stabiliseVolumeToggle: 1,
	dc_rpc: 0,
	dc_bot: 0,
	dc_bot_token: null,
	dc_channel_id: null,
	dc_guild_id: null,
	current_version: null,
};

function initialiseSettingsDatabase() {
	let settingsRow;

	try {
		settingsDb
			.prepare(
				`CREATE TABLE IF NOT EXISTS statistics (
                    total_time_spent INTEGER,
                    app_install_date INTEGER,
                    first_song_listen_date INTEGER,
                    playlists_formed INTEGER,
                    songs_downloaded_youtube INTEGER,
                    songs_downloaded_spotify INTEGER
                )`
			)
			.run();

		const columns = Object.entries(defaultSettings)
			.map(([key, value]) => {
				const type = typeof value === "number" ? "INTEGER" : "TEXT";
				return `${key} ${type}`;
			})
			.join(", ");

		settingsDb.prepare(`CREATE TABLE IF NOT EXISTS settings (${columns})`).run();
		settingsRow = settingsDb.prepare("SELECT * FROM settings LIMIT 1").get();
		statsRow = settingsDb.prepare("SELECT * FROM statistics LIMIT 1").get();

		if (!settingsRow) {
			const columns = Object.keys(defaultSettings).join(", ");
			const placeholders = Object.keys(defaultSettings)
				.map(() => "?")
				.join(", ");
			settingsDb.prepare(`INSERT INTO settings (${columns}) VALUES (${placeholders})`).run(...Object.values(defaultSettings));
			settingsRow = defaultSettings;
		}

		if (!statsRow) {
			settingsDb.prepare(`INSERT INTO statistics (app_install_date) VALUES (?)`).run(Math.floor(Date.now() / 1000));
		} else if (!statsRow.app_install_date) {
			settingsDb.prepare(`UPDATE statistics SET app_install_date = ?`).run(Math.floor(Date.now() / 1000));
		}

		const tableInfo = settingsDb.prepare("PRAGMA table_info(settings)").all();
		const existingColumns = tableInfo.map(col => col.name);

		for (const [key, value] of Object.entries(defaultSettings)) {
			if (!existingColumns.includes(key)) {
				const type = typeof value === "number" ? "INTEGER" : "TEXT";
				const defaultVal = typeof value === "number" ? value : `'${value}'`;
				settingsDb.prepare(`ALTER TABLE settings ADD COLUMN ${key} ${type} DEFAULT ${defaultVal}`).run();
			}
		}

		if (existingColumns.length === 0) {
			const columns = Object.keys(defaultSettings).join(", ");
			const placeholders = Object.keys(defaultSettings)
				.map(() => "?")
				.join(", ");
			settingsDb.prepare(`INSERT INTO settings (${columns}) VALUES (${placeholders})`).run(...Object.values(defaultSettings));
		}
	} catch (err) {
		console.log("Database error:", err.message);
		return;
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
	document.getElementById("settingsRandomSong").innerHTML = settingsRow.key_randomSong;
	document.getElementById("settingsRandomPlaylist").innerHTML = settingsRow.key_randomPlaylist;

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
	key_randomSong = settingsRow.key_randomSong;
	key_randomPlaylist = settingsRow.key_randomPlaylist;
	rememberautoplay = settingsRow.rememberautoplay;
	remembershuffle = settingsRow.remembershuffle;
	rememberloop = settingsRow.rememberloop;
	rememberspeed = settingsRow.rememberspeed;
	volume = settingsRow.volume;
	dividevolume = settingsRow.dividevolume;
	displayCount = settingsRow.displayCount;
	stabiliseVolumeToggle = settingsRow.stabiliseVolumeToggle;
	current_version = settingsRow.current_version;
	document.body.className = `bg-gradient-${settingsRow.background}`;

	discordRPCstatus = settingsRow.dc_rpc == 1 ? true : false;
	discordRPCstatus ? sendCommandToDaemon("create") : updateDiscordStatus("disabled");
	document.getElementById("toggleSwitchDiscord").checked = discordRPCstatus;

	const icons = {
		backwardButton: "backward.svg",
		previousSongButton: "previous.svg",
		playButton: "play.svg",
		pauseButton: "pause.svg",
		nextSongButton: "next.svg",
		forwardButton: "forward.svg",
		autoplayButton: "redAutoplay.svg",
		shuffleButton: "redShuffle.svg",
		muteButton: "mute.svg",
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

	volumeControl.value = volume;
	if (audioElement) audioElement.volume = volumeControl.value / 100 / dividevolume;

	setupLazyBackgrounds();
	document.getElementById("main-menu").click();

	ipcRenderer.invoke("get-app-version").then(async version => {
		if (version != current_version || current_version == undefined) await loadNewPage(`legacy`, current_version);
		current_version = version;
		updateDatabase("current_version", current_version, settingsDb, "settings");
		document.getElementById("version").textContent = `Version: ${version}`;
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
			`CREATE TABLE IF NOT EXISTS timers (
            song_id TEXT,
            start_time INTEGER,
            end_time INTEGER
            playlist TEXT
        )`
		)
		.run();

	musicsDb
		.prepare(
			`CREATE TABLE IF NOT EXISTS songs (
            ${requiredColumns.map(c => `${c.name} ${c.type}`).join(", ")}
        )`
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
		`
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
        `
		)
		.run();
}, 60000);

async function savePlayedTime() {
	const theId = removeExtensions(secondfilename).replace("tarator", "").replace("-", "");
	const currentTimeUnix = Math.floor(Date.now() / 1000 - totalPausedTime);
	const playlist = currentPlaylist ? currentPlaylist.id.replace("tarator-", "") : null;

	musicsDb.prepare("INSERT INTO timers (song_id, start_time, end_time, playlist) VALUES (?, ?, ?, ?)").run(theId, songStartTime, currentTimeUnix, playlist);
	console.log(`New listen data: ${theId} --> ${songStartTime} - ${currentTimeUnix}, ${currentTimeUnix - songStartTime} seconds. Playlist: ${playlist}`);
}

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
					document.getElementById("my-music-content").style.display = "block";
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
	if (!songNameCache.has(songId)) songNameCache.set(songId, getSongNameById(songId));
	return songNameCache.get(songId) || "";
}

async function myMusicOnClick() {
	const myMusicContent = document.getElementById("my-music-content");
	myMusicContent.innerHTML = "";

	const controlsBar = document.createElement("div");
	controlsBar.id = "controlsBar";

	const musicSearchInput = document.createElement("input");
	musicSearchInput.type = "text";
	musicSearchInput.id = "music-search";
	musicSearchInput.placeholder = `Search in ${taratorFolder}...`;

	const displayCountSelect = document.createElement("select");
	displayCountSelect.id = "display-count";

	const availableRowCounts = [0, 1, 2, 3, 4, 6, 8, 16, "All"];
	availableRowCounts.forEach(rowCount => {
		const optionElement = document.createElement("option");
		optionElement.value = rowCount;
		optionElement.innerText = rowCount == "All" ? "Show All" : `Show ${rowCount} Row${rowCount == 1 ? "" : "s"}`;
		if (rowCount == displayCount || (displayCount == 9999999 && rowCount == "All")) optionElement.selected = true;
		displayCountSelect.appendChild(optionElement);
	});

	displayCountSelect.onchange = () => handleDropdownChange("displayCount", displayCountSelect);

	const songRows = musicsDb.prepare("SELECT song_id, song_length, song_extension FROM songs").all();
	const songCountElement = document.createElement("div");
	songCountElement.id = "songCountElement";
	songCountElement.innerText = `${songRows.length} songs.`;

	controlsBar.appendChild(musicSearchInput);
	controlsBar.appendChild(songCountElement);
	controlsBar.appendChild(displayCountSelect);
	myMusicContent.appendChild(controlsBar);

	const musicListContainer = document.createElement("div");
	musicListContainer.id = "music-list-container";
	musicListContainer.className = "scrollArea";

	myMusicContent.appendChild(musicListContainer);

	const musicFiles = songRows
		.map(databaseRow => ({
			id: databaseRow.song_id,
			name: `${databaseRow.song_id}.${databaseRow.song_extension}`,
			thumbnail: `file://${databaseRow.id + databaseRow.thumbnail_extension}`,
			length: databaseRow.song_length || 0,
		}))
		.sort((songA, songB) => getSongNameCached(songA.id).toLowerCase().localeCompare(getSongNameCached(songB.id).toLowerCase()));

	let filteredSongs = [...musicFiles];
	let previousItemsPerRow = null;
	let resizeTimeoutId = null;

	function renderSongs() {
		filteredSongs = musicFiles.filter(songFile => getSongNameCached(songFile.id).toLowerCase().includes(musicSearchInput.value.trim().toLowerCase()));
		musicListContainer.innerHTML = "";
		const maxVisible = displayCount == "All" ? filteredSongs.length : parseInt(displayCount * previousItemsPerRow);
		filteredSongs.slice(0, maxVisible).forEach(songFile => {
			const musicElement = createMusicElement(songFile);
			if (songFile.id == removeExtensions(secondfilename)) musicElement.classList.add("playing");
			musicElement.addEventListener("click", () => playMusic(songFile.id, null));
			musicListContainer.appendChild(musicElement);
		});
		setupLazyBackgrounds();
	}

	function recalculateItemsPerRow() {
		const contentWidth = document.getElementById("content").offsetWidth;
		const newItemsPerRow = Math.floor((contentWidth - 53) / 205);
		if (newItemsPerRow !== previousItemsPerRow) {
			previousItemsPerRow = newItemsPerRow;
			renderSongs();
		}
	}

	window.addEventListener("resize", () => {
		clearTimeout(resizeTimeoutId);
		resizeTimeoutId = setTimeout(recalculateItemsPerRow, 250);
	});

	musicSearchInput.addEventListener("input", renderSongs);
	displayCountSelect.addEventListener("change", () => {
		displayCount = displayCountSelect.value;
		renderSongs();
	});

	recalculateItemsPerRow();
}

function createMusicElement(songFile) {
	const musicElement = document.createElement("div");
	musicElement.classList.add("music-item");
	musicElement.setAttribute("alt", songFile.name);
	musicElement.setAttribute("data-file-name", songFile.name);

	const fileNameWithoutExtension = path.parse(songFile.name).name;
	const row = musicsDb.prepare("SELECT thumbnail_extension FROM songs WHERE song_id = ?").get(fileNameWithoutExtension);

	const thumbnailFileName = `${fileNameWithoutExtension}.${row.thumbnail_extension}`;
	const thumbnailPath = path.join(thumbnailFolder, thumbnailFileName.replace(/%20/g, " "));

	if (fs.existsSync(thumbnailPath)) {
		const backgroundElement = document.createElement("div");
		backgroundElement.classList.add("background-element");
		backgroundElement.dataset.bg = `file://${thumbnailPath.replace(/\\/g, "/")}?t=${Date.now()}`;
		musicElement.appendChild(backgroundElement);
	}

	const songNameElement = document.createElement("div");
	songNameElement.classList.add("song-name");
	songNameElement.innerText = getSongNameCached(fileNameWithoutExtension);

	const songLengthElement = document.createElement("div");
	songLengthElement.classList.add("song-length");
	songLengthElement.innerText = formatTime(songFile.length);

	const customiseButtonElement = document.createElement("button");

	customiseButtonElement.classList.add("customise-button");
	customiseButtonElement.addEventListener("click", event => {
		event.stopPropagation();
		opencustomiseModal(songFile.name);
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

async function playMusic(file, playlistId) {
	await saveUserProgress();

	if (audioElement) {
		audioElement.pause();
		audioElement.src = "";
		if (audioSource) {
			audioSource.disconnect();
		}
	} else {
		initStaticControls();
	}

	try {
		const songName = document.getElementById("song-name");

		currentPlaylist = playlistId || null;

		audioElement = new Audio();
		manageAudioControls(audioElement);
		const row = musicsDb.prepare("SELECT song_extension, thumbnail_extension FROM songs WHERE song_id = ?").get(file);

		audioElement.addEventListener("loadedmetadata", () => {
			songDuration = audioElement.duration;
		});

		audioElement.controls = true;
		audioElement.autoplay = true;

		secondfilename = file;

		songName.textContent = getSongNameById(file);

		audioElement.src = `file://${path.join(musicFolder, secondfilename + "." + row.song_extension)}`;
		audioElement.volume = volumeControl.value / 100 / dividevolume;
		audioElement.playbackRate = rememberspeed;
		audioElement.loop = isLooping == true;
		document.querySelectorAll(".settingsMenuButtons").forEach(el => {
			el.style.color = "white";
		});

		if (!audioContext) audioContext = new AudioContext();

		audioSource = audioContext.createMediaElementSource(audioElement);
		audioSource.connect(audioContext.destination);

		await audioElement.play();
		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";

		const thumbnailPath = path.join(thumbnailFolder, `${file}.${row.thumbnail_extension}`.replace(/%20/g, " "));
		let thumbnailUrl = path.join(appThumbnailFolder, "placeholder.jpg".replace(/%20/g, " "));

		if (fs.existsSync(thumbnailPath)) {
			thumbnailUrl = `file://${thumbnailPath.replace(/\\/g, "/")}`;
		} else {
			console.log("Tried to get thumbnail from", thumbnailPath, "but failed. Used", thumbnailUrl, "instead.");
		}

		document.getElementById("videothumbnailbox").style.backgroundImage = `url('${thumbnailUrl}')`;

		document.querySelectorAll(".music-item.playing").forEach(el => el.classList.remove("playing"));
		document.querySelectorAll(".music-item").forEach(musicElement => {
			if (removeExtensions(musicElement.getAttribute("data-file-name")) == secondfilename) {
				musicElement.classList.add("playing");
			}
		});

		currentPlayingElement = songName;
		currentPlayingElement.setAttribute("data-file-name", secondfilename);
		updateDiscordPresence();

		if (isShuffleActive) {
			if (playlistId) {
				if (newPlaylistID != playlistId.id) {
					newPlaylistID = playlistId.id;
					playlistPlayedSongs.splice(0, 9999);
				}
				playlistPlayedSongs.unshift(secondfilename);
				if (playlistPlayedSongs.length > 9999) {
					playlistPlayedSongs.pop();
				}
			} else {
				playedSongs.unshift(secondfilename);
				if (playedSongs.length > 9999) {
					playedSongs.pop();
				}
			}
		}

		return new Promise(resolve => {
			audioElement.addEventListener(
				"ended",
				async () => {
					songDuration = 0;
					resolve();
				},
				{ once: true }
			);
		});
	} catch (error) {
		console.log("Error:", error);
	}
}

function initStaticControls() {
	volumeControl.addEventListener("input", () => {
		audioElement.volume = volumeControl.value / 100 / dividevolume;
	});

	playButton.addEventListener("click", () => {
		playPause("play");
	});

	pauseButton.addEventListener("click", () => {
		playPause("pause");
	});

	videoProgress.addEventListener("input", () => {
		const seekTime = (audioElement.duration * parseFloat(videoProgress.value)) / 100;
		if (Number.isFinite(seekTime)) {
			audioElement.currentTime = seekTime;
		}
	});
}

function manageAudioControls(audioElement) {
	audioElement.addEventListener("loadedmetadata", () => {
		videoProgress.value = 0;
		const duration = formatTime(audioElement.duration);
		videoLength.textContent = `00:00 / ${duration}`;
	});

	audioElement.addEventListener("timeupdate", () => {
		const currentTime = formatTime(audioElement.currentTime);
		const duration = formatTime(audioElement.duration);
		videoLength.textContent = `${currentTime} / ${duration}`;
		videoProgress.value = (audioElement.currentTime / audioElement.duration) * 100;
		updateDiscordPresence();
	});

	audioElement.addEventListener("ended", () => {
		pauseButton.style.display = "none";
		playButton.style.display = "inline-block";
		if (isAutoplayActive) {
			playNextSong();
		}
	});
}

async function playPlaylist(playlist, startingIndex = 0) {
	if (!playlist.songs || playlist.songs.length == 0) {
		console.log(`Playlist ${playlist.name} is empty.`);
		return;
	}

	for (let i = startingIndex; i < playlist.songs.length; i++) {
		currentPlaylistElement = i;
		await playMusic(playlist.songs[i], playlist);
		if (!isAutoplayActive) {
			break;
		}
		if (isShuffleActive) {
			await playNextSong();
			break;
		}
	}
}

async function playPreviousSong() {
	if (!currentPlayingElement) return;

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
			const parts = audioElement.src.split("/");
			const currentFileName = removeExtensions(parts[parts.length - 1]);

			const currentIndex = sortedSongIds.indexOf(currentFileName);
			if (currentIndex == -1) {
				return;
			}

			const previousIndex = currentIndex > 0 ? currentIndex - 1 : sortedSongIds.length - 1;

			playMusic(sortedSongIds[previousIndex], null);
		}
	}
}

async function playNextSong() {
	if (!currentPlayingElement) return;

	const allMusics = musicsDb.prepare("SELECT song_id, song_name FROM songs").all();
	const songMap = new Map();
	allMusics.forEach(song => songMap.set(song.song_id, song.song_name));

	const sortedEntries = [...songMap.entries()].sort((a, b) => {
		const nameA = a[1] || "";
		const nameB = b[1] || "";
		return nameA.localeCompare(nameB);
	});
	const sortedSongIds = sortedEntries.map(entry => entry[0]);

	let nextSongId;

	if (isShuffleActive) {
		if (currentPlaylist) {
			const currentSongId = currentPlaylist.songs[currentPlaylistElement];
			if (currentPlaylist.songs.length == 1) {
				nextSongId = currentSongId;
			} else {
				let randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);
				while (currentPlaylist.songs[randomIndex] == currentSongId) {
					randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);
				}
				nextSongId = currentPlaylist.songs[randomIndex];
				currentPlaylistElement = randomIndex;
			}
		} else {
			const parts = audioElement.src.split("/");
			const currentFileName = removeExtensions(parts[parts.length - 1]);
			if (sortedSongIds.length == 1) {
				nextSongId = currentFileName;
			} else {
				let randomIndex = Math.floor(Math.random() * sortedSongIds.length);
				while (sortedSongIds[randomIndex] == currentFileName) {
					randomIndex = Math.floor(Math.random() * sortedSongIds.length);
				}
				nextSongId = sortedSongIds[randomIndex];
			}
		}
	} else {
		if (currentPlaylist) {
			if (currentPlaylistElement < currentPlaylist.songs.length - 1) {
				nextSongId = currentPlaylist.songs[++currentPlaylistElement];
			}
		} else {
			const parts = audioElement.src.split("/");
			const currentFileName = removeExtensions(parts[parts.length - 1]);
			const currentIndex = sortedSongIds.indexOf(currentFileName);
			const nextIndex = currentIndex < sortedSongIds.length - 1 ? currentIndex + 1 : 0;
			nextSongId = sortedSongIds[nextIndex];
		}
	}

	if (nextSongId) {
		playMusic(nextSongId, !!currentPlaylist);
	}
}

async function randomSongFunctionMainMenu() {
	const musicItems = musicsDb.prepare("SELECT song_id, song_name FROM songs").all();
	let randomIndex = Math.floor(Math.random() * musicItems.length);

	if (currentPlayingElement) {
		while (removeExtensions(musicItems[randomIndex].song_name) == document.getElementById("song-name").innerText) {
			randomIndex = Math.floor(Math.random() * musicItems.length);
		}
	}

	playMusic(musicItems[randomIndex].song_id, null);
}

async function randomPlaylistFunctionMainMenu() {
	const playlists = playlistsDb.prepare("SELECT id, name, songs FROM playlists").all();

	const nonEmptyPlaylists = playlists
		.map(pl => ({
			...pl,
			songs: JSON.parse(pl.songs),
		}))
		.filter(pl => Array.isArray(pl.songs) && pl.songs.length > 0);

	if (nonEmptyPlaylists.length == 0) {
		console.log("No playlists with songs found.");
		return;
	}

	const availablePlaylists = currentPlaylist ? nonEmptyPlaylists.filter(pl => pl.id !== currentPlaylist.id) : nonEmptyPlaylists;

	if (availablePlaylists.length == 0) {
		console.log("No other playlists available to play.");
		return;
	}

	const randomIndex = Math.floor(Math.random() * availablePlaylists.length);
	const selectedPlaylist = availablePlaylists[randomIndex];

	await playPlaylist(selectedPlaylist, 0);
}

function playPause(status) {
	if (status == "play") {
		audioElement.play();
		totalPausedTime += songPauseStartTime - Math.floor(Date.now() / 1000);
		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";
	} else {
		audioElement.pause();
		songPauseStartTime = Math.floor(Date.now() / 1000);
		pauseButton.style.display = "none";
		playButton.style.display = "inline-block";
	}

	updateDiscordPresence();
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

	if (audioElement) audioElement.loop = isLooping;
}

function mute() {
	if (volumeControl.value != 0) {
		previousVolume = volumeControl.value;
		volumeControl.value = 0;
		document.getElementById("muteButton").classList.add("active");
	} else {
		volumeControl.value = previousVolume;
		document.getElementById("muteButton").classList.remove("active");
	}
	if (audioElement) audioElement.volume = volumeControl.value / 100 / dividevolume;
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
			if (audioElement) {
				audioElement.playbackRate = rememberspeed;
			}
			closeModal();
		});
		document.getElementById("speedOptions").appendChild(speedOption);
	});
}

function skipForward() {
	if (audioElement) {
		audioElement.currentTime = Math.min(audioElement.currentTime + 5, audioElement.duration);
	}
}

function skipBackward() {
	if (audioElement) {
		audioElement.currentTime = Math.max(audioElement.currentTime - 5, 0);
	}
}

async function updateThumbnailImage(event, mode) {
	const file = event.target.files[0];
	if (file && file.type == "image/jpeg") {
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
	} else {
		await alertModal("Please select a valid JPG image.");
	}
}

function opencustomiseModal(songName) {
	const songNameNoMp3 = removeExtensions(songName);
	const baseName = getSongNameById(songNameNoMp3);
	document.getElementById("removeSongButton").dataset.songId = songNameNoMp3;

	const stmt = musicsDb.prepare(`
		SELECT stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension
		FROM songs
		WHERE song_id = ?
	`);

	const { stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension } = stmt.get(songNameNoMp3);

	const oldThumbnailPath = path.join(thumbnailFolder, songNameNoMp3 + "." + thumbnail_extension);

	document.getElementById("customiseSongName").value = baseName;
	document.getElementById("customiseImage").src = path.join(thumbnailFolder, baseName + "." + thumbnail_extension);
	document.getElementById("customiseModal").style.display = "block";
	document.getElementById("customiseSongName").value = baseName;
	document.getElementById("customiseImage").src = oldThumbnailPath;

	document.getElementById("modalStabilised").innerText = `Song Sound Stabilised: ${stabilised == 1}`;
	document.getElementById("modalFileSize").innerText = `File Size: ${(size / 1048576).toFixed(2)} MBs`;
	document.getElementById("modalPlaySpeed").innerText = `Play Speed: Coming Soon!`;
	document.getElementById("modalBass").innerText = `Bass: Coming Soon!`;
	document.getElementById("modalTreble").innerText = `Treble: Coming Soon!`;
	document.getElementById("modalMidrange").innerText = `Midrange: Coming Soon!`;
	document.getElementById("modalVolume").innerText = `Volume: Coming Soon!`;

	const customiseDiv = document.getElementById("customiseModal");
	customiseDiv.dataset.oldSongName = baseName;
	customiseDiv.dataset.oldThumbnailPath = oldThumbnailPath;
	customiseDiv.dataset.songID = songName;
}

async function saveEditedSong() {
	const customiseDiv = document.getElementById("customiseModal");
	const songID = removeExtensions(customiseDiv.dataset.songID);

	const newNameInput = document.getElementById("customiseSongName").value.trim();

	if (newNameInput.length < 1) {
		await alertModal("Please do not set a song name empty.");
		return;
	}

	const row = musicsDb.prepare("SELECT song_extension, thumbnail_extension FROM songs WHERE song_id = ?").get(songID);

	const thumbnailPath = path.join(thumbnailFolder, `${songID}.${row.thumbnail_extension}`);
	const oldName = customiseDiv.dataset.oldSongName;

	const newThumbFile = document.getElementById("customiseThumbnail").files[0];
	let reloadSrc = `${thumbnailPath}?t=${Date.now()}`;

	if (newThumbFile) {
		const data = fs.readFileSync(newThumbFile.path);
		fs.writeFileSync(thumbnailPath, data);
	}

	musicsDb.prepare("UPDATE songs SET song_name = ? WHERE song_id = ?").run(newNameInput, songID);

	document.getElementById("customiseModal").style.display = "none";
	document.getElementById("my-music").click();

	if (secondfilename == customiseDiv.dataset.songID) {
		document.getElementById("song-name").innerText = newNameInput;
		document.getElementById("videothumbnailbox").style.backgroundImage = `url("${reloadSrc}")`;
	}

	new Promise((resolve, reject) => {
		// When the new box in the new menu gets initialised, this will run, aims to add "Playing" text on the playing song
		const timeout = 5000;
		const start = Date.now();
		const interval = setInterval(() => {
			const el = document.querySelector(`.music-item[data-file-name="${songID + "." + row.song_extension}"]`);
			if (el) {
				clearInterval(interval);
				resolve(el);
			} else if (Date.now() - start > timeout) {
				clearInterval(interval);
				reject("Element not found in time");
			}
		}, 50);
	})
		.then(el => {
			if (newNameInput == removeExtensions(secondfilename)) el.classList.add("playing");
			el.querySelector(".song-name").textContent = newNameInput;
			el.querySelector(".background-element").style.backgroundImage = `url("${reloadSrc}")`;
		})
		.catch(console.log);
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
		const updatedSongs = songs.filter(song => song !== fileToDelete);
		playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE id = ?").run(JSON.stringify(updatedSongs), playlist.id);
	});

	musicsDb.prepare("DELETE FROM songs WHERE song_id = ?").run(fileToDelete);

	closeModal();
	document.getElementById("customiseModal").style.display = "none";
	const divToRemove = document.querySelector(`div[alt="${fileToDelete}.${row.song_extension}"]`);
	if (divToRemove) divToRemove.remove();
	if (document.getElementById("my-music-content").style.display == "block") await myMusicOnClick();
}

function searchSong() {
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
		true
	);
});

document.addEventListener("keydown", event => {
	if (event.key === "Escape") closeModal();
	if (event.key == "Tab") event.preventDefault();
	if (event.key == "Enter" && document.getElementById("downloadModal").style.display != "none") loadNewPage("download");
	if (event.key == "Enter" && document.getElementById("searchModal").style.display != "none") searchSong();

	if (event.ctrlKey && event.key.toLowerCase() === "f") {
		event.preventDefault();
		searchModalInput.classList.remove("red-placeholder");
		searchModalInput.placeholder = "Type a song name, and press Enter";
		document.getElementById("searchModal").style.display = "flex";
		document.getElementById("searchModalInput").focus();
		return;
	}

	if (document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA" || disableKeyPresses == 1) {
		return;
	}

	if (event.key == key_Rewind) {
		skipBackward();
	} else if (event.key == key_Previous) {
		playPreviousSong();
	} else if (event.key == key_PlayPause) {
		if (audioElement.paused) {
			playPause("play");
		} else {
			playPause("pause");
		}
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
	} else if (event.key == key_randomSong) {
		randomSongFunctionMainMenu();
	} else if (event.key == key_randomPlaylist) {
		randomPlaylistFunctionMainMenu();
	}
});

function setupLazyBackgrounds() {
	const bgElements = document.querySelectorAll(".background-element[data-bg]");
	const vh = window.innerHeight;
	const margin = `${2 * vh}px 0px`;

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
			}
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
	const selectedValue = option == "displayCount" && selectElement.value == "All" ? 9999999 : Number(selectElement.value);
	console.log("Selected:", selectedValue, "at", option);
	updateDatabase(option, selectedValue, settingsDb, "settings");
	if (option == "dividevolume") {
		dividevolume = selectedValue;
		if (audioElement) {
			audioElement.volume = volumeControl.value / 100 / dividevolume;
		}
	} else if (option == "displayCount") {
		displayCount = selectedValue;
	}
}

function getSongNameById(songId) {
	const stmt = musicsDb.prepare("SELECT song_name FROM songs WHERE song_id = ?");
	const row = stmt.get(songId);
	return row ? row.song_name : null;
}

function bottomRightFunctions(input) {
	if (!secondfilename) return;
	if (input == "addToPlaylist") {
		openAddToPlaylistModal(removeExtensions(secondfilename));
	} else if (input == "addToFavorites") {
		let songs = [];
		const fav = playlistsDb.prepare("SELECT songs FROM playlists WHERE id = ?").get("Favorites");
		if (fav && fav.songs) {
			songs = JSON.parse(fav.songs);
		}

		if (!songs.includes(removeExtensions(secondfilename))) {
			songs.push(removeExtensions(secondfilename));
			playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE id = ?").run(JSON.stringify(songs), "Favorites");

			if (getComputedStyle(document.getElementById("playlists-content")).display == "grid") {
				getPlaylists();
			}
		}
	} else if (input == "customise") {
		opencustomiseModal(secondfilename);
	}
}

async function saveUserProgress() {
	if (songPauseStartTime) totalPausedTime += Math.floor(Date.now() / 1000 - songPauseStartTime);
	if (songStartTime && Math.floor(Date.now() / 1000) - songStartTime - totalPausedTime >= 1) await savePlayedTime();

	songStartTime = Math.floor(Date.now() / 1000);
	songPauseStartTime = null;
	totalPausedTime = 0;
}

ipcRenderer.on("update-available", (event, releaseNotes) => {
	document.getElementById("patchNotes").innerHTML = releaseNotes;
	document.getElementById("version").classList.add("no-animation");
	document.getElementById("installBtn").disabled = false;
	if (platform == "win32" || platform == "darwin") {
		document.getElementById("installBtn").innerText = "Go to the latest release page";
	}
});

ipcRenderer.on("download-progress", (event, percent) => {
	const progressBar = document.getElementById("downloadProgress");
	progressBar.style.width = percent + "%";
	progressBar.innerText = Math.floor(percent) + "%";
});

ipcRenderer.on("save-progress", async () => {
	await saveUserProgress();
	ipcRenderer.send("save-complete");
});

document.addEventListener("DOMContentLoaded", function () {
	initialiseSettingsDatabase();
	initialiseMusicsDatabase();
	initialisePlaylistsDatabase();

	ipcRenderer.send("renderer-domready");

	const divideVolumeSelect = document.getElementById("dividevolume");
	for (let i = 0; i < divideVolumeSelect.options.length; i++) {
		if (divideVolumeSelect.options[i].value == dividevolume) {
			divideVolumeSelect.selectedIndex = i;
			break;
		}
	}

	document.getElementById("stabiliseVolumeToggle").checked = stabiliseVolumeToggle == 1 ? true : false;
	document.getElementById("removeSongButton").addEventListener("click", e => removeSong(e.currentTarget.dataset.songId));

	if (!fs.existsSync(appThumbnailFolder)) {
		loadNewPage("createAppThumbnailsFolder");
	} else {
		const files = ["addtoplaylist.svg", "adjustments.svg", "backward.svg", "custom.svg", "customise.svg", "forward.svg", "greenAutoplay.svg", "greenLoop.svg", "greenShuffle.svg", "mute.svg", "next.svg", "pause.svg", "placeholder.jpg", "play.svg", "previous.svg", "redAutoplay.svg", "redLoop.svg", "redShuffle.svg", "speed.svg", "star.svg", "tarator_icon.icns", "tarator_icon.ico", "tarator_icon.png", "tarator16_icon.png", "tarator512_icon.png", "tarator1024_icon.png", "trash.svg"];
		for (const file of files) {
			if (!fs.existsSync(path.join(appThumbnailFolder, file))) {
				loadNewPage("createAppThumbnailsFolder");
				return;
			}
		}
	}

	const missingSongs = musicsDb.prepare("SELECT song_id FROM songs WHERE song_extension IS NULL").all();
	if (missingSongs.length > 0) {
		const musicFiles = fs.readdirSync(musicFolder);
		for (const { song_id } of missingSongs) {
			const file = musicFiles.find(f => path.parse(f).name === song_id);
			if (file) {
				const ext = path.extname(file).slice(1);
				musicsDb.prepare("UPDATE songs SET song_extension = ? WHERE song_id = ?").run(ext, song_id);
			}
		}
	}

	const missingThumbs = musicsDb.prepare("SELECT song_id FROM songs WHERE thumbnail_extension IS NULL").all();
	if (missingThumbs.length > 0) {
		const thumbFiles = fs.readdirSync(thumbnailFolder);
		for (const { song_id } of missingThumbs) {
			const file = thumbFiles.find(f => path.parse(f).name === song_id);
			if (file) {
				const ext = path.extname(file).slice(1);
				musicsDb.prepare("UPDATE songs SET thumbnail_extension = ? WHERE song_id = ?").run(ext, song_id);
			}
		}
	}

	document.querySelectorAll("div[data-tooltip]").forEach(el => {
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
		const platform = process.platform;

		if (platform == "win32" || platform == "darwin") {
			window.open("https://github.com/Victiniiiii/TaratorMusic/releases/latest", "_blank");
			return;
		}

		document.getElementById("progressContainer").style.display = "block";
		document.getElementById("installBtn").disabled = true;
		ipcRenderer.send("download-update");
	});

	window.addEventListener("resize", () => {
		document.querySelectorAll(".hourChart").forEach(chart => {
			chart.width = window.innerWidth * 0.7;
			chart.height = window.innerWidth * 0.0525;
		});
	});
});
