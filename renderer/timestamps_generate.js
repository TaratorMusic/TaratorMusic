const os = require("os");

function getSoundDetectBinary() {
	const effective = getEffectiveLinetimeSelection();
	return getLinetimeBinaryPath(effective.binary);
}

function getSoundDetectLibDir() {
	const effective = getEffectiveLinetimeSelection();
	const v = LINETIME_BINARY_VARIANTS.find(x => x.id === effective.binary);
	if (!v) return path.join(getLinetimeFolder(), "lib");
	return path.join(getLinetimeFolder(), v.libDir);
}

function getSoundDetectModels() {
	return path.join(getLinetimeFolder(), "sounddetect_models");
}

function getLinetimeFfmpegPath() {
	const ext = process.platform === "win32" ? ".exe" : "";
	return path.join(getLinetimeFolder(), "ffmpeg" + ext);
}

function getLinetimeWhisperCliPath() {
	const ext = process.platform === "win32" ? ".exe" : "";
	return path.join(getLinetimeFolder(), "whisper-cli" + ext);
}

function convertToWav16k(inputPath, outputPath) {
	const ffmpegBin = getLinetimeFfmpegPath();

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

async function runSoundDetect(args, env) {
	const binaryPath = getSoundDetectBinary();
	await new Promise((resolve, reject) => {
		const proc = spawn(binaryPath, args, {
			windowsHide: true,
			cwd: getLinetimeFolder(),
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
}

async function generateTimestampsForCurrentSong() {
	const customiseDiv = document.getElementById("customiseModal");
	const songId = customiseDiv.dataset.songID;
	if (!songId) return;

	const songData = songNameCache.get(songId);
	if (!songData) return await alertModal("Song not found in database.");

	const cachedRows = songLyricsCache.get(songId) || [];
	const originalRow = cachedRows.find(r => !r.language);
	const plainLyrics = originalRow && originalRow.lyrics ? originalRow.lyrics.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() : "";

	const effective = getEffectiveLinetimeSelection();
	const binaryPath = getSoundDetectBinary();
	if (!fs.existsSync(binaryPath)) {
		return await alertModal("Linetime is not installed. Go to Settings > Linetime Aligner to download it.");
	}

	const modelPath = getLinetimeModelPath(effective.model);
	if (!isLinetimeModelInstalled(effective.model)) {
		return await alertModal("Alignment model not found. Go to Settings > Linetime Aligner to download it.");
	}

	const tokenizerPath = getLinetimeModelDataPath(effective.model).replace("mms_multilingual_standard.onnx.data", "mms_multilingual_tokenizer.json");
	if (!fs.existsSync(tokenizerPath)) {
		return await alertModal("Tokenizer not found. Go to Settings > Linetime Aligner to download it.");
	}

	const whisperPath = effective.whisper ? getLinetimeWhisperPath(effective.whisper) : null;
	const whisperCliPath = getLinetimeWhisperCliPath();
	const ffmpegPath = getLinetimeFfmpegPath();

	const methodChoice = await showMethodSelectionModal(plainLyrics, !!whisperPath);
	if (!methodChoice) return;

	const { method, language } = methodChoice;

	const btn = document.getElementById("generateTimestampsBtn");
	btn.disabled = true;
	btn.textContent = "Generating...";

	const tmpDir = os.tmpdir();
	const tmpId = songId + "_" + Date.now();
	const audioPath = path.join(musicFolder, songId + "." + songData.song_extension);
	const wavPath = path.join(tmpDir, "sd_audio_" + tmpId + ".wav");
	const lyricsTmpPath = path.join(tmpDir, "sd_lyrics_" + tmpId + ".txt");
	const outputLrcPath = path.join(tmpDir, "sd_output_" + tmpId + ".lrc");

	const libDir = getSoundDetectLibDir();
	const env = Object.assign({}, process.env);
	if (process.platform !== "win32") {
		env.LD_LIBRARY_PATH = libDir + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "");
	}

	try {
		if (method !== "b") {
			fs.writeFileSync(lyricsTmpPath, plainLyrics, "utf8");
		}

		await convertToWav16k(audioPath, wavPath);

		const args = [wavPath];
		if (method !== "b") args.push(lyricsTmpPath);
		args.push("--method", method);
		if (method === "b" || method === "c") {
			if (!whisperPath || !fs.existsSync(whisperPath)) {
				return await alertModal(`Whisper model not found for Method ${method.toUpperCase()}. Download it in Settings > Linetime Aligner.`);
			}
			if (!fs.existsSync(whisperCliPath)) {
				return await alertModal("Whisper CLI not found. Go to Settings > Linetime Aligner to reinstall Linetime.");
			}
			args.push("--model-c", whisperPath);
			args.push("--whisper-cli", whisperCliPath);
		}
		if (method === "a" || method === "c") {
			args.push("--model-a", modelPath);
			args.push("--tokenizer", tokenizerPath);
		}
		if (language) args.push("--language", language);
		args.push("--ffmpeg", ffmpegPath);
		const prov = effective.binary === "gpu" ? "cuda" : "cpu";
		args.push("--provider", prov, "-o", outputLrcPath);

		await runSoundDetect(args, env);

		if (!fs.existsSync(outputLrcPath)) {
			return await alertModal("Generation completed but no output file was created.");
		}

		const syncedText = fs.readFileSync(outputLrcPath, "utf8").trim();
		if (!syncedText) {
			return await alertModal("Generation completed but LRC output was empty.");
		}

		const confirm = await showPreviewModal(syncedText, method);
		if (!confirm) return;

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

function getSelectedLanguage() {
	const langEl = document.getElementById("customiseSongLanguage");
	return langEl ? langEl.value.trim() : "";
}

function showMethodSelectionModal(plainLyrics, hasWhisperModel) {
	return new Promise(resolve => {
		const overlay = document.createElement("div");
		overlay.className = "confirm-modal-overlay";

		const modal = document.createElement("div");
		modal.className = "confirm-modal";
		modal.style.maxWidth = "500px";

		const title = document.createElement("h3");
		title.textContent = "Choose Timestamp Method";
		modal.appendChild(title);

		const hasLyrics = plainLyrics && plainLyrics.trim().length > 0;
		const songLang = getSelectedLanguage();

		const methods = [
			{ 
				id: "a", 
				name: "Align my lyrics", 
				desc: "Matches your existing lyrics to the audio. Fast and accurate if you already have correct lyrics.", 
				needsLang: true,
				disabledReason: hasLyrics ? null : "Add lyrics in the customisation modal first",
				available: hasLyrics 
			},
			{ 
				id: "b", 
				name: "Auto-generate (no lyrics needed)", 
				desc: "Transcribes the audio from scratch using AI. Use when you don't have lyrics. Needs Whisper model (~3GB).", 
				needsLang: true,
				disabledReason: hasLyrics 
					? "Method B is only available when no lyrics exist. Use Method C to fix existing lyrics."
					: (hasWhisperModel ? null : "Download Whisper model in Settings > Linetime Aligner"),
				available: !hasLyrics && hasWhisperModel 
			},
			{ 
				id: "c", 
				name: "Auto-generate + fix my lyrics", 
				desc: "Transcribes audio, then corrects your lyrics (fixes typos, restores missing parts). Best accuracy. Needs Whisper model (~3GB).", 
				needsLang: true,
				disabledReason: hasLyrics 
					? (hasWhisperModel ? null : "Download Whisper model in Settings > Linetime Aligner")
					: "Add lyrics in the customisation modal first",
				available: hasLyrics && hasWhisperModel 
			},
		];

		const methodRadios = {};
		const methodContainer = document.createElement("div");
		methodContainer.style.marginBottom = "16px";

		methods.forEach(m => {
			const row = document.createElement("label");
			row.className = "lyric-copy-option";
			row.style.display = "flex";
			row.style.alignItems = "flex-start";
			row.style.gap = "8px";
			row.style.padding = "8px";
			row.style.border = "1px solid #333";
			row.style.borderRadius = "4px";
			row.style.marginBottom = "8px";
			row.style.cursor = m.available ? "pointer" : "not-allowed";
			row.style.opacity = m.available ? "1" : "0.5";

			if (m.disabledReason) {
				row.title = m.disabledReason;
			}

			const input = document.createElement("input");
			input.type = "radio";
			input.name = "timestampMethod";
			input.value = m.id;
			input.disabled = !m.available;
			methodRadios[m.id] = input;
			row.appendChild(input);

			const textDiv = document.createElement("div");
			textDiv.style.flex = "1";

			const nameDiv = document.createElement("div");
			nameDiv.textContent = m.name + (m.disabledReason ? "  (unavailable)" : "");
			nameDiv.style.fontWeight = "bold";
			nameDiv.style.marginBottom = "2px";
			textDiv.appendChild(nameDiv);

			const descDiv = document.createElement("div");
			descDiv.textContent = m.desc;
			descDiv.style.fontSize = "12px";
			descDiv.style.color = "#aaa";
			textDiv.appendChild(descDiv);

			row.appendChild(textDiv);
			methodContainer.appendChild(row);
		});

		modal.appendChild(methodContainer);

		if (!songLang) {
			const langWarn = document.createElement("p");
			langWarn.style.fontSize = "12px";
			langWarn.style.color = "#f88";
			langWarn.style.marginTop = "4px";
			langWarn.style.marginBottom = "8px";
			langWarn.textContent = "⚠ No language set — pick one in the customisation modal for better accuracy";
			modal.appendChild(langWarn);
		}

		const actions = document.createElement("div");
		actions.className = "confirm-modal-actions";

		const continueBtn = document.createElement("button");
		continueBtn.id = "confirmModalPrimary";
		continueBtn.textContent = "Continue";
		actions.appendChild(continueBtn);

		const cancelBtn = document.createElement("button");
		cancelBtn.id = "confirmModalSecondary";
		cancelBtn.textContent = "Cancel";
		actions.appendChild(cancelBtn);

		modal.appendChild(actions);
		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		function cleanup(result) {
			overlay.remove();
			resolve(result);
		}

		continueBtn.addEventListener("click", () => {
			const method = Object.keys(methodRadios).find(k => methodRadios[k].checked);
			if (!method) {
				alertModal("Please select a method first.");
				return;
			}
			const language = getSelectedLanguage() || undefined;
			cleanup({ method, language });
		});
		cancelBtn.addEventListener("click", () => cleanup(null));
		overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(null); });
	});
}

function showPreviewModal(lrcText, method) {
	return new Promise(resolve => {
		const overlay = document.createElement("div");
		overlay.className = "confirm-modal-overlay";

		const modal = document.createElement("div");
		modal.className = "confirm-modal";
		modal.style.maxWidth = "700px";
		modal.style.maxHeight = "80vh";
		modal.style.overflow = "auto";

		const title = document.createElement("h3");
		title.textContent = `Preview — Method ${method.toUpperCase()}`;
		modal.appendChild(title);

		const pre = document.createElement("pre");
		pre.style.whiteSpace = "pre-wrap";
		pre.style.fontSize = "12px";
		pre.style.lineHeight = "1.4";
		pre.style.maxHeight = "50vh";
		pre.style.overflow = "auto";
		pre.style.background = "rgba(0,0,0,0.3)";
		pre.style.padding = "12px";
		pre.style.borderRadius = "4px";
		pre.style.margin = "12px 0";
		pre.textContent = lrcText;
		modal.appendChild(pre);

		const actions = document.createElement("div");
		actions.className = "confirm-modal-actions";

		const applyBtn = document.createElement("button");
		applyBtn.id = "confirmModalPrimary";
		applyBtn.textContent = "Apply";
		actions.appendChild(applyBtn);

		const cancelBtn = document.createElement("button");
		cancelBtn.id = "confirmModalSecondary";
		cancelBtn.textContent = "Cancel";
		actions.appendChild(cancelBtn);

		modal.appendChild(actions);
		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		function cleanup(result) {
			overlay.remove();
			resolve(result);
		}

		applyBtn.addEventListener("click", () => cleanup(true));
		cancelBtn.addEventListener("click", () => cleanup(false));
		overlay.addEventListener("click", e => { if (e.target === overlay) cleanup(false); });
	});
}