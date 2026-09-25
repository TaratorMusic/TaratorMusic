async function grabAndStoreSongInfo(songId) {
	let fetchedId = songId;
	if (fetchedId == "html") fetchedId = document.getElementById("customiseModal").dataset.songID;

	const isSingle = fetchedId && !Array.isArray(fetchedId);

	return new Promise((resolve, reject) => {
		let songs = [];

		if (fetchedId) {
			if (Array.isArray(fetchedId)) {
				for (let i = 0; i < fetchedId.length; i++) {
					songs[i] = getSongNameById(fetchedId[i]);
				}
			} else {
				const songData = songNameCache.get(fetchedId);
				if (!songData) {
					alertModal("Song not found in database.");
					return resolve();
				} else {
					songs = [songData.song_name];
				}
			}
		} else {
			songs = Array.from(songNameCache.values())
				.filter(song => !song.artist || !song.genre || !song.language)
				.map(song => song.song_name);

			fetchedId = Array.from(songNameCache.entries())
				.filter(([key, song]) => !song.artist || !song.genre || !song.language)
				.map(([key]) => key);

			if (!songs.length) {
				alertModal("No songs with missing information.");
				return resolve();
			} else {
				alertModal(`${songs.length} song${songs.length != 1 ? "s" : ""} will be searched for information. You can close this window and the action will happen in the background.`);
			}
		}

		const goBinary = path.join(backendFolder, "musicbrainz_fetch");
		const proc = spawn(goBinary, songs, {
			windowsHide: true,
		});

		let buffer = "";
		let count = 0;

		proc.stdout.on("data", chunk => {
			buffer += chunk.toString();
			for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
				const line = buffer.slice(0, i).trim();
				buffer = buffer.slice(i + 1);
				if (!line) continue;

				try {
					const meta = JSON.parse(line);
					const songIdUsed = Array.isArray(fetchedId) ? fetchedId[count] : fetchedId;

					if (isSingle && songIdUsed) {
						const cached = songNameCache.get(songIdUsed);
						const hasExisting = cached && (cached.artist || cached.genre || cached.language);

						if (hasExisting) {
							const currentData = {
								artist: cached.artist || "",
								genre: cached.genre || "",
								language: cached.language || "",
							};
							const fetchedData = {
								artist: meta.artist || "",
								genre: meta.genre || "",
								language: meta.language || "",
							};

							const same = normalizeText(currentData.artist) == normalizeText(fetchedData.artist)
								&& normalizeText(currentData.genre) == normalizeText(fetchedData.genre)
								&& normalizeText(currentData.language) == normalizeText(fetchedData.language);

							if (!same) {
								comparisonModal({
									title: "Compare Song Info",
									currentLabel: "Current Info",
									fetchedLabel: "Fetched Info",
									current: currentData,
									results: [fetchedData],
									renderPreview: item => {
										let html = "";
										const fields = [
											{ label: "Artist", value: item.artist },
											{ label: "Genre", value: item.genre },
											{ label: "Language", value: item.language },
										];
										for (const f of fields) {
											html += `<div class="comparison-preview-title" style="margin-top:8px">${f.label}</div>`;
											html += `<div style="color:${f.value ? "#ddd" : "#666"}">${f.value || "Not found"}</div>`;
										}
										return html;
									},
								}).then(chosen => {
									if (chosen) {
										applyMetadata(songIdUsed, chosen, true);
									}
								});
								count++;
								return;
							}
						}
					}

					applyMetadata(songIdUsed, meta);
					count++;
				} catch (error) {
					logChange("error", error.message ?? String(error));
				}
			}
		});

		proc.stderr.on("data", error => logChange("error", error.message ?? String(error)));
		proc.on("error", reject);
		proc.on("close", code => (code == 0 ? resolve() : reject(new Error(`Go exited ${code}`))));
	});
}

const LINETIME_RELEASE_TAG = "latest";

const LINETIME_BINARY_VARIANTS = Object.freeze([
	{ id: "cpu", label: "CPU", executable: "sounddetect_cpu", libDir: "lib", gpu: false },
	{ id: "gpu", label: "GPU (CUDA 12)", executable: "sounddetect_gpu", libDir: "lib_gpu", gpu: true },
]);

const LINETIME_MODEL_VARIANTS = Object.freeze([
	{ id: "standard", label: "Standard (FP32)", file: "mms_multilingual_standard.onnx", dataFile: "mms_multilingual_standard.onnx.data", sizeDesc: "~1.2 GB", requiresData: true },
	{ id: "fast", label: "Fast (UINT8)", file: "mms_multilingual_fast.onnx", dataFile: null, sizeDesc: "~303 MB", requiresData: false },
]);

const LINETIME_WHISPER_VARIANTS = Object.freeze([
	{ id: "standard", label: "Standard (fp16)", file: "ggml-large-v3.bin", sizeDesc: "~3.1 GB" },
	{ id: "whisper-q5", label: "Balanced (q5_0)", file: "ggml-large-v3-q5_0.bin", sizeDesc: "~2.1 GB" },
	{ id: "whisper-q8", label: "High Quality (q8_0)", file: "ggml-large-v3-q8_0.bin", sizeDesc: "~2.6 GB" },
]);

