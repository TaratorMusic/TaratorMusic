async function createAppThumbnailsFolder() {
	await alertModal("Some app assets not found, they will now be fetched from the repository. Click the button to continue.");
	return new Promise((resolve, reject) => {
		const goBinary = path.join(backendFolder, "create_app_thumbnails_folder");
		const proc = spawn(goBinary, [appThumbnailFolder], { windowsHide: true, stdio: "inherit" });

		proc.on("error", reject);
		proc.on("close", async code => {
			if (code != 0) return reject(alertModal(`Go process exited with code ${code}`));
			await alertModal("App thumbnails installed. App restart required for the effects.");
			ipcRenderer.send("restart-app");
			resolve();
		});
	});
}

async function grabAndStoreSongInfo(songId) {
	let fetchedId = songId;
	if (fetchedId == "html") fetchedId = document.getElementById("customiseModal").dataset.songID;

	return new Promise((resolve, reject) => {
		let songs = [];

		if (fetchedId) {
			if (Array.isArray(fetchedId)) {
				for (let i = 0; i < fetchedId.length; i++) {
					songs[i] = getSongNameById(fetchedId[i]);
				}
			} else {
				const songData = songNameCache.get(fetchedId);
				if (!songData) {
					alertModal("Song not found in database.");
					return resolve();
				} else {
					songs = [songData.song_name];
				}
			}

			alertModal("Checking for song info... You can close this window.");
		} else {
			songs = Array.from(songNameCache.values())
				.filter(song => !song.artist || !song.genre || !song.language)
				.map(song => song.song_name);

			fetchedId = Array.from(songNameCache.entries())
				.filter(([key, song]) => !song.artist || !song.genre || !song.language)
				.map(([key]) => key);

			if (!songs.length) {
				alertModal("No songs with missing information.");
				return resolve();
			} else {
				alertModal(`${songs.length} song${songs.length != 1 ? "s" : ""} will be searched for information. You can close this window and the action will happen in the background.`);
			}
		}

		const goBinary = path.join(backendFolder, "musicbrainz_fetch");
		const proc = spawn(goBinary, songs, {
			windowsHide: true,
		});

		let buffer = "";
		let count = 0;

		proc.stdout.on("data", chunk => {
			buffer += chunk.toString();
			for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
				const line = buffer.slice(0, i).trim();
				buffer = buffer.slice(i + 1);
				if (!line) continue;

				try {
					const meta = JSON.parse(line);
					const songIdUsed = Array.isArray(fetchedId) ? fetchedId[count] : fetchedId;

					callSqlite({
						db: "musics",
						query: "UPDATE songs SET artist = CASE WHEN artist IS NULL OR artist = '' THEN ? ELSE artist END, genre = CASE WHEN genre IS NULL OR genre = '' THEN ? ELSE genre END, language = CASE WHEN language IS NULL OR language = '' THEN ? ELSE language END WHERE song_id = ?",
						args: [meta.artist, meta.genre, meta.language, songIdUsed],
						fetch: false,
					});

					const cached = songNameCache.get(songIdUsed);

					if (cached) {
						if (cached.artist == null || cached.artist == "") cached.artist = meta.artist;
						if (cached.genre == null || cached.genre == "") cached.genre = meta.genre;
						if (cached.language == null || cached.language == "") cached.language = meta.language;

						console.log("New song info added for", cached.song_name, ":", meta.artist, meta.genre, meta.language, songIdUsed);

						if (document.getElementById("customiseModal").style.display == "block" && songIdUsed == document.getElementById("customiseModal").dataset.songID) {
							document.getElementById("customiseSongGenre").value = meta.genre;
							document.getElementById("customiseSongArtist").value = meta.artist;
							document.getElementById("customiseSongLanguage").value = meta.language;
						}
					}

					count++;
				} catch (error) {
					console.error(error);
				}
			}
		});

		proc.stderr.on("data", error => console.error(error.toString()));
		proc.on("error", reject);
		proc.on("close", code => (code == 0 ? resolve() : reject(new Error(`Go exited ${code}`))));
	});
}

