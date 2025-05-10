// renderer.js

const { ipcRenderer } = require("electron");
const icon = require("./svg.js");
const path = require("path");
const fetch = require("node-fetch");
const fs = require("fs");
const Database = require("better-sqlite3");

let taratorFolder;
let musicFolder, thumbnailFolder, appThumbnailFolder, databasesFolder;
let settingsDbPath, playlistsDbPath, musicsDbPath;
let settingsDb = {},
	playlistsDb = {},
	musicsDb = {};

(async () => {
	taratorFolder = await ipcRenderer.invoke("get-app-base-path");

	musicFolder = path.join(taratorFolder, "musics");
	thumbnailFolder = path.join(taratorFolder, "thumbnails");
	appThumbnailFolder = path.join(taratorFolder, "app_thumbnails");
	databasesFolder = path.join(taratorFolder, "databases");
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
const tabContents = document.querySelectorAll(".tab-content");
const playButton = document.getElementById("playButton");
const pauseButton = document.getElementById("pauseButton");
const videothumbnailbox = document.getElementById("videothumbnailbox");
const createPlaylistModal = document.getElementById("createPlaylistModal");
const customizeModal = document.getElementById("customizeModal");
const downloadModal = document.getElementById("downloadModal");
const speedModal = document.getElementById("speedModal");
const speedOptions = document.getElementById("speedOptions");
const muteButton = document.getElementById("muteButton");
const loopButton = document.getElementById("loopButton");
const editPlaylistModal = document.getElementById("editPlaylistModal");
const volumeControl = document.getElementById("volume");

volumeControl.addEventListener("change", () => {
	updateDatabase("volume", volumeControl.value, settingsDb);
	if (audioElement) {
		audioElement.volume = volumeControl.value / 100;
	}
});

let currentPlayingElement = null;
let audioElement = null;
let secondfilename = null;
let currentPlaylist = null;
let currentPlaylistElement = null;
let isShuffleActive = false;
let isAutoplayActive = false;
let isLooping = false;
let newThumbnailPath;
let domates = null;
let playedSongs = [];
let playlistPlayedSongs = [];
let havuc = null;
let disableKeyPresses = 0;
let songStartTime = 0;
let previousVolume = null;
let audioContext;
let audioSource;

let totalTimeSpent = 0;
let rememberautoplay;
let remembershuffle;
let rememberloop;
let rememberspeed;
let maximumPreviousSongCount;
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

const defaultSettings = {
	totalTimeSpent: 0,
	maximumPreviousSongCount: 50,
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
};

function initializeSettingsDatabase() {
	let row;
	try {
		row = settingsDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
	} catch (err) {
		console.error("Error checking for settings table:", err.message);
		return;
	}

	if (!row) {
		console.log("Settings table not found. Creating...");

		let createTableSQL = `CREATE TABLE settings (`;
		const keys = Object.keys(defaultSettings);
		keys.forEach((key, index) => {
			const columnType = typeof defaultSettings[key] === "number" ? "INTEGER" : "TEXT";
			createTableSQL += `${key} ${columnType} DEFAULT '${defaultSettings[key]}'`;
			if (index < keys.length - 1) {
				createTableSQL += ",\n";
			}
		});

		createTableSQL += ")";

		try {
			settingsDb.prepare(createTableSQL).run();
			console.log("Settings table created successfully.");
			insertDefaultSettings();
		} catch (err) {
			console.error("Error creating settings table:", err.message);
		}
	} else {
		console.log("Settings table exists. Checking columns...");
		let columns;
		try {
			columns = settingsDb.prepare("PRAGMA table_info(settings)").all();
		} catch (err) {
			console.error("Error fetching table info:", err.message);
			return;
		}

		const existingColumns = columns.map(col => col.name);
		const missingColumns = Object.keys(defaultSettings).filter(key => !existingColumns.includes(key));

		if (missingColumns.length > 0) {
			console.log("Adding missing columns...");

			missingColumns.forEach(key => {
				let columnType = typeof defaultSettings[key] === "number" ? "INTEGER" : "TEXT";
				try {
					settingsDb.prepare(`ALTER TABLE settings ADD COLUMN ${key} ${columnType} DEFAULT '${defaultSettings[key]}'`).run();
					console.log(`Added missing column: ${key}`);
				} catch (err) {
					console.error(`Error adding column ${key}:`, err.message);
				}
			});
		}
		loadSettings();
	}
}

function initializeMusicsDatabase() {
	musicsDb
		.prepare(
			`
			CREATE TABLE IF NOT EXISTS songs (
				song_id TEXT PRIMARY KEY,
				song_name TEXT,
				song_url TEXT,
				song_thumbnail TEXT,
				seconds_played INTEGER,
				times_listened INTEGER,
				rms REAL
			)
			`
		)
		.run();
	const files = fs.readdirSync(musicFolder);

	const insert = musicsDb.prepare(`
    INSERT INTO songs (
      song_id, song_name, song_url, song_thumbnail,
      seconds_played, times_listened, rms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

	const existingNames = new Set(
		musicsDb
			.prepare(`SELECT song_name FROM songs`)
			.all()
			.map(row => row.song_name)
	);

	for (const file of files) {
		const ext = path.extname(file).toLowerCase();
		if (![".mp3", ".wav", ".flac"].includes(ext)) continue;

		const name = path.basename(file, ext);

		if (!existingNames.has(name)) {
			const songId = generateId();
			insert.run(songId, name, "", `${name}.jpg`, 0, 0, null);
			console.log(`Inserted new song: ${name}`);
		}
	}
}

function initializePlaylistsDatabase() {
	try {
		playlistsDb
			.prepare(
				`
			CREATE TABLE IF NOT EXISTS playlists (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT UNIQUE,
				songs TEXT,
				thumbnail TEXT
			)
		`
			)
			.run();

		const allPlaylists = playlistsDb.prepare("SELECT * FROM playlists").all();

		if (allPlaylists.length === 0) {
			console.log("No playlists found in the database.");
		} else {
			console.log(`Loaded ${allPlaylists.length} playlists from the database.`);
		}

		return allPlaylists;
	} catch (err) {
		console.error("Error initializing playlists database:", err);
		return [];
	}
}

document.addEventListener("DOMContentLoaded", function () {
	initializeSettingsDatabase();
	initializeMusicsDatabase();
	initializePlaylistsDatabase();
});

function insertDefaultSettings() {
	const columns = Object.keys(defaultSettings).join(", ");
	const placeholders = Object.keys(defaultSettings)
		.map(() => "?")
		.join(", ");
	const values = Object.values(defaultSettings);
	const insertSQL = `INSERT INTO settings (${columns}) VALUES (${placeholders})`;

	try {
		settingsDb.prepare(insertSQL).run(values);
		console.log(`Default settings inserted.`);
		loadSettings();
	} catch (err) {
		console.error("Error inserting default settings:", err.message);
	}
}

function loadSettings() {
	let row;
	try {
		row = settingsDb.prepare("SELECT * FROM settings").get();
	} catch (err) {
		console.error("Error retrieving settings:", err.message);
		return;
	}

	if (!row) {
		console.log("No settings found, inserting defaults.");
		insertDefaultSettings();
		return;
	}

	Object.keys(defaultSettings).forEach(key => {
		if (row[key] === null || row[key] === undefined) {
			console.log(`Setting ${key} is null, reverting to default: ${defaultSettings[key]}`);
			updateDatabase(key, defaultSettings[key], settingsDb);
			row[key] = defaultSettings[key];
		}
	});

	console.log("Settings loaded:", row);

	document.getElementById("settingsRewind").innerHTML = row.key_Rewind;
	document.getElementById("settingsPrevious").innerHTML = row.key_Previous;
	document.getElementById("settingsPlayPause").innerHTML = row.key_PlayPause;
	document.getElementById("settingsNext").innerHTML = row.key_Next;
	document.getElementById("settingsSkip").innerHTML = row.key_Skip;
	document.getElementById("settingsAutoplay").innerHTML = row.key_Autoplay;
	document.getElementById("settingsShuffle").innerHTML = row.key_Shuffle;
	document.getElementById("settingsMute").innerHTML = row.key_Mute;
	document.getElementById("settingsSpeed").innerHTML = row.key_Speed;
	document.getElementById("settingsLoop").innerHTML = row.key_Loop;

	key_Rewind = row.key_Rewind;
	key_Previous = row.key_Previous;
	key_PlayPause = row.key_PlayPause;
	key_Next = row.key_Next;
	key_Skip = row.key_Skip;
	key_Autoplay = row.key_Autoplay;
	key_Shuffle = row.key_Shuffle;
	key_Mute = row.key_Mute;
	key_Speed = row.key_Speed;
	key_Loop = row.key_Loop;

	totalTimeSpent = row.totalTimeSpent;
	rememberautoplay = row.rememberautoplay;
	remembershuffle = row.remembershuffle;
	rememberloop = row.rememberloop;
	rememberspeed = row.rememberspeed;
	maximumPreviousSongCount = row.maximumPreviousSongCount;
	volume = row.volume;

	updateTimer();
	rememberautoplay && toggleAutoplay();
	remembershuffle && toggleShuffle();
	rememberloop && loop();
	document.getElementById("arrayLength").value = maximumPreviousSongCount;
	volumeControl.value = volume;
	if (audioElement) audioElement.volume = volumeControl.value / 100;
}

function updateDatabase(name, option, db) {
	try {
		db.prepare(`UPDATE settings SET ${name} = ?`).run(option);
		console.log(`${name} updated to ${option}.`);
	} catch (err) {
		console.error(`Error updating ${name}:`, err.message);
	}
}

function updateTimer() {
	let value, unit;

	if (totalTimeSpent >= 3600) {
		value = (totalTimeSpent / 3600).toFixed(0);
		unit = value == 1 ? "hour" : "hours";
	} else {
		value = (totalTimeSpent / 60).toFixed(0);
		unit = value == 1 ? "minute" : "minutes";
	}

	document.getElementById("mainmenutimespent").innerHTML = `Time Spent: ${value} ${unit}`;
}

setInterval(() => {
	totalTimeSpent += 60;
	updateDatabase("totalTimeSpent", totalTimeSpent, settingsDb);
	updateTimer();
}, 60000);

function generateId() {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.floor(Math.random() * 1e6).toString(36);
	return `${timestamp}-${randomPart}`;
}

function savePlayedTime(songName, timePlayed) {
	const row = musicsDb
		.prepare(
			`
			SELECT seconds_played, times_listened
			FROM songs
			WHERE song_name = ?
		`
		)
		.get(songName);

	if (row) {
		const updatedTime = row.seconds_played + timePlayed;
		const updatedCount = row.times_listened + 1;

		musicsDb
			.prepare(
				`
				UPDATE songs
				SET seconds_played = ?, times_listened = ?
				WHERE song_name = ?
			`
			)
			.run(updatedTime, updatedCount, songName);

		console.log(`Updated ${songName}: ${updatedTime}s, listened ${updatedCount} times.`);
	} else {
		console.warn(`Tried to update "${songName}", but it doesn't exist in songs.`);
	}
}

document.getElementById("backwardButton").innerHTML = icon.backward;
document.getElementById("previousSongButton").innerHTML = icon.previous;
document.getElementById("playButton").innerHTML = icon.play;
document.getElementById("pauseButton").innerHTML = icon.pause;
document.getElementById("nextSongButton").innerHTML = icon.next;
document.getElementById("forwardButton").innerHTML = icon.forward;
document.getElementById("autoplayButton").innerHTML = icon.redAutoplay;
document.getElementById("shuffleButton").innerHTML = icon.redShuffle;
document.getElementById("muteButton").innerHTML = icon.mute;
document.getElementById("speedButton").innerHTML = icon.speed;
document.getElementById("loopButton").innerHTML = icon.redLoop;
document.getElementById("mainmenulogo").style.backgroundImage = "url(app_thumbnails/tarator1024_icon.png)";

function changeThePreviousSongAmount() {
	if (document.getElementById("arrayLength").value > 9 && document.getElementById("arrayLength").value < 101) {
		maximumPreviousSongCount = document.getElementById("arrayLength").value;
		updateDatabase("maximumPreviousSongCount", maximumPreviousSongCount, settingsDb);
	} else {
		alert("Please set a number between 10 and 100");
	}
	document.getElementById("arrayLength").value = maximumPreviousSongCount;
}

tabs.forEach(tab => {
	tab.addEventListener("click", () => {
		tabs.forEach(div => div.classList.remove("active"));
		tab.classList.add("active");

		const tabContentId = `${tab.id}-content`;
		tabContents.forEach(content => {
			content.classList.add("hidden");
			if (content.id === tabContentId) {
				content.classList.remove("hidden");
				document.getElementById("main-menu-content").style.display = "none";
				document.getElementById("my-music-content").style.display = "none";
				document.getElementById("playlists-content").style.display = "none";
				document.getElementById("settings-content").style.display = "none";
				window.scrollTo(0, 0);
				if (content.id === "main-menu-content") {
					document.getElementById("main-menu-content").style.display = "flex";
				} else if (content.id === "my-music-content") {
					document.getElementById("my-music-content").style.display = "block";
				} else if (content.id === "playlists-content") {
					document.getElementById("playlists-content").style.display = "grid";
				} else if (content.id === "settings-content") {
					document.getElementById("settings-content").style.display = "flex";
				}
			}
		});
	});
});

async function myMusicOnClick() {
	const myMusicContent = document.getElementById("my-music-content");
	myMusicContent.innerHTML = "";

	const controlsBar = document.createElement("div");
	controlsBar.style.display = "flex";
	controlsBar.style.justifyContent = "space-between";
	controlsBar.style.marginBottom = "10px";
	controlsBar.style.gap = "10px";

	const musicSearch = document.createElement("input");
	musicSearch.type = "text";
	musicSearch.id = "music-search";
	musicSearch.placeholder = `Search in ${taratorFolder}...`;
	musicSearch.style.flex = "1";

	const displayCountSelect = document.createElement("select");
	displayCountSelect.id = "display-count";

	[10, 20, 50, 100, 250, 500, 1000, "All"].forEach(count => {
		const option = document.createElement("option");
		option.value = count;
		option.innerText = count === "All" ? "Show All" : `Show ${count}`;
		displayCountSelect.appendChild(option);
	});

	controlsBar.appendChild(musicSearch);
	controlsBar.appendChild(displayCountSelect);
	myMusicContent.appendChild(controlsBar);

	const musicListContainer = document.createElement("div");
	musicListContainer.id = "music-list-container";
	musicListContainer.style.display = "grid";
	musicListContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(180px, 1fr))";
	musicListContainer.style.gap = "16px";
	myMusicContent.appendChild(musicListContainer);

	let musicFiles = [];

	try {
		const files = await fs.promises.readdir(musicFolder);
		musicFiles = files
			.filter(file => file.toLowerCase() !== "desktop.ini")
			.map(file => ({
				name: file,
				thumbnail: `file://${path.join(thumbnailFolder, file, "_thumbnail")}`,
			}));

		if (musicFiles.length === 0) {
			myMusicContent.innerHTML = "No songs? Use the download feature on the left, or add some mp3 files to the 'musics' folder.";
			myMusicContent.style.display = "block";
			return;
		}

		let filteredSongs = [...musicFiles];
		let displayCount = displayCountSelect.value;
		let searchQuery = "";

		let currentPlayingSongName = currentPlayingElement ? currentPlayingElement.getAttribute("data-file-name").slice(0, -4) : null;

		function renderSongs() {
			musicListContainer.innerHTML = "";
			const count = displayCount === "All" ? filteredSongs.length : parseInt(displayCount);
			const visibleSongs = filteredSongs.slice(0, count);
			visibleSongs.forEach(file => {
				const musicElement = createMusicElement(file);

				if (file.name.slice(0, -4) === currentPlayingSongName) {
					musicElement.classList.add("playing");
				}

				musicElement.addEventListener("click", () => {
					playMusic(file, musicElement);
				});

				musicListContainer.appendChild(musicElement);
			});
		}

		musicSearch.addEventListener("input", () => {
			searchQuery = musicSearch.value.trim().toLowerCase();
			filteredSongs = musicFiles.filter(file => file.name.toLowerCase().includes(searchQuery));
			renderSongs();
		});

		displayCountSelect.addEventListener("change", () => {
			displayCount = displayCountSelect.value;
			renderSongs();
		});

		renderSongs();
	} catch (error) {
		console.error("Error reading music directory:", error);
	}
}

function createMusicElement(file) {
	const musicElement = document.createElement("div");
	musicElement.classList.add("music-item");
	musicElement.setAttribute("alt", file.name);
	musicElement.setAttribute("data-file-name", file.name);

	const fileNameWithoutExtension = path.parse(file.name).name;
	const encodedFileName = encodeURIComponent(fileNameWithoutExtension);
	const decodedFileName = decodeURIComponent(encodedFileName);
	const thumbnailFileName = `${decodedFileName}_thumbnail.jpg`;
	const thumbnailPath = path.join(thumbnailFolder, thumbnailFileName.replace(/%20/g, " "));
	let thumbnailUrl = `file://${path.join(appThumbnailFolder, "placeholder.jpg").replace(/\\/g, "/")}`;

	if (fs.existsSync(thumbnailPath)) {
		thumbnailUrl = `file://${thumbnailPath.replace(/\\/g, "/")}`;
	}

	const backgroundElement = document.createElement("div");
	backgroundElement.classList.add("background-element");
	backgroundElement.style.backgroundImage = `url('${thumbnailUrl}')`;
	musicElement.appendChild(backgroundElement);

	const songNameElement = document.createElement("div");
	songNameElement.classList.add("song-name");
	songNameElement.innerText = fileNameWithoutExtension;

	const songLengthElement = document.createElement("div");
	songLengthElement.classList.add("song-length");

	const customizeButton = document.createElement("button");
	customizeButton.innerHTML = icon.customise;
	customizeButton.classList.add("customize-button");
	customizeButton.addEventListener("click", event => {
		event.stopPropagation();
		openCustomizeModal(file.name, thumbnailUrl);
	});

	const addToPlaylistButton = document.createElement("button");
	addToPlaylistButton.innerHTML = icon.addToPlaylist;
	addToPlaylistButton.classList.add("add-to-playlist-button");
	addToPlaylistButton.addEventListener("click", event => {
		event.stopPropagation();
		openAddToPlaylistModal(songNameElement.innerHTML);
	});

	musicElement.appendChild(songLengthElement);
	musicElement.appendChild(songNameElement);
	musicElement.appendChild(customizeButton);
	musicElement.appendChild(addToPlaylistButton);

	const audio = new Audio();
	const filePath = path.join(musicFolder, file.name);
	audio.src = `file://${filePath}`;

	audio.addEventListener("loadedmetadata", () => {
		songLengthElement.innerText = formatTime(audio.duration);
	});

	return musicElement;
}

async function playMusic(file, clickedElement, isPlaylist = false) {
	const songName = document.getElementById("song-name");

	if (songStartTime !== 0) {
		let timePlayed = (Date.now() - songStartTime) / 1000;
		if (timePlayed >= 10) {
			const songFileName = songName.innerHTML;
			savePlayedTime(songFileName, timePlayed);
		}
	}

	songStartTime = Date.now();

	if (audioElement) {
		audioElement.pause();
		audioElement.src = "";
		if (audioSource) {
			try {
				audioSource.disconnect();
			} catch (err) {
				console.warn("Audio source disconnect error:", err);
			}
		}
	}

	try {
		if (!isPlaylist) {
			currentPlaylist = null;
		}

		audioElement = new Audio();
		manageAudioControls(audioElement);

		audioElement.addEventListener("loadedmetadata", () => {
			songDuration = audioElement.duration;
		});

		audioElement.controls = true;
		audioElement.autoplay = true;
		secondfilename = file.name;

		if (file.name.endsWith(".mp3")) {
			songName.textContent = file.name.slice(0, -4);
		} else {
			songName.textContent = file.name;
			secondfilename += ".mp3";
		}

		audioElement.src = `file://${path.join(musicFolder, secondfilename)}`;
		audioElement.volume = volumeControl.value / 100;
		audioElement.playbackRate = rememberspeed;
		audioElement.loop = isLooping === true;

		if (!audioContext) {
			audioContext = new AudioContext();
		}

		audioSource = audioContext.createMediaElementSource(audioElement);
		let newGain;

		try {
			const row = musicsDb.prepare("SELECT rms FROM songs WHERE song_name = ?").get(secondfilename);
			const measuredRms = row ? row.rms : 0.07;
			const targetRms = 0.07;
			newGain = targetRms / measuredRms;
			newGain = Math.min(Math.max(newGain, 0.5), 1.5);
		} catch (err) {
			console.warn("Could not load RMS from database:", err);
		}

		const compressorNode = audioContext.createDynamicsCompressor();
		compressorNode.threshold.value = -50;
		compressorNode.knee.value = 40;
		compressorNode.ratio.value = 12;
		compressorNode.attack.value = 0;
		compressorNode.release.value = 0.25;

		const gainNode = audioContext.createGain();
		gainNode.gain.value = newGain;

		audioSource.connect(compressorNode);
		compressorNode.connect(gainNode);
		gainNode.connect(audioContext.destination);

		await audioElement.play();
		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";

		const fileNameWithoutExtension = path.parse(file.name).name;
		const encodedFileName = encodeURIComponent(fileNameWithoutExtension);
		const decodedFileName = decodeURIComponent(encodedFileName);
		const thumbnailFileName = `${decodedFileName}_thumbnail.jpg`;
		const thumbnailPath = path.join(thumbnailFolder, thumbnailFileName.replace(/%20/g, " "));
		let thumbnailUrl = path.join(appThumbnailFolder, "placeholder.jpg".replace(/%20/g, " "));

		if (fs.existsSync(thumbnailPath)) {
			thumbnailUrl = `file://${thumbnailPath.replace(/\\/g, "/")}`;
		} else {
			console.log("Tried to get thumbnail from", thumbnailPath, "but failed. Used", thumbnailUrl, "instead.");
		}

		videothumbnailbox.style.backgroundImage = `url('${thumbnailUrl}')`;

		document.querySelectorAll(".music-item.playing").forEach(el => el.classList.remove("playing"));
		document.querySelectorAll(".music-item").forEach(musicElement => {
			if (musicElement.getAttribute("data-file-name").slice(0, -4) === songName.innerHTML) {
				musicElement.classList.add("playing");
			}
		});

		currentPlayingElement = songName;
		currentPlayingElement.setAttribute("data-file-name", secondfilename);
		updateDiscordPresence();

		if (isShuffleActive) {
			if (currentPlaylist) {
				if (havuc !== currentPlaylist.name) {
					havuc = currentPlaylist.name;
					playlistPlayedSongs.splice(0, maximumPreviousSongCount);
				}
				playlistPlayedSongs.unshift(songName.innerHTML);
				if (playlistPlayedSongs.length > maximumPreviousSongCount) {
					playlistPlayedSongs.pop();
				}
			} else {
				playedSongs.unshift(songName.innerHTML);
				if (playedSongs.length > maximumPreviousSongCount) {
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
		console.error("Error:", error);
	}
}

function manageAudioControls(audioElement) {
	const videoLength = document.getElementById("video-length");
	const videoProgress = document.getElementById("video-progress");
	const playButton = document.getElementById("playButton");
	const pauseButton = document.getElementById("pauseButton");

	volumeControl.addEventListener("input", () => {
		audioElement.volume = volumeControl.value / 100;
	});

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

	playButton.addEventListener("click", () => {
		audioElement.play();
		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";
	});

	pauseButton.addEventListener("click", () => {
		audioElement.pause();
		pauseButton.style.display = "none";
		playButton.style.display = "inline-block";
	});

	audioElement.addEventListener("ended", () => {
		pauseButton.style.display = "none";
		playButton.style.display = "inline-block";
		if (isAutoplayActive) {
			playNextSong();
		}
	});

	videoProgress.addEventListener("input", () => {
		const seekTime = (audioElement.duration * videoProgress.value) / 100;
		audioElement.currentTime = seekTime;
		updateDiscordPresence();
	});
}

function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	seconds = Math.floor(seconds % 60);
	const minutesDisplay = minutes < 10 ? `0${minutes}` : `${minutes}`;
	const secondsDisplay = seconds < 10 ? `0${seconds}` : `${seconds}`;
	return `${minutesDisplay}:${secondsDisplay}`;
}

function createPlaylistElement(playlist) {
	const playlistElement = document.createElement("div");
	playlistElement.className = "playlist";
	playlistElement.setAttribute("data-playlist-name", playlist.name);
	const thumbnailPath = path.join(thumbnailFolder, playlist.name + "_playlist.jpg");

	let thumbnailSrc = ``;
	if (fs.existsSync(thumbnailPath)) {
		thumbnailSrc = `file://${thumbnailPath.replace(/\\/g, "/")}`;
	} else {
		thumbnailSrc = `file://${path.join(appThumbnailFolder, "placeholder.jpg").replace(/\\/g, "/")}`;
	}

	const thumbnail = document.createElement("img");
	thumbnail.src = thumbnailSrc;
	playlistElement.appendChild(thumbnail);

	const playlistInfoandSongs = document.createElement("div");
	playlistElement.appendChild(playlistInfoandSongs);
	playlistInfoandSongs.className = "playlistInfoandSongs";

	const playlistInfo = document.createElement("div");
	playlistInfoandSongs.appendChild(playlistInfo);
	playlistInfo.className = "playlist-info";

	const playlistName = document.createElement("div");
	const playlistLength = document.createElement("div");
	playlistName.textContent = playlist.name;
	if (playlist.songs.length === 1) {
		playlistLength.textContent = playlist.songs.length + " song";
	} else {
		playlistLength.textContent = playlist.songs.length + " songs";
	}
	playlistInfo.appendChild(playlistName);
	playlistInfo.appendChild(playlistLength);

	const playlistSongs = document.createElement("div");
	const playlistButtons = document.createElement("div");
	playlistInfoandSongs.appendChild(playlistSongs);
	playlistElement.appendChild(playlistButtons);
	playlistSongs.className = "playlist-songs";
	playlistButtons.className = "playlist-buttons";

	const playlistCustomiseButton = document.createElement("div");
	playlistButtons.appendChild(playlistCustomiseButton);
	playlistCustomiseButton.className = "playlist-buttons-button";
	playlistCustomiseButton.innerHTML = icon.custom;

	playlistCustomiseButton.addEventListener("click", () => {
		let theNameOfThePlaylist = playlist.name;
		editPlaylistModal.style.display = "block";
		document.getElementById("editPlaylistNameInput").value = theNameOfThePlaylist;
		document.getElementById("editInvisibleName").value = theNameOfThePlaylist;
		document.getElementById("editPlaylistThumbnail").src = thumbnailSrc;
		document.getElementById("editInvisiblePhoto").src = thumbnailSrc;
	});

	for (let i = 0; i < playlist.songs.length; i++) {
		const playlistSong = document.createElement("div");
		playlistSong.textContent = playlist.songs[i];
		playlistSongs.appendChild(playlistSong);
		playlistSong.className = "playlist-song";

		playlistSong.addEventListener("click", () => {
			playPlaylist(playlist, i);
		});
	}

	thumbnail.addEventListener("click", () => {
		playPlaylist(playlist, 0);
	});

	return playlistElement;
}

function saveEditPlaylist() {
	const oldName = document.getElementById("editInvisibleName").value;
	const newName = document.getElementById("editPlaylistNameInput").value.trim();
	const newThumbnail = document.getElementById("editPlaylistThumbnail").src;

	const playlist = musicsDb.prepare("SELECT * FROM playlists WHERE name = ?").get(oldName);

	if (!playlist) {
		console.error("Playlist not found:", oldName);
		return;
	}

	let thumbnailPath = playlist.thumbnail;

	const updateAndExit = () => {
		musicsDb.prepare("UPDATE playlists SET name = ?, thumbnail = ? WHERE playlist_id = ?").run(newName, thumbnailPath, playlist.playlist_id);

		console.log("Playlist updated successfully");
		closeModal();
		document.getElementById("settings").click();
		document.getElementById("playlists").click();
	};

	if (newThumbnail.startsWith("data:image")) {
		const base64Data = newThumbnail.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(base64Data, "base64");
		thumbnailPath = path.join(thumbnailFolder, `${newName}_playlist.jpg`);

		fs.writeFile(thumbnailPath, buffer, err => {
			if (err) {
				console.error("Error saving new thumbnail:", err);
				return;
			}
			console.log("Thumbnail saved successfully:", thumbnailPath);
			updateAndExit();
		});
	} else {
		thumbnailPath = newThumbnail;
		updateAndExit();
	}
}

function displayPlaylists(playlists) {
	const playlistsContent = document.getElementById("playlists-content");
	playlistsContent.innerHTML = "";

	playlists.forEach(playlist => {
		const playlistElement = createPlaylistElement(playlist);
		playlistsContent.appendChild(playlistElement);
	});
}

function getPlaylists() {
	try {
		const playlists = playlistsDb.prepare("SELECT * FROM playlists").all();

		if (!playlists || playlists.length === 0) {
			console.warn("No playlists found in the database.");
			displayPlaylists([]);
			return;
		}

		const playlistsWithParsedSongs = playlists.map(playlist => {
			let parsedSongs = [];
			if (playlist.songs) {
				try {
					parsedSongs = JSON.parse(playlist.songs);
				} catch (e) {
					console.warn(`Error parsing songs for playlist '${playlist.name}': ${e.message}`);
				}
			}
			return { ...playlist, songs: parsedSongs };
		});

		displayPlaylists(playlistsWithParsedSongs);
	} catch (err) {
		console.error("Error fetching playlists from the database:", err);
		displayPlaylists([]);
	}
}

ipcRenderer.on("playlist-created", () => {
	closeModal();
});

ipcRenderer.on("playlist-creation-error", (event, errorMessage) => {
	createPlaylistModal.style.display = "block";
	const modalFooter = document.querySelector("#modalerror");
	modalFooter.innerHTML = "";

	const errorElement = document.createElement("p");
	errorElement.className = "error-message";
	errorElement.textContent = errorMessage;
	modalFooter.appendChild(errorElement);
});

function openAddToPlaylistModal(songName) {
	document.getElementById("addToPlaylistModal").style.display = "block";
	const playlistsContainer = document.getElementById("playlist-checkboxes");
	playlistsContainer.innerHTML = "";
	let mercimek = songName;

	try {
		const playlists = playlistsDb.prepare("SELECT * FROM playlists").all();

		if (!playlists || playlists.length === 0) {
			console.warn("No playlists found.");
			displayPlaylists([]);
			return;
		}

		playlists.forEach(playlist => {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = playlist.name;
			checkbox.value = mercimek;

			let songsInPlaylist = [];
			if (playlist.songs) {
				try {
					songsInPlaylist = JSON.parse(playlist.songs);
				} catch (e) {
					console.error("Error parsing songs from playlist:", e);
				}
			}

			const isSongInPlaylist = songsInPlaylist.includes(mercimek);

			if (isSongInPlaylist) {
				checkbox.checked = true;
			}

			const label = document.createElement("label");
			label.textContent = playlist.name;
			label.htmlFor = checkbox.id;

			playlistsContainer.appendChild(checkbox);
			playlistsContainer.appendChild(label);
			playlistsContainer.appendChild(document.createElement("br"));
		});

		const button = document.createElement("button");
		button.id = "addToPlaylistDone";
		button.textContent = "Done";
		button.onclick = function () {
			addToSelectedPlaylists(mercimek);
			console.log("mercimek", mercimek);
		};
		playlistsContainer.appendChild(button);
	} catch (err) {
		console.error("Error fetching playlists from the database:", err);
		displayPlaylists([]);
	}
}

function addToSelectedPlaylists(songName) {
	let hamburger = songName;
	const checkboxes = document.querySelectorAll('#playlist-checkboxes input[type="checkbox"]');
	const selectedPlaylists = Array.from(checkboxes)
		.filter(checkbox => checkbox.checked)
		.map(checkbox => checkbox.id);

	try {
		selectedPlaylists.forEach(playlistName => {
			const playlist = playlistsDb.prepare("SELECT * FROM playlists WHERE name = ?").get(playlistName);

			let songsInPlaylist = [];
			if (playlist.songs) {
				try {
					songsInPlaylist = JSON.parse(playlist.songs);
				} catch (e) {
					console.error("Error parsing songs from playlist:", e);
				}
			}

			const songExists = songsInPlaylist.includes(hamburger);

			if (songExists) {
				console.log(`Song '${hamburger}' already exists in playlist '${playlistName}'.`);
			} else {
				songsInPlaylist.push(hamburger);
				const updatedSongs = JSON.stringify(songsInPlaylist);
				playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE name = ?").run(updatedSongs, playlistName);
				console.log(`Song '${hamburger}' added to playlist '${playlistName}'.`);
			}
		});

		const allPlaylists = playlistsDb.prepare("SELECT * FROM playlists").all();
		allPlaylists.forEach(playlist => {
			if (!selectedPlaylists.includes(playlist.name)) {
				let songsInPlaylist = [];
				if (playlist.songs) {
					try {
						songsInPlaylist = JSON.parse(playlist.songs);
					} catch (e) {
						console.error("Error parsing songs from playlist:", e);
					}
				}

				const songExistsInPlaylist = songsInPlaylist.includes(hamburger);
				if (songExistsInPlaylist) {
					const updatedSongs = songsInPlaylist.filter(song => song !== hamburger);
					const newSongs = JSON.stringify(updatedSongs);
					playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE name = ?").run(newSongs, playlist.name);
					console.log(`Song '${hamburger}' removed from playlist '${playlist.name}'.`);
				}
			}
		});
	} catch (err) {
		console.error("Error updating playlists in the database:", err);
	}

	closeModal();
}

async function playPlaylist(playlist, startingIndex = 0) {
	if (!playlist.songs || playlist.songs.length === 0) {
		console.error(`Playlist ${playlist.name} is empty.`);
		return;
	}

	currentPlaylist = playlist;

	for (let i = startingIndex; i < playlist.songs.length; i++) {
		let songName = playlist.songs[i];
		const file = { name: songName };
		currentPlaylistElement = i;
		const clickedElement = document.querySelector(`.music-item[data-file-name="${songName}.mp3"]`);
		await playMusic(file, clickedElement, true);
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
	if (currentPlayingElement) {
		const musicFiles = await fs.promises.readdir(musicFolder);
		const musicItems = musicFiles.filter(file => file.toLowerCase() !== "desktop.ini" && file.toLowerCase().endsWith(".mp3"));

		if (isShuffleActive) {
			if (currentPlaylist) {
				if (playlistPlayedSongs.length > 1) {
					const previousSongName = playlistPlayedSongs[1];
					const file = { name: previousSongName };
					playMusic(file, null, true);
					playlistPlayedSongs.splice(0, 2);
				}
			} else {
				if (playedSongs.length > 1) {
					const previousSongName = playedSongs[1];
					const file = { name: previousSongName };
					playMusic(file, null, true);
					playedSongs.splice(0, 2);
				}
			}
		} else {
			if (currentPlaylist) {
				if (currentPlaylistElement > 0) {
					const previousSongName = currentPlaylist.songs[currentPlaylistElement - 1];
					const file = { name: previousSongName };
					playMusic(file, null, true);
					currentPlaylistElement--;
				}
			} else {
				const currentSongName = document.getElementById("song-name").innerText + ".mp3";
				const previousIndex = musicItems.indexOf(currentSongName) - 1;
				const previousSongName = musicItems[previousIndex >= 0 ? previousIndex : musicItems.length - 1];
				const file = { name: previousSongName };
				playMusic(file, null, true);
			}
		}
	}
}

async function playNextSong() {
	if (currentPlayingElement) {
		const musicFiles = await fs.promises.readdir(musicFolder);
		const musicItems = musicFiles.filter(file => file.toLowerCase() !== "desktop.ini" && file.toLowerCase().endsWith(".mp3"));

		let nextSongName;

		if (isShuffleActive) {
			if (currentPlaylist) {
				const currentSongName = currentPlaylist.songs[currentPlaylistElement];
				if (currentPlaylist.songs.length === 1) {
					nextSongName = currentSongName;
				} else {
					let randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);
					while (currentPlaylist.songs[randomIndex] === currentSongName) {
						randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);
					}
					nextSongName = currentPlaylist.songs[randomIndex];
					currentPlaylistElement = randomIndex;
				}
			} else {
				const currentFileName = currentPlayingElement.getAttribute("data-file-name");
				if (musicItems.length === 1) {
					nextSongName = currentFileName;
				} else {
					let randomIndex = Math.floor(Math.random() * musicItems.length);
					while (musicItems[randomIndex] === currentFileName) {
						randomIndex = Math.floor(Math.random() * musicItems.length);
					}
					nextSongName = musicItems[randomIndex];
				}
			}
		}

		if (nextSongName) {
			const file = { name: nextSongName };
			playMusic(file, null, true);
		}
	}
}

async function randomSongFunctionMainMenu() {
	const musicFiles = await fs.promises.readdir(musicFolder);
	const musicItems = musicFiles.filter(file => file.toLowerCase() !== "desktop.ini" && file.toLowerCase().endsWith(".mp3"));
	let randomIndex = Math.floor(Math.random() * musicItems.length);

	if (currentPlayingElement) {
		const currentSongName = document.getElementById("song-name").innerText + ".mp3";
		while (musicItems[randomIndex] === currentSongName) {
			randomIndex = Math.floor(Math.random() * musicItems.length);
		}
	}

	const nextSongName = musicItems[randomIndex];
	const file = { name: nextSongName };
	playMusic(file, null, false);
}

function randomPlaylistFunctionMainMenu() {
	let allThePlaylists = Array.from(document.querySelectorAll(".playlist"));
	let randomIndex = Math.floor(Math.random() * allThePlaylists.length);
	let selectedPlaylist = allThePlaylists[randomIndex];

	while (selectedPlaylist.querySelectorAll(".playlistInfoandSongs .playlist-songs .playlist-song").length == 0) {
		randomIndex = Math.floor(Math.random() * allThePlaylists.length);
		selectedPlaylist = allThePlaylists[randomIndex];
	}

	if (currentPlaylist) {
		while (selectedPlaylist.getAttribute("data-playlist-name") == currentPlaylist.name || selectedPlaylist.querySelectorAll(".playlistInfoandSongs .playlist-songs .playlist-song").length == 0) {
			randomIndex = Math.floor(Math.random() * allThePlaylists.length);
			selectedPlaylist = allThePlaylists[randomIndex];
		}
	}

	selectedPlaylist.querySelectorAll(".playlistInfoandSongs .playlist-songs .playlist-song")[0].click();
}

function toggleAutoplay() {
	isAutoplayActive = !isAutoplayActive;
	const autoplayButton = document.getElementById("autoplayButton");
	if (isAutoplayActive) {
		autoplayButton.classList.add("active");
		autoplayButton.innerHTML = icon.greenAutoplay;
		updateDatabase("rememberautoplay", 1, settingsDb);
	} else {
		autoplayButton.classList.remove("active");
		autoplayButton.innerHTML = icon.redAutoplay;
		updateDatabase("rememberautoplay", 0, settingsDb);
	}
}

function toggleShuffle() {
	isShuffleActive = !isShuffleActive;
	const shuffleButton = document.getElementById("shuffleButton");
	if (isShuffleActive) {
		shuffleButton.classList.add("active");
		shuffleButton.innerHTML = icon.greenShuffle;
		updateDatabase("remembershuffle", 1, settingsDb);
	} else {
		shuffleButton.classList.remove("active");
		shuffleButton.innerHTML = icon.redShuffle;
		updateDatabase("remembershuffle", 0, settingsDb);
	}
}

function loop() {
	if (isLooping) {
		isLooping = false;
		loopButton.innerHTML = icon.redLoop;
		updateDatabase("rememberloop", 0, settingsDb);
		if (audioElement) {
			audioElement.loop = false;
		}
	} else {
		isLooping = true;
		loopButton.innerHTML = icon.greenLoop;
		updateDatabase("rememberloop", 1, settingsDb);
		if (audioElement) {
			audioElement.loop = true;
		}
	}
}

function mute() {
	if (volumeControl.value != 0) {
		previousVolume = volumeControl.value / 100;
		volumeControl.value = 0;
		muteButton.classList.add("active");
	} else {
		volumeControl.value = previousVolume;
		muteButton.classList.remove("active");
	}
	if (audioElement) audioElement.volume = volumeControl.value / 100;
	updateDatabase("volume", volumeControl.value, settingsDb);
}

function speed() {
	document.getElementById("speedOptions").innerHTML = "";
	speedModal.style.display = "block";
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
			updateDatabase("rememberspeed", speed, settingsDb);
			if (audioElement) {
				audioElement.playbackRate = rememberspeed;
			}
			closeModal();
		});
		speedOptions.appendChild(speedOption);
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

function createNewPlaylist() {
	createPlaylistModal.style.display = "block";
}

function closeModal() {
	document.querySelectorAll(".modal").forEach(modal => {
		modal.style.display = "none";
	});
}

document.getElementById("savePlaylistButton").addEventListener("click", () => {
	const playlistName = document.getElementById("playlistNameInput").value;
	let thumbnailFilePath = null;

	const thumbnailInput = document.getElementById("thumbnailInput");
	if (thumbnailInput.files.length > 0) {
		thumbnailFilePath = thumbnailInput.files[0].path;
	} else {
		alert("Please select a thumbnail for the playlist.");
		return;
	}

	try {
		const existingPlaylist = playlistsDb.prepare("SELECT * FROM playlists WHERE name = ?").get(playlistName);
		if (existingPlaylist) {
			alert("Playlist name already exists.");
			return;
		}

		const thumbnailPath = path.join(thumbnailFolder, `${playlistName}_playlist.jpg`);
		playlistsDb.prepare("INSERT INTO playlists (name, thumbnail) VALUES (?, ?)").run(playlistName, thumbnailPath);

		if (thumbnailFilePath) {
			const newThumbnailPath = path.join(thumbnailFolder, `${playlistName}_playlist.jpg`);
			fs.copyFile(thumbnailFilePath, newThumbnailPath, copyErr => {
				if (copyErr) {
					console.error("Error copying thumbnail file:", copyErr);
					return;
				}
				closeModal();
				if (document.getElementById("playlists-content").style.display == "grid") {
					document.getElementById("playlists").click();
				}
			});
		} else {
			closeModal();
			if (document.getElementById("playlists-content").style.display == "grid") {
				document.getElementById("playlists").click();
			}
		}
	} catch (err) {
		console.error("Error saving playlist:", err);
		alert("Error saving playlist. Please try again.");
	}
});

function openCustomizeModal(songName, thumbnailUrl) {
	customizeModal.style.display = "block";
	document.getElementById("customizeSongName").value = songName.slice(0, -4);
	const oldThumbnailPath = path.join(thumbnailFolder, songName + "_thumbnail.jpg");
	const customizeForm = document.getElementById("customizeForm");
	document.getElementById("customiseImage").src = path.join(thumbnailFolder, songName.slice(0, -4) + "_thumbnail.jpg");
	customizeForm.dataset.oldSongName = songName;
	customizeForm.dataset.oldThumbnailPath = oldThumbnailPath;
	domates = songName;
	domates2 = domates.slice(0, -4) + "_thumbnail.jpg";
}

document.getElementById("customizeForm").addEventListener("submit", function (event) {
	event.preventDefault();

	const oldSongName = document.getElementById("customizeForm").dataset.oldSongName;
	const oldThumbnailBase = document.getElementById("customizeForm").dataset.oldThumbnailPath.replace(".mp3", "");
	const newSongName = document.getElementById("customizeSongName").value.trim();
	const newThumbnailFile = document.getElementById("customizeThumbnail").files[0];

	const oldSongPath = path.join(musicFolder, oldSongName);
	const newSongFilePath = path.join(musicFolder, newSongName + ".mp3");

	const oldThumbnailPath = oldThumbnailBase + "_thumbnail.jpg";
	const newThumbnailPath = path.join(thumbnailFolder, newSongName + "_thumbnail.jpg");

	if (!fs.existsSync(oldSongPath)) {
		console.error("Old song file does not exist:", oldSongPath);
		return;
	}

	fs.renameSync(oldSongPath, newSongFilePath);

	if (newThumbnailFile) {
		const reader = new FileReader();
		reader.onload = function (e) {
			const base64Data = e.target.result.replace(/^data:image\/jpeg;base64,/, "");
			fs.writeFileSync(newThumbnailPath, base64Data, "base64");
			if (fs.existsSync(oldThumbnailPath)) fs.unlinkSync(oldThumbnailPath);
		};
		reader.readAsDataURL(newThumbnailFile);
	} else {
		if (fs.existsSync(oldThumbnailPath)) {
			fs.renameSync(oldThumbnailPath, newThumbnailPath);
		}
	}

	const song = musicsDb.prepare("SELECT * FROM songs WHERE name = ?").get(oldSongName);
	if (song) {
		musicsDb.prepare("UPDATE songs SET name = ?, thumbnail = ? WHERE song_id = ?").run(newSongName, newThumbnailPath, song.song_id);

		musicsDb.prepare("UPDATE song_play_time SET songName = ? WHERE songName = ?").run(newSongName, oldSongName);

		console.log("Updated song metadata and play time references.");
	} else {
		console.warn("No song entry found for:", oldSongName);
	}

	const playlists = playlistsDb.prepare("SELECT * FROM playlists").all();
	for (const playlist of playlists) {
		const songIds = playlist.songs.split(",");
		const updated = songIds.map(id => (id === song.song_id ? song.song_id : id)).join(",");
		playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE playlist_id = ?").run(updated, playlist.playlist_id);
	}

	customizeModal.style.display = "none";
	document.getElementById("my-music").click();
});

function removeSong() {
	if (!confirm("Are you sure you want to remove this song?")) return;

	const musicFilePath = path.join(musicFolder, domates);
	const thumbnailFilePath = path.join(thumbnailFolder, domates2);
	const songName = path.parse(domates).name;

	if (fs.existsSync(musicFilePath)) fs.unlinkSync(musicFilePath);
	if (fs.existsSync(thumbnailFilePath)) fs.unlinkSync(thumbnailFilePath);

	const song = musicsDb.prepare("SELECT * FROM songs WHERE name = ?").get(songName);
	if (song) {
		musicsDb.prepare("DELETE FROM songs WHERE song_id = ?").run(song.song_id);
		musicsDb.prepare("DELETE FROM song_play_time WHERE songName = ?").run(song.name);
		playlistsDb.prepare("DELETE FROM playlists WHERE song_id = ?").run(song.song_id);
		console.log("Song and related DB entries deleted.");
	} else {
		console.warn("Song not found in musicsDb:", songName);
	}

	closeModal();
	document.getElementById("my-music").click();
}

function deletePlaylist() {
	if (!confirm("Are you sure you want to remove this playlist?")) return;

	const playlistName = document.getElementById("editInvisibleName").value;

	const playlist = playlistsDb.prepare("SELECT * FROM playlists WHERE name = ?").get(playlistName);
	if (!playlist) {
		console.error("Playlist not found:", playlistName);
		return;
	}

	playlistsDb.prepare("DELETE FROM playlists WHERE id = ?").run(playlist.id);

	console.log(`Deleted playlist "${playlistName}" and its song links.`);

	closeModal();
	document.getElementById("settings").click();
	document.getElementById("playlists").click();
}

document.querySelectorAll(".settingsKeybindsButton").forEach(button => {
	button.addEventListener("click", function () {
		const currentButton = this;
		currentButton.innerText = "Press a key...";
		disableKeyPresses = 1;

		function handleKeyPress(event) {
			currentButton.innerText = event.key;
			document.removeEventListener("keydown", handleKeyPress);
			disableKeyPresses = 0;
		}

		document.addEventListener("keydown", handleKeyPress);
	});
});

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

window.addEventListener("focus", () => {
	const el = document.activeElement;
	if (el && typeof el.blur === "function") {
		el.blur();
	}
});

document.addEventListener("keydown", event => {
	if (event.key === "Tab") {
		event.preventDefault();
	}

	if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || disableKeyPresses == 1) {
		return;
	}

	if (event.key === key_Rewind) {
		skipBackward();
	} else if (event.key === key_Previous) {
		playPreviousSong();
	} else if (event.key === key_PlayPause) {
		if (audioElement.paused) {
			audioElement.play();
			playButton.style.display = "none";
			pauseButton.style.display = "inline-block";
		} else {
			audioElement.pause();
			pauseButton.style.display = "none";
			playButton.style.display = "inline-block";
		}
	} else if (event.key === key_Next) {
		playNextSong();
	} else if (event.key === key_Skip) {
		skipForward();
	} else if (event.key === key_Autoplay) {
		toggleAutoplay();
	} else if (event.key === key_Shuffle) {
		toggleShuffle();
	} else if (event.key === key_Mute) {
		mute();
	} else if (event.key === key_Speed) {
		document.getElementById("speedModal").style.display == "none" ? speed() : closeModal();
	} else if (event.key === key_Loop) {
		loop();
	}
});