function getLinetimeFolder() {
	return path.join(taratorFolder, "linetime");
}

function getLinetimeBinaryPath(id) {
	const v = LINETIME_BINARY_VARIANTS.find(x => x.id === id);
	if (!v) return null;
	const ext = process.platform === "win32" ? ".exe" : "";
	return path.join(getLinetimeFolder(), v.executable + ext);
}

function getLinetimeModelPath(id) {
	const v = LINETIME_MODEL_VARIANTS.find(x => x.id === id);
	if (!v) return null;
	return path.join(getLinetimeFolder(), "sounddetect_models", v.file);
}

function getLinetimeModelDataPath(id) {
	const v = LINETIME_MODEL_VARIANTS.find(x => x.id === id);
	if (!v || !v.dataFile) return null;
	return path.join(getLinetimeFolder(), "sounddetect_models", v.dataFile);
}

function getLinetimeWhisperPath(id) {
	const v = LINETIME_WHISPER_VARIANTS.find(x => x.id === id);
	if (!v) return null;
	return path.join(getLinetimeFolder(), "sounddetect_models", v.file);
}

function getLinetimeFfmpegPath() {
	const ext = process.platform === "win32" ? ".exe" : "";
	return path.join(getLinetimeFolder(), "ffmpeg" + ext);
}

function getLinetimeWhisperCliPath() {
	const ext = process.platform === "win32" ? ".exe" : "";
	return path.join(getLinetimeFolder(), "whisper-cli" + ext);
}

function getLinetimeBinaryVariant(id) {
	return LINETIME_BINARY_VARIANTS.find(x => x.id === id);
}

function getLinetimeModelVariant(id) {
	return LINETIME_MODEL_VARIANTS.find(x => x.id === id);
}

function getLinetimeWhisperVariant(id) {
	return LINETIME_WHISPER_VARIANTS.find(x => x.id === id);
}

function isLinetimeBinaryInstalled(id) {
	const v = getLinetimeBinaryVariant(id);
	if (!v) return false;
	const binPath = getLinetimeBinaryPath(id);
	if (!fs.existsSync(binPath)) return false;
	const ffmpegPath = getLinetimeFfmpegPath();
	if (!fs.existsSync(ffmpegPath)) return false;
	const whisperCliPath = getLinetimeWhisperCliPath();
	if (!fs.existsSync(whisperCliPath)) return false;
	if (v.gpu) {
		const libDir = path.join(getLinetimeFolder(), v.libDir);
		if (!fs.existsSync(libDir)) return false;
	}
	return true;
}

function isLinetimeModelInstalled(id) {
	const v = getLinetimeModelVariant(id);
	if (!v) return false;
	const modelPath = getLinetimeModelPath(id);
	if (!fs.existsSync(modelPath)) return false;
	if (v.requiresData) {
		const dataPath = getLinetimeModelDataPath(id);
		if (!fs.existsSync(dataPath)) return false;
	}
	return true;
}

function isLinetimeWhisperInstalled(id) {
	const v = getLinetimeWhisperVariant(id);
	if (!v) return false;
	const whisperPath = getLinetimeWhisperPath(id);
	return fs.existsSync(whisperPath);
}

function getEffectiveLinetimeSelection() {
	const binary = (linetimeSelectedBinary && isLinetimeBinaryInstalled(linetimeSelectedBinary))
		? linetimeSelectedBinary
		: (LINETIME_BINARY_VARIANTS.find(v => isLinetimeBinaryInstalled(v.id))?.id ?? "cpu");
	const model = (linetimeSelectedModel && isLinetimeModelInstalled(linetimeSelectedModel))
		? linetimeSelectedModel
		: (LINETIME_MODEL_VARIANTS.find(v => isLinetimeModelInstalled(v.id))?.id ?? "standard");
	const whisper = (linetimeSelectedWhisper && isLinetimeWhisperInstalled(linetimeSelectedWhisper))
		? linetimeSelectedWhisper
		: (LINETIME_WHISPER_VARIANTS.find(v => isLinetimeWhisperInstalled(v.id))?.id ?? null);
	return { binary, model, whisper };
}

