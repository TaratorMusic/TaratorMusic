const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("ffprobe-static").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const CODEC_MAP = new Map([
	["mp3", "libmp3lame"],
	["wav", "pcm_s16le"],
	["flac", "flac"],
	["ogg", "libvorbis"],
	["aac", "aac"],
	["m4a", "aac"],
	["opus", "libopus"],
]);

async function normalizeAudio(filePath) {
	const ext = path.extname(filePath).toLowerCase().slice(1);
	const codec = CODEC_MAP.get(ext);
	if (!codec) throw new Error(`Unsupported file extension: .${ext}`);

	const dir = path.dirname(filePath);
	const base = path.basename(filePath, "." + ext);
	const tmpPath = path.join(dir, `${base}.!${Date.now()}.${ext}`);

	await new Promise((resolve, reject) => {
		ffmpeg(filePath).audioFilter("loudnorm=I=-16:TP=-1.5:LRA=11").audioCodec(codec).on("error", reject).on("end", resolve).save(tmpPath);
	});

	await new Promise((resolve, reject) => {
		fs.rename(tmpPath, filePath, err => {
			if (err) reject(err);
			else resolve();
		});
	});

	return filePath;
}

async function processAllFiles() {
	const allFiles = fs.readdirSync(musicFolder);
	const tempFiles = allFiles.filter(f => f.includes("!"));
	if (tempFiles.length > 0) {
		console.log(`Cleaning up ${tempFiles.length} temporary files...`);
		tempFiles.forEach(tempFile => {
			try {
				fs.unlinkSync(path.join(musicFolder, tempFile));
				console.log(`Deleted: ${tempFile}`);
			} catch (err) {
				console.log(`Could not delete ${tempFile}:`, err.message);
			}
		});
	}

	const files = fs.readdirSync(musicFolder).filter(f => {
		return !f.startsWith(".") && !f.startsWith("normalized_") && !f.includes("temp_normalized");
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

	document.getElementById("stabiliseProgress").innerText = "Song stabilisation complete.";
}

async function cleanDebugFiles() {
	const regex = /^174655\d+-player-script\.js$/;

	document.getElementById("cleanProgress").innerText = `Cleaning debug files...`;
	await sleep(10);
	fs.readdirSync(taratorFolder).forEach(file => {
		if (regex.test(file)) {
			fs.unlinkSync(path.join(taratorFolder, file));
		}
	});

	try {
		document.getElementById("cleanProgress").innerText = `Cleaning the database...`;
		await sleep(10);

		const musicFiles = fs.readdirSync(musicFolder);
		const allSongs = musicsDb.prepare(`SELECT song_id FROM songs`).all();
		const deleteSong = musicsDb.prepare(`DELETE FROM songs WHERE song_id = ?`);

		allSongs.forEach(song => {
			const exists = musicFiles.some(f => f.startsWith(song.song_id));
			if (!exists) {
				deleteSong.run(song.song_id);
				console.log("Deleted", song.song_id);
			}
		});

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
	} catch (err) {
		console.log("Error during database cleanup:", err.message);
	}

	document.getElementById("cleanProgress").innerText = `Cleaning complete!`;
}

async function processNewSongs() {
	try {
		const files = await fs.promises.readdir(musicFolder);
		const audioExtensions = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"]);
		const audioFiles = [];

		for (const fileName of files) {
			if (fileName.includes("tarator")) continue;

			const fullPath = path.join(musicFolder, fileName);

			try {
				const stats = await fs.promises.stat(fullPath);
				if (!stats.isFile()) continue;

				const ext = path.extname(fileName).toLowerCase();
				if (audioExtensions.has(ext)) {
					audioFiles.push(fileName);
				}
			} catch (error) {
				console.log(`Cannot access file ${fileName}:`, error.message);
			}
		}

		if (audioFiles.length === 0) {
			document.getElementById("folderProgress").innerText = "No new audio files found.";
			return;
		}

		document.getElementById("folderProgress").innerText = `Found ${audioFiles.length} audio file(s) to process...`;

		for (let i = 0; i < audioFiles.length; i++) {
			const fileName = audioFiles[i];
			const currentProgress = `(${i + 1}/${audioFiles.length})`;

			try {
				const fullPath = path.join(musicFolder, fileName);
				const songName = removeExtensions(fileName);
				const songId = generateId();

				document.getElementById("folderProgress").innerText = `${currentProgress} Processing: ${songName}...`;

				let duration = null;
				try {
					document.getElementById("folderProgress").innerText = `${currentProgress} Getting duration for: ${songName}...`;

					const metadata = await new Promise((resolve, reject) => {
						ffmpeg.ffprobe(fullPath, (err, meta) => {
							if (err) return reject(err);
							resolve(meta);
						});
					});

					duration = metadata.format?.duration ? Math.round(metadata.format.duration) : null;

					document.getElementById("folderProgress").innerText = `${currentProgress} Duration: ${duration ? `${duration}s` : "unknown"}`;
				} catch (error) {
					console.log(`Failed to get duration for ${songName}:`, error.message);
					document.getElementById("folderProgress").innerText = `${currentProgress} Duration: unknown (${error.message})`;
				}

				const songExt = path.extname(fileName).slice(1).toLowerCase();
				const newSongPath = path.join(musicFolder, `${songId}.${songExt}`);
				await fs.promises.rename(fullPath, newSongPath);

				let thumbnailExt = null;
				try {
					const oldThumbnailBase = path.parse(fileName).name;
					const thumbFiles = await fs.promises.readdir(thumbnailFolder);
					const thumbFile = thumbFiles.find(f => path.parse(f).name === oldThumbnailBase);

					if (thumbFile) {
						thumbnailExt = path.extname(thumbFile).slice(1).toLowerCase();
						const oldThumbPath = path.join(thumbnailFolder, thumbFile);
						const newThumbPath = path.join(thumbnailFolder, `${songId}.${thumbnailExt}`);

						await fs.promises.rename(oldThumbPath, newThumbPath);
					}
				} catch (error) {
					console.log(`Failed to process thumbnail for ${fileName}:`, error.message);
				}

				const stats = await fs.promises.stat(newSongPath);
				const fileSize = stats.size;

				const insertQuery = `
                    INSERT INTO songs (
                        song_id, song_name, song_url, song_length, seconds_played, 
                        times_listened, stabilised, size, speed, bass, treble, 
                        midrange, volume, song_extension, thumbnail_extension
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

				musicsDb.prepare(insertQuery).run(songId, songName, null, duration, 0, 0, 0, fileSize, 100, null, null, null, 100, songExt, thumbnailExt);

				document.getElementById("folderProgress").innerText = `${currentProgress} Successfully added: ${songName}`;
			} catch (error) {
				console.error(`Failed to process ${fileName}:`, error);
				document.getElementById("folderProgress").innerText = `${currentProgress} Failed to process ${fileName}: ${error.message}`;
			}
		}

		document.getElementById("folderProgress").innerText = "Folder check complete!";
	} catch (error) {
		console.error("Error in processNewSongs:", error);
		document.getElementById("folderProgress").innerText = `Error reading music folder: ${error.message}`;
	}
}
