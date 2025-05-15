const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

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