function applyMetadata(songIdUsed, meta, unconditional = false) {
	if (unconditional) {
		callSqlite({
			db: "musics",
			query: "UPDATE songs SET artist = ?, genre = ?, language = ? WHERE song_id = ?",
			args: [meta.artist, meta.genre, meta.language, songIdUsed],
			fetch: false,
		});
	} else {
		callSqlite({
			db: "musics",
			query: "UPDATE songs SET artist = CASE WHEN artist IS NULL OR artist = '' THEN ? ELSE artist END, genre = CASE WHEN genre IS NULL OR genre = '' THEN ? ELSE genre END, language = CASE WHEN language IS NULL OR language = '' THEN ? ELSE language END WHERE song_id = ?",
			args: [meta.artist, meta.genre, meta.language, songIdUsed],
			fetch: false,
		});
	}

	const cached = songNameCache.get(songIdUsed);

	if (cached) {
		if (unconditional || cached.artist == null || cached.artist == "") cached.artist = meta.artist;
		if (unconditional || cached.genre == null || cached.genre == "") cached.genre = meta.genre;
		if (unconditional || cached.language == null || cached.language == "") cached.language = meta.language;

		logChange("debug", `New song info added for ${(cached.song_name, ":", meta.artist, meta.genre, meta.language, songIdUsed)}`);

		if (document.getElementById("customiseModal").style.display == "block" && songIdUsed == document.getElementById("customiseModal").dataset.songID) {
			document.getElementById("customiseSongGenre").value = meta.genre;
			document.getElementById("customiseSongArtist").value = meta.artist;
			document.getElementById("customiseSongLanguage").value = meta.language;

			const customiseDiv = document.getElementById("customiseModal");
			customiseDiv.dataset.origGenre = meta.genre || "";
			customiseDiv.dataset.origArtist = meta.artist || "";
			customiseDiv.dataset.origLanguage = meta.language || "";
		}
	}
}

async function startupCheck() {
	return new Promise(async (resolve, reject) => {
		const missingSongExts = [...songNameCache.entries()].filter(([, v]) => !v.song_extension);
		const missingThumbExts = [...songNameCache.entries()].filter(([, v]) => !v.thumbnail_extension);

		if (missingSongExts.length > 0) {
			const musicFiles = fs.readdirSync(musicFolder);
			for (const [song_id, data] of missingSongExts) {
				const file = musicFiles.find(f => path.parse(f).name == song_id);
				if (file) {
					const ext = path.extname(file).slice(1);
					data.song_extension = ext;
					callSqlite({ db: "musics", query: "UPDATE songs SET song_extension = ? WHERE song_id = ?", args: [ext, song_id], fetch: false });
				}
			}
		}

		if (missingThumbExts.length > 0) {
			const thumbFiles = fs.readdirSync(thumbnailFolder);
			for (const [song_id, data] of missingThumbExts) {
				const file = thumbFiles.find(f => path.parse(f).name == song_id);
				if (file) {
					const ext = path.extname(file).slice(1);
					data.thumbnail_extension = ext;
					callSqlite({ db: "musics", query: "UPDATE songs SET thumbnail_extension = ? WHERE song_id = ?", args: [ext, song_id], fetch: false });
				}
			}
		}

		const allMusics = [...songNameCache.entries()].map(([song_id, v]) => ({ song_id, ...v }));
		const musicMap = Object.fromEntries(allMusics.map(({ song_id, ...rest }) => [song_id, rest]));

		const streamedIds = await callSqlite({
			db: "musics",
			query: "SELECT song_id FROM streams",
			fetch: true,
		});

		const validSongIds = new Set([...songNameCache.keys(), ...streamedIds.map(row => row.song_id)]);

		for (const [playlistId, playlist] of playlistsMap.entries()) {
			const filtered = playlist.songs.filter(id => validSongIds.has(id));
			if (filtered.length != playlist.songs.length) {
				playlist.songs = filtered;
				callSqlite({ db: "playlists", query: "UPDATE playlists SET songs = ? WHERE id = ?", args: [JSON.stringify(filtered), playlistId], fetch: false });
			}
		}

		const goBinary = path.join(backendFolder, "startup_check");
		const proc = spawn(goBinary, [musicFolder, thumbnailFolder, JSON.stringify(playlistIdsForStartup)], { windowsHide: true, stdio: ["pipe", "pipe", "inherit"] });
		let data = "";

		proc.on("error", reject);
		proc.stdout.on("data", chunk => (data += chunk));

		proc.on("close", code => {
			data = JSON.parse(data);
			if (Object.keys(data).length != songNameCache.size) foundNewSongs(data, musicMap);
			if (code != 0) return reject(new Error(`Go process exited with code ${code}`));
			else resolve();
		});

		callSqlite({ db: "musics", query: "DELETE FROM songs WHERE song_length = 0 OR song_length IS NULL", fetch: false });
		callSqlite({ db: "musics", query: "UPDATE songs SET song_extension = LTRIM(song_extension, '.')", fetch: false });
		callSqlite({ db: "musics", query: "UPDATE songs SET thumbnail_extension = LTRIM(thumbnail_extension, '.')", fetch: false });
	});
}

async function promptUserOnSongs(redownload) {
	let thePrompt = "";

	const stabilisedNull = [...songNameCache.values()].filter(v => v.size == null).length;
	const artistNull = [...songNameCache.values()].filter(v => v.artist == null).length;

	if (redownload > 0) thePrompt += `You have ${redownload} songs not installed. `;

	if (stabilisedNull != 0 || artistNull != 0) {
		if (stabilisedNull != 0) thePrompt += `You have ${stabilisedNull} songs not stabilised. `;
		if (artistNull != 0) thePrompt += `You have ${artistNull} songs with no artist + genre + language information. `;
	}

	if (thePrompt != "") thePrompt += "Complete your songs data using the options in the settings menu.";

	return thePrompt;
}

