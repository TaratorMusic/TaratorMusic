const os = require("os");

function getSoundDetectBinary() {
	const name = process.platform === "win32" ? "sounddetect.exe" : "sounddetect";
	return path.join(backendFolder, name);
}

function getSoundDetectModels() {
	return path.join(backendFolder, "sounddetect_models");
}

function convertToWav16k(inputPath, outputPath) {
	const ffmpegBin = require("@ffmpeg-installer/ffmpeg").path;

	return new Promise((resolve, reject) => {
		const proc = spawn(ffmpegBin, [
			"-i", inputPath,
			"-f", "wav",
			"-ar", "16000",
			"-ac", "1",
			"-acodec", "pcm_s16le",
			"-hide_banner",
			"-loglevel", "error",
			"-y",
			outputPath,
		], { windowsHide: true });

		proc.on("close", code => {
			if (code === 0) resolve();
			else reject(new Error("ffmpeg conversion failed with code " + code));
		});
		proc.on("error", err => reject(err));
	});
}

async function generateTimestampsForCurrentSong() {
	const customiseDiv = document.getElementById("customiseModal");
	const songId = customiseDiv.dataset.songID;
	if (!songId) return;

	const songData = songNameCache.get(songId);
	if (!songData) return await alertModal("Song not found in database.");

	const cachedRows = songLyricsCache.get(songId) || [];
	const originalRow = cachedRows.find(r => !r.language);
	const plainLyrics = originalRow && originalRow.lyrics ? originalRow.lyrics.trim() : "";

	if (!plainLyrics) {
		return await alertModal("No lyrics found for this song. Add or fetch lyrics first.");
	}

	const binaryPath = getSoundDetectBinary();
	if (!fs.existsSync(binaryPath)) {
		return await alertModal("Linetime is not installed. Go to Settings > Linetime Aligner to download it.");
	}

	const modelsDir = getSoundDetectModels();
	const modelPath = path.join(modelsDir, "mms_multilingual.onnx");
	const tokenizerPath = path.join(modelsDir, "mms_multilingual_tokenizer.json");

	if (!fs.existsSync(modelPath)) {
		return await alertModal("Alignment model not found. Go to Settings > Linetime Aligner to download it.");
	}

	const btn = document.getElementById("generateTimestampsBtn");
	btn.disabled = true;
	btn.textContent = "Generating...";

	const tmpDir = os.tmpdir();
	const tmpId = songId + "_" + Date.now();
	const audioPath = path.join(musicFolder, songId + "." + songData.song_extension);
	const wavPath = path.join(tmpDir, "sd_audio_" + tmpId + ".wav");
	const lyricsTmpPath = path.join(tmpDir, "sd_lyrics_" + tmpId + ".txt");
	const outputLrcPath = path.join(tmpDir, "sd_output_" + tmpId + ".lrc");

	try {
		fs.writeFileSync(lyricsTmpPath, plainLyrics, "utf8");

		await convertToWav16k(audioPath, wavPath);

		const args = [
			wavPath,
			lyricsTmpPath,
			"--method", "a",
			"--model-a", modelPath,
			"--tokenizer", tokenizerPath,
			"--gpu",
			"-o", outputLrcPath,
		];

		const libDir = path.join(path.dirname(binaryPath), "lib");
		const env = Object.assign({}, process.env);
		if (process.platform !== "win32") {
			env.LD_LIBRARY_PATH = libDir + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "");
		}

		await new Promise((resolve, reject) => {
			const proc = spawn(binaryPath, args, {
				windowsHide: true,
				cwd: backendFolder,
				env: env,
			});

			let stderr = "";
			proc.stderr.on("data", chunk => { stderr += chunk.toString(); });
			proc.stdout.on("data", () => {});

			proc.on("close", code => {
				if (code === 0) resolve();
				else reject(new Error("sounddetect exited with code " + code + "\n" + stderr));
			});

			proc.on("error", err => reject(err));
		});

		if (!fs.existsSync(outputLrcPath)) {
			return await alertModal("Generation completed but no output file was created.");
		}

		const syncedText = fs.readFileSync(outputLrcPath, "utf8").trim();
		if (!syncedText) {
			return await alertModal("Generation completed but LRC output was empty.");
		}

		if (originalRow) {
			originalRow.synced_lyrics = syncedText;
			await callSqlite({
				db: "musics",
				query: "UPDATE lyrics SET synced_lyrics = ? WHERE song_id = ? AND (language IS NULL OR language = '')",
				args: [syncedText, songId],
				fetch: false,
			});
		} else {
			cachedRows.push({ lyrics: plainLyrics, language: null, synced_lyrics: syncedText });
			await callSqlite({
				db: "musics",
				query: "INSERT INTO lyrics (song_id, lyrics, language, synced_lyrics) VALUES (?, ?, NULL, ?)",
				args: [songId, plainLyrics, syncedText],
				fetch: false,
			});
		}
		songLyricsCache.set(songId, cachedRows);

		renderLyricsTimestampCol(syncedText);
		customiseDiv.dataset.origSyncedLyrics = Array.from(document.getElementById("lyricsTimestampCol").children)
			.map(input => input.value)
			.join("\n");

		document.getElementById("customiseButtonBottomRight").style.color = "lime";

		if (playingSongsID == songId && pipShowLyrics == 1) {
			updateMiniPlayer({ lyrics: plainLyrics, syncedLyrics: parseLrc(syncedText) });
			lastPipLyricsSongId = "";
		}

		if (lyricsPanelVisible && playingSongsID == songId) renderMainLyrics();

		btn.textContent = "Done!";
	} catch (error) {
		btn.textContent = "Failed";
		await alertModal("Failed to generate timestamps: " + (error.message || String(error)));
	} finally {
		setTimeout(() => {
			btn.textContent = "Generate Timestamps";
			btn.disabled = false;
		}, 2000);

		try { fs.unlinkSync(lyricsTmpPath); } catch (_) {}
		try { fs.unlinkSync(outputLrcPath); } catch (_) {}
		try { fs.unlinkSync(wavPath); } catch (_) {}
	}
}