function findDuplicates(array) {
	const seen = new Set();
	const duplicates = new Set();

	for (const item of array) {
		if (seen.has(item)) {
			duplicates.add(item);
		}
		seen.add(item);
	}

	return Array.from(duplicates);
}

function saveKeybinds() {
	const buttons = Array.from(document.querySelectorAll(".settingsKeybindsButton")).map(button => button.innerText.trim());
	const test = findDuplicates(buttons);

	if (test.length > 0) {
		alert(`This key is a duplicate: ${test[0]}`);
		return;
	}

	updateDatabase("key_Rewind", document.getElementById("settingsRewind").innerHTML, settingsDb);
	updateDatabase("key_Previous", document.getElementById("settingsPrevious").innerHTML, settingsDb);
	updateDatabase("key_PlayPause", document.getElementById("settingsPlayPause").innerHTML, settingsDb);
	updateDatabase("key_Next", document.getElementById("settingsNext").innerHTML, settingsDb);
	updateDatabase("key_Skip", document.getElementById("settingsSkip").innerHTML, settingsDb);
	updateDatabase("key_Autoplay", document.getElementById("settingsAutoplay").innerHTML, settingsDb);
	updateDatabase("key_Shuffle", document.getElementById("settingsShuffle").innerHTML, settingsDb);
	updateDatabase("key_Mute", document.getElementById("settingsMute").innerHTML, settingsDb);
	updateDatabase("key_Speed", document.getElementById("settingsSpeed").innerHTML, settingsDb);
	updateDatabase("key_Loop", document.getElementById("settingsLoop").innerHTML, settingsDb);

	key_Rewind = document.getElementById("settingsRewind").innerHTML;
	key_Previous = document.getElementById("settingsPrevious").innerHTML;
	key_PlayPause = document.getElementById("settingsPlayPause").innerHTML;
	key_Next = document.getElementById("settingsNext").innerHTML;
	key_Skip = document.getElementById("settingsSkip").innerHTML;
	key_Autoplay = document.getElementById("settingsAutoplay").innerHTML;
	key_Shuffle = document.getElementById("settingsShuffle").innerHTML;
	key_Mute = document.getElementById("settingsMute").innerHTML;
	key_Speed = document.getElementById("settingsSpeed").innerHTML;
	key_Loop = document.getElementById("settingsLoop").innerHTML;
}