function refreshLinetimeStatus() {
	const tokEl = document.getElementById("linetimeTokenizerStatus");
	const tokBtn = document.getElementById("linetimeTokenizerBtn");

	const effective = getEffectiveLinetimeSelection();

	// Binary table
	const binTable = document.getElementById("linetimeBinaryTable");
	if (binTable) {
		const rows = LINETIME_BINARY_VARIANTS.map(v => {
			const installed = isLinetimeBinaryInstalled(v.id);
			const active = effective.binary === v.id;
			let sizeMB = 0;
			if (installed) {
				try { sizeMB = Math.round(fs.statSync(getLinetimeBinaryPath(v.id)).size / 1048576); } catch (_) {}
			}
			const state = installed ? (active ? "Active" : "Installed") : "Not installed";
			const color = installed ? (active ? "#2f2" : "lime") : "red";
			const actionBtns = installed
				? (active
					? `<button class="linetime-action-btn" disabled>Active</button>`
					: `<button class="linetime-action-btn" onclick="linetimeUseBinary('${v.id}')">Pick</button>
					   <button class="linetime-action-btn" onclick="linetimeDownloadBinary('${v.id}')">Download</button>`)
				: `<button class="linetime-action-btn" onclick="linetimeDownloadBinary('${v.id}')">Download</button>`;
			const delBtn = installed && !active ? `<button class="linetime-action-btn" onclick="linetimeDeleteBinary('${v.id}')" style="background:#a33;">Delete</button>` : "";
			return `
				<div style="display:grid;grid-template-columns:120px 80px 100px 1fr;gap:8px;margin:4px 0;align-items:center;padding:4px 0;border-bottom:1px solid #222;">
					<div>${v.label}</div>
					<div>${installed ? sizeMB + " MB" : ""}</div>
					<div style="color:${color};">${state}</div>
					<div>${actionBtns} ${delBtn}</div>
				</div>`;
		}).join("");
		binTable.innerHTML = `
			<div style="display:grid;grid-template-columns:120px 80px 100px 1fr;gap:8px;font-weight:bold;color:#888;margin-bottom:4px;">
				<div>Variant</div><div>Size</div><div>Status</div><div>Action</div>
			</div>
			<div style="grid-column:1/-1;color:#888;font-size:11px;margin-bottom:4px;">GPU requires NVIDIA CUDA 12. Active variant used for timestamp generation.</div>` + rows;
	}

	// CTC Model table
	const modelTable = document.getElementById("linetimeModelTable");
	if (modelTable) {
		const rows = LINETIME_MODEL_VARIANTS.map(v => {
			const installed = isLinetimeModelInstalled(v.id);
			const active = effective.model === v.id;
			let sizeMB = 0;
			if (installed) {
				try { sizeMB = Math.round(fs.statSync(getLinetimeModelPath(v.id)).size / 1048576); } catch (_) {}
			}
			const state = installed ? (active ? "Active" : "Installed") : "Not installed";
			const color = installed ? (active ? "#2f2" : "lime") : "red";
			const actionBtns = installed
				? (active
					? `<button class="linetime-action-btn" disabled>Active</button>`
					: `<button class="linetime-action-btn" onclick="linetimeUseModel('${v.id}')">Pick</button>
					   <button class="linetime-action-btn" onclick="linetimeDownloadModel('${v.id}')">Download</button>`)
				: `<button class="linetime-action-btn" onclick="linetimeDownloadModel('${v.id}')">Download</button>`;
			const delBtn = installed && !active ? `<button class="linetime-action-btn" onclick="linetimeDeleteModel('${v.id}')" style="background:#a33;">Delete</button>` : "";
			return `
				<div style="display:grid;grid-template-columns:140px 80px 100px 1fr;gap:8px;margin:4px 0;align-items:center;padding:4px 0;border-bottom:1px solid #222;">
					<div>${v.label}</div>
					<div>${installed ? sizeMB + " MB" : v.sizeDesc}</div>
					<div style="color:${color};">${state}</div>
					<div>${actionBtns} ${delBtn}</div>
				</div>`;
		}).join("");
		modelTable.innerHTML = `
			<div style="display:grid;grid-template-columns:140px 80px 100px 1fr;gap:8px;font-weight:bold;color:#888;margin-bottom:4px;">
				<div>Variant</div><div>Size</div><div>Status</div><div>Action</div>
			</div>
			<div style="grid-column:1/-1;color:#888;font-size:11px;margin-bottom:4px;">Standard (FP32) is more accurate. Fast (UINT8) is 75% smaller. Active variant used for alignment.</div>` + rows;
	}

	// Tokenizer
	const tokenizerPath = getLinetimeModelPath("standard").replace("mms_multilingual_standard.onnx", "mms_multilingual_tokenizer.json");
	if (tokEl) {
		if (fs.existsSync(tokenizerPath)) {
			tokEl.innerText = "Installed";
			tokEl.style.color = "lime";
			if (tokBtn) tokBtn.style.display = "none";
		} else {
			tokEl.innerText = "Not installed";
			tokEl.style.color = "red";
			if (tokBtn) tokBtn.style.display = "";
		}
	}

	// Whisper table
	const whisperTable = document.getElementById("linetimeWhisperTable");
	if (whisperTable) {
		const rows = LINETIME_WHISPER_VARIANTS.map(v => {
			const installed = isLinetimeWhisperInstalled(v.id);
			const active = effective.whisper === v.id;
			let sizeMB = 0;
			if (installed) {
				try { sizeMB = Math.round(fs.statSync(getLinetimeWhisperPath(v.id)).size / 1048576); } catch (_) {}
			}
			const state = installed ? (active ? "Active" : "Installed") : "Not installed";
			const color = installed ? (active ? "#2f2" : "lime") : "red";
			const actionBtns = installed
				? (active
					? `<button class="linetime-action-btn" disabled>Active</button>`
					: `<button class="linetime-action-btn" onclick="linetimeUseWhisper('${v.id}')">Pick</button>
					   <button class="linetime-action-btn" onclick="linetimeDownloadWhisper('${v.id}')">Download</button>`)
				: `<button class="linetime-action-btn" onclick="linetimeDownloadWhisper('${v.id}')">Download</button>`;
			const delBtn = installed && !active ? `<button class="linetime-action-btn" onclick="linetimeDeleteWhisper('${v.id}')" style="background:#a33;">Delete</button>` : "";
			return `
				<div style="display:grid;grid-template-columns:160px 80px 100px 1fr;gap:8px;margin:4px 0;align-items:center;padding:4px 0;border-bottom:1px solid #222;">
					<div>${v.label}</div>
					<div>${installed ? sizeMB + " MB" : v.sizeDesc}</div>
					<div style="color:${color};">${state}</div>
					<div>${actionBtns} ${delBtn}</div>
				</div>`;
		}).join("");
		whisperTable.innerHTML = `
			<div style="display:grid;grid-template-columns:160px 80px 100px 1fr;gap:8px;font-weight:bold;color:#888;margin-bottom:4px;">
				<div>Variant</div><div>Size</div><div>Status</div><div>Action</div>
			</div>
			<div style="grid-column:1/-1;color:#888;font-size:11px;margin-bottom:4px;">One Whisper model required for Methods B & C (auto-generate / fix lyrics). Active variant used for transcription.</div>` + rows;
	}
}

