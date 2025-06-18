// renderer.js

const { ipcRenderer } = require("electron");
const icon = require("./svg.js");
const path = require("path");
const https = require("https");
const fs = require("fs");
const Database = require("better-sqlite3");

let taratorFolder;
let musicFolder, thumbnailFolder, appThumbnailFolder, databasesFolder, childProcessesFolder;
let settingsDbPath, playlistsDbPath, musicsDbPath;
let settingsDb = {},
	playlistsDb = {},
	musicsDb = {};

(async () => {
	taratorFolder = await ipcRenderer.invoke("get-app-base-path");
	console.log(taratorFolder);

	musicFolder = path.join(taratorFolder, "musics");
	thumbnailFolder = path.join(taratorFolder, "thumbnails");
	appThumbnailFolder = path.join(taratorFolder, "app_thumbnails");
	databasesFolder = path.join(taratorFolder, "databases");
	childProcessesFolder = path.join(taratorFolder, "child-processes");

	settingsDbPath = path.join(databasesFolder, "settings.db");
	playlistsDbPath = path.join(databasesFolder, "playlists.db");
	musicsDbPath = path.join(databasesFolder, "musics.db");	

	if (!fs.existsSync(musicFolder)) fs.mkdirSync(musicFolder);
	if (!fs.existsSync(thumbnailFolder)) fs.mkdirSync(thumbnailFolder);
	if (!fs.existsSync(databasesFolder)) fs.mkdirSync(databasesFolder);
	if (!fs.existsSync(appThumbnailFolder)) createAppThumbnailsFolder();

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
const volumeControl = document.getElementById("volume");

volumeControl.addEventListener("change", () => {
	updateDatabase("volume", volumeControl.value, settingsDb);
	if (audioElement) {
		audioElement.volume = volumeControl.value / 100 / dividevolume;
	}
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
let fileToDelete = null;
let playedSongs = [];
let newPlaylistName = null;
let disableKeyPresses = 0;
let songStartTime = 0;
let previousVolume = null;
let audioContext;
let audioSource;
let latestReleaseNotes = "You are using the latest version of TaratorMusic.";
const debounceMap = new Map();
let oldItemsPerRow = null;
let resizeTimeout;

let totalTimeSpent;
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
let dividevolume;
let displayCount;
let activateRms;
let lazyLoadSize;
let background;

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
	dividevolume: 1,
	displayCount: 50,
	activateRms: 1,
	lazyLoadSize: 100,
	background: "blue",
};

function initializeSettingsDatabase() {
	let tableExists = false;

	try {
		const row = settingsDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
		tableExists = !!row;
	} catch (err) {
		console.error("Error checking for settings table:", err.message);
		return;
	}

	if (!tableExists) {
		console.log("Settings table not found. Creating...");
		const keys = Object.keys(defaultSettings);
		let createTableSQL = `CREATE TABLE settings (`;

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
		} catch (err) {
			console.error("Error creating settings table:", err.message);
			return;
		}
	} else {
		console.log("Settings table exists. Checking columns...");

		try {
			const columns = settingsDb.prepare("PRAGMA table_info(settings)").all();
			const existingColumns = columns.map(col => col.name);
			const missingColumns = Object.keys(defaultSettings).filter(key => !existingColumns.includes(key));

			if (missingColumns.length > 0) {
				console.log("Adding missing columns...");
				missingColumns.forEach(key => {
					const columnType = typeof defaultSettings[key] === "number" ? "INTEGER" : "TEXT";
					try {
						settingsDb.prepare(`ALTER TABLE settings ADD COLUMN ${key} ${columnType} DEFAULT '${defaultSettings[key]}'`).run();
						console.log(`Added missing column: ${key}`);
					} catch (err) {
						console.error(`Error adding column ${key}:`, err.message);
					}
				});
			}
		} catch (err) {
			console.error("Error fetching table info:", err.message);
			return;
		}
	}

	let settingsRow;
	try {
		settingsRow = settingsDb.prepare("SELECT * FROM settings").get();
	} catch (err) {
		console.error("Error retrieving settings:", err.message);
		return;
	}

	if (!settingsRow) {
		console.log("No settings found, inserting defaults.");
		const columns = Object.keys(defaultSettings).join(", ");
		const placeholders = Object.keys(defaultSettings)
			.map(() => "?")
			.join(", ");
		const values = Object.values(defaultSettings);
		const insertSQL = `INSERT INTO settings (${columns}) VALUES (${placeholders})`;

		try {
			settingsDb.prepare(insertSQL).run(values);
			console.log("Default settings inserted.");
			settingsRow = settingsDb.prepare("SELECT * FROM settings").get();
		} catch (err) {
			console.error("Error inserting default settings:", err.message);
			return;
		}
	} else {
		let needsUpdate = false;
		Object.keys(defaultSettings).forEach(key => {
			if (settingsRow[key] === null || settingsRow[key] === undefined) {
				console.log(`Setting ${key} is null, reverting to default: ${defaultSettings[key]}`);
				try {
					settingsDb.prepare(`UPDATE settings SET ${key} = ?`).run(defaultSettings[key]);
					settingsRow[key] = defaultSettings[key];
					needsUpdate = true;
				} catch (err) {
					console.error(`Error setting default for ${key}:`, err.message);
				}
			}
		});

		if (needsUpdate) {
			console.log("Updated missing default values.");
		}
	}

	console.log("Settings loaded:", settingsRow);

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
	totalTimeSpent = settingsRow.totalTimeSpent;
	rememberautoplay = settingsRow.rememberautoplay;
	remembershuffle = settingsRow.remembershuffle;
	rememberloop = settingsRow.rememberloop;
	rememberspeed = settingsRow.rememberspeed;
	maximumPreviousSongCount = settingsRow.maximumPreviousSongCount;
	volume = settingsRow.volume;
	dividevolume = settingsRow.dividevolume;
	displayCount = settingsRow.displayCount;
	activateRms = settingsRow.activateRms;
	lazyLoadSize = settingsRow.lazyLoadSize;
	background = settingsRow.background;

	updateTimer();
	rememberautoplay && toggleAutoplay();
	remembershuffle && toggleShuffle();
	rememberloop && loop();
	document.getElementById("arrayLength").value = maximumPreviousSongCount;
	volumeControl.value = volume;
	if (audioElement) audioElement.volume = volumeControl.value / 100 / dividevolume;

	setupLazyBackgrounds();
	document.getElementById("main-menu").click();
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

	const columns = musicsDb
		.prepare(`PRAGMA table_info(songs)`)
		.all()
		.map(col => col.name);

	if (!columns.includes("song_length")) {
		musicsDb.prepare(`ALTER TABLE songs ADD COLUMN song_length INTEGER`).run();
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

function updateDatabase(name, option, db) {
	const key = `${name}`;

	if (debounceMap.has(key)) clearTimeout(debounceMap.get(key));

	const timeout = setTimeout(() => {
		try {
			db.prepare(`UPDATE settings SET ${name} = ?`).run(option);
			console.log(`${name} updated to ${option}.`);
		} catch (err) {
			console.error(`Error updating ${name}:`, err.message);
		}
		debounceMap.delete(key);
	}, 300);

	debounceMap.set(key, timeout);
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
		document.querySelectorAll(".tab-content").forEach(content => {
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
				setupLazyBackgrounds();
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
	controlsBar.style.justifyContent = "center";
	controlsBar.style.alignItems = "center";

	const musicSearch = document.createElement("input");
	musicSearch.type = "text";
	musicSearch.id = "music-search";
	musicSearch.placeholder = `Search in ${taratorFolder}...`;
	musicSearch.style.flex = "1";

	const displayCountSelect = document.createElement("select");
	displayCountSelect.id = "display-count";

	displayCountSelect.innerHTML = "";
	[0, 1, 2, 3, 4, 6, 8, 16, "All"].forEach(count => {
		const option = document.createElement("option");
		option.value = count;
		option.innerText = count === "All" ? "Show All" : `Show ${count} Rows`;
		if (count == displayCount || (displayCount == 9999999 && count === "All")) {
			option.selected = true;
		}

		displayCountSelect.appendChild(option);
	});

	displayCountSelect.onchange = function () {
		handleDropdownChange("displayCount", this);
	};

	const songAmount = document.createElement("div");
	songAmount.innerText = musicsDb.prepare('SELECT COUNT(*) AS count FROM songs').get().count;
	songAmount.innerText += " songs."

	controlsBar.appendChild(musicSearch);
	controlsBar.appendChild(songAmount);
	controlsBar.appendChild(displayCountSelect);
	myMusicContent.appendChild(controlsBar);

	const musicListContainer = document.createElement("div");
	musicListContainer.id = "music-list-container";
	musicListContainer.style.display = "grid";
	musicListContainer.style.gridTemplateColumns = "repeat(auto-fill, minmax(200px, 1fr))";
	musicListContainer.style.gap = "5px";
	myMusicContent.appendChild(musicListContainer);

	let musicFiles = [];

	try {
		const rows = musicsDb.prepare("SELECT song_id, song_thumbnail FROM songs").all();
		musicFiles = rows
			.filter(row => row.song_id && row.song_thumbnail)
			.map(row => {
				return {
					name: row.song_id + ".mp3",
					thumbnail: `file://${row.song_thumbnail}`,
				};
			});

		musicFiles.sort((a, b) => {
			const idA = a?.name?.replace(/\.mp3$/, "") || "";
			const idB = b?.name?.replace(/\.mp3$/, "") || "";
			const nameA = (getSongNameById(idA) || "").toLowerCase();
			const nameB = (getSongNameById(idB) || "").toLowerCase();
			return nameA.localeCompare(nameB);
		});

		if (musicFiles.length === 0) {
			myMusicContent.innerHTML = "No songs? Use the download feature on the left, or add some mp3 files to the 'musics' folder.";
			myMusicContent.style.display = "block";
			return;
		}

		let songNamesArray = [];

		for (i = 0; i < musicFiles.length; i++) {
			songNamesArray.push(getSongNameById(musicFiles[i].name.replace(".mp3", "")));
		}

		let filteredSongs = [...musicFiles];

		function renderSongs() {
			musicListContainer.innerHTML = "";
			const count = displayCount === "All" ? filteredSongs.length : parseInt(displayCount * oldItemsPerRow);
			const visibleSongs = filteredSongs.slice(0, count);
			visibleSongs.forEach(file => {
				const musicElement = createMusicElement(file);

				if (file.name.slice(0, -4) === secondfilename.replace(".mp3", "")) {
					musicElement.classList.add("playing");
				}

				musicElement.addEventListener("click", () => {
					playMusic(file, musicElement, false);
				});

				musicListContainer.appendChild(musicElement);
			});
			setupLazyBackgrounds();
		}

		function calculateItemsPerRowInMusicTab() {
			let theWidth = document.getElementById("content").offsetWidth;
			let itemsPerRow = Math.floor((theWidth - 53) / 205);

			if (itemsPerRow != oldItemsPerRow && oldItemsPerRow != null) {
				oldItemsPerRow = itemsPerRow;
				renderSongs();
			} else {
				oldItemsPerRow = itemsPerRow;
			}
		}

		window.addEventListener("resize", () => {
			clearTimeout(resizeTimeout);
			resizeTimeout = setTimeout(calculateItemsPerRowInMusicTab, 250);
		});

		calculateItemsPerRowInMusicTab();

		musicSearch.addEventListener("input", () => {
			filteredSongs = musicFiles.filter(file => {
				const songName = getSongNameById(file.name.replace(".mp3", ""));
				return songName && songName.toLowerCase().includes(musicSearch.value.trim().toLowerCase());
			});

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
	const thumbnailFileName = `${fileNameWithoutExtension}.jpg`;
	const thumbnailPath = path.join(thumbnailFolder, thumbnailFileName.replace(/%20/g, " "));
	let realUrl = null;
	if (fs.existsSync(thumbnailPath)) {
		const cacheBuster = `?t=${Date.now()}`;
		realUrl = `file://${thumbnailPath.replace(/\\/g, "/")}${cacheBuster}`;
	}

	const backgroundElement = document.createElement("div");
	backgroundElement.classList.add("background-element");

	if (realUrl) {
		backgroundElement.dataset.bg = realUrl;
	}

	musicElement.appendChild(backgroundElement);

	const songNameElement = document.createElement("div");
	songNameElement.classList.add("song-name");
	songNameElement.innerText = getSongNameById(fileNameWithoutExtension);

	const songLengthElement = document.createElement("div");
	songLengthElement.classList.add("song-length");
	let lengthSec = 0;
	try {
		const row = musicsDb.prepare("SELECT song_length FROM songs WHERE song_id = ?").get(fileNameWithoutExtension);
		lengthSec = row ? row.song_length : 0;
	} catch {
		lengthSec = 0;
	}
	songLengthElement.innerText = formatTime(lengthSec);

	const customizeButton = document.createElement("button");
	customizeButton.innerHTML = icon.customise;
	customizeButton.classList.add("customize-button");
	customizeButton.addEventListener("click", event => {
		event.stopPropagation();
		openCustomizeModal(file.name);
	});

	const addToPlaylistButton = document.createElement("button");
	addToPlaylistButton.innerHTML = icon.addToPlaylist;
	addToPlaylistButton.classList.add("add-to-playlist-button");
	addToPlaylistButton.addEventListener("click", event => {
		event.stopPropagation();
		openAddToPlaylistModal(fileNameWithoutExtension);
	});

	musicElement.appendChild(songLengthElement);
	musicElement.appendChild(songNameElement);
	musicElement.appendChild(customizeButton);
	musicElement.appendChild(addToPlaylistButton);

	return musicElement;
}

function applyRmsEffect() {
	if (!audioContext || !audioSource) return;

	try {
		audioSource.disconnect();
	} catch (err) {
		console.warn("Audio source disconnect error:", err);
	}

	if (activateRms === 1) {
		let newGain;
		try {
			const row = musicsDb.prepare("SELECT rms FROM songs WHERE song_name = ?").get(secondfilename);
			const measuredRms = row ? row.rms : 0.07;
			const targetRms = 0.07;
			newGain = targetRms / measuredRms;
			newGain = Math.min(Math.max(newGain, 0.5), 1.5);
		} catch (err) {
			console.warn("Could not load RMS from database:", err);
			newGain = 1;
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
	} else {
		audioSource.connect(audioContext.destination);
	}
}

async function playMusic(file, boop, isPlaylist) {
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

		songName.textContent = getSongNameById(file.name.slice(0, -4));

		audioElement.src = `file://${path.join(musicFolder, secondfilename)}`;
		audioElement.volume = volumeControl.value / 100 / dividevolume;
		audioElement.playbackRate = rememberspeed;
		audioElement.loop = isLooping === true;

		if (!audioContext) {
			audioContext = new AudioContext();
		}

		audioSource = audioContext.createMediaElementSource(audioElement);
		applyRmsEffect();

		await audioElement.play();
		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";

		const fileNameWithoutExtension = path.parse(file.name).name;
		const encodedFileName = encodeURIComponent(fileNameWithoutExtension);
		const decodedFileName = decodeURIComponent(encodedFileName);
		const thumbnailFileName = `${decodedFileName}.jpg`;
		const thumbnailPath = path.join(thumbnailFolder, thumbnailFileName.replace(/%20/g, " "));
		let thumbnailUrl = path.join(appThumbnailFolder, "placeholder.jpg".replace(/%20/g, " "));

		if (fs.existsSync(thumbnailPath)) {
			thumbnailUrl = `file://${thumbnailPath.replace(/\\/g, "/")}`;
		} else {
			console.log("Tried to get thumbnail from", thumbnailPath, "but failed. Used", thumbnailUrl, "instead.");
		}

		document.getElementById("videothumbnailbox").style.backgroundImage = `url('${thumbnailUrl}')`;

		document.querySelectorAll(".music-item.playing").forEach(el => el.classList.remove("playing"));
		document.querySelectorAll(".music-item").forEach(musicElement => {
			if (musicElement.getAttribute("data-file-name").slice(0, -4) === secondfilename.replace(".mp3", "")) {
				musicElement.classList.add("playing");
			}
		});

		currentPlayingElement = songName;
		currentPlayingElement.setAttribute("data-file-name", secondfilename);
		updateDiscordPresence();

		if (isShuffleActive) {
			if (currentPlaylist) {
				if (newPlaylistName !== currentPlaylist.name) {
					newPlaylistName = currentPlaylist.name;
					playlistPlayedSongs.splice(0, maximumPreviousSongCount);
				}
				playlistPlayedSongs.unshift(secondfilename);
				if (playlistPlayedSongs.length > maximumPreviousSongCount) {
					playlistPlayedSongs.pop();
				}
			} else {
				playedSongs.unshift(secondfilename);
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

	volumeControl.addEventListener("input", () => {
		audioElement.volume = volumeControl.value / 100 / dividevolume;
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

async function playPlaylist(playlist, startingIndex = 0) {
	if (!playlist.songs || playlist.songs.length === 0) {
		console.error(`Playlist ${playlist.name} is empty.`);
		return;
	}

	currentPlaylist = playlist;

	for (let i = startingIndex; i < playlist.songs.length; i++) {
		let songName = playlist.songs[i] + ".mp3";
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
				const previousSongName = playlistPlayedSongs[1];
				const file = { name: previousSongName };
				playMusic(file, null, true);
				playlistPlayedSongs.splice(0, 2);
			}
		} else {
			if (playedSongs.length > 1) {
				const previousSongName = playedSongs[1];
				const file = { name: previousSongName };
				playMusic(file, null, false);
				playedSongs.splice(0, 2);
			}
		}
	} else {
		if (currentPlaylist) {
			if (currentPlaylistElement > 0) {
				const previousSongName = currentPlaylist.songs[currentPlaylistElement - 1];
				const file = { name: previousSongName + ".mp3" };
				playMusic(file, null, true);
				currentPlaylistElement--;
			}
		} else {
			const parts = audioElement.src.split("/");
			const currentFileName = parts[parts.length - 1].replace(".mp3", "");

			const currentIndex = sortedSongIds.indexOf(currentFileName);
			if (currentIndex === -1) {
				return;
			}

			const previousIndex = currentIndex > 0 ? currentIndex - 1 : sortedSongIds.length - 1;
			const previousSongId = sortedSongIds[previousIndex];

			const file = { name: previousSongId + ".mp3" };
			playMusic(file, null, false);
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
			if (currentPlaylist.songs.length === 1) {
				nextSongId = currentSongId;
			} else {
				let randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);
				while (currentPlaylist.songs[randomIndex] === currentSongId) {
					randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);
				}
				nextSongId = currentPlaylist.songs[randomIndex];
				currentPlaylistElement = randomIndex;
			}
		} else {
			const parts = audioElement.src.split("/");
			const currentFileName = parts[parts.length - 1].replace(".mp3", "");
			if (sortedSongIds.length === 1) {
				nextSongId = currentFileName;
			} else {
				let randomIndex = Math.floor(Math.random() * sortedSongIds.length);
				while (sortedSongIds[randomIndex] === currentFileName) {
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
			const currentFileName = parts[parts.length - 1].replace(".mp3", "");
			const currentIndex = sortedSongIds.indexOf(currentFileName);
			const nextIndex = currentIndex < sortedSongIds.length - 1 ? currentIndex + 1 : 0;
			nextSongId = sortedSongIds[nextIndex];
		}
	}

	if (nextSongId) {
		const file = { name: nextSongId + ".mp3" };
		playMusic(file, null, !!currentPlaylist);
	}
}

async function randomSongFunctionMainMenu() {
	const musicItems = musicsDb.prepare("SELECT song_id, song_name FROM songs").all();
	let randomIndex = Math.floor(Math.random() * musicItems.length);

	if (currentPlayingElement) {
		const currentSongName = document.getElementById("song-name").innerText + ".mp3";
		while (musicItems[randomIndex] === currentSongName) {
			randomIndex = Math.floor(Math.random() * musicItems.length);
		}
	}

	const nextSongName = musicItems[randomIndex].song_id;
	const file = { name: nextSongName + ".mp3" };
	playMusic(file, null, false);
}

async function randomPlaylistFunctionMainMenu() {
	const playlists = playlistsDb.prepare("SELECT id, name, songs FROM playlists").all();

	const nonEmptyPlaylists = playlists
		.map(pl => ({
			...pl,
			songs: JSON.parse(pl.songs),
		}))
		.filter(pl => Array.isArray(pl.songs) && pl.songs.length > 0);

	if (nonEmptyPlaylists.length === 0) {
		console.error("No playlists with songs found.");
		return;
	}

	const availablePlaylists = currentPlaylist ? nonEmptyPlaylists.filter(pl => pl.name !== currentPlaylist.name) : nonEmptyPlaylists;

	if (availablePlaylists.length === 0) {
		console.error("No other playlists available to play.");
		return;
	}

	const randomIndex = Math.floor(Math.random() * availablePlaylists.length);
	const selectedPlaylist = availablePlaylists[randomIndex];

	await playPlaylist(selectedPlaylist, 0);
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
		document.getElementById("loopButton").innerHTML = icon.redLoop;
		updateDatabase("rememberloop", 0, settingsDb);
		if (audioElement) {
			audioElement.loop = false;
		}
	} else {
		isLooping = true;
		document.getElementById("loopButton").innerHTML = icon.greenLoop;
		updateDatabase("rememberloop", 1, settingsDb);
		if (audioElement) {
			audioElement.loop = true;
		}
	}
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
	updateDatabase("volume", volumeControl.value, settingsDb);
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
			updateDatabase("rememberspeed", speed, settingsDb);
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

function closeModal() {
	document.querySelectorAll(".modal").forEach(modal => {
		modal.style.display = "none";
	});
}

function updateThumbnailImage(event, mode) {
	const file = event.target.files[0];
	if (file && file.type === "image/jpeg") {
		const reader = new FileReader();
		reader.onload = e => {
			if (typeof mode === "number") {
				const id = mode === 1 ? "customiseImage" : mode === 2 ? "editPlaylistThumbnail" : mode === 3 ? "thumbnailImage" : null;
				if (id) document.getElementById(id).src = e.target.result;
			} else if (mode instanceof HTMLElement) {
				mode.style.backgroundImage = `url(${e.target.result})`;
			}
		};
		reader.readAsDataURL(file);
	} else {
		alert("Please select a valid JPG image.");
	}
}

function openCustomizeModal(songName) {
	const baseName = getSongNameById(songName.replace(".mp3", ""));
	const oldThumbnailPath = path.join(thumbnailFolder, songName.replace(".mp3", "") + ".jpg");
	fileToDelete = songName.replace(".mp3", "");

	document.getElementById("customizeSongName").value = baseName;
	document.getElementById("customiseImage").src = path.join(thumbnailFolder, baseName + ".jpg");
	document.getElementById("customizeModal").style.display = "block";
	document.getElementById("customizeSongName").value = baseName;
	document.getElementById("customiseImage").src = oldThumbnailPath;

	const customizeDiv = document.getElementById("customizeModal");
	customizeDiv.dataset.oldSongName = baseName;
	customizeDiv.dataset.oldThumbnailPath = oldThumbnailPath;
	customizeDiv.dataset.songID = songName;
}

function saveEditedSong() {
	const customizeDiv = document.getElementById("customizeModal");
	const newNameInput = document.getElementById("customizeSongName").value.trim();

	if (newNameInput.length < 1) {
		alert("Please do not set a song name empty.");
		return;
	}

	const songID = customizeDiv.dataset.songID.replace(".mp3", "");
	const thumbnailPath = path.join(thumbnailFolder, `${songID}.jpg`);
	const oldName = customizeDiv.dataset.oldSongName;

	const newThumbFile = document.getElementById("customizeThumbnail").files[0];
	let reloadSrc = `${thumbnailPath}?t=${Date.now()}`;

	if (newThumbFile) {
		const data = fs.readFileSync(newThumbFile.path);
		fs.writeFileSync(thumbnailPath, data);
		if (thumbnailPath !== thumbnailPath && fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
	}

	musicsDb.prepare("UPDATE songs SET song_name = ?, song_thumbnail = ? WHERE song_id = ?").run(newNameInput, thumbnailPath, songID);

	document.getElementById("customizeModal").style.display = "none";
	document.getElementById("my-music").click();

	if (document.getElementById("song-name").innerText == oldName) {
		document.getElementById("song-name").innerText = newNameInput;
		document.getElementById("videothumbnailbox").style.backgroundImage = `url("${reloadSrc}")`;
	}

	new Promise((resolve, reject) => {
		// When the new box in the new menu gets initialised, this will run
		const timeout = 5000;
		const start = Date.now();
		const interval = setInterval(() => {
			const el = document.querySelector(`.music-item[data-file-name="${songID + ".mp3"}"]`);
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
			if (newNameInput == secondfilename.replace(".mp3", "")) el.classList.add("playing");
			el.querySelector(".song-name").textContent = newNameInput;
			el.querySelector(".background-element").style.backgroundImage = `url("${reloadSrc}")`;
		})
		.catch(console.error);
}

function removeSong() {
	if (!confirm("Are you sure you want to delete this song?")) return;

	const musicFilePath = path.join(musicFolder, fileToDelete + ".mp3");
	const thumbnailFilePath = path.join(thumbnailFolder, fileToDelete + ".jpg");

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
	document.getElementById("my-music").click();
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
	const bgElements = document.querySelectorAll(".background-element[data-bg]");
	const vh = window.innerHeight;
	const margin = `${(lazyLoadSize / 100) * vh}px 0px`;

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
				rootMargin: margin, // How large the loaded area is
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

function loadJSFile(filename) {
	if (filename === "download_music") {
		document.getElementById("downloadModal").style.display = "block";
	}

	const src = `${filename}.js`;
	const existingScript = Array.from(document.scripts).find(script => script.src.includes(src));

	if (existingScript) {
		return;
	}

	const script = document.createElement("script");
	script.src = src;
	document.body.appendChild(script);
}

function cleanDownloadModal() {
	document.getElementById("downloadFirstInput").value = "";

	const secondPhase = document.getElementById("downloadSecondPhase");
	if (secondPhase) {
		secondPhase.remove();
	}

	closeModal();
}

function handleDropdownChange(option, selectElement) {
	const selectedValue = option == "displayCount" && selectElement.value == "All" ? 9999999 : Number(selectElement.value);
	console.log("Selected:", selectedValue, "at", option);
	updateDatabase(option, selectedValue, settingsDb);
	if (option == "dividevolume") {
		dividevolume = selectedValue;
		if (audioElement) {
			audioElement.volume = volumeControl.value / 100 / dividevolume;
		}
	} else if (option == "displayCount") {
		displayCount = selectedValue;
	} else if (option == "activateRms") {
		activateRms = selectedValue;
		if (audioElement && audioContext && audioSource) {
			applyRmsEffect();
		}
	}
}

function generateId() {
	const timestamp = Date.now().toString(36);
	const randomPart = Math.floor(Math.random() * 1e6).toString(36);
	return `tarator${timestamp}-${randomPart}`;
}

function getSongNameById(songId) {
	const stmt = musicsDb.prepare("SELECT song_name FROM songs WHERE song_id = ?");
	const row = stmt.get(songId);
	return row ? row.song_name : null;
}

function createAppThumbnailsFolder() {
	fs.mkdirSync(appThumbnailFolder);
	console.log("App thumbnails folder missing. Downloading thumbnails...");
	const filesToDownload = ["https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/app_thumbnails/placeholder.jpg", "https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/app_thumbnails/tarator1024_icon.png", "https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/app_thumbnails/tarator16_icon.png", "https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/app_thumbnails/tarator512_icon.png", "https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/app_thumbnails/tarator_icon.icns", "https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/app_thumbnails/tarator_icon.ico", "https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/app_thumbnails/tarator_icon.png"];

	filesToDownload.forEach(url => {
		const fileName = path.basename(url);
		const filePath = path.join(appThumbnailFolder, fileName);

		if (fs.existsSync(filePath)) {
			console.log(`${fileName} already exists, skipping download.`);
			return;
		}

		const fileStream = fs.createWriteStream(filePath);

		https
			.get(url, res => {
				if (res.statusCode !== 200) {
					console.error(`Failed to download ${fileName}: Status code ${res.statusCode}`);
					fileStream.close();
					fs.unlinkSync(filePath);
					return;
				}

				res.pipe(fileStream);

				fileStream.on("finish", () => {
					fileStream.close();
					console.log(`Downloaded ${fileName}`);
				});
			})
			.on("error", err => {
				console.error(`Error downloading ${fileName}:`, err.message);
				fileStream.close();
				fs.unlinkSync(filePath);
			});
	});
	alert("App thumbnails installed. App restart required for the effects.");
}

function changeBackground(color) {
	background = color;
	updateDatabase("background", color, settingsDb);
	if (background === "blue") {
		document.body.className = "bg-gradient-blue";
	} else if (background === "red") {
		document.body.className = "bg-gradient-red";
	} else if (background === "green") {
		document.body.className = "bg-gradient-green";
	} else if (background === "purple") {
		document.body.className = "bg-gradient-purple";
	} else if (background === "black") {
		document.body.className = "bg-gradient-black";
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

ipcRenderer.invoke("get-app-version").then(version => {
	document.getElementById("version").textContent = `Version: ${version}`;
});

ipcRenderer.on("update-available", (event, releaseNotes) => {
	latestReleaseNotes = releaseNotes;
	document.getElementById("version").classList.add("no-animation");
	document.getElementById("installBtn").disabled = false;
});

ipcRenderer.on("download-progress", (event, percent) => {
	const progressBar = document.getElementById("downloadProgress");
	progressBar.style.width = percent + "%";
	progressBar.innerText = Math.floor(percent) + "%";
});

document.getElementById("version").addEventListener("click", () => {
	document.getElementById("patchNotes").innerHTML = latestReleaseNotes;
	document.getElementById("updateModal").style.display = "block";
});

document.getElementById("installBtn").addEventListener("click", () => {
	document.getElementById("progressContainer").style.display = "block";
	ipcRenderer.send("download-update");
});

document.addEventListener("DOMContentLoaded", function () {
	initializeSettingsDatabase();
	initializeMusicsDatabase();
	initializePlaylistsDatabase();

	if (background === "blue") {
		document.body.className = "bg-gradient-blue";
	} else if (background === "red") {
		document.body.className = "bg-gradient-red";
	} else if (background === "green") {
		document.body.className = "bg-gradient-green";
	} else if (background === "purple") {
		document.body.className = "bg-gradient-purple";
	} else if (background === "black") {
		document.body.className = "bg-gradient-black";
	}

	const divideVolumeSelect = document.getElementById("dividevolume");
	for (let i = 0; i < divideVolumeSelect.options.length; i++) {
		if (divideVolumeSelect.options[i].value == dividevolume) {
			divideVolumeSelect.selectedIndex = i;
			break;
		}
	}

	const activateRmsSelect = document.getElementById("activateRms");
	for (let i = 0; i < activateRmsSelect.options.length; i++) {
		if (activateRmsSelect.options[i].value == activateRms) {
			activateRmsSelect.selectedIndex = i;
			break;
		}
	}

	const lazyLoadSizeSelect = document.getElementById("lazyLoadSize");
	for (let i = 0; i < lazyLoadSizeSelect.options.length; i++) {
		if (lazyLoadSizeSelect.options[i].value == lazyLoadSize) {
			lazyLoadSizeSelect.selectedIndex = i;
			break;
		}
	}
});
