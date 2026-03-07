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
	const rows = Array.from(songNameCache.entries())
		.filter(([_, data]) => data.stabilised != 1)
		.map(([song_id, data]) => ({
			song_id,
			song_extension: data.song_extension,
			stabilised: data.stabilised,
		}));
	document.getElementById("stabiliseProgress").innerText = `Found ${rows.length} songs to process.`;

	let processedCount = 0;
	const totalRows = rows.length;

	for (const row of rows) {
		const fileName = row.song_id + row.song_extension;
		const fullPath = path.join(musicFolder, fileName);

		document.getElementById("stabiliseProgress").innerText = `[${processedCount + 1}/${totalRows}] Normalizing ${getSongNameById(row.song_id)}...`;

		try {
			await normalizeAudio(fullPath);
			const updateResult = callSqlite({
				db: "musics",
				query: "UPDATE songs SET stabilised = 1 WHERE song_id = ?",
				args: [row.song_id],
			});

			const cached = songNameCache.get(row.song_id);

			if (cached) cached.stabilised = 1;

			processedCount++;
			if (updateResult.changes > 0) {
				document.getElementById("stabiliseProgress").innerText = `[${processedCount}/${totalRows}] Successfully normalized and marked ${getSongNameById(row.song_id)}`;
			} else {
				document.getElementById("stabiliseProgress").innerText = `[${processedCount}/${totalRows}] Failed to update database for ${getSongNameById(row.song_id)}`;
			}
		} catch (e) {
			processedCount++;
			document.getElementById("stabiliseProgress").innerText = `[${processedCount}/${totalRows}] Failed to normalize ${getSongNameById(row.song_id)}: ${e.message}`;
		}
	}

	document.getElementById("stabiliseProgress").innerText = `Song stabilisation complete. ${processedCount} songs processed.`;
}
