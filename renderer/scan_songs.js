const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("ffprobe-static").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function normalizeAudio(filePath) {
	return new Promise((resolve, reject) => {
		const tempPath = path.join(path.dirname(filePath), `normalized_${Date.now()}.mp3`);

		ffmpeg(filePath)
			.audioFilter("loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:print_format=none")
			.audioCodec("libmp3lame")
			.outputOptions("-b:a", "192k")
			.on("error", err => {
				if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
				reject(err);
			})
			.on("end", () => {
				fs.renameSync(tempPath, filePath);
				resolve(true);
			})
			.save(tempPath);
	});
}

async function processAllFiles() {
	const allFiles = fs.readdirSync(musicFolder);
	const tempFiles = allFiles.filter(f => f.startsWith(".normalized_") || f.startsWith("normalized_") || f.includes("temp_normalized"));
	if (tempFiles.length > 0) {
		console.log(`Cleaning up ${tempFiles.length} temporary files...`);
		tempFiles.forEach(tempFile => {
			try {
				fs.unlinkSync(path.join(musicFolder, tempFile));
				console.log(`Deleted: ${tempFile}`);
			} catch (err) {
				console.warn(`Could not delete ${tempFile}:`, err.message);
			}
		});
	}

	const files = fs.readdirSync(musicFolder).filter(f => {
		return f.endsWith(".mp3") && !f.startsWith(".") && !f.startsWith("normalized_") && !f.includes("temp_normalized");
	});

	document.getElementById("stabiliseProgress").innerText = `Found ${files.length} files to process`;

	let processedCount = 0;
	const totalFiles = files.length;

	for (const file of files) {
		const fullPath = path.join(musicFolder, file);
		if (!fs.statSync(fullPath).isFile()) continue;

		const name = path.basename(file, path.extname(file));
		const row = musicsDb.prepare("SELECT stabilised FROM songs WHERE song_id = ?").get(name);

		if (row && row.stabilised == 1) {
			processedCount++;
			document.getElementById("stabiliseProgress").innerText = `[${processedCount}/${totalFiles}] Skipping ${name}, already processed.`;
			continue;
		}

		document.getElementById("stabiliseProgress").innerText = `[${processedCount + 1}/${totalFiles}] Normalizing ${getSongNameById(name)}...`;
		try {
			await normalizeAudio(fullPath);
			const updateResult = musicsDb.prepare("UPDATE songs SET stabilised = ? WHERE song_id = ?").run(1, name);
			processedCount++;
			if (updateResult.changes > 0) {
				document.getElementById("stabiliseProgress").innerText = `[${processedCount}/${totalFiles}] Successfully normalized and marked ${getSongNameById(name)}`;
			} else {
				document.getElementById("stabiliseProgress").innerText = `[${processedCount}/${totalFiles}] Failed to update database for ${getSongNameById(name)}`;
			}
		} catch (e) {
			processedCount++;
			document.getElementById("stabiliseProgress").innerText = (`[${processedCount}/${totalFiles}] Failed to normalize ${getSongNameById(name)}:`, e.message);
		}
	}

	document.getElementById("stabiliseProgress").innerText = "Audio normalization complete.";
}