async function startupCheck() {
	return new Promise(async (resolve, reject) => {
		callSqlite({ db: "musics", query: "DELETE FROM songs WHERE song_length = 0 OR song_length IS NULL", fetch: false });
		callSqlite({ db: "musics", query: "UPDATE songs SET song_extension = LTRIM(song_extension, '.')", fetch: false });
		callSqlite({ db: "musics", query: "UPDATE songs SET thumbnail_extension = LTRIM(thumbnail_extension, '.')", fetch: false });

		if (!fs.existsSync(appThumbnailFolder)) {
			loadNewPage("createAppThumbnailsFolder");
			return;
		}

		const requiredFiles = [
			"addtoplaylist.svg",
			"adjustments.svg",
			"backward.svg",
			"custom.svg",
			"customise.svg",
			"forward.svg",
			"greenAutoplay.svg",
			"greenLoop.svg",
			"greenShuffle.svg",
			"mute_on.svg",
			"mute_off.svg",
			"next.svg",
			"pause.svg",
			"placeholder.jpg",
			"play.svg",
			"previous.svg",
			"redAutoplay.svg",
			"redLoop.svg",
			"redShuffle.svg",
			"refresh.svg",
			"speed.svg",
			"star.svg",
			"tarator_icon.icns",
			"tarator_icon.ico",
			"tarator_icon.png",
			"tarator16_icon.png",
			"tarator512_icon.png",
			"tarator1024_icon.png",
			"trash.svg",
		];

		for (const file of requiredFiles) {
			if (!fs.existsSync(path.join(appThumbnailFolder, file))) {
				loadNewPage("createAppThumbnailsFolder");
				return;
			}
		}

		const missingSongExts = [...songNameCache.entries()].filter(([, v]) => !v.song_extension);
		const missingThumbExts = [...songNameCache.entries()].filter(([, v]) => !v.thumbnail_extension);

		if (missingSongExts.length > 0) {
			const musicFiles = fs.readdirSync(musicFolder);
			for (const [song_id, data] of missingSongExts) {
				const file = musicFiles.find(f => path.parse(f).name == song_id);
				if (file) {
					const ext = path.extname(file).slice(1);
					data.song_extension = ext;
					callSqlite({ db: "musics", query: "UPDATE songs SET song_extension = ? WHERE song_id = ?", args: [ext, song_id], fetch: false });
				}
			}
		}

		if (missingThumbExts.length > 0) {
			const thumbFiles = fs.readdirSync(thumbnailFolder);
			for (const [song_id, data] of missingThumbExts) {
				const file = thumbFiles.find(f => path.parse(f).name == song_id);
				if (file) {
					const ext = path.extname(file).slice(1);
					data.thumbnail_extension = ext;
					callSqlite({ db: "musics", query: "UPDATE songs SET thumbnail_extension = ? WHERE song_id = ?", args: [ext, song_id], fetch: false });
				}
			}
		}

		const allMusics = [...songNameCache.entries()].map(([song_id, v]) => ({ song_id, ...v }));
		const musicMap = Object.fromEntries(allMusics.map(({ song_id, ...rest }) => [song_id, rest]));
		const validSongIds = new Set(songNameCache.keys());

		for (const [playlistId, playlist] of playlistsMap.entries()) {
			const filtered = playlist.songs.filter(id => validSongIds.has(id));
			if (filtered.length != playlist.songs.length) {
				playlist.songs = filtered;
				callSqlite({ db: "playlists", query: "UPDATE playlists SET songs = ? WHERE id = ?", args: [JSON.stringify(filtered), playlistId], fetch: false });
			}
		}

		const goBinary = path.join(backendFolder, "startup_check");
		const proc = spawn(goBinary, [musicFolder, thumbnailFolder], { windowsHide: true, stdio: ["pipe", "pipe", "inherit"] });
		let data = "";

		proc.on("error", reject);
		proc.stdout.on("data", chunk => (data += chunk));

		proc.on("close", code => {
			if (code != 0) return reject(new Error(`Go process exited with code ${code}`));
			try {
				data = JSON.parse(data);
				if (Object.keys(data).length != allMusics.length) {
					foundNewSongs(data, musicMap);
				}
				resolve(data);
			} catch (e) {
				reject(e);
			}
		});
	});
}

