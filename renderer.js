// renderer.js

const { ipcRenderer } = require("electron");
const icon = require("./svg.js");
const { spawn } = require("child_process");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");

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
	updateDatabase("volume", volumeControl.value);
	if (audioElement) {
		audioElement.volume = volume;
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
let isSaveAsPlaylistActive = false;
let disableKeyPresses = 0;
let songStartTime = 0;
let previousVolume = null;
let audioContext;
let compressorNode;
let audioSource;

let totalTimeSpent = 0;
let pytubeStatus;
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

const taratorFolder = __dirname;
const dbPath = path.join(taratorFolder, "appData.db");

if (!fs.existsSync(dbPath)) {
	fs.writeFileSync(dbPath, "");
}

const db = new sqlite3.Database(dbPath, (err) => {
	if (err) {
		console.error("Error opening database:", err.message);
	} else {
		console.log("Connected to the SQLite database.");
		initializeDatabase();
	}
});

const defaultSettings = {
	totalTimeSpent: 0,
	pytubeStatus: 0,
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

function initializeDatabase() {
	db.serialize(() => {
		db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'", (err, row) => {
			if (err) {
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

				db.run(createTableSQL, (err) => {
					if (err) {
						console.error("Error creating settings table:", err.message);
						return;
					}

					console.log("Settings table created successfully.");
					insertDefaultSettings();
				});
			} else {
				console.log("Settings table exists. Checking columns...");
				ensureColumns();
			}
		});
	});
}

function ensureColumns() {
	db.all("PRAGMA table_info(settings)", (err, columns) => {
		if (err) {
			console.error("Error fetching table info:", err.message);
			return;
		}

		const existingColumns = columns.map((col) => col.name);
		const missingColumns = Object.keys(defaultSettings).filter((key) => !existingColumns.includes(key));

		if (missingColumns.length > 0) {
			console.log("Adding missing columns...");

			let columnsProcessed = 0;

			missingColumns.forEach((key) => {
				let columnType = typeof defaultSettings[key] === "number" ? "INTEGER" : "TEXT";
				db.run(`ALTER TABLE settings ADD COLUMN ${key} ${columnType} DEFAULT '${defaultSettings[key]}'`, (err) => {
					if (err) {
						console.error(`Error adding column ${key}:`, err.message);
					} else {
						console.log(`Added missing column: ${key}`);
					}

					columnsProcessed++;

					if (columnsProcessed === missingColumns.length) {
						loadSettings();
					}
				});
			});
		} else {
			loadSettings();
		}
	});
}

function insertDefaultSettings() {
	const columns = Object.keys(defaultSettings).join(", ");
	const placeholders = Object.keys(defaultSettings)
		.map(() => "?")
		.join(", ");
	const values = Object.values(defaultSettings);

	const insertSQL = `INSERT INTO settings (${columns}) VALUES (${placeholders})`;

	db.run(insertSQL, values, function (err) {
		if (err) {
			console.error("Error inserting default settings:", err.message);
			return;
		}

		console.log(`Default settings inserted.`);
		loadSettings();
	});
}

function loadSettings() {
	db.get("SELECT * FROM settings", (err, row) => {
		if (err) {
			console.error("Error retrieving settings:", err.message);
			return;
		}

		if (!row) {
			console.log("No settings found, inserting defaults.");
			insertDefaultSettings();
			return;
		}

		Object.keys(defaultSettings).forEach((key) => {
			if (row[key] === null || row[key] === undefined) {
				console.log(`Setting ${key} is null, reverting to default: ${defaultSettings[key]}`);
				updateDatabase(key, defaultSettings[key]);
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
		pytubeStatus = row.pytubeStatus;
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
	});
}

function updateDatabase(name, option) {
	const db = new sqlite3.Database(dbPath);

	db.run(`UPDATE settings SET ${name} = ?`, [option], function (err) {
		if (err) {
			console.error(`Error updating ${name}:`, err.message);
		} else {
			console.log(`${name} updated to ${option}.`);
		}
	});

	db.close();
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
	updateDatabase("totalTimeSpent", totalTimeSpent);
	updateTimer();
}, 60000);

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
document.getElementById("mainmenulogo").style.backgroundImage = "url(thumbnails/tarator1024_icon.png)";

function changeThePreviousSongAmount() {
	if (document.getElementById("arrayLength").value > 9 && document.getElementById("arrayLength").value < 101) {
		maximumPreviousSongCount = document.getElementById("arrayLength").value;
		updateDatabase("maximumPreviousSongCount", maximumPreviousSongCount);
	} else {
		alert("Please set a number between 10 and 100");
	}
	document.getElementById("arrayLength").value = maximumPreviousSongCount;
}

tabs.forEach((tab) => {
	tab.addEventListener("click", () => {
		tabs.forEach((div) => div.classList.remove("active"));
		tab.classList.add("active");

		const tabContentId = `${tab.id}-content`;
		tabContents.forEach((content) => {
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
					document.getElementById("my-music-content").style.display = "grid";
				} else if (content.id === "playlists-content") {
					document.getElementById("playlists-content").style.display = "grid";
				} else if (content.id === "settings-content") {
					document.getElementById("settings-content").style.display = "flex";
				}
			}
		});
	});
});

