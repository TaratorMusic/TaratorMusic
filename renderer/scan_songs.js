const CODEC_MAP = new Map([
	["mp3", "libmp3lame"],
	["wav", "pcm_s16le"],
	["flac", "flac"],
	["ogg", "libvorbis"],
	["aac", "aac"],
	["m4a", "aac"],
	["opus", "libopus"],
]);

function timemarkToSeconds(timemark) {
	if (!timemark) return 0;
	const parts = String(timemark)
		.split(":")
		.map(part => Number(part));
	if (parts.some(part => !Number.isFinite(part))) return 0;
	return parts.reduce((total, part) => total * 60 + part, 0);
}

async function normalizeAudio(filePath, onProgress) {
	const ext = path.extname(filePath).toLowerCase().slice(1);
	const codec = CODEC_MAP.get(ext);
	if (!codec) throw new Error(`Unsupported file extension: .${ext}`);

	const dir = path.dirname(filePath);
	const base = path.basename(filePath, "." + ext);
	const tmpPath = path.join(dir, `${base}.!${Date.now()}.${ext}`);
	const startedAt = Date.now();
	const rateSamples = [];

	await new Promise((resolve, reject) => {
		ffmpeg(filePath)
			.audioFilter("loudnorm=I=-16:TP=-1.5:LRA=11")
			.audioCodec(codec)
			.on("progress", progress => {
				if (!onProgress) return;
				const percent = progress.percent;
				if (percent == null || !Number.isFinite(percent)) return;

				const processedSeconds = timemarkToSeconds(progress.timemark);
				const elapsedSeconds = (Date.now() - startedAt) / 1000;
				if (processedSeconds <= 0 || elapsedSeconds <= 0) return;

				rateSamples.push({ processed: processedSeconds, elapsed: elapsedSeconds });
				if (rateSamples.length > 4) rateSamples.shift();
				if (rateSamples.length < 2) return;

				const first = rateSamples[0];
				const last = rateSamples[rateSamples.length - 1];
				const windowSeconds = last.elapsed - first.elapsed;
				const rate = windowSeconds > 0 ? (last.processed - first.processed) / windowSeconds : processedSeconds / elapsedSeconds;
				if (rate <= 0) return;

				const totalSeconds = percent > 0 ? processedSeconds / (percent / 100) : 0;
				const secondsLeft = Math.max(0, (totalSeconds - processedSeconds) / rate);
				onProgress({ percent: percent, secondsLeft: secondsLeft });
			})
			.on("error", reject)
			.on("end", resolve)
			.save(tmpPath);
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
	isStabilisingAll = true;
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
		const fileName = row.song_id + "." + row.song_extension;
		const fullPath = path.join(musicFolder, fileName);

		document.getElementById("stabiliseProgress").innerText = `[${processedCount + 1}/${totalRows}] Normalizing ${getSongNameById(row.song_id)}...`;

		try {
			await normalizeAudio(fullPath);
			const updateResult = await callSqlite({
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
	isStabilisingAll = false;
}

let isStabilisingAll = false;

function refreshStabiliseCount() {
	if (isStabilisingAll) return;
	const el = document.getElementById("stabiliseProgress");
	if (!el) return;
	const total = songNameCache.size;
	const done = Array.from(songNameCache.values()).filter(v => v.stabilised == 1).length;
	el.innerText = `Stabilised: ${done} of ${total} songs`;
}
