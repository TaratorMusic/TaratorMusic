function createAppThumbnailsFolder() {
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

		if (!songs.length) return resolve();

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
		const allMusics = musicsDb.prepare("SELECT song_id, song_name, song_extension, thumbnail_extension, size, song_length, artist, genre, language FROM songs").all();

		musicsDb.prepare(`DELETE FROM songs WHERE song_name LIKE '%tarator%' COLLATE NOCASE`).run();
		musicsDb.prepare(`DELETE FROM songs WHERE song_length = 0 OR song_length IS NULL`).run();

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
                console.log(data);
				resolve(data);
			} catch (e) {
				reject(e);
			}
		});

		// Compare our database length and the output length. If different, find out which are not in the database and add them. Remember to generate a new ID for it.
		// TODO: You have: 3 undownloaded songs, 5 unstabilised songs, 7 songs with no genre information, go to settings to add these...
	});
}

// async function processNewSongs() {
// 	try {
// 		const files = await fs.promises.readdir(musicFolder);
// 		const audioExtensions = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"]);
// 		const audioFiles = [];

// 		for (const fileName of files) {
// 			if (fileName.includes("tarator")) continue;

// 			const fullPath = path.join(musicFolder, fileName);

// 			try {
// 				const stats = await fs.promises.stat(fullPath);
// 				if (!stats.isFile()) continue;

// 				const ext = path.extname(fileName).toLowerCase();
// 				if (audioExtensions.has(ext)) {
// 					audioFiles.push(fileName);
// 				}
// 			} catch (error) {
// 				console.log(`Cannot access file ${fileName}:`, error.message);
// 			}
// 		}

// 		if (audioFiles.length === 0) {
// 			document.getElementById("folderProgress").innerText = "No new audio files found.";
// 			return;
// 		}

// 		document.getElementById("folderProgress").innerText = `Found ${audioFiles.length} audio file(s) to process...`;

// 		for (let i = 0; i < audioFiles.length; i++) {
// 			const fileName = audioFiles[i];
// 			const currentProgress = `(${i + 1}/${audioFiles.length})`;

// 			try {
// 				const fullPath = path.join(musicFolder, fileName);
// 				const songName = removeExtensions(fileName);
// 				const songId = generateId();

// 				document.getElementById("folderProgress").innerText = `${currentProgress} Processing: ${songName}...`;

// 				let duration = null;
// 				try {
// 					document.getElementById("folderProgress").innerText = `${currentProgress} Getting duration for: ${songName}...`;

// 					const metadata = await new Promise((resolve, reject) => {
// 						ffmpeg.ffprobe(fullPath, (err, meta) => {
// 							if (err) return reject(err);
// 							resolve(meta);
// 						});
// 					});

// 					duration = metadata.format?.duration ? Math.round(metadata.format.duration) : null;

// 					document.getElementById("folderProgress").innerText = `${currentProgress} Duration: ${duration ? `${duration}s` : "unknown"}`;
// 				} catch (error) {
// 					console.log(`Failed to get duration for ${songName}:`, error.message);
// 					document.getElementById("folderProgress").innerText = `${currentProgress} Duration: unknown (${error.message})`;
// 				}

// 				const songExt = path.extname(fileName).slice(1).toLowerCase();
// 				const newSongPath = path.join(musicFolder, `${songId}.${songExt}`);
// 				await fs.promises.rename(fullPath, newSongPath);

// 				let thumbnailExt = null;
// 				try {
// 					const oldThumbnailBase = path.parse(fileName).name;
// 					const thumbFiles = await fs.promises.readdir(thumbnailFolder);
// 					const thumbFile = thumbFiles.find(f => path.parse(f).name === oldThumbnailBase);

// 					if (thumbFile) {
// 						thumbnailExt = path.extname(thumbFile).slice(1).toLowerCase();
// 						const oldThumbPath = path.join(thumbnailFolder, thumbFile);
// 						const newThumbPath = path.join(thumbnailFolder, `${songId}.${thumbnailExt}`);

// 						await fs.promises.rename(oldThumbPath, newThumbPath);
// 					}
// 				} catch (error) {
// 					console.log(`Failed to process thumbnail for ${fileName}:`, error.message);
// 				}

// 				const stats = await fs.promises.stat(newSongPath);
// 				const fileSize = stats.size;

// 				const insertQuery = `
// 					INSERT INTO songs (
// 						song_id, song_name, song_url, song_length, seconds_played,
// 						times_listened, stabilised, size, speed, bass, treble,
// 						midrange, volume, song_extension, thumbnail_extension, artist, genre, language
// 					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
// 				`;

// 				musicsDb.prepare(insertQuery).run(songId, songName, null, duration, 0, 0, 0, fileSize, 100, null, null, null, 100, songExt, thumbnailExt, null, null, null);

// 				document.getElementById("folderProgress").innerText = `${currentProgress} Successfully added: ${songName}`;
// 			} catch (error) {
// 				console.error(`Failed to process ${fileName}:`, error);
// 				document.getElementById("folderProgress").innerText = `${currentProgress} Failed to process ${fileName}: ${error.message}`;
// 			}
// 		}

// 		document.getElementById("folderProgress").innerText = "Folder check complete!";
// 	} catch (error) {
// 		console.error("Error in processNewSongs:", error);
// 		document.getElementById("folderProgress").innerText = `Error reading music folder: ${error.message}`;
// 	}
// }