async function myMusicOnClick(firsttime) {
	const myMusicContent = document.getElementById("my-music-content");
	myMusicContent.innerHTML = "";

	const musicsearch = document.createElement("input");
	musicsearch.setAttribute("type", "text");
	musicsearch.setAttribute("id", "music-search");
	musicsearch.setAttribute("placeholder", "Search...");

	musicsearch.addEventListener("input", () => {
		const searchQuery = musicsearch.value.trim().toLowerCase();
		const musicItems = myMusicContent.querySelectorAll(".music-item");

		musicItems.forEach((item) => {
			const songName = item.getAttribute("data-file-name").toLowerCase();
			if (songName.includes(searchQuery)) {
				item.style.display = "block";
			} else {
				item.style.display = "none";
			}
		});
	});

	myMusicContent.appendChild(musicsearch);

	const musicFolderPath = path.join(taratorFolder, "musics");

	try {
		const files = await fs.promises.readdir(musicFolderPath);
		const musicFiles = files
			.filter((file) => file.toLowerCase() !== "desktop.ini")
			.map((file) => ({
				name: file,
				thumbnail: `file://${path.join(taratorFolder, "thumbnail", file, "_thumbnail")}`,
			}));

		if (firsttime == 1) {
		} else if (files.length == 0) {
			document.getElementById("my-music-content").innerHTML = "No songs? Use the download feature on the left, or add some mp3 files to the 'musics' folder.";
			document.getElementById("my-music-content").style.display = "block";
			return;
		} else {
			document.getElementById("my-music-content").style.display = "grid";
		}

		musicFiles.forEach((file) => {
			const musicElement = createMusicElement(file);
			myMusicContent.appendChild(musicElement);

			if (currentPlayingElement && file.name === currentPlayingElement.getAttribute("data-file-name")) {
				musicElement.classList.add("playing");
			}

			const backgroundElement = musicElement.querySelector(".background-element");
			if (backgroundElement) {
				backgroundElement.addEventListener("click", () => {
					playMusic(file, musicElement);
				});
			}
		});
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
	const thumbnailFolder = path.join(taratorFolder, "thumbnails");
	const thumbnailFileName = `${decodedFileName}_thumbnail.jpg`;
	const thumbnailPath = path.join(thumbnailFolder, thumbnailFileName.replace(/%20/g, " "));
	if (newThumbnailPath) {
		thumbnailPath = newThumbnailPath;
	}

	let thumbnailUrl = `file://${path.join(thumbnailFolder, "_placeholder.jpg").replace(/\\/g, "/")}`;

	if (fs.existsSync(thumbnailPath)) {
		thumbnailUrl = `file://${thumbnailPath.replace(/\\/g, "/")}`;
	} else {
		console.log("Tried to get thumbnail from", thumbnailPath, "but failed. Used", thumbnailUrl, "instead.");
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
	customizeButton.addEventListener("click", () => {
		openCustomizeModal(file.name, thumbnailUrl);
	});

	const addToPlaylistButton = document.createElement("button");
	addToPlaylistButton.innerHTML = icon.addToPlaylist;
	addToPlaylistButton.classList.add("add-to-playlist-button");
	addToPlaylistButton.addEventListener("click", () => {
		openAddToPlaylistModal(songNameElement.innerHTML);
	});

	musicElement.appendChild(songLengthElement);
	musicElement.appendChild(songNameElement);
	musicElement.appendChild(customizeButton);
	musicElement.appendChild(addToPlaylistButton);

	const audio = new Audio();
	const filePath = path.join(taratorFolder, "musics", file.name);
	audio.src = `file://${filePath}`;
	audio.addEventListener("loadedmetadata", () => {
		songLengthElement.innerText = formatTime(audio.duration);
	});
	return musicElement;
}

async function playMusic(file, clickedElement, isPlaylist = false) {
	const songName = document.getElementById("song-name");

	if (songStartTime != 0) {
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
		const musicPath = path.join(taratorFolder, "musics");
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
			secondfilename = secondfilename + ".mp3";
		}

		audioElement.src = `file://${path.join(musicPath, secondfilename)}`;
		audioElement.volume = volumeControl.value / 100;
		audioElement.playbackRate = rememberspeed;

		if (isLooping === true) {
			audioElement.loop = true;
		} else {
			audioElement.loop = false;
		}

		if (!audioContext) {
			audioContext = new AudioContext();
		}

		audioSource = audioContext.createMediaElementSource(audioElement);

		compressorNode = audioContext.createDynamicsCompressor();

		compressorNode.threshold.value = -50;
		compressorNode.knee.value = 40;
		compressorNode.ratio.value = 12;
		compressorNode.attack.value = 0;
		compressorNode.release.value = 0.25;

		audioSource.connect(compressorNode);
		compressorNode.connect(audioContext.destination);

		await audioElement.play();
		playButton.style.display = "none";
		pauseButton.style.display = "inline-block";

		const fileNameWithoutExtension = path.parse(file.name).name;
		const encodedFileName = encodeURIComponent(fileNameWithoutExtension);
		const decodedFileName = decodeURIComponent(encodedFileName);
		const thumbnailFolder = path.join(taratorFolder, "thumbnails");
		const thumbnailFileName = `${decodedFileName}_thumbnail.jpg`;
		const thumbnailPath = path.join(taratorFolder, "thumbnails", thumbnailFileName.replace(/%20/g, " "));
		let thumbnailUrl = path.join(thumbnailFolder, "_____placeholder.jpg".replace(/%20/g, " "));

		if (fs.existsSync(thumbnailPath)) {
			thumbnailUrl = `file://${thumbnailPath.replace(/\\/g, "/")}`;
		} else {
			console.log("Tried to get thumbnail from", thumbnailPath, "but failed. Used", thumbnailUrl, "instead.");
		}

		videothumbnailbox.style.backgroundImage = `url('${thumbnailUrl}')`;
		const playingElements = document.querySelectorAll(".music-item.playing");
		playingElements.forEach((element) => {
			element.classList.remove("playing");
		});

		document.querySelectorAll(".music-item").forEach((musicElement) => {
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

		return new Promise((resolve) => {
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

async function savePlayedTime(songName, timePlayed) {
	const db = new sqlite3.Database(dbPath);

	db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='song_play_time'", (err, row) => {
		if (err) {
			console.error("Error checking table existence:", err);
			return;
		}

		if (!row) {
			db.run(
				`CREATE TABLE song_play_time (
					songName TEXT PRIMARY KEY,
					secondsPlayed INTEGER,
					timesListened INTEGER
				)`,
				(err) => {
					if (err) {
						console.error("Error creating song_play_time table:", err);
					} else {
						console.log("song_play_time table created.");
						savePlayedTime(songName, timePlayed);
					}
				}
			);
		} else {
			db.all("PRAGMA table_info(song_play_time)", (err, columns) => {
				if (err) {
					console.error("Error fetching table info:", err);
					return;
				}

				const hasTimesListened = columns.some((col) => col.name === "timesListened");

				const continueWithUpdate = () => {
					db.get("SELECT * FROM song_play_time WHERE songName = ?", [songName], (err, row) => {
						if (err) {
							console.error("Error checking song play time:", err);
							return;
						}

						if (row) {
							const updatedTime = row.secondsPlayed + timePlayed;
							const updatedCount = (row.timesListened || 0) + 1;
							db.run("UPDATE song_play_time SET secondsPlayed = ?, timesListened = ? WHERE songName = ?", [updatedTime, updatedCount, songName], (err) => {
								if (err) {
									console.error("Error updating song play time:", err);
								} else {
									console.log(`Updated ${songName}: ${updatedTime}s, listened ${updatedCount} times.`);
								}
							});
						} else {
							db.run("INSERT INTO song_play_time (songName, secondsPlayed, timesListened) VALUES (?, ?, ?)", [songName, timePlayed, 1], (err) => {
								if (err) {
									console.error("Error inserting new song:", err);
								} else {
									console.log(`Saved ${songName}: ${timePlayed}s, listened 1 time.`);
								}
							});
						}
					});
				};

				if (!hasTimesListened) {
					db.run("ALTER TABLE song_play_time ADD COLUMN timesListened INTEGER DEFAULT 0", (err) => {
						if (err) {
							console.error("Error adding timesListened column:", err);
						} else {
							console.log("timesListened column added.");
							continueWithUpdate();
						}
					});
				} else {
					continueWithUpdate();
				}
			});
		}
	});
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
	const thumbnailPath = path.join(taratorFolder, "thumbnails", playlist.name + "_playlist.jpg");

	let thumbnailSrc = ``;
	if (fs.existsSync(thumbnailPath)) {
		thumbnailSrc = `file://${thumbnailPath.replace(/\\/g, "/")}`;
		thumbnailSrc = playlist.thumbnail;
	} else {
		thumbnailSrc = `file://${path.join(taratorFolder, "thumbnails", "_placeholder.jpg").replace(/\\/g, "/")}`;
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
	if (playlist.songs.length == 1) {
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
	const newName = document.getElementById("editPlaylistNameInput").value;
	const newThumbnail = document.getElementById("editPlaylistThumbnail").src;

	const filePath = path.join(taratorFolder, "playlists.json");
	fs.readFile(filePath, "utf8", (err, data) => {
		if (err) {
			console.error("Error reading file:", err);
			return;
		}

		let playlists;
		try {
			playlists = JSON.parse(data);
		} catch (parseErr) {
			console.error("Error parsing JSON:", parseErr);
			return;
		}

		const playlist = playlists.find((pl) => pl.name === oldName);
		if (playlist) {
			playlist.name = newName;

			if (newThumbnail.startsWith("data:image")) {
				const base64Data = newThumbnail.replace(/^data:image\/\w+;base64,/, "");
				const buffer = Buffer.from(base64Data, "base64");
				const thumbnailsDir = path.join(taratorFolder, "thumbnails");
				const newThumbnailPath = path.join(thumbnailsDir, `${newName}_playlist.jpg`);

				if (!fs.existsSync(thumbnailsDir)) {
					fs.mkdirSync(thumbnailsDir, { recursive: true });
				}

				fs.writeFile(newThumbnailPath, buffer, (writeErr) => {
					if (writeErr) {
						console.error("Error saving thumbnail:", writeErr);
						return;
					}
					console.log("Thumbnail saved successfully:", newThumbnailPath);

					playlist.thumbnail = newThumbnailPath;

					fs.writeFile(filePath, JSON.stringify(playlists, null, 2), "utf8", (writeErr) => {
						if (writeErr) {
							console.error("Error writing file:", writeErr);
							return;
						}
						console.log("Playlist updated successfully");
						closeModal();
						document.getElementById("settings").click();
						document.getElementById("playlists").click();
					});
				});
			} else {
				playlist.thumbnail = newThumbnail;

				fs.writeFile(filePath, JSON.stringify(playlists, null, 2), "utf8", (writeErr) => {
					if (writeErr) {
						console.error("Error writing file:", writeErr);
						return;
					}
					console.log("Playlist updated successfully");
					closeModal();
					document.getElementById("settings").click();
					document.getElementById("playlists").click();
				});
			}
		} else {
			console.error("Playlist not found:", oldName);
			return;
		}
	});
}

function displayPlaylists(playlists) {
	const playlistsContent = document.getElementById("playlists-content");
	playlistsContent.innerHTML = "";

	playlists.forEach((playlist) => {
		const playlistElement = createPlaylistElement(playlist);
		playlistsContent.appendChild(playlistElement);
	});
}

function getPlaylists() {
	const playlistsFilePath = path.join(taratorFolder, "playlists.json");
	fs.readFile(playlistsFilePath, "utf8", (err, data) => {
		const playlists = JSON.parse(data);
		displayPlaylists(playlists);
	});
}

ipcRenderer.on("playlist-created", (event, newPlaylist) => {
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

	const playlistsFilePath = path.join(taratorFolder, "playlists.json");
	fs.readFile(playlistsFilePath, "utf8", (err, data) => {
		const playlists = JSON.parse(data);
		displayPlaylists(playlists);
		playlists.forEach((playlist) => {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = playlist.name;
			checkbox.value = mercimek;

			if (playlist.songs.includes(mercimek)) {
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
	});
}

function addToSelectedPlaylists(mercimek) {
	let hamburger = mercimek;
	const checkboxes = document.querySelectorAll('#playlist-checkboxes input[type="checkbox"]');
	const selectedPlaylists = Array.from(checkboxes)
		.filter((checkbox) => checkbox.checked)
		.map((checkbox) => checkbox.id);

	fs.readFile(path.join(taratorFolder, "playlists.json"), "utf8", (err, data) => {
		if (err) {
			console.error("Error reading playlists file:", err);
			return;
		}

		let playlists = [];
		try {
			playlists = JSON.parse(data);
		} catch (parseErr) {
			console.error("Error parsing playlists file:", parseErr);
			return;
		}

		playlists.forEach((playlist) => {
			const playlistName = playlist.name;
			const isSelected = selectedPlaylists.includes(playlistName);

			if (isSelected) {
				if (!playlist.songs.includes(hamburger)) {
					playlist.songs.push(hamburger);
					console.log(`Song '${hamburger}' added to playlist '${playlistName}'.`);
				} else {
					console.log(`Song '${hamburger}' already exists in playlist '${playlistName}'.`);
				}
			} else {
				const songIndex = playlist.songs.indexOf(hamburger);
				if (songIndex !== -1) {
					playlist.songs.splice(songIndex, 1);
					console.log(`Song '${hamburger}' removed from playlist '${playlistName}'.`);
				}
			}
		});

		fs.writeFile(path.join(taratorFolder, "playlists.json"), JSON.stringify(playlists, null, 2), (writeErr) => {
			if (writeErr) {
				console.error("Error updating playlists file:", writeErr);
				return;
			}
			console.log("Playlists updated successfully.");
		});
	});
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

function playPreviousSong() {
	if (currentPlayingElement) {
		if (isShuffleActive) {
			if (currentPlaylist) {
				if (playlistPlayedSongs.length > 1) {
					const previousSongName = playlistPlayedSongs[1];
					const previousElement = document.querySelector(`.music-item[data-file-name="${previousSongName}.mp3"]`);
					const file = { name: previousSongName };
					playMusic(file, previousElement, true);
					playlistPlayedSongs.splice(0, 2);
				}
			} else {
				if (playedSongs.length > 1) {
					const previousSongName = playedSongs[1];
					const previousElement = document.querySelector(`.music-item[data-file-name="${previousSongName}.mp3"]`);
					const file = { name: previousSongName };
					playMusic(file, previousElement, true);
					playedSongs.splice(0, 2);
				}
			}
		} else {
			if (currentPlaylist) {
				if (currentPlaylistElement > 0) {
					const previousSongName = currentPlaylist.songs[currentPlaylistElement - 1];
					const previousElement = document.querySelector(`.music-item[data-file-name="${previousSongName}.mp3"]`);
					const file = { name: previousSongName };
					playMusic(file, previousElement, true);
					currentPlaylistElement--;
				}
			} else {
				const previousElement = document.querySelector(`.music-item[data-file-name="${document.getElementById("song-name").innerText}.mp3"]`).previousElementSibling;
				const previousFileName = previousElement.getAttribute("data-file-name");
				const file = { name: previousFileName };
				playMusic(file, document.querySelector(`.music-item[data-file-name="${previousFileName}.mp3"]`), true);
			}
		}
	}
}

function playNextSong() {
	if (currentPlayingElement) {
		let nextSongName;
		if (isShuffleActive) {
			if (currentPlaylist) {
				const currentSongName = currentPlaylist.songs[currentPlaylistElement];
				let randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);

				while (currentPlaylist.songs[randomIndex] === currentSongName) {
					randomIndex = Math.floor(Math.random() * currentPlaylist.songs.length);
				}

				nextSongName = currentPlaylist.songs[randomIndex];
				currentPlaylistElement = randomIndex;
			} else {
				const musicItems = Array.from(document.querySelectorAll(".music-item"));
				const currentFileName = currentPlayingElement.getAttribute("data-file-name");
				let randomIndex = Math.floor(Math.random() * musicItems.length);

				while (musicItems[randomIndex].getAttribute("data-file-name") === currentFileName) {
					randomIndex = Math.floor(Math.random() * musicItems.length);
				}

				nextSongName = musicItems[randomIndex].getAttribute("data-file-name");
			}
		} else {
			if (currentPlaylist) {
				if (currentPlaylistElement < currentPlaylist.songs.length - 1) {
					nextSongName = currentPlaylist.songs[currentPlaylistElement + 1];
					currentPlaylistElement++;
				}
			} else {
				const nextElement = document.querySelector(`.music-item[data-file-name="${document.getElementById("song-name").innerText}.mp3"]`).nextElementSibling;
				nextSongName = nextElement.getAttribute("data-file-name");
			}
		}

		if (nextSongName) {
			const file = { name: nextSongName };
			playMusic(file, document.querySelector(`.music-item[data-file-name="${nextSongName}.mp3"]`), true);
		}
	}
}

async function randomSongFunctionMainMenu() {
	// await myMusicOnClick(1); //TODO: DestroyMyMusic aktifken bunu kullanıp butonları kullandırtcaksın
	const musicItems = Array.from(document.querySelectorAll(".music-item"));
	let randomIndex = Math.floor(Math.random() * musicItems.length);
	if (currentPlayingElement) {
		while (musicItems[randomIndex].getAttribute("data-file-name") === document.getElementById("song-name").innerText + ".mp3") {
			randomIndex = Math.floor(Math.random() * musicItems.length);
		}
	}
	nextSongName = musicItems[randomIndex].getAttribute("data-file-name");
	const file = { name: nextSongName };
	playMusic(file, document.querySelector(`.music-item[data-file-name="${nextSongName}.mp3"]`), false);
	// destroyMyMusic(); TODO
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
		updateDatabase("rememberautoplay", true);
	} else {
		autoplayButton.classList.remove("active");
		autoplayButton.innerHTML = icon.redAutoplay;
		updateDatabase("rememberautoplay", false);
	}
}

function toggleShuffle() {
	isShuffleActive = !isShuffleActive;
	const shuffleButton = document.getElementById("shuffleButton");
	if (isShuffleActive) {
		shuffleButton.classList.add("active");
		shuffleButton.innerHTML = icon.greenShuffle;
		updateDatabase("remembershuffle", true);
	} else {
		shuffleButton.classList.remove("active");
		shuffleButton.innerHTML = icon.redShuffle;
		updateDatabase("remembershuffle", false);
	}
}

function loop() {
	if (isLooping) {
		isLooping = false;
		loopButton.innerHTML = icon.redLoop;
		updateDatabase("rememberloop", false);
		if (audioElement) {
			audioElement.loop = false;
		}
	} else {
		isLooping = true;
		loopButton.innerHTML = icon.greenLoop;
		updateDatabase("rememberloop", true);
		if (audioElement) {
			audioElement.loop = true;
		}
	}
}

function mute() {
	if (volumeControl.value != 0) {
		previousVolume = volumeControl.value;
		volumeControl.value = 0;
		muteButton.classList.add("active");
	} else {
		volumeControl.value = previousVolume;
		muteButton.classList.remove("active");
	}
	if (audioElement) audioElement.volume = volumeControl.value / 100;
	updateDatabase("volume", volumeControl.value);
}

function speed() {
	document.getElementById("speedOptions").innerHTML = "";
	speedModal.style.display = "block";
	const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

	speeds.forEach((speed) => {
		const speedOption = document.createElement("div");
		speedOption.classList.add("speed-option");
		speedOption.textContent = `${speed}x`;
		if (speed == rememberspeed) {
			speedOption.style.color = "red";
		}
		speedOption.addEventListener("click", () => {
			rememberspeed = speed;
			updateDatabase("rememberspeed", speed);
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

function downloadNew() {
	if (!pytubeStatus) {
		alert("Please first install Pytube from the settings to download music.");
		return;
	}
	downloadModal.style.display = "block";
	document.getElementById("downloadFirstInput").value = "";

	if (document.getElementById("downloadSecondPhase")) {
		document.getElementById("downloadSecondPhase").remove();
	}
}

function closeModal() {
	document.querySelectorAll(".modal").forEach((modal) => {
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

	const thumbnailsDirectory = path.join(taratorFolder, "thumbnails");
	const playlistsFilePath = path.join(taratorFolder, "playlists.json");

	fs.readFile(playlistsFilePath, "utf8", (err, data) => {
		let playlists = [];

		if (!err && data) {
			try {
				playlists = JSON.parse(data);
				if (playlists.find((playlist) => playlist.name === playlistName)) {
					alert("Playlist name already exists.");
					return;
				}
			} catch (parseErr) {
				console.error("Error parsing playlists file:", parseErr);
			}
		}

		const newPlaylist = {
			name: playlistName,
			songs: [],
			thumbnail: path.join(thumbnailsDirectory, `${playlistName}_playlist.jpg`),
		};

		playlists.push(newPlaylist);

		fs.writeFile(playlistsFilePath, JSON.stringify(playlists, null, 2), (writeErr) => {
			if (writeErr) {
				console.error("Error updating playlists file:", writeErr);
				return;
			}
			if (thumbnailFilePath) {
				const newThumbnailPath = path.join(thumbnailsDirectory, `${playlistName}_playlist.jpg`);
				fs.copyFile(thumbnailFilePath, newThumbnailPath, (copyErr) => {
					if (copyErr) {
						console.error("Error copying thumbnail file:", copyErr);
						return;
					}
				});
			}
			closeModal();
			if (document.getElementById("playlists-content").style.display == "grid") {
				document.getElementById("playlists").click();
			}
		});
	});
});

function openCustomizeModal(songName, thumbnailUrl) {
	customizeModal.style.display = "block";
	document.getElementById("customizeSongName").value = songName.slice(0, -4);
	const oldThumbnailPath = path.join(taratorFolder, "thumbnails", songName + "_thumbnail.jpg");
	const customizeForm = document.getElementById("customizeForm");
	document.getElementById("customiseImage").src = path.join(taratorFolder, "thumbnails", songName.slice(0, -4) + "_thumbnail.jpg");
	customizeForm.dataset.oldSongName = songName;
	customizeForm.dataset.oldThumbnailPath = oldThumbnailPath;
	domates = songName;
	domates2 = domates.slice(0, -4) + "_thumbnail.jpg";
}

document.getElementById("customizeForm").addEventListener("submit", function (event) {
	event.preventDefault();

	const oldSongName = document.getElementById("customizeForm").dataset.oldSongName;
	const oldThumbnailPath = document.getElementById("customizeForm").dataset.oldThumbnailPath.replace(".mp3", "");
	const newSongName = document.getElementById("customizeSongName").value;
	const newThumbnailFile = document.getElementById("customizeThumbnail").files[0];
	const userDesktop = path.join(taratorFolder, "musics");
	const oldSongFilePath = path.join(userDesktop, oldSongName);
	let newSongFilePath = path.join(userDesktop, newSongName + path.extname(oldSongName));

	if (fs.existsSync(oldSongFilePath)) {
		fs.renameSync(oldSongFilePath, newSongFilePath);
	} else {
		console.error("Old song file does not exist:", oldSongFilePath);
		return;
	}

	if (newThumbnailFile) {
		const reader = new FileReader();
		reader.onload = function (e) {
			const newThumbnailPath = path.join(path.dirname(oldThumbnailPath), newSongName + "_thumbnail.jpg");
			const base64Data = e.target.result.replace(/^data:image\/jpeg;base64,/, "");
			fs.writeFileSync(newThumbnailPath, base64Data, "base64");

			if (fs.existsSync(oldThumbnailPath)) {
				fs.unlinkSync(oldThumbnailPath);
			}
		};
		reader.readAsDataURL(newThumbnailFile);
	} else {
		const newThumbnailPath = path.join(path.dirname(oldThumbnailPath), newSongName + "_thumbnail.jpg");
		if (fs.existsSync(oldThumbnailPath)) {
			fs.renameSync(oldThumbnailPath, newThumbnailPath);
		} else {
			console.error("Old thumbnail file does not exist:", oldThumbnailPath);
		}
		console.log("THis function ran");
	}

	const playlistsFilePath = path.join(taratorFolder, "playlists.json");
	if (fs.existsSync(playlistsFilePath)) {
		let playlistsData = fs.readFileSync(playlistsFilePath, "utf8");
		playlistsData = JSON.parse(playlistsData);
		console.log("oldSongName", oldSongName, "newSongName", newSongName, "oldSongName.slice(0,-4)", oldSongName.slice(0, -4));

		for (const playlist of playlistsData) {
			for (let i = 0; i < playlist.songs.length; i++) {
				console.log(playlist.songs[i]);
				if (playlist.songs[i] == oldSongName.slice(0, -4)) {
					playlist.songs[i] = newSongName;
				}
			}
		}

		fs.writeFileSync(playlistsFilePath, JSON.stringify(playlistsData, null, 2));
	} else {
		console.error("playlists.json file does not exist:", playlistsFilePath);
	}

	customizeModal.style.display = "none";
	document.getElementById("my-music").click();
});

function checkNameThumbnail() {
	document.getElementById("downloadFirstButton").disabled = true;

	if (document.getElementById("downloadSecondPhase")) {
		document.getElementById("downloadSecondPhase").remove();
	}

	const downloadSecondPhase = document.createElement("div");
	downloadSecondPhase.id = "downloadSecondPhase";
	document.getElementById("downloadModalContent").appendChild(downloadSecondPhase);

	const downloadModalBottomRow = document.createElement("div");
	downloadModalBottomRow.id = "downloadModalBottomRow";
	document.getElementById("downloadSecondPhase").appendChild(downloadModalBottomRow);

	const downloadModalText = document.createElement("div");
	downloadModalText.id = "downloadModalText";
	downloadModalBottomRow.appendChild(downloadModalText);
	document.getElementById("downloadModalText").innerHTML = "Checking...";

	if (document.getElementById("downloadFirstInput").value.trim() === "") {
		document.getElementById("downloadModalText").innerHTML = "The input can not be empty.";
		document.getElementById("downloadFirstButton").disabled = false;
		return;
	}

	if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "video") {
		const pythonProcessTitle = spawn("python", [path.join(taratorFolder, "pytube.py"), "Title", document.getElementById("downloadFirstInput").value]);
		pythonProcessTitle.stdout.on("data", (data) => {
			const decodedData = data.toString().trim();
			let decodedString;
			try {
				decodedString = JSON.parse(decodedData);
			} catch (error) {
				decodedString = decodedData;
			}

			const pythonProcessThumbnail2 = spawn("python", [path.join(taratorFolder, "pytube.py"), "Thumbnail", document.getElementById("downloadFirstInput").value]);
			pythonProcessThumbnail2.stdout.on("data", (data) => {
				const downloadPlaceofSongs = document.createElement("div");
				document.getElementById("downloadSecondPhase").appendChild(downloadPlaceofSongs);
				downloadPlaceofSongs.className = "flexrow";
				downloadPlaceofSongs.id = "downloadPlaceofSongs";

				const songAndThumbnail = document.createElement("div");
				songAndThumbnail.className = "songAndThumbnail";
				downloadPlaceofSongs.appendChild(songAndThumbnail);

				const exampleDownloadColumn = document.createElement("div");
				exampleDownloadColumn.className = "exampleDownloadColumn";

				const downloadSecondInput = document.createElement("input");
				downloadSecondInput.type = "text";
				downloadSecondInput.id = "downloadSecondInput";
				downloadSecondInput.value = decodedString;
				downloadSecondInput.spellcheck = false;

				const thumbnailInput = document.createElement("input");
				thumbnailInput.type = "file";
				thumbnailInput.id = "thumbnailInput";
				thumbnailInput.accept = "image/*";
				thumbnailInput.onchange = function (event) {
					updateThumbnailImage(event, 3);
				};

				const thumbnailImage = document.createElement("img");
				thumbnailImage.id = "thumbnailImage";
				thumbnailImage.className = "thumbnailImage";
				thumbnailImage.src = data.toString().trim();
				thumbnailImage.alt = "";

				songAndThumbnail.appendChild(exampleDownloadColumn);
				exampleDownloadColumn.appendChild(downloadSecondInput);
				exampleDownloadColumn.appendChild(thumbnailInput);
				songAndThumbnail.appendChild(thumbnailImage);
				document.getElementById("downloadModalText").innerHTML = "";
				document.getElementById("downloadFirstButton").disabled = false;
				document.getElementById("downloadSecondPhase").style.display = "block";
				const finalDownloadButton = document.createElement("button");
				finalDownloadButton.id = "finalDownloadButton";
				finalDownloadButton.onclick = function () {
					actuallyDownloadTheSong();
				};
				finalDownloadButton.textContent = "Download";
				downloadModalBottomRow.appendChild(finalDownloadButton);
			});
			pythonProcessThumbnail2.stderr.on("data", (data) => {
				console.error(`Error: ${data}`);
			});
			pythonProcessThumbnail2.on("close", (code) => {
				console.log(`Python process exited with code ${code}`);
			});
		});
		pythonProcessTitle.stderr.on("data", (data) => {
			console.error(`Error: ${data}`);
		});
		pythonProcessTitle.on("close", (code) => {
			console.log(`Python process exited with code ${code}`);
		});
	} else if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "playlist") {
		const pythonProcessTitle = spawn("python", [path.join(taratorFolder, "pytube.py"), "PlaylistTitle", document.getElementById("downloadFirstInput").value]);
		pythonProcessTitle.stdout.on("data", (data) => {
			decodedData = data.toString().trim();

			try {
				decodedJson = JSON.parse(decodedData);
			} catch (error) {
				console.error("Error parsing JSON:", error);
				return;
			}
			if (decodedJson.error) {
				console.error("Python script error:", decodedJson.error);
				return;
			}
			if (decodedJson.length > 10) {
				document.getElementById("downloadModalText").innerHTML = "Checking... Might take long...";
			}

			const pythonProcessThumbnail2 = spawn("python", [path.join(taratorFolder, "pytube.py"), "PlaylistThumbnail", document.getElementById("downloadFirstInput").value]);
			pythonProcessThumbnail2.stdout.on("data", (data) => {
				decodedData2 = data.toString().trim();

				try {
					decodedJson2 = JSON.parse(decodedData2);
				} catch (error) {
					console.error("Error parsing JSON:", error);
					return;
				}
				if (decodedJson2.error) {
					console.error("Python script error:", decodedJson2.error);
					return;
				}

				const downloadPlaceofSongs = document.createElement("div");
				downloadPlaceofSongs.id = "downloadPlaceofSongs";
				document.getElementById("downloadSecondPhase").appendChild(downloadPlaceofSongs);

				const python3 = spawn("python", [path.join(taratorFolder, "pytube.py"), "PlaylistNames", document.getElementById("downloadFirstInput").value]);
				python3.stdout.on("data", (data) => {
					let pypy9output = JSON.parse(data.toString().trim().replace(/'/g, '"'));

					for (i = 0; i < decodedJson.length; i++) {
						const songAndThumbnail = document.createElement("div");
						songAndThumbnail.className = "songAndThumbnail";
						songAndThumbnail.id = "songAndThumbnail" + i;
						downloadPlaceofSongs.appendChild(songAndThumbnail);

						const exampleDownloadColumn = document.createElement("div");
						exampleDownloadColumn.className = "exampleDownloadColumn";
						songAndThumbnail.appendChild(exampleDownloadColumn);

						const downloadSecondInput = document.createElement("input");
						downloadSecondInput.type = "text";
						downloadSecondInput.className = "playlistTitle";
						downloadSecondInput.id = "playlistTitle" + i;
						downloadSecondInput.value = decodedJson[i];
						downloadSecondInput.spellcheck = false;
						exampleDownloadColumn.appendChild(downloadSecondInput);

						if (i == 0) {
							const saveAsPlaylist = document.createElement("button");
							saveAsPlaylist.id = "saveAsPlaylist";
							saveAsPlaylist.innerHTML = "Save as playlist";
							songAndThumbnail.appendChild(saveAsPlaylist);
							saveAsPlaylist.style.backgroundColor = "red";

							saveAsPlaylist.onclick = function () {
								if (isSaveAsPlaylistActive) {
									saveAsPlaylist.style.backgroundColor = "red";
									isSaveAsPlaylistActive = false;
								} else {
									saveAsPlaylist.style.backgroundColor = "green";
									isSaveAsPlaylistActive = true;
								}
							};
						} else {
							const deleteThisPlaylistSong = document.createElement("button");
							deleteThisPlaylistSong.id = "deleteThisPlaylistSong" + i;
							deleteThisPlaylistSong.className = "deleteThisPlaylistSong";
							deleteThisPlaylistSong.innerHTML = "Delete";
							songAndThumbnail.appendChild(deleteThisPlaylistSong);
							deleteThisPlaylistSong.onclick = function () {
								this.parentNode.remove();
							};
						}

						const theDivsNumber = document.createElement("div");
						theDivsNumber.innerHTML = i;
						theDivsNumber.className = "numberingTheBoxes";
						exampleDownloadColumn.appendChild(theDivsNumber);

						const thumbnailInput = document.createElement("input");
						thumbnailInput.type = "file";
						thumbnailInput.className = "thumbnailInput";
						thumbnailInput.id = "thumbnailInput" + i;
						thumbnailInput.accept = "image/*";
						let obama = i;
						thumbnailInput.onchange = function (event) {
							updateThumbnailImage(event, document.getElementById("thumbnailImage" + obama));
						};
						exampleDownloadColumn.appendChild(thumbnailInput);

						const thumbnailDiv = document.createElement("div");
						thumbnailDiv.className = "thumbnailImage";
						thumbnailDiv.id = "thumbnailImage" + i;
						if (i == 0) {
							thumbnailDiv.style.backgroundImage = `url(${decodedJson2[1]})`;
						} else {
							thumbnailDiv.style.backgroundImage = `url(${decodedJson2[i]})`;
							songAndThumbnail.dataset.link = pypy9output[i - 1];
						}
						thumbnailDiv.alt = "";
						songAndThumbnail.appendChild(thumbnailDiv);
					}

					document.getElementById("downloadModalText").innerHTML = "";
					document.getElementById("downloadFirstButton").disabled = false;
					document.getElementById("downloadSecondPhase").style.display = "block";
					const finalDownloadButton = document.createElement("button");
					finalDownloadButton.id = "finalDownloadButton";
					finalDownloadButton.onclick = function () {
						actuallyDownloadTheSong();
					};
					finalDownloadButton.textContent = "Download";
					downloadModalBottomRow.appendChild(finalDownloadButton);
				});
			});
			pythonProcessThumbnail2.stderr.on("data", (data) => {
				console.error(`Error: ${data}`);
			});
			pythonProcessThumbnail2.on("close", (code) => {
				console.log(`Python process exited with code ${code}`);
			});
		});
		pythonProcessTitle.stderr.on("data", (data) => {
			console.error(`Error: ${data}`);
		});
		pythonProcessTitle.on("close", (code) => {
			console.log(`Python process exited with code ${code}`);
		});
	} else {
		document.getElementById("downloadModalText").innerHTML = "Link neither a video or playlist.";
		document.getElementById("downloadFirstButton").disabled = false;
		document.getElementById("downloadSecondPhase").style.display = "block";
	}
}

function isValidFileName(fileName) {
	const invalidChars = /[\\/:"*?<>|'.,]/;
	return !invalidChars.test(fileName);
}

function fileExists(filePath) {
	try {
		fs.accessSync(filePath, fs.constants.F_OK);
		return true;
	} catch (err) {
		return false;
	}
}

function actuallyDownloadTheSong() {
	document.getElementById("finalDownloadButton").disabled = true;
	if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "video") {
		const secondInput = document.getElementById("downloadSecondInput").value.trim();
		const outputFilePath = path.join(taratorFolder, "musics", `${secondInput}.mp3`);
		const img = document.getElementById("thumbnailImage");
		if (!isValidFileName(secondInput)) {
			document.getElementById("downloadModalText").innerText = 'Invalid characters in filename. These characters cannot be used in filenames: / \\ : * ? " < > | ,';
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		} else if (secondInput.length > 100) {
			document.getElementById("downloadModalText").innerText = "Invalid filename. The file must be shorter than 100 characters.";
			document.getElementById("finalDownloadButton").disabled = false;
		} else if (fileExists(outputFilePath)) {
			document.getElementById("downloadModalText").innerText = `File ${secondInput}.mp3 already exists. Please choose a different filename.`;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		} else {
			document.getElementById("downloadModalText").innerText = "Downloading Song...";
		}
		const pythonProcessFileName = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadMusic", document.getElementById("downloadFirstInput").value, secondInput]);
		pythonProcessFileName.stdout.on("data", (data) => {
			const decodedData = data.toString().trim();
			console.log(data.toString().trim());
			let parsedData;
			try {
				parsedData = JSON.parse(decodedData);
				document.getElementById("downloadModalText").innerText = "Song downloaded successfully!";
			} catch (error) {
				console.error(`Error parsing JSON: ${error}`);
				parsedData = {
					error: "Invalid JSON",
				};
				document.getElementById("finalDownloadButton").disabled = false;
				document.getElementById("downloadModalText").innerText = parsedData.message;
			}

			fetch(img.src)
				.then((res) => res.blob())
				.then((blob) => {
					const reader = new FileReader();
					reader.onloadend = function () {
						const base64data = reader.result;
						const tempFilePath = path.join(taratorFolder, "temp_thumbnail.txt");
						fs.writeFileSync(tempFilePath, base64data);

						const pythonProcessFileThumbnail = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadThumbnail", tempFilePath, secondInput]);
						pythonProcessFileThumbnail.stdout.on("data", (data) => {
							const decodedData = data.toString().trim();
							let parsedData;
							try {
								parsedData = JSON.parse(decodedData);
							} catch (error) {
								console.error(`Error parsing JSON: ${error}`);
								parsedData = { error: "Invalid JSON" };
							}
							document.getElementById("downloadModalText").innerText = document.getElementById("downloadModalText").innerText + " Thumbnail downloaded successfully!";
						});

						pythonProcessFileThumbnail.stderr.on("data", (data) => {
							console.error(`Error: ${data}`);
						});
						pythonProcessFileThumbnail.on("close", (code) => {
							console.log(`Python process exited with code ${code}`);
							fs.unlinkSync(tempFilePath);
							document.getElementById("finalDownloadButton").disabled = false;
						});
					};
					reader.readAsDataURL(blob);
				})
				.catch((error) => console.error(`Error: ${error}`));
		});
		pythonProcessFileName.stderr.on("data", (data) => {
			console.error(`Error: ${data}`);
		});
		pythonProcessFileName.on("close", (code) => {
			console.log(`Python process exited with code ${code}`);
		});
	} else if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "playlist") {
		let howManyAreThere = document.querySelectorAll("div.songAndThumbnail").length;
		const playlistTitlesArray = Array.from(document.querySelectorAll("input.playlistTitle"), (input) => input.value);
		const dataLinks = Array.from(document.querySelectorAll(".songAndThumbnail")).map((div) => div.getAttribute("data-link"));
		playlistTitlesArray.shift();
		dataLinks.shift();

		if (!isValidFileName(document.getElementById("playlistTitle0").value)) {
			document.getElementById("downloadModalText").innerText = `Invalid characters in the playlist name. These characters cannot be used in filenames: / \\ ' . : * ? " < > | ,`;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		fs.readFile(path.join(taratorFolder, "playlists.json"), "utf8", (err, data) => {
			if (err) {
				document.getElementById("downloadModalText").innerText = ("Error reading the JSON file:", err);
				document.getElementById("finalDownloadButton").disabled = false;
				return;
			} else if (JSON.parse(data).some((playlist) => playlist.name === document.getElementById("playlistTitle0").value)) {
				document.getElementById("downloadModalText").innerText = "A playlist with this name already exists.";
				document.getElementById("finalDownloadButton").disabled = false;
				return;
			}

			let tavuk = 1;
			let barbeku = 1;

			while (tavuk < howManyAreThere) {
				if (barbeku == 5001) {
					break;
				}
				if (document.getElementById(`playlistTitle${barbeku}`)) {
					let outputFilePath = path.join(taratorFolder, "musics", `${playlistTitlesArray[tavuk - 1]}.mp3`);
					if (document.getElementById("playlistTitle" + barbeku)) {
						const duplicates = findDuplicates(playlistTitlesArray);
						if (!isValidFileName(document.getElementById("playlistTitle" + barbeku).value)) {
							document.getElementById("downloadModalText").innerText = `Invalid characters in ${barbeku}. songs name. These characters cannot be used in filenames: / \\ ' . : * ? " < > | ,`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						} else if (document.getElementById("playlistTitle" + barbeku).value.length > 100) {
							document.getElementById("downloadModalText").innerText = `${barbeku}. songs name is too long. Maximum length allowed is 100 characters.`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						} else if (fileExists(outputFilePath)) {
							document.getElementById("downloadModalText").innerText = `File ${playlistTitlesArray[tavuk - 1]}.mp3 already exists. Please choose a different filename.`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						} else if (duplicates.length > 0) {
							document.getElementById("downloadModalText").innerText = `The following file names have duplicates: ${duplicates.join(", ")}. Please choose different filenames.`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						}
					}
					tavuk++;
				}
				barbeku++;
			}

			saveeeAsPlaylist(playlistTitlesArray);
			document.getElementById("downloadModalText").innerText = "Downloading...";
			if (howManyAreThere > 50) {
				document.getElementById("downloadModalText").innerText = "Downloading... But it might take some time...";
			}
			testFunctionTest(howManyAreThere, dataLinks, playlistTitlesArray);

			let peynir = 1;
			let j = 1;
			if (isSaveAsPlaylistActive) {
				peynir = 0;
				j = 0;
			}
			while (peynir < howManyAreThere) {
				if (j == 5001) {
					break;
				}
				if (document.getElementById(`thumbnailImage${j}`)) {
					let img = document.getElementById(`thumbnailImage${j}`);
					let songName = "placeholdergagaga";
					playlistName = document.getElementById(`playlistTitle0`).value;
					if (j != 0) {
						songName = document.getElementById(`playlistTitle${j}`).value.trim();
					}
					peynir++;
					fetch(img.src)
						.then((res) => res.blob())
						.then((blob) => {
							let reader = new FileReader();
							reader.onloadend = function () {
								let base64data = reader.result;
								let tempFilePath = path.join(taratorFolder, `temp_thumbnail_${songName}.txt`);
								try {
									fs.writeFileSync(tempFilePath, base64data);
									let pythonProcess = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadThumbnail", tempFilePath, songName]);

									pythonProcess.stdout.on("data", (data) => {
										let decodedData = data.toString().trim();
										let parsedData;
										try {
											parsedData = JSON.parse(decodedData);
										} catch (error) {
											console.error(`Error parsing JSON: ${error}`);
											parsedData = { error: "Invalid JSON" };
											document.getElementById("finalDownloadButton").disabled = false;
										}
									});

									pythonProcess.stderr.on("data", (data) => {
										console.error(`Error: ${data}`);
									});
									pythonProcess.on("close", (code) => {
										console.log(`Python process exited with code ${code}`);
										if (fs.existsSync(tempFilePath)) {
											fs.unlinkSync(tempFilePath);
										}
										document.getElementById("downloadModalText").innerText = ("Downloaded all thumbnails successfully!" || parsedData.error || "Unknown response") + "\n";
									});
								} catch (error) {
									console.error(`Error writing file: ${error}`);
								}
							};
							reader.readAsDataURL(blob);
						})
						.catch((error) => console.error(`Error: ${error}`));
				}
				j++;
			}
		});
	} else {
		document.getElementById("downloadModalText").innerText = "The URL is neither a video or a playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

function updateThumbnailImage(event, salata) {
	const file = event.target.files[0];
	if (file && file.type === "image/jpeg") {
		const reader = new FileReader();
		reader.onload = function (e) {
			if (salata == 1) {
				document.getElementById("customiseImage").src = e.target.result;
			} else if (salata == 2) {
				document.getElementById("editPlaylistThumbnail").src = e.target.result;
			} else if (salata == 3) {
				document.getElementById("thumbnailImage").src = e.target.result;
			} else {
				salata.style.backgroundImage = `url(${e.target.result})`;
			}
		};
		reader.readAsDataURL(file);
	} else {
		alert("Please select a valid JPG image.");
	}
}

function removeSong() {
	if (confirm("Are you sure you want to remove this song?")) {
		const musicFilePath = path.join(taratorFolder, "musics", domates); // TODO parantezlerin içine value ekle domates yerine
		const thumbnailFilePath = path.join(taratorFolder, "thumbnails", domates2);

		if (fs.existsSync(musicFilePath)) {
			fs.unlinkSync(musicFilePath);
		}
		if (fs.existsSync(thumbnailFilePath)) {
			fs.unlinkSync(thumbnailFilePath);
		}
		closeModal();
		document.getElementById("my-music").click();
	}
}

function deletePlaylist() {
	if (confirm("Are you sure you want to remove this playlist?")) {
		const playlistName = document.getElementById("editInvisibleName").value;
		const filePath = path.join(taratorFolder, "playlists.json");
		fs.readFile(filePath, "utf8", (err, data) => {
			if (err) {
				console.error("Error reading file:", err);
				return;
			}

			let playlists;
			try {
				playlists = JSON.parse(data);
			} catch (parseErr) {
				console.error("Error parsing JSON:", parseErr);
				return;
			}

			const playlistIndex = playlists.findIndex((pl) => pl.name === playlistName);
			if (playlistIndex !== -1) {
				playlists.splice(playlistIndex, 1);
			} else {
				console.error("Playlist not found:", playlistName);
				return;
			}

			fs.writeFile(filePath, JSON.stringify(playlists, null, 2), "utf8", (writeErr) => {
				if (writeErr) {
					console.error("Error writing file:", writeErr);
					return;
				}
				console.log("Playlist deleted successfully");
				closeModal();
				document.getElementById("settings").click();
				document.getElementById("playlists").click();
			});
		});
	}
}

function differentiateYouTubeLinks(url) {
	const videoRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&]+)/;
	const playlistRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=([^&]+)/;

	if (videoRegex.test(url.trim())) {
		return "video";
	} else if (playlistRegex.test(url.trim())) {
		return "playlist";
	} else {
		return "unknown";
	}
}

function saveeeAsPlaylist(playlistTitlesArray) {
	if (isSaveAsPlaylistActive) {
		const jsonFilePath = path.join(taratorFolder, "playlists.json");
		const thumbnailDir = path.join(taratorFolder, "thumbnails");
		const trimmedArray = playlistTitlesArray.map((element) => element.trim());

		fs.readFile(jsonFilePath, "utf8", (err, data) => {
			if (err) {
				console.error("Error reading the JSON file:", err);
				return;
			}

			try {
				let playlists = JSON.parse(data);
				const playlistName = document.getElementById("playlistTitle0").value;

				const playlistExists = playlists.some((playlist) => playlist.name === playlistName);
				if (playlistExists) {
					console.error("A playlist with this name already exists.");
					return;
				}

				let newPlaylist = {
					name: playlistName,
					songs: trimmedArray,
					thumbnail: path.join(thumbnailDir, `${playlistName}_playlist.jpg`),
				};

				playlists.push(newPlaylist);
				let updatedJsonData = JSON.stringify(playlists, null, 2);

				fs.writeFile(jsonFilePath, updatedJsonData, "utf8", (err) => {
					if (err) {
						console.error("Error writing to the JSON file:", err);
						return;
					}
					console.log("New playlist added successfully!");
				});
			} catch (parseError) {
				console.error("Error parsing the JSON data:", parseError);
			}
		});
	}
}

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

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFunctionTest(howManyAreThere, dataLinks, playlistTitlesArray) {
	for (let i = 0; i < howManyAreThere - 1; i++) {
		console.log("Link: ", dataLinks[i].trim(), "Title: ", playlistTitlesArray[i].trim());

		const pythonProcessTitle = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadMusic", dataLinks[i].trim(), playlistTitlesArray[i].trim()]);

		pythonProcessTitle.stdout.on("data", (data) => {
			console.log(data.toString().trim());
		});

		pythonProcessTitle.stderr.on("data", (data) => {
			document.getElementById("downloadModalText").innerText = `Error: ${data}`;
			console.log(data.toString().trim());
			document.getElementById("finalDownloadButton").disabled = false;
		});

		if (i < howManyAreThere - 2) {
			document.getElementById("downloadModalText").innerText = "Done downloading the " + (i + 1) + ". song.";
			await sleep(3000);
		} else {
			document.getElementById("downloadModalText").innerText = "Done!";
			document.getElementById("finalDownloadButton").disabled = false;
			if (isSaveAsPlaylistActive) {
				fs.rename("thumbnails/placeholdergagaga_thumbnail.jpg", `thumbnails/${document.getElementById("playlistTitle0").value}_playlist.jpg`, (err) => {
					if (err) {
						console.error("Error renaming file:", err);
					} else {
						console.log("File renamed successfully");
					}
				});
			}
		}
	}
}

document.querySelectorAll(".settingsKeybindsButton").forEach((button) => {
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

document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		document.body.focus();
	}
});

document.addEventListener("keydown", (event) => {
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

function saveKeybinds() {
	const buttons = Array.from(document.querySelectorAll(".settingsKeybindsButton")).map((button) => button.innerText.trim());
	const test = findDuplicates(buttons);

	if (test.length > 0) {
		alert(`This key is a duplicate: ${test[0]}`);
		return;
	}

	updateDatabase("key_Rewind", document.getElementById("settingsRewind").innerHTML);
	updateDatabase("key_Previous", document.getElementById("settingsPrevious").innerHTML);
	updateDatabase("key_PlayPause", document.getElementById("settingsPlayPause").innerHTML);
	updateDatabase("key_Next", document.getElementById("settingsNext").innerHTML);
	updateDatabase("key_Skip", document.getElementById("settingsSkip").innerHTML);
	updateDatabase("key_Autoplay", document.getElementById("settingsAutoplay").innerHTML);
	updateDatabase("key_Shuffle", document.getElementById("settingsShuffle").innerHTML);
	updateDatabase("key_Mute", document.getElementById("settingsMute").innerHTML);
	updateDatabase("key_Speed", document.getElementById("settingsSpeed").innerHTML);
	updateDatabase("key_Loop", document.getElementById("settingsLoop").innerHTML);

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

document.getElementById("checkUpdateButton").addEventListener("click", async function () {
	await ipcRenderer.invoke("check-for-updates");
});

document.getElementById("checkPytubeButton").addEventListener("click", () => {
	ipcRenderer.send("update-pytubefix", pytubeStatus);
});

document.getElementById("checkNPMButton").addEventListener("click", () => {
	ipcRenderer.send("run-npm-install");
});

ipcRenderer.on("update-response", (event, message) => {
	alert(message);
	if (message.startsWith("PIP Success")) {
		updateDatabase("pytubeStatus", "true");
		pytubeStatus = true;
	}
});

document.getElementById("playlists").click();
document.getElementById("main-menu").click();
myMusicOnClick(1);