function setupLazyBackgrounds() {
	const bgElements = document.querySelectorAll(".background-element");

	bgElements.forEach(el => {
		const currentBg = el.style.backgroundImage;
		const urlMatch = currentBg.match(/url\(["']?(file:\/\/[^"')]+)["']?\)/);

		if (urlMatch && !el.dataset.bg) {
			const actualUrl = urlMatch[1];
			el.dataset.bg = actualUrl;

			el.style.backgroundImage = `file://${path.join(appThumbnailFolder, "placeholder.jpg").replace(/\\/g, "/")}`;
			el.classList.add("lazy-bg");
		}
	});

	if ("IntersectionObserver" in window) {
		const observer = new IntersectionObserver((entries, obs) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					const el = entry.target;
					const realBg = el.dataset.bg;
					if (realBg) {
						el.style.backgroundImage = `url('${realBg}')`;
						el.classList.remove("lazy-bg");
						obs.unobserve(el);
					}
				}
			});
		});

		document.querySelectorAll(".lazy-bg").forEach(el => observer.observe(el));
	} else {
		document.querySelectorAll(".lazy-bg").forEach(el => {
			if (el.dataset.bg) {
				el.style.backgroundImage = `url('${el.dataset.bg}')`;
				el.classList.remove("lazy-bg");
			}
		});
	}
}

function loadJSFile(filename) {
	if (filename === "download_music") {
		downloadModal.style.display = "block";
	}
	const src = `${filename}.js`;
	const existingScript = Array.from(document.scripts).find(script => script.src.includes(src));
	if (existingScript) {
		return;
	}

	const script = document.createElement("script");
	script.src = src;
	script.onload = function () {
		if (filename === "download_music") {
			document.getElementById("downloadFirstInput").value = "";

			const secondPhase = document.getElementById("downloadSecondPhase");
			if (secondPhase) {
				secondPhase.remove();
			}
		}
	};

	document.body.appendChild(script);
}

ipcRenderer.invoke("get-app-version").then(version => {
	document.getElementById("version").textContent = `Version: ${version}`;
});

setupLazyBackgrounds();
