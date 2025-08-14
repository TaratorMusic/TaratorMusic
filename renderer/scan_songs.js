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

async function normalizeAudioSimple(inputPath, outputPath) {
	const ext = path.extname(inputPath).toLowerCase().slice(1);
	const codec = CODEC_MAP.get(ext);

	if (!codec) {
		console.log(`Unsupported file extension: .${ext}`);
		return;
	}

	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.audioFilter("loudnorm=I=-16:TP=-1.5:LRA=11")
			.audioCodec(codec)
			.on("error", err => {
				reject(console.log(`FFmpeg error: ${err.message}`));
			})
			.on("end", () => {
				resolve(outputPath);
			})
			.save(outputPath);
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

	document.getElementById("stabiliseProgress").innerText = "Audio normalization complete.";
}

async function cleanDebugFiles() {
	const regex = /^174655\d+-player-script\.js$/;

	document.getElementById("cleanProgress").innerText = `Cleaning debug files...`;
	await new Promise(resolve => setTimeout(resolve, 10));

	fs.readdirSync(taratorFolder).forEach(file => {
		if (regex.test(file)) {
			fs.unlinkSync(path.join(taratorFolder, file));
		}
	});

	document.getElementById("cleanProgress").innerText = `Cleaning broken songs...`;
	await new Promise(resolve => setTimeout(resolve, 10));

	try {
		document.getElementById("cleanProgress").innerText = `Cleaning the database...`;
		await new Promise(resolve => setTimeout(resolve, 10));

		const musicFiles = fs.readdirSync(musicFolder);
		const allSongs = musicsDb.prepare(`SELECT song_id FROM songs`).all();
		const deleteSong = musicsDb.prepare(`DELETE FROM songs WHERE song_id = ?`);

		allSongs.forEach(song => {
			const exists = musicFiles.some(f => f.startsWith(song.song_id + "."));
			if (!exists) {
				deleteSong.run(song.song_id);
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
	const files = fs.readdirSync(musicFolder);
	for (const name of files) {
		if (name.includes("tarator")) continue;

		const fullPath = path.join(musicFolder, name);
		if (!fs.statSync(fullPath).isFile()) continue;

		const songName = removeExtensions(name);
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

		const songExt = path.extname(name).slice(1).toLowerCase();
		const newSongPath = path.join(musicFolder, `${songId}.${songExt}`);
		fs.renameSync(fullPath, newSongPath);

		let thumbnailExt = null;
		let newThumbnailName = null;
		const oldThumbnailBase = path.parse(name).name;
		const thumbFiles = fs.readdirSync(thumbnailFolder);
		const thumbFile = thumbFiles.find(f => path.parse(f).name === oldThumbnailBase);
		if (thumbFile) {
			thumbnailExt = path.extname(thumbFile).slice(1).toLowerCase();
			newThumbnailName = `${songId}.${thumbnailExt}`;
			fs.renameSync(path.join(thumbnailFolder, thumbFile), path.join(thumbnailFolder, newThumbnailName));
		}

		const fileSize = fs.statSync(newSongPath).size;

		try {
			musicsDb
				.prepare(
					`INSERT INTO songs (
                        song_id, song_name, song_url, song_thumbnail,
                        song_length, seconds_played, times_listened, stabilised,
                        size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension
                    ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 1, 0, 0, 0, 100, ?, ?)`
				)
				.run(songId, songName, newSongPath, newThumbnailName, duration, 1, songExt, thumbnailExt);

			document.getElementById("folderProgress").innerText = `Added ${songName} to database`;
		} catch (error) {
			document.getElementById("folderProgress").innerText = `Failed to add ${songName} to database: ${error.message}`;
		}
	}

	document.getElementById("folderProgress").innerText = "Folder check complete!";
}