async function updateYtdlp() {
	const btn = document.getElementById("updateYtdlpButton");
	btn.disabled = true;
	btn.innerText = "Updating...";

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "ytdlp_fetch.exe" : "ytdlp_fetch");
		const result = await new Promise((resolve, reject) => {
			const fetchCwd = process.platform === "linux" ? taratorFolder : processFolder;
			const proc = spawn(bin, ["--force"], { windowsHide: true, cwd: fetchCwd });
			let stdout = "";
			let stderr = "";
			proc.stdout.on("data", d => {
				const msg = d.toString();
				stdout += msg;
				console.log("[ytdlp_fetch]", msg.trim());
			});
			proc.stderr.on("data", d => {
				const msg = d.toString();
				stderr += msg;
				console.error("[ytdlp_fetch]", msg.trim());
			});
			proc.on("error", reject);
			proc.on("close", code => {
				if (code != 0) return reject(new Error(stderr || `ytdlp_fetch exited ${code}`));
				const match = stdout.match(/Successfully downloaded yt-dlp (.+) to/);
				resolve({ version: match ? match[1] : "latest" });
			});
		});

		ytdlpLastUpdateDate = Math.floor(Date.now() / 1000);
		ytdlpVersion = result.version;
		await callSqlite({
			db: "settings",
			query: "UPDATE statistics SET ytdlp_last_update_date = ?, ytdlp_version = ?",
			args: [ytdlpLastUpdateDate, ytdlpVersion],
			fetch: false,
		});
		btn.innerText = "Updated!";

		document.getElementById("ytdlpCurrentVersion").innerText = `Current version: ${ytdlpVersion}`;
		await alertModal(`yt-dlp updated to ${result.version}!`);
	} catch (error) {
		btn.innerText = "Failed";
		await alertModal(`Failed to update yt-dlp: ${error.message ?? String(error)}`);
	}

	btn.disabled = false;
	setTimeout(() => {
		btn.innerText = "Update";
	}, 2000);
}


function setLinetimeDownloadButtonsDisabled(disabled) {
	const actionBtns = document.querySelectorAll("#settings-content .linetime-action-btn");
	actionBtns.forEach(b => b.disabled = disabled);
	const tokBtn = document.getElementById("linetimeTokenizerBtn");
	if (tokBtn) tokBtn.disabled = disabled;
}

