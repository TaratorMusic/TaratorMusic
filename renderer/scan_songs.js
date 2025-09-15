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