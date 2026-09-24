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
	const binaryName = process.platform === "win32" ? "sounddetect.exe" : "sounddetect";
	const binaryPath = path.join(backendFolder, binaryName);
	const modelsDir = path.join(backendFolder, "sounddetect_models");
	const modelPath = path.join(modelsDir, "mms_multilingual.onnx");
	const dataPath = path.join(modelsDir, "mms_multilingual.onnx.data");
	const tokenizerPath = path.join(modelsDir, "mms_multilingual_tokenizer.json");
	const whisperPath = path.join(modelsDir, "ggml-large-v3.bin");

	const binEl = document.getElementById("linetimeBinaryStatus");
	const modelEl = document.getElementById("linetimeModelStatus");
	const tokEl = document.getElementById("linetimeTokenizerStatus");
	const whisperEl = document.getElementById("linetimeWhisperStatus");
	const binBtn = document.getElementById("linetimeBinaryBtn");
	const modelBtn = document.getElementById("linetimeModelBtn");
	const tokBtn = document.getElementById("linetimeTokenizerBtn");
	const whisperBtn = document.getElementById("linetimeWhisperBtn");

	// Binary
	if (fs.existsSync(binaryPath)) {
		binEl.innerText = "Installed";
		binEl.style.color = "lime";
		binBtn.style.display = "none";
	} else {
		binEl.innerText = "Not installed";
		binEl.style.color = "red";
		binBtn.style.display = "";
	}

	// Model — detect Standard (FP32, has .data file >500MB) vs Fast (UINT8, no .data, <500MB)
	if (fs.existsSync(modelPath)) {
		try {
			const sizeMB = Math.round(fs.statSync(modelPath).size / 1048576);
			const hasData = fs.existsSync(dataPath);
			if (hasData || sizeMB >= 500) {
				modelEl.innerText = `Installed (Standard, FP32, ${sizeMB} MB)`;
			} else {
				modelEl.innerText = `Installed (Fast, UINT8, ${sizeMB} MB)`;
			}
			modelEl.style.color = "lime";
			modelBtn.style.display = "none";
		} catch (e) {
			modelEl.innerText = "Installed";
			modelEl.style.color = "lime";
			modelBtn.style.display = "none";
		}
	} else {
		modelEl.innerText = "Not installed";
		modelEl.style.color = "red";
		modelBtn.style.display = "";
	}

	// Tokenizer
	if (fs.existsSync(tokenizerPath)) {
		tokEl.innerText = "Installed";
		tokEl.style.color = "lime";
		tokBtn.style.display = "none";
	} else {
		tokEl.innerText = "Not installed";
		tokEl.style.color = "red";
		tokBtn.style.display = "";
	}

	// Whisper model
	if (fs.existsSync(whisperPath)) {
		try {
			const sizeMB = Math.round(fs.statSync(whisperPath).size / 1048576);
			whisperEl.innerText = `Installed (${sizeMB} MB)`;
			whisperEl.style.color = "lime";
			whisperBtn.style.display = "none";
		} catch (e) {
			whisperEl.innerText = "Installed";
			whisperEl.style.color = "lime";
			whisperBtn.style.display = "none";
		}
	} else {
		whisperEl.innerText = "Not installed";
		whisperEl.style.color = "red";
		whisperBtn.style.display = "";
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

async function downloadLinetimeComponent(component) {
	const progressContainer = document.getElementById("linetimeProgressContainer");
	const progressBar = document.getElementById("linetimeProgressBar");
	const progressText = document.getElementById("linetimeProgressText");

	const gpuSelect = document.getElementById("linetimeGpuSelect");
	const modelSelect = document.getElementById("linetimeModelSelect");
	const whisperSelect = document.getElementById("linetimeWhisperSelect");
	const useGPU = gpuSelect.value === "gpu";
	const modelType = modelSelect.value;
	const whisperType = whisperSelect ? whisperSelect.value : "whisper";

	const args = ["--force"];
	if (useGPU) args.push("--gpu");

	// Skip everything except the requested component
	if (component === "binary") {
		args.push("--skip-model");
		args.push("--skip-tokenizer");
		args.push("--skip-whisper");
	} else if (component === "model") {
		args.push("--skip-binary");
		args.push("--skip-tokenizer");
		args.push("--skip-whisper");
		args.push("--model-" + modelType);
	} else if (component === "tokenizer") {
		args.push("--skip-binary");
		args.push("--skip-model");
		args.push("--skip-whisper");
	} else if (component === "whisper") {
		args.push("--skip-binary");
		args.push("--skip-model");
		args.push("--skip-tokenizer");
		args.push("--model-" + whisperType);
	}

	progressContainer.style.display = "block";
	progressBar.style.width = "0%";
	progressText.textContent = `Downloading ${component}...`;

	// Disable all download buttons during download
	const binBtn = document.getElementById("linetimeBinaryBtn");
	const modelBtn = document.getElementById("linetimeModelBtn");
	const tokBtn = document.getElementById("linetimeTokenizerBtn");
	const whisperBtn = document.getElementById("linetimeWhisperBtn");
	binBtn.disabled = true;
	modelBtn.disabled = true;
	tokBtn.disabled = true;
	if (whisperBtn) whisperBtn.disabled = true;

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "linetime_fetch.exe" : "linetime_fetch");
		await new Promise((resolve, reject) => {
			const fetchCwd = process.platform === "linux" ? taratorFolder : processFolder;
			const proc = spawn(bin, args, { windowsHide: true, cwd: fetchCwd });

			proc.stdout.on("data", d => {
				const msg = d.toString();
				console.log("[linetime_fetch]", msg.trim());

				const pctMatch = msg.match(/(\d+)%/);
				if (pctMatch) {
					progressBar.style.width = parseInt(pctMatch[1]) + "%";
				}

				if (msg.includes("Downloading binary")) {
					progressText.textContent = "Downloading binary...";
					progressBar.style.width = "10%";
				} else if (msg.includes("Downloading standard CTC")) {
					progressText.textContent = "Downloading model (standard, ~1.2GB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading fast CTC")) {
					progressText.textContent = "Downloading model (fast, ~303MB)...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading tokenizer")) {
					progressText.textContent = "Downloading tokenizer...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading Whisper large-v3 model")) {
					progressText.textContent = "Downloading Whisper model (~" + msg.match(/~(\d+\.?\d*)MB/) + ")...";
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

		const gpuLabel = useGPU ? "GPU (CUDA)" : "CPU";
		const modelLabel = modelType === "fast" ? "Fast (UINT8)" : "Standard (FP32)";
		let versionParts = [`${modelLabel} - ${gpuLabel}`];
		if (component === "whisper") {
			const whisperLabels = { "whisper": "fp16", "whisper-q4": "q4_0", "whisper-q5": "q5_0", "whisper-q8": "q8_0" };
			versionParts.push("Whisper: " + (whisperLabels[whisperType] || whisperType));
		}
		linetimeVersion = versionParts.join(" | ");
		await callSqlite({
			db: "settings",
			query: "UPDATE statistics SET linetime_version = ?",
			args: [linetimeVersion],
			fetch: false,
		});

		refreshLinetimeStatus();
	} catch (error) {
		progressText.textContent = "Failed";
		progressBar.style.width = "0%";
		await alertModal(`Failed to download ${component}: ${error.message ?? String(error)}`);
	}

	binBtn.disabled = false;
	modelBtn.disabled = false;
	tokBtn.disabled = false;
	if (whisperBtn) whisperBtn.disabled = false;
	setTimeout(() => {
		progressContainer.style.display = "none";
	}, 3000);
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