async function downloadLinetimeVariant(component, variant) {
	if (linetimeDownloadInProgress) {
		await alertModal("A download is already in progress. Please wait.");
		return;
	}
	linetimeDownloadInProgress = true;
	setLinetimeDownloadButtonsDisabled(true);

	const progressContainer = document.getElementById("linetimeProgressContainer");
	const progressBar = document.getElementById("linetimeProgressBar");
	const progressText = document.getElementById("linetimeProgressText");

	let args = ["--force", "--asset-dir", getLinetimeFolder(), "--release", LINETIME_RELEASE_TAG];
	let useGPU = false;
	let modelType = "standard";
	let gpuLabel = "CPU";
	let modelLabel = "Standard (FP32)";

	// Parse component and variant to build correct args
	if (component === "binary") {
		useGPU = variant === "gpu";
		if (useGPU) args.push("--gpu");
		args.push("--skip-model", "--skip-tokenizer", "--skip-whisper");
		gpuLabel = useGPU ? "GPU (CUDA)" : "CPU";
	} else if (component === "model") {
		modelType = variant;
		args.push("--skip-binary", "--skip-tokenizer", "--skip-whisper", "--model-" + modelType);
		modelLabel = modelType === "fast" ? "Fast (UINT8)" : "Standard (FP32)";
	} else if (component === "tokenizer") {
		args.push("--tokenizer-only");
	} else if (component === "whisper") {
		const whisperMap = { standard: "whisper", "whisper-q5": "whisper-q5", "whisper-q8": "whisper-q8" };
		args.push("--skip-binary", "--skip-model", "--skip-tokenizer", "--model-" + (whisperMap[variant] || variant));
	}

	progressContainer.style.display = "block";
	progressBar.style.width = "0%";
	progressText.textContent = `Downloading ${component} (${variant})...`;

	setLinetimeDownloadButtonsDisabled(true);

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "linetime_fetch.exe" : "linetime_fetch");
		await new Promise((resolve, reject) => {
			const proc = spawn(bin, args, { windowsHide: true, cwd: getLinetimeFolder() });

			proc.stdout.on("data", d => {
				const msg = d.toString();
				console.log("[linetime_fetch]", msg.trim());

				const pctMatch = msg.match(/(\d+)%/);
				if (pctMatch) {
					progressBar.style.width = parseInt(pctMatch[1]) + "%";
				}

				if (msg.includes("Downloading binary")) {
					progressText.textContent = `Downloading binary ${variant} (~2.5 MB)...`;
					progressBar.style.width = "10%";
				} else if (msg.includes("Downloading standard CTC")) {
					progressText.textContent = "Downloading CTC model (standard, ~1.2 GB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading fast CTC")) {
					progressText.textContent = "Downloading CTC model (fast, ~303 MB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading tokenizer")) {
					progressText.textContent = "Downloading tokenizer (~1 KB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading Whisper large-v3 model")) {
					const mbMatch = msg.match(/~(\d+\.?\d*)MB/);
					const mb = mbMatch ? mbMatch[1] : "?";
					progressText.textContent = `Downloading Whisper ${variant} (~${mb} MB)...`;
					progressBar.style.width = "30%";
				} else if (msg.includes("Extracting")) {
					progressText.textContent = "Extracting...";
					progressBar.style.width = "90%";
				} else if (msg.includes("Done")) {
					progressBar.style.width = "100%";
				}
			});

			proc.stderr.on("data", d => {
				const msg = d.toString();
				console.error("[linetime_fetch]", msg.trim());
			});

			proc.on("error", reject);
			proc.on("close", code => {
				if (code !== 0) return reject(new Error(`linetime_fetch exited with code ${code}`));
				resolve();
			});
		});

		progressBar.style.width = "100%";
		progressText.textContent = "Done!";

		refreshLinetimeStatus();

		await alertModal(`${component} (${variant}) downloaded and installed successfully!`);
	} catch (error) {
		progressText.textContent = "Failed";
		progressBar.style.width = "0%";
		await alertModal(`Failed to download ${component} (${variant}): ${error.message ?? String(error)}`);
	}

	setLinetimeDownloadButtonsDisabled(false);
	linetimeDownloadInProgress = false;
	setTimeout(() => {
		progressContainer.style.display = "none";
	}, 3000);
}


function setLinetimeDownloadButtonsDisabled(disabled) {
	const actionBtns = document.querySelectorAll("#settings-content .linetime-action-btn");
	actionBtns.forEach(b => b.disabled = disabled);
	const tokBtn = document.getElementById("linetimeTokenizerBtn");
	if (tokBtn) tokBtn.disabled = disabled;
}