async function promptUserOnSongs(redownload) {
	let thePrompt = "";

	const stabilisedNull = [...songNameCache.values()].filter(v => v.size == null).length;
	const artistNull = [...songNameCache.values()].filter(v => v.artist == null).length;

	if (redownload > 0) thePrompt += `You have ${redownload} songs not installed. `;

	if (stabilisedNull != 0 || artistNull != 0) {
		if (stabilisedNull != 0) thePrompt += `You have ${stabilisedNull} songs not stabilised. `;
		if (artistNull != 0) thePrompt += `You have ${artistNull} songs with no artist + genre + language information. `;
	}

	if (thePrompt != "") thePrompt += "Complete your songs data using the options in the settings menu.";

	return thePrompt;
}

async function foundNewSongs(folderSongs, databaseSongs) {
	await alertModal("Found new songs in your folders.");

	const folderOnly = {};
	const databaseOnly = {};

	for (const key of Object.keys(folderSongs)) {
		if (!(key in databaseSongs)) folderOnly[key] = folderSongs[key];
	}

	for (const key of Object.keys(databaseSongs)) {
		if (!(key in folderSongs)) databaseOnly[key] = databaseSongs[key];
	}

	const rowsToInsert = [];

	for (const fileName of Object.keys(folderOnly)) {
		let songName = fileName;
		const songExt = folderOnly[fileName]?.song_extension ?? "";
		const thumbExt = folderOnly[fileName]?.thumbnail_extension ?? "";

		const originalMusicPath = path.join(musicFolder, fileName + songExt);

		if (!fileName.includes("tarator")) {
			songName = await generateId();

			const newMusicPath = path.join(musicFolder, songName + songExt);
			if (fs.existsSync(originalMusicPath)) fs.renameSync(originalMusicPath, newMusicPath);

			if (thumbExt) {
				const originalThumbPath = path.join(thumbnailFolder, fileName + thumbExt);
				const newThumbPath = path.join(thumbnailFolder, songName + thumbExt);
				if (fs.existsSync(originalThumbPath)) fs.renameSync(originalThumbPath, newThumbPath);
			}
		}

		const fullPath = path.join(musicFolder, songName + songExt);
		if (!fs.existsSync(fullPath)) continue;

		const metadata = await new Promise(resolve => {
			ffmpeg.ffprobe(fullPath, (err, meta) => resolve(err ? null : meta));
		});

		const duration = metadata?.format?.duration ? Math.round(metadata.format.duration) : null;
		const stats = fs.statSync(fullPath);
		const fileSize = stats.size;

		rowsToInsert.push([songName, fileName, null, duration, 0, 0, 0, fileSize, 100, null, null, null, 100, songExt.replace(".", "") || null, thumbExt.replace(".", "") || null, null, null, null]);
	}

	if (rowsToInsert.length > 0) {
		for (const row of rowsToInsert) {
			callSqlite({
				db: "musics",
				query: `
                    INSERT INTO songs (
                        song_id, song_name, song_url, song_length, seconds_played,
                        times_listened, stabilised, size, speed, bass, treble,
                        midrange, volume, song_extension, thumbnail_extension, artist, genre, language
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
				args: row,
				fetch: false,
			});

			songNameCache.set(row[0], {
				song_name: row[1],
				song_length: row[3],
				song_extension: row[13],
				song_url: row[2],
				thumbnail_extension: row[14],
				stabilised: row[6],
				size: row[7],
				genre: row[16],
				artist: row[15],
				language: row[17],
			});
		}
	}

	await alertModal(await promptUserOnSongs(Object.keys(databaseOnly).length));
}