async function cleanDebugFiles() {
	const regex = /^174655\d+-player-script\.js$/;

	document.getElementById("cleanProgress").innerText = `Cleaning debug files...`;
	await new Promise(resolve => setTimeout(resolve, 10));

	fs.readdirSync("./").forEach(file => {
		if (regex.test(file)) {
			fs.unlinkSync(path.join("./", file));
		}
	});

	document.getElementById("cleanProgress").innerText = `Cleaning broken songs...`;
	await new Promise(resolve => setTimeout(resolve, 10));

	fs.readdirSync("./musics").forEach(file => {
		if (!file.endsWith(".mp3")) {
			fs.unlinkSync(path.join("./musics", file));
		}
	});

	try {
		document.getElementById("cleanProgress").innerText = `Cleaning the database...`;
		await new Promise(resolve => setTimeout(resolve, 10));

		const musicFiles = fs.readdirSync("./musics");
		const allSongs = musicsDb.prepare(`SELECT song_id FROM songs`).all();
		const deleteSong = musicsDb.prepare(`DELETE FROM songs WHERE song_id = ?`);

		allSongs.forEach(song => {
			const fileName = song.song_id + ".mp3";
			if (!musicFiles.includes(fileName)) {
				deleteSong.run(song.song_id);
			}
		});

		musicsDb.prepare(`DELETE FROM songs WHERE song_id LIKE '%.mp3%'`).run();
		musicsDb.prepare(`DELETE FROM songs WHERE song_name LIKE '%tarator%' COLLATE NOCASE`).run();
		musicsDb.prepare(`DELETE FROM songs WHERE song_length = 0 OR song_length IS NULL`).run();

		const selectPlaylists = playlistsDb.prepare(`SELECT id, songs FROM playlists`).all();
		const checkSongExists = musicsDb.prepare(`SELECT 1 FROM songs WHERE song_id = ?`);
		const updatePlaylist = playlistsDb.prepare(`UPDATE playlists SET songs = ? WHERE id = ?`);

		selectPlaylists.forEach(row => {
			let songArray;
			try {
				songArray = JSON.parse(row.songs || "[]");
			} catch {
				songArray = [];
			}

			const filtered = songArray.filter(id => {
				const exists = checkSongExists.get(id);
				return !!exists;
			});

			if (filtered.length !== songArray.length) {
				const newSongsJson = JSON.stringify(filtered);
				updatePlaylist.run(newSongsJson, row.id);
			}
		});
	} catch (err) {
		console.error("Error during database cleanup:", err.message);
	}

	document.getElementById("cleanProgress").innerText = `Cleaning complete!`;
}

async function processNewSongs() {
	const files = fs.readdirSync(musicFolder);
	for (const name of files) {
		if (name.includes("tarator")) continue;

		const fullPath = path.join(musicFolder, name);
		if (!fs.statSync(fullPath).isFile()) continue;

		const songName = name.replace(".mp3", "");
		document.getElementById("folderProgress").innerText = `Found new song: ${songName}`;

		const songId = generateId();
		let duration = null;
		try {
			const metadata = await new Promise((resolve, reject) => {
				ffmpeg.ffprobe(fullPath, (err, meta) => {
					if (err) return reject(err);
					resolve(meta);
				});
			});

			if (metadata.format && metadata.format.duration) {
				duration = Math.round(metadata.format.duration);
			}
			document.getElementById("folderProgress").innerText += ` Song length: ${duration} seconds`;
		} catch (error) {
			document.getElementById("folderProgress").innerText = `Failed to get duration for ${songName}: ${error.message}`;
		}

		const newSongPath = path.join(musicFolder, `${songId}.mp3`);
		fs.renameSync(fullPath, newSongPath);

		let newThumbnailName = `${songId}.jpg`;
		const oldThumbnailPath = path.join(thumbnailFolder, `${name}.jpg`);
		if (fs.existsSync(oldThumbnailPath)) {
			const newThumbnailPath = path.join(thumbnailFolder, newThumbnailName);
			fs.renameSync(oldThumbnailPath, newThumbnailPath);
		} else {
			newThumbnailName = null;
		}

		const fileSize = fs.statSync(newSongPath).size;

		try {
			musicsDb
				.prepare(
					`
                    INSERT INTO songs (
                        song_id, song_name, song_url, song_thumbnail,
                        song_length, seconds_played, times_listened, stabilised,
                        size, speed, bass, treble, midrange, volume
                    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, 1, 0, 0, 0, 100)
                `
				)
				.run(songId, songName, newThumbnailName, duration, fileSize);

			document.getElementById("folderProgress").innerText = `Added ${songName} to database`;
		} catch (error) {
			document.getElementById("folderProgress").innerText = `Failed to add ${songName} to database: ${error.message}`;
		}
	}

	document.getElementById("folderProgress").innerText = "Folder check complete!";
}
