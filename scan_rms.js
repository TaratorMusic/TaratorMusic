// scan_rms.js

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
				resolve(rms);
			})
			.pipe()
			.on("data", (chunk) => buffers.push(chunk));
	});
}

async function processAllFiles() {
	const files = fs.readdirSync(musicFolder).filter((f) => f.endsWith(".mp3"));
	let rmsMap = {};

	for (const file of files) {
		const filePath = path.join(musicFolder, file);
		console.log(`Analyzing ${file}...`);
		try {
			const rms = await analyzeFile(filePath);
			rmsMap[file] = rms;
			console.log(`→ RMS: ${rms.toFixed(4)}`);
		} catch (e) {
			console.error(`Failed to analyze ${file}:`, e);
		}
	}

	fs.writeFileSync(rmsPath, JSON.stringify(rmsMap, null, 2));
	console.log("✅ RMS analysis complete.");
}

processAllFiles();