async function downloadLinetimeVariant(component, variant) {
	if (linetimeDownloadInProgress) {
		await alertModal("A download is already in progress. Please wait.");
		return;
	}
	linetimeDownloadInProgress = true;
	setLinetimeDownloadButtonsDisabled(true);

	const progressContainer = document.getElementById("linetimeProgressContainer");
	const progressBar = document.getElementById("linetimeProgressBar");
	const progressText = document.getElementById("linetimeProgressText");

	let args = ["--force", "--asset-dir", getLinetimeFolder(), "--release", LINETIME_RELEASE_TAG];
	let useGPU = false;
	let modelType = "standard";
	let gpuLabel = "CPU";
	let modelLabel = "Standard (FP32)";

	// Parse component and variant to build correct args
	if (component === "binary") {
		useGPU = variant === "gpu";
		if (useGPU) args.push("--gpu");
		args.push("--skip-model", "--skip-tokenizer", "--skip-whisper");
		gpuLabel = useGPU ? "GPU (CUDA)" : "CPU";
	} else if (component === "model") {
		modelType = variant;
		args.push("--skip-binary", "--skip-tokenizer", "--skip-whisper", "--model-" + modelType);
		modelLabel = modelType === "fast" ? "Fast (UINT8)" : "Standard (FP32)";
	} else if (component === "tokenizer") {
		args.push("--tokenizer-only");
	} else if (component === "whisper") {
		const whisperMap = { standard: "whisper", "whisper-q5": "whisper-q5", "whisper-q8": "whisper-q8" };
		args.push("--skip-binary", "--skip-model", "--skip-tokenizer", "--model-" + (whisperMap[variant] || variant));
	}

	progressContainer.style.display = "block";
	progressBar.style.width = "0%";
	progressText.textContent = `Downloading ${component} (${variant})...`;

	setLinetimeDownloadButtonsDisabled(true);

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "linetime_fetch.exe" : "linetime_fetch");
		await new Promise((resolve, reject) => {
			const proc = spawn(bin, args, { windowsHide: true, cwd: getLinetimeFolder() });

			proc.stdout.on("data", d => {
				const msg = d.toString();
				console.log("[linetime_fetch]", msg.trim());

				const pctMatch = msg.match(/(\d+)%/);
				if (pctMatch) {
					progressBar.style.width = parseInt(pctMatch[1]) + "%";
				}

				if (msg.includes("Downloading binary")) {
					progressText.textContent = `Downloading binary ${variant} (~2.5 MB)...`;
					progressBar.style.width = "10%";
				} else if (msg.includes("Downloading standard CTC")) {
					progressText.textContent = "Downloading CTC model (standard, ~1.2 GB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading fast CTC")) {
					progressText.textContent = "Downloading CTC model (fast, ~303 MB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading tokenizer")) {
					progressText.textContent = "Downloading tokenizer (~1 KB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading Whisper large-v3 model")) {
					const mbMatch = msg.match(/~(\d+\.?\d*)MB/);
					const mb = mbMatch ? mbMatch[1] : "?";
					progressText.textContent = `Downloading Whisper ${variant} (~${mb} MB)...`;
					progressBar.style.width = "30%";
				} else if (msg.includes("Extracting")) {
					progressText.textContent = "Extracting...";
					progressBar.style.width = "90%";
				} else if (msg.includes("Done")) {
					progressBar.style.width = "100%";
				}
			});

			proc.stderr.on("data", d => {
				const msg = d.toString();
				console.error("[linetime_fetch]", msg.trim());
			});

			proc.on("error", reject);
			proc.on("close", code => {
				if (code !== 0) return reject(new Error(`linetime_fetch exited with code ${code}`));
				resolve();
			});
		});

		progressBar.style.width = "100%";
		progressText.textContent = "Done!";

		refreshLinetimeStatus();

		await alertModal(`${component} (${variant}) downloaded and installed successfully!`);
	} catch (error) {
		progressText.textContent = "Failed";
		progressBar.style.width = "0%";
		await alertModal(`Failed to download ${component} (${variant}): ${error.message ?? String(error)}`);
	}

	setLinetimeDownloadButtonsDisabled(false);
	linetimeDownloadInProgress = false;
	setTimeout(() => {
		progressContainer.style.display = "none";
	}, 3000);
}

async function linetimeUseBinary(variant) {
	if (!isLinetimeBinaryInstalled(variant)) {
		await alertModal(`${variant} binary not installed. Download it first.`);
		return;
	}
	linetimeSelectedBinary = variant;
	await callSqlite({
		db: "settings",
		query: "UPDATE statistics SET linetime_selected_binary = ?",
		args: [variant],
		fetch: false,
	});
	refreshLinetimeStatus();
	await alertModal(`Using ${variant} binary`);
}

async function linetimeUseModel(variant) {
	if (!isLinetimeModelInstalled(variant)) {
		await alertModal(`${variant} model not installed. Download it first.`);
		return;
	}
	linetimeSelectedModel = variant;
	await callSqlite({
		db: "settings",
		query: "UPDATE statistics SET linetime_selected_model = ?",
		args: [variant],
		fetch: false,
	});
	refreshLinetimeStatus();
	await alertModal(`Using ${variant} CTC model`);
}

async function linetimeUseWhisper(variant) {
	if (!isLinetimeWhisperInstalled(variant)) {
		await alertModal(`${variant} Whisper model not installed. Download it first.`);
		return;
	}
	linetimeSelectedWhisper = variant;
	await callSqlite({
		db: "settings",
		query: "UPDATE statistics SET linetime_selected_whisper = ?",
		args: [variant],
		fetch: false,
	});
	refreshLinetimeStatus();
	await alertModal(`Using ${variant} Whisper model`);
}

