async function createAppThumbnailsFolder() {
	await alertModal("Some app assets not found, they will now be fetched from the repository. Click the button to continue.");
	return new Promise((resolve, reject) => {
		const goBinary = path.join(backendFolder, "create_app_thumbnails_folder");
		const proc = spawn(goBinary, [appThumbnailFolder], { stdio: "inherit" });

		proc.on("error", reject);
		proc.on("close", code => {
			if (code !== 0) return reject(alertModal(`Go process exited with code ${code}`));
			alertModal("App thumbnails installed. App restart required for the effects.");
			resolve();
		});
	});
}

function shortenSongIdsGoPart(queryArray) {
	return new Promise((resolve, reject) => {
		const goBinary = path.join(backendFolder, "shorten_song_ids");
		const proc = spawn(goBinary, [queryArray[1], queryArray[2]], { stdio: ["pipe", "inherit", "inherit"] });

		proc.on("error", reject);

		proc.stdin.write(JSON.stringify(queryArray[0]));
		proc.stdin.end();

		proc.on("close", async code => {
			if (code !== 0) {
				await alertModal(`Go process exited with code ${code}`);
				return reject(new Error(`Go process exited with code ${code}`));
			}
			resolve();
		});
	});
}

async function grabAndStoreSongInfo() {
	return new Promise((resolve, reject) => {
		const goBinary = path.join(backendFolder, "musicbrainz_fetch");
		const songs = musicsDb
			.prepare(
				`
                SELECT song_name FROM songs
                WHERE artist IS NULL OR genre IS NULL OR language IS NULL
            `
			)
			.all()
			.map(r => r.song_name);

		if (!songs.length) {
			alertModal("No songs with missing information.");
			return resolve();
		}

		alertModal(`${songs.length} song${songs.length !== 1 ? "s" : ""} will be searched for information. You can close this window and the action will happen in the background.`);

		const proc = spawn(goBinary, songs);
		const stmt = musicsDb.prepare(`
            UPDATE songs
            SET artist = ?, genre = ?, language = ?
            WHERE song_name = ?
        `);

		let buffer = "";
		proc.stdout.on("data", chunk => {
			buffer += chunk.toString();
			let idx;
			while ((idx = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, idx).trim();
				buffer = buffer.slice(idx + 1);
				if (!line) continue;
				try {
					const meta = JSON.parse(line);
					console.log("New song:", meta.artist, meta.genre, meta.language, meta.title);
					stmt.run(meta.artist, meta.genre, meta.language, meta.title);
				} catch (e) {
					console.error("Bad JSON:", e);
				}
			}
		});

		proc.stderr.on("data", e => console.error(e.toString()));
		proc.on("error", reject);
		proc.on("close", code => (code === 0 ? resolve() : reject(new Error(`Go exited ${code}`))));
	});
}

async function startupCheck() {
	return new Promise((resolve, reject) => {
		musicsDb.prepare(`DELETE FROM songs WHERE song_length = 0 OR song_length IS NULL`).run();
		musicsDb.prepare("UPDATE songs SET song_extension = LTRIM(song_extension, '.')").run();
		musicsDb.prepare("UPDATE songs SET thumbnail_extension = LTRIM(thumbnail_extension, '.')").run();

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

		const allMusics = musicsDb.prepare("SELECT song_id, song_extension, thumbnail_extension FROM songs").all();
		const musicMap = Object.fromEntries(allMusics.map(({ song_id, ...rest }) => [song_id, rest]));

		const selectPlaylists = playlistsDb.prepare(`SELECT id, songs FROM playlists`).all();
		const checkSongExists = musicsDb.prepare(`SELECT 1 FROM songs WHERE song_id = ?`);
		const updatePlaylist = playlistsDb.prepare(`UPDATE playlists SET songs = ? WHERE id = ?`);

		selectPlaylists.forEach(row => {
			let songArray = JSON.parse(row.songs || "[]");

			const filtered = songArray.filter(id => {
				const exists = checkSongExists.get(id);
				return !!exists;
			});

			if (filtered.length !== songArray.length) {
				const newSongsJson = JSON.stringify(filtered);
				updatePlaylist.run(newSongsJson, row.id);
			}
		});

		const goBinary = path.join(backendFolder, "startup_check");
		const proc = spawn(goBinary, [musicFolder, thumbnailFolder], { stdio: ["pipe", "pipe", "inherit"] });
		let data = "";

		proc.on("error", reject);
		proc.stdout.on("data", chunk => (data += chunk));

		proc.on("close", code => {
			if (code !== 0) return reject(new Error(`Go process exited with code ${code}`));
			try {
				data = JSON.parse(data);

				if (Object.keys(data).length != allMusics.length) {
					foundNewSongs(data, musicMap);
				} else {
					alertModal(promptUserOnSongs());
				}

				resolve(data);
			} catch (e) {
				reject(e);
			}
		});
	});
}

function promptUserOnSongs(redownload) {
	let thePrompt = "";
	const stabilisedNull = musicsDb.prepare("SELECT COUNT(*) AS total FROM songs WHERE size IS NULL").get().total;
	const artistNull = musicsDb.prepare("SELECT COUNT(*) AS total FROM songs WHERE artist IS NULL").get().total;

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
		if (!(key in databaseSongs)) {
			folderOnly[key] = folderSongs[key];
		}
	}

	for (const key of Object.keys(databaseSongs)) {
		if (!(key in folderSongs)) {
			databaseOnly[key] = databaseSongs[key];
		}
	}

	for (const fileName of Object.keys(folderOnly)) {
		let songName = fileName;

		if (!fileName.includes("tarator")) {
			songName = generateId();
			const thumbSrc = path.join(thumbnailFolder, fileName) + folderOnly[fileName].thumbnail_extension;

			if (fs.existsSync(thumbSrc)) fs.renameSync(thumbSrc, path.join(thumbnailFolder, songName));
			await fs.renameSync(path.join(musicFolder, fileName), path.join(musicFolder, songName));
		}

		const fullPath = path.join(musicFolder, songName) + folderOnly[fileName].song_extension;

		const metadata = await new Promise((resolve, reject) => {
			ffmpeg.ffprobe(fullPath, (err, meta) => {
				if (err) return reject(err);
				resolve(meta);
			});
		});

		const duration = metadata.format?.duration ? Math.round(metadata.format.duration) : null;
		const stats = fs.statSync(fullPath);
		const fileSize = stats.size;

		const insertQuery = `
            INSERT INTO songs (
                song_id, song_name, song_url, song_length, seconds_played,
                times_listened, stabilised, size, speed, bass, treble,
                midrange, volume, song_extension, thumbnail_extension, artist, genre, language
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

		musicsDb.prepare(insertQuery).run(songName, fileName, null, duration, 0, 0, 0, fileSize, 100, null, null, null, 100, folderOnly[fileName].song_extension, folderOnly[fileName].thumbnail_extension, null, null, null);
	}

	await alertModal(promptUserOnSongs(Object.keys(databaseOnly).length));
}
