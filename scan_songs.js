const ffmpeg = require("fluent-ffmpeg");
const ffprobeStatic = require("ffprobe-static");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

function calculateRMSFromPCM(pcmData) {
	let sum = 0;
	for (let i = 0; i < pcmData.length; i += 2) {
		let sample = pcmData.readInt16LE(i) / 32768;
		sum += sample * sample;
	}
	return Math.sqrt(sum / (pcmData.length / 2));
}

async function analyzeFile(filePath) {
	return new Promise((resolve, reject) => {
		let buffers = [];

		ffmpeg(filePath)
			.format("s16le")
			.audioChannels(1)
			.audioFrequency(44100)
			.noVideo()
			.on("error", reject)
			.on("end", () => {
				const buffer = Buffer.concat(buffers);
				const rms = calculateRMSFromPCM(buffer);
				console.log(`Calculated RMS for ${filePath}:`, rms);
				resolve(rms);
			})
			.pipe()
			.on("data", chunk => buffers.push(chunk));
	});
}

async function processAllFiles() {
	const files = fs.readdirSync(musicFolder).filter(f => f.endsWith(".mp3"));

	for (const file of files) {
		const name = path.basename(file, path.extname(file));
		const row = musicsDb.prepare("SELECT rms FROM songs WHERE song_id = ?").get(name);

		if (row && row.rms !== null && row.rms !== undefined) {
			console.log(`Skipping ${name}, RMS already stored.`);
			continue;
		}

		const filePath = path.join(musicFolder, file);
		console.log(`Analyzing ${name}...`);
		try {
			const rms = await analyzeFile(filePath);
			if (rms !== null && rms !== undefined && !isNaN(rms)) {
				console.log(`Updating RMS for ${name} to ${rms.toFixed(4)}...`);

				const updateResult = musicsDb
					.prepare(
						`
						UPDATE songs
						SET rms = ?
						WHERE song_id = ?
						`
					)
					.run(rms, name);

				if (updateResult.changes > 0) {
					console.log(`Successfully updated RMS for ${name}`);
				} else {
					console.warn(`Failed to update RMS for ${name}`);
				}
			} else {
				console.warn(`No valid RMS calculated for ${name}, skipping.`);
			}
		} catch (e) {
			console.error(`Failed to analyze ${name}:`, e);
		}
	}

	console.log("✅ RMS analysis complete.");
}

async function updateSongLengths() {
	const files = fs.readdirSync(musicFolder);
	const upsert = musicsDb.prepare(`
        INSERT INTO songs (song_id, song_length)
        VALUES (?, ?)
        ON CONFLICT(song_id) DO UPDATE SET song_length = excluded.song_length
    `);

	for (const file of files) {
		if (!file.toLowerCase().endsWith(".mp3")) {
			continue;
		}

		const songId = path.parse(file).name;
		const fullPath = path.join(musicFolder, file);

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

	console.log("Song length update complete.");
}
