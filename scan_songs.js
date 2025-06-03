const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("ffprobe-static").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function normalizeAudio(filePath) {
	return new Promise((resolve, reject) => {
		const tempPath = path.join(path.dirname(filePath), `normalized_${Date.now()}.mp3`);

		ffmpeg(filePath)
			.audioFilter("loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json")
			.audioCodec("libmp3lame")
			.format("mp3")
			.on("error", err => {
				if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
				reject(err);
			})
			.on("end", () => {
				try {
					fs.renameSync(tempPath, filePath);
					resolve(true);
				} catch (err) {
					reject(err);
				}
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

	console.log(`Found ${files.length} files to process`);

	for (const file of files) {
		const fullPath = path.join(musicFolder, file);

		if (!fs.statSync(fullPath).isFile()) continue;

		const name = path.basename(file, path.extname(file));

		const row = musicsDb.prepare("SELECT rms FROM songs WHERE song_id = ?").get(name);
		if (row && row.rms !== null && row.rms !== undefined) {
			console.log(`Skipping ${name}, already processed.`);
			continue;
		}

		console.log(`Normalizing ${name}...`);

		try {
			await normalizeAudio(fullPath);

			const updateResult = musicsDb.prepare("UPDATE songs SET rms = ? WHERE song_id = ?").run(1, name);

			if (updateResult.changes > 0) {
				console.log(`✅ Successfully normalized and marked ${name}`);
			} else {
				console.warn(`⚠️ Failed to update database for ${name}`);
			}
		} catch (e) {
			console.error(`❌ Failed to normalize ${name}:`, e.message);
		}
	}

	console.log("✅ Audio normalization complete.");
}

async function updateSongLengths() {
	const files = fs.readdirSync(musicFolder).filter(f => {
		return f.toLowerCase().endsWith(".mp3") && !f.startsWith(".") && !f.startsWith("normalized_") && !f.includes("temp_normalized") && !f.includes("tarator");
	});

	const upsert = musicsDb.prepare(`
    INSERT INTO songs (song_id, song_length)
    VALUES (?, ?)
    ON CONFLICT(song_id) DO UPDATE SET song_length = excluded.song_length
  `);

	console.log(`Updating lengths for ${files.length} files`);

	for (const file of files) {
		const songId = path.parse(file).name;
		const fullPath = path.join(musicFolder, file);

		if (!fs.statSync(fullPath).isFile()) continue;

		let metadata;
		try {
			metadata = await new Promise((resolve, reject) => {
				ffmpeg.ffprobe(fullPath, (err, meta) => {
					if (err) return reject(err);
					resolve(meta);
				});
			});
		} catch {
			console.warn(`Failed ffprobe for: ${file}`);
			continue;
		}

		if (!metadata.format || !metadata.format.duration) {
			console.warn(`No duration for: ${file}`);
			continue;
		}

		const duration = Math.round(metadata.format.duration);
		try {
			upsert.run(songId, duration);
		} catch (e) {
			console.error(`DB insert failed for "${file}": ${e.message}`);
		}
	}

	console.log("✅ Song length update complete.");
}