async function linetimeDeleteBinary(variant) {
	const effective = getEffectiveLinetimeSelection();
	if (effective.binary === variant) {
		await alertModal("Cannot delete active binary. Switch to another first.");
		return;
	}
	const confirm = await confirmModal(`Delete ${variant} binary?`, "Delete", "Cancel");
	if (!confirm) return;

	const binPath = getLinetimeBinaryPath(variant);
	try {
		fs.unlinkSync(binPath);
		if (variant === "gpu") {
			const libDir = path.join(getLinetimeFolder(), "lib_gpu");
			if (fs.existsSync(libDir)) fs.rmSync(libDir, { recursive: true, force: true });
		}
		refreshLinetimeStatus();
		await alertModal(`${variant} binary deleted`);
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

async function linetimeDeleteModel(variant) {
	const effective = getEffectiveLinetimeSelection();
	if (effective.model === variant) {
		await alertModal("Cannot delete active model. Switch to another first.");
		return;
	}
	const confirm = await confirmModal(`Delete ${variant} CTC model?`, "Delete", "Cancel");
	if (!confirm) return;

	const modelPath = getLinetimeModelPath(variant);
	const v = getLinetimeModelVariant(variant);
	try {
		fs.unlinkSync(modelPath);
		if (v && v.dataFile) {
			const dataPath = getLinetimeModelDataPath(variant);
			if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
		}
		refreshLinetimeStatus();
		await alertModal(`${variant} model deleted`);
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

async function linetimeDeleteWhisper(variant) {
	const effective = getEffectiveLinetimeSelection();
	if (effective.whisper === variant) {
		await alertModal("Cannot delete active Whisper model. Switch to another first.");
		return;
	}
	const confirm = await confirmModal(`Delete ${variant} Whisper model?`, "Delete", "Cancel");
	if (!confirm) return;

	const whisperPath = getLinetimeWhisperPath(variant);
	try {
		fs.unlinkSync(whisperPath);
		refreshLinetimeStatus();
		await alertModal(`${variant} Whisper model deleted`);
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

// Download handlers that read variant from the button
function linetimeDownloadBinary(variant) {
	downloadLinetimeVariant("binary", variant);
}

function linetimeDownloadModel(variant) {
	downloadLinetimeVariant("model", variant);
}

function linetimeDownloadWhisper(variant) {
	downloadLinetimeVariant("whisper", variant);
}


async function foundNewSongs(folderSongs, databaseSongs) {
	await alertModal("Found new songs in your folders.");

	const folderOnly = {};
	const databaseOnly = {};

	for (const key of Object.keys(folderSongs)) {
		if (!(key in databaseSongs)) folderOnly[key] = folderSongs[key];
	}

	for (const key of Object.keys(databaseSongs)) {
		if (!(key in folderSongs)) databaseOnly[key] = databaseSongs[key];
	}

	const rowsToInsert = [];

	for (const fileName of Object.keys(folderOnly)) {
		let songName = fileName;
		const songExt = folderOnly[fileName]?.song_extension ?? "";
		const thumbExt = folderOnly[fileName]?.thumbnail_extension ?? "";

		const originalMusicPath = path.join(musicFolder, fileName + songExt);

		if (!fileName.includes("tarator")) {
			songName = await generateId();

			const newMusicPath = path.join(musicFolder, songName + songExt);
			if (fs.existsSync(originalMusicPath)) fs.renameSync(originalMusicPath, newMusicPath);

			if (thumbExt) {
				const originalThumbPath = path.join(thumbnailFolder, fileName + thumbExt);
				const newThumbPath = path.join(thumbnailFolder, songName + thumbExt);
				if (fs.existsSync(originalThumbPath)) fs.renameSync(originalThumbPath, newThumbPath);
			}
		}

		const fullPath = path.join(musicFolder, songName + songExt);
		if (!fs.existsSync(fullPath)) continue;

		const metadata = await new Promise(resolve => {
			ffmpeg.ffprobe(fullPath, (err, meta) => resolve(err ? null : meta));
		});

		const duration = metadata?.format?.duration ? Math.round(metadata.format.duration) : null;
		const stats = fs.statSync(fullPath);
		const fileSize = stats.size;

		rowsToInsert.push([songName, fileName, null, duration, 0, 0, 0, fileSize, 100, null, null, null, 100, songExt.replace(".", "") || null, thumbExt.replace(".", "") || null, null, null, null]);
	}

	if (rowsToInsert.length > 0) {
		for (const row of rowsToInsert) {
			callSqlite({
				db: "musics",
				query: `
                    INSERT INTO songs (
                        song_id, song_name, song_url, song_length, seconds_played,
                        times_listened, stabilised, size, speed, bass, treble,
                        midrange, volume, song_extension, thumbnail_extension, artist, genre, language
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
				args: row,
				fetch: false,
			});

			songNameCache.set(row[0], {
				song_name: row[1],
				song_length: row[3],
				song_extension: row[13],
				song_url: row[2],
				thumbnail_extension: row[14],
				stabilised: row[6],
				size: row[7],
				genre: row[16],
				artist: row[15],
				language: row[17],
			});
		}
	}

	await alertModal(await promptUserOnSongs(Object.keys(databaseOnly).length));
}
