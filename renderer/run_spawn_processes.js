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

// Presentation metadata only. Filenames live in the Go appfiles package and
// arrive in the binary_check report, so a rename there cannot leave the renderer
// looking for a file nothing writes any more.
const LINETIME_BINARY_VARIANTS = Object.freeze([
	{ id: "cpu", label: "CPU", gpu: false },
	{ id: "gpu", label: "GPU (CUDA 12)", gpu: true },
]);

const LINETIME_BINARY_SIZES = Object.freeze({
	linux: Object.freeze({ cpu: "~40 MB", gpu: "~805 MB" }),
	win32: Object.freeze({ cpu: "~42 MB", gpu: null }),
	darwin: Object.freeze({ cpu: "~16 MB", gpu: null }),
});

let linetimeDownloadInProgress = false;

const LINETIME_MODEL_VARIANTS = Object.freeze([
	{ id: "standard", label: "Standard (FP32)", sizeDesc: "~1.2 GB", requiresData: true },
	{ id: "fast", label: "Fast (UINT8)", sizeDesc: "~289 MB", requiresData: false },
]);

const LINETIME_WHISPER_VARIANTS = Object.freeze([
	{ id: "standard", label: "Standard (fp16)", reportId: "whisper-standard", sizeDesc: "~2.9 GB" },
	{ id: "whisper-q5", label: "Balanced (q5_0)", reportId: "whisper-q5", sizeDesc: "~1 GB" },
]);

function getLinetimeFolder() {
	return backendFolder;
}

// Filenames come from the binary_check report so Go owns them. Existence is still
// verified live wherever it matters, because the report is only a boot snapshot and
// the user can delete a file at any time.
function getLinetimeBinaryPath(id) {
	if (!getLinetimeBinaryVariant(id)) return null;
	return getAppFilePart(id, "binary");
}

function getLinetimeModelPath(id) {
	const v = getLinetimeModelVariant(id);
	if (!v) return null;
	return getAppFilePart(id, "model");
}

function getLinetimeModelDataPath(id) {
	const v = getLinetimeModelVariant(id);
	if (!v || !v.requiresData) return null;
	return getAppFilePart(id, "data");
}

function getLinetimeWhisperCliFolder() {
	return path.join(getLinetimeFolder(), "whisper_cli");
}

function getLinetimeWhisperCliPath() {
	return getAppFilePart("whisper-cli", "cli");
}

function getLinetimeWhisperCliSizeDesc() {
	if (process.platform === "darwin") return null;
	if (process.platform === "win32") {
		return process.arch === "arm64" ? "~4.2 MB" : "~8.2 MB";
	}
	return process.arch === "arm64" ? "~4.4 MB" : "~9.3 MB";
}

function getLinetimeWhisperPath(id) {
	const v = getLinetimeWhisperVariant(id);
	if (!v) return null;
	return getAppFilePart(v.reportId || v.id, "model");
}

function getLinetimeTokenizerPath() {
	return getAppFilePart("tokenizer", "tokenizer");
}

function getLinetimeFfmpegPath() {
	return getAppFilePart("cpu", "ffmpeg");
}

function getLinetimeBinaryVariant(id) {
	return LINETIME_BINARY_VARIANTS.find(x => x.id === id);
}

function getLinetimeBinarySizeDesc(variantId) {
	const sizes = LINETIME_BINARY_SIZES[process.platform];
	if (!sizes) return null;
	return sizes[variantId] ?? null;
}

function getLinetimeModelVariant(id) {
	return LINETIME_MODEL_VARIANTS.find(x => x.id === id);
}

function getLinetimeWhisperVariant(id) {
	return LINETIME_WHISPER_VARIANTS.find(x => x.id === id);
}

// Existence is checked live, not taken from the report state, because the report
// is a boot snapshot. A null path means the report never arrived, which counts as
// not installed rather than throwing.
function linetimePartExists(id, part) {
	const p = getAppFilePart(id, part);
	return !!p && fs.existsSync(p);
}

function isLinetimeBinaryInstalled(id) {
	if (!getLinetimeBinaryVariant(id)) return false;
	if (getAppFileState(id) === "unsupported") return false;
	if (!linetimePartExists(id, "binary")) return false;
	if (!linetimePartExists("cpu", "ffmpeg")) return false;
	if (getLinetimeBinaryVariant(id).gpu && !linetimePartExists("gpu", "lib")) return false;
	return true;
}

function isLinetimeModelInstalled(id) {
	const v = getLinetimeModelVariant(id);
	if (!v) return false;
	if (!linetimePartExists(id, "model")) return false;
	if (v.requiresData && !linetimePartExists(id, "data")) return false;
	return true;
}

function isLinetimeWhisperInstalled(id) {
	const v = getLinetimeWhisperVariant(id);
	if (!v) return false;
	return linetimePartExists(v.reportId || v.id, "model");
}

function isLinetimeWhisperCliInstalled() {
	if (getAppFileState("whisper-cli") === "unsupported") return false;
	return linetimePartExists("whisper-cli", "cli");
}

function isLinetimeTokenizerInstalled() {
	return linetimePartExists("tokenizer", "tokenizer");
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

let appBinaryReport = null;

// Reports which required files are actually on disk. Optional components that are
// simply not downloaded yet are expected, so only genuinely required ones are
// logged; the Settings tab shows the full picture either way.
async function runBinaryCheck() {
	const bin = path.join(backendFolder, process.platform === "win32" ? "binary_check.exe" : "binary_check");
	const userDataBin = path.join(taratorFolder, "bin");

	const result = await new Promise(resolve => {
		const proc = spawn(bin, [backendFolder, userDataBin], { windowsHide: true });
		let out = "";
		proc.stdout.on("data", d => (out += d.toString()));
		proc.on("error", err => resolve({ error: err }));
		proc.on("close", code => {
			if (code !== 0 || !out.trim()) return resolve({ error: new Error("exited with code " + code) });
			try {
				resolve({ report: JSON.parse(out) });
			} catch (e) {
				resolve({ error: e });
			}
		});
	});

	if (result.error) {
		appBinaryReport = null;
		// The whole Linetime panel reads its paths from this report, so without it
		// every row would claim "Not installed" even when the file is on disk. Say so
		// plainly instead of letting the tables lie.
		logChange("warn", "Component inventory unavailable, binary_check did not run ("
			+ (result.error.message ?? result.error)
			+ "). Filenames come from it, so the Linetime rows cannot be verified. Run npm run gobuild.");
		return;
	}

	appBinaryReport = result.report;
	const missing = result.report.components.filter(c => c.state === "missing" && !c.optional);
	if (missing.length > 0) {
		logChange("warn", "Missing required files: " + missing.map(c => c.label).join(", "));
	}
	const unsupported = result.report.components.filter(c => c.state === "unsupported");
	if (unsupported.length > 0) {
		logChange("info", "Not available on " + process.platform + ": " + unsupported.map(c => c.label).join(", "));
	}
}

// State of a component from the boot report, or null when unknown. Lets the
// settings tables stop hardcoding filenames that the Go tools also own.
function getAppFileState(id) {
	if (!appBinaryReport || !Array.isArray(appBinaryReport.components)) return null;
	const c = appBinaryReport.components.find(x => x.id === id);
	return c ? c.state : null;
}

// Resolves one named part of a component, e.g. the ffmpeg inside the cpu binary.
function getAppFilePart(id, part) {
	if (!appBinaryReport || !Array.isArray(appBinaryReport.components)) return null;
	const c = appBinaryReport.components.find(x => x.id === id);
	if (!c || !c.parts) return null;
	return c.parts[part] ?? null;
}

// Version string the binary reported about itself, or "" when it could not be
// read. The released 1.2 aligner and a locally built 1.3 differ in whether they
// can drive the Whisper CLI, so it is worth surfacing.
function getAppFileVersion(id) {
	if (!appBinaryReport || !Array.isArray(appBinaryReport.components)) return "";
	const c = appBinaryReport.components.find(x => x.id === id);
	return c && typeof c.version === "string" ? c.version : "";
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

const LINETIME_TABLE_COLUMNS = "150px 80px 100px 1fr";

function linetimeBytesText(total) {
	if (total < 1048576) return Math.max(1, Math.round(total / 1024)) + " KB";
	if (total < 1073741824) return (Math.round(total / 104857.6) / 10) + " MB";
	return (Math.round(total / 107374182.4) / 10) + " GB";
}

function linetimeFileSizeBytes(filePaths) {
	let total = 0;
	for (const filePath of filePaths) {
		if (!filePath) continue;
		try {
			total += fs.statSync(filePath).size;
		} catch (_) {}
	}
	return total;
}

function linetimeFileSizeText(filePaths, fallback) {
	const total = linetimeFileSizeBytes(filePaths);
	if (total <= 0) return fallback;
	return linetimeBytesText(total);
}

function dirFilePaths(dir) {
	try {
		return fs.readdirSync(dir).map(f => path.join(dir, f));
	} catch {
		return [];
	}
}

// The GPU bundle is mostly shared libraries, so its real footprint is the
// lib_gpu tree. Summing only the executable reported 2.7 MB for a 1.5 GB
// install and made a complete download look truncated.
function dirSizeBytes(dir) {
	let total = 0;
	for (const entry of dirFilePaths(dir)) {
		try {
			const stat = fs.statSync(entry);
			if (stat.isDirectory()) total += dirSizeBytes(entry);
			else if (stat.isFile()) total += stat.size;
		} catch (_) {}
	}
	return total;
}

function renderLinetimeTable(containerId, title, items) {
	const el = document.getElementById(containerId);
	if (!el) return;

	const busy = linetimeDownloadInProgress;

	const header = `
		<div style="font-weight:bold;margin-bottom:6px;">${title}</div>
		<div style="display:grid;grid-template-columns:${LINETIME_TABLE_COLUMNS};gap:8px;font-weight:bold;color:#ccc;margin-bottom:4px;">
			<div>Variant</div><div>Size</div><div>Status</div><div>Action</div>
		</div>`;

	const rows = items.map(item => {
		const supported = item.supported !== false;

		let statusClass = "linetime-status-missing";
		let statusText = "Not installed";
		if (!supported) {
			statusText = "Not available on this OS";
		} else if (item.active) {
			statusClass = "linetime-status-active";
			statusText = "Active";
		} else if (item.installed) {
			statusClass = "linetime-status-ok";
			statusText = "Installed";
		}
		if (item.version) statusText += " \u00b7 v" + item.version;

		let actionBtns = "";
		if (supported) {
			if (item.useFn) {
				const pickEnabled = item.installed && !item.active && !busy;
				const pickClick = pickEnabled ? `onclick="${item.useFn}('${item.id}')"` : "disabled";
				actionBtns += `<button class="linetime-action-btn linetime-btn-pick" ${pickClick}>${item.active ? "Active" : "Pick"}</button>`;
			}

			if (!item.installed) {
				const dlClick = busy ? "disabled" : `onclick="${item.downloadFn}('${item.id}')"`;
				actionBtns += `<button class="linetime-action-btn" ${dlClick}>Download</button>`;
			} else if (item.deleteFn) {
				const delClick = busy ? "disabled" : `onclick="${item.deleteFn}('${item.id}')"`;
				actionBtns += `<button class="linetime-action-btn linetime-btn-delete" ${delClick}>Delete</button>`;
			}
		}

		return `
			<div style="display:grid;grid-template-columns:${LINETIME_TABLE_COLUMNS};gap:8px;margin:4px 0;align-items:center;padding:4px 0;border-bottom:1px solid #333;">
				<div>${item.label}</div>
				<div>${item.sizeText}</div>
				<div><span class="${statusClass}">${statusText}</span></div>
				<div>${actionBtns}</div>
			</div>`;
	}).join("");

	el.innerHTML = header + rows;
}

// After anything that changes what is on disk the boot report is stale, so it is
// regenerated before the tables redraw. Selection changes do not need this.
async function refreshLinetimeReport() {
	await runBinaryCheck();
	refreshLinetimeStatus();
}

// Non-modal on purpose. A modal on every cold boot for an optional feature is
// hostile, so the report lives quietly in Settings and in the log.
function renderAppFileNotice() {
	const el = document.getElementById("appFileNotice");
	if (!el) return;

	if (!appBinaryReport || !Array.isArray(appBinaryReport.components)) {
		// Do not fall through to "everything is missing": the rows cannot be
		// trusted without the report, and saying so is more useful than a lie.
		el.className = "app-file-notice";
		el.textContent = "Component inventory unavailable: binary_check did not run, so these rows cannot be verified. Run npm run gobuild to build it. Downloads still work.";
		el.style.display = "block";
		return;
	}

	const missing = appBinaryReport.components.filter(c => c.state === "missing");
	if (missing.length === 0) {
		el.style.display = "none";
		return;
	}

	const required = missing.filter(c => !c.optional);
	const optional = missing.filter(c => c.optional);
	const parts = [];
	if (required.length > 0) {
		parts.push("Missing: " + required.map(c => c.label).join(", ") + ".");
	}
	if (optional.length > 0) {
		parts.push("Optional, not downloaded yet: " + optional.map(c => c.label).join(", ") + ".");
	}

	el.className = required.length > 0 ? "app-file-notice" : "app-file-notice optional";
	el.textContent = parts.join(" ");
	el.style.display = "block";
}

function refreshLinetimeStatus() {
	const effective = getEffectiveLinetimeSelection();

	const binaryItems = LINETIME_BINARY_VARIANTS.map(v => {
		// Platform support comes from the report, not a table duplicated here, so
		// the UI cannot disagree with the check about what is possible.
		const supported = getAppFileState(v.id) !== "unsupported";
		const installed = supported && isLinetimeBinaryInstalled(v.id);
		const gpuLibPath = v.gpu ? getAppFilePart("gpu", "lib") : null;
		const gpuLibBytes = gpuLibPath ? dirSizeBytes(gpuLibPath) : 0;
		const binBytes = linetimeFileSizeBytes([getLinetimeBinaryPath(v.id)]);
		const sizeText = supported
			? ((binBytes + gpuLibBytes) > 0 ? linetimeBytesText(binBytes + gpuLibBytes) : getLinetimeBinarySizeDesc(v.id))
			: "N/A";
		return {
			id: v.id,
			label: v.label,
			installed,
			active: supported && installed && effective.binary === v.id,
			supported,
			version: getAppFileVersion(v.id),
			sizeText,
			useFn: "linetimeUseBinary",
			downloadFn: "linetimeDownloadBinary",
			deleteFn: "linetimeDeleteBinary",
		};
	});
	renderLinetimeTable("linetimeBinaryTable", "Binary", binaryItems);

	const tokenizerInstalled = isLinetimeTokenizerInstalled();
	const modelItems = [{
		id: "tokenizer",
		label: "Tokenizer (required)",
		installed: tokenizerInstalled,
		active: false,
		sizeText: tokenizerInstalled ? linetimeFileSizeText([getLinetimeTokenizerPath()], "~1 KB") : "~1 KB",
		useFn: null,
		downloadFn: "linetimeDownloadTokenizer",
		deleteFn: "linetimeDeleteTokenizer",
	}];

	LINETIME_MODEL_VARIANTS.forEach(v => {
		const installed = isLinetimeModelInstalled(v.id);
		modelItems.push({
			id: v.id,
			label: v.label,
			installed,
			active: installed && effective.model === v.id,
			sizeText: linetimeFileSizeText([getLinetimeModelPath(v.id), getLinetimeModelDataPath(v.id)], v.sizeDesc),
			useFn: "linetimeUseModel",
			downloadFn: "linetimeDownloadModel",
			deleteFn: "linetimeDeleteModel",
		});
	});
	renderLinetimeTable("linetimeModelTable", "Alignment models", modelItems);

	const whisperItems = LINETIME_WHISPER_VARIANTS.map(v => {
		const installed = isLinetimeWhisperInstalled(v.id);
		return {
			id: v.id,
			label: v.label,
			installed,
			active: installed && effective.whisper === v.id,
			sizeText: linetimeFileSizeText([getLinetimeWhisperPath(v.id)], v.sizeDesc),
			useFn: "linetimeUseWhisper",
			downloadFn: "linetimeDownloadWhisper",
			deleteFn: "linetimeDeleteWhisper",
		};
	});
	renderLinetimeTable("linetimeWhisperTable", "Whisper models (optional)", whisperItems);

	const cliSupported = getAppFileState("whisper-cli") !== "unsupported";
	const cliInstalled = isLinetimeWhisperCliInstalled();
	const cliDir = getLinetimeWhisperCliFolder();
	const cliSizeText = cliSupported
		? (cliInstalled ? linetimeFileSizeText(dirFilePaths(cliDir), getLinetimeWhisperCliSizeDesc()) : getLinetimeWhisperCliSizeDesc())
		: "N/A";
	renderLinetimeTable("linetimeCliTable", "Transcription (auto-generate lyrics)", [{
		id: "whisper-cli",
		label: "Whisper CLI",
		installed: cliInstalled,
		active: false,
		supported: cliSupported,
		sizeText: cliSizeText,
		useFn: null,
		downloadFn: "linetimeDownloadWhisperCli",
		deleteFn: "linetimeDeleteWhisperCli",
	}]);

	renderAppFileNotice();
}

async function updateYtdlp() {
	const btn = document.getElementById("updateYtdlpButton");
	btn.disabled = true;
	btn.innerText = "Updating...";

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "ytdlp_fetch.exe" : "ytdlp_fetch");
		const result = await new Promise((resolve, reject) => {
			// ytdlp_fetch writes a relative "bin/<name>", so the cwd decides the
			// destination. It must be userData, not the install dir: on Windows and
			// macOS processDir is the app bundle, which is not writable and, on macOS,
			// would invalidate the code signature. taratorFolder is also what the
			// readers in download_music.js prefer.
			const proc = spawn(bin, ["--force"], { windowsHide: true, cwd: taratorFolder });
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", d => {
			stdout += d.toString();
		});
		// yt-dlp writes progress to stderr on a successful run, so logging it as an
		// error would cry wolf. The accumulated text is reported by the close handler.
		proc.stderr.on("data", d => {
			stderr += d.toString();
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


async function downloadLinetimeVariant(component, variant) {
	if (linetimeDownloadInProgress) {
		await alertModal("A download is already in progress. Please wait.");
		return;
	}
	linetimeDownloadInProgress = true;
	refreshLinetimeStatus();

	const progressContainer = document.getElementById("linetimeProgressContainer");
	const progressBar = document.getElementById("linetimeProgressBar");
	const progressText = document.getElementById("linetimeProgressText");

	let args = ["--force", "--asset-dir=" + getLinetimeFolder(), "--release=" + LINETIME_RELEASE_TAG];
	let modelType = "standard";
	let label = "Linetime component";
	let sizeDesc = "";

	if (component === "binary") {
		if (variant === "gpu") args.push("--gpu");
		args.push("--skip-model", "--skip-tokenizer", "--skip-whisper", "--skip-whisper-cli");
		label = getLinetimeBinaryVariant(variant)?.label ?? "binary";
		sizeDesc = getLinetimeBinarySizeDesc(variant) ?? "";
	} else if (component === "model") {
		modelType = variant;
		args.push("--skip-binary", "--skip-tokenizer", "--skip-whisper", "--skip-whisper-cli", "--model-" + modelType);
		label = getLinetimeModelVariant(variant)?.label ?? "CTC model";
		sizeDesc = getLinetimeModelVariant(variant)?.sizeDesc ?? "";
	} else if (component === "tokenizer") {
		args.push("--skip-binary", "--skip-model", "--skip-whisper", "--tokenizer-only");
		label = "Tokenizer";
	} else if (component === "whisper") {
		const whisperMap = { standard: "whisper", "whisper-q5": "whisper-q5" };
		args.push("--skip-binary", "--skip-model", "--skip-tokenizer", "--skip-whisper-cli", "--model-" + (whisperMap[variant] || variant));
		label = getLinetimeWhisperVariant(variant)?.label ?? "Whisper model";
		sizeDesc = getLinetimeWhisperVariant(variant)?.sizeDesc ?? "";
	} else if (component === "whisper-cli") {
		args.push("--skip-binary", "--skip-model", "--skip-tokenizer", "--skip-whisper", "--whisper-cli-only");
		label = "Whisper CLI";
		sizeDesc = getLinetimeWhisperCliSizeDesc() ?? "";
	}

	const sizeSuffix = sizeDesc ? ` (${sizeDesc})` : "";

	progressContainer.style.display = "block";
	progressBar.style.width = "0%";
	progressText.textContent = `Downloading ${label}${sizeSuffix}...`;

	let lastErrorLine = "";

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "linetime_fetch.exe" : "linetime_fetch");
		await new Promise((resolve, reject) => {
			const proc = spawn(bin, args, { windowsHide: true, cwd: getLinetimeFolder() });

			let reportedError = false;
			proc.stdout.on("data", d => {
				const msg = d.toString();

				const pctMatch = msg.match(/(\d+)%/);
				if (pctMatch) {
					progressBar.style.width = parseInt(pctMatch[1]) + "%";
				} else if (msg.includes("Downloading binary")) {
					progressText.textContent = `Downloading ${label}${sizeSuffix}...`;
					progressBar.style.width = "10%";
				} else if (msg.includes("Downloading standard CTC")) {
					progressText.textContent = `Downloading ${label}${sizeSuffix}...`;
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading fast CTC")) {
					progressText.textContent = `Downloading ${label}${sizeSuffix}...`;
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading tokenizer")) {
					progressText.textContent = "Downloading tokenizer...";
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading Whisper large-v3 model")) {
					progressText.textContent = `Downloading ${label}${sizeSuffix}...`;
					progressBar.style.width = "30%";
				} else if (msg.includes("Downloading Whisper CLI")) {
					progressText.textContent = `Downloading ${label}${sizeSuffix}...`;
					progressBar.style.width = "30%";
				} else if (msg.includes("Extracting")) {
					progressText.textContent = "Extracting...";
					progressBar.style.width = "90%";
				} else if (msg.includes("Done")) {
					progressBar.style.width = "100%";
				}
			});

			proc.stderr.on("data", d => {
				const firstLine = d.toString().split("\n").map(l => l.trim()).find(l => l);
				if (!firstLine) return;
				if (!reportedError) {
					reportedError = true;
					logChange("error", "[linetime_fetch] " + firstLine);
				}
				lastErrorLine = firstLine;
				progressText.textContent = firstLine;
			});

			proc.on("error", reject);
			proc.on("close", code => {
				if (code !== 0) return reject(new Error(`linetime_fetch exited with code ${code}`));
				resolve();
			});
		});

		progressBar.style.width = "100%";
		progressText.textContent = "Done!";

		// A fresh download may carry a different CLI than the one that was probed.
		clearSoundDetectCapsCache();
		// Only a new GPU bundle can fix a GPU bundle that crashed before.
		if (component === "binary" && variant === "gpu") clearLinetimeGpuBundleBroken();

		await alertModal(`${label} downloaded and installed successfully.`);
	} catch (error) {
		const reason = lastErrorLine || error.message || String(error);
		progressText.textContent = reason;
		progressBar.style.width = "0%";
		await alertModal(`Failed to download ${label}: ${reason}`);
	}

	linetimeDownloadInProgress = false;
	await refreshLinetimeReport();

	setTimeout(() => {
		progressContainer.style.display = "none";
	}, 3000);
}

async function linetimeUseBinary(variant) {
	const v = getLinetimeBinaryVariant(variant);
	if (!isLinetimeBinaryInstalled(variant)) {
		await alertModal(`${v?.label ?? variant} binary is not installed. Download it first.`);
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
}

async function linetimeUseModel(variant) {
	const v = getLinetimeModelVariant(variant);
	if (!isLinetimeModelInstalled(variant)) {
		await alertModal(`${v?.label ?? variant} is not installed. Download it first.`);
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
}

async function linetimeUseWhisper(variant) {
	const v = getLinetimeWhisperVariant(variant);
	if (!isLinetimeWhisperInstalled(variant)) {
		await alertModal(`${v?.label ?? variant} is not installed. Download it first.`);
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
}

async function linetimeDeleteBinary(variant) {
	const label = getLinetimeBinaryVariant(variant)?.label ?? variant;
	const confirm = await confirmModal(`Delete the ${label} binary?`, "Delete", "Cancel");
	if (!confirm) return;

	const binPath = getLinetimeBinaryPath(variant);
	try {
		fs.unlinkSync(binPath);
		if (variant === "gpu") {
			const libDir = getAppFilePart("gpu", "lib");
			if (libDir && fs.existsSync(libDir)) fs.rmSync(libDir, { recursive: true, force: true });
			// A re-downloaded bundle should be given a clean chance, in case the
			// previous one crashed for a reason that has since been fixed.
			clearLinetimeGpuBundleBroken();
		}
		clearSoundDetectCapsCache();
		await refreshLinetimeReport();
		await alertModal(`${label} binary deleted`);
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

async function linetimeDeleteModel(variant) {
	const label = getLinetimeModelVariant(variant)?.label ?? variant;
	const confirm = await confirmModal(`Delete the ${label} CTC model?`, "Delete", "Cancel");
	if (!confirm) return;

	const modelPath = getLinetimeModelPath(variant);
	const v = getLinetimeModelVariant(variant);
	try {
		fs.unlinkSync(modelPath);
		if (v && v.requiresData) {
			const dataPath = getLinetimeModelDataPath(variant);
			if (dataPath && fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
		}
		await refreshLinetimeReport();
		await alertModal(`${label} CTC model deleted`);
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

async function linetimeDeleteWhisper(variant) {
	const label = getLinetimeWhisperVariant(variant)?.label ?? variant;
	const confirm = await confirmModal(`Delete the ${label} Whisper model?`, "Delete", "Cancel");
	if (!confirm) return;

	const whisperPath = getLinetimeWhisperPath(variant);
	try {
		fs.unlinkSync(whisperPath);
		await refreshLinetimeReport();
		await alertModal(`${label} Whisper model deleted`);
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

async function linetimeDeleteTokenizer() {
	const confirm = await confirmModal("Delete the tokenizer? Alignment needs it, so you will have to download it again.", "Delete", "Cancel");
	if (!confirm) return;

	try {
		fs.unlinkSync(getLinetimeTokenizerPath());
		await refreshLinetimeReport();
		await alertModal("Tokenizer deleted");
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

async function linetimeDeleteWhisperCli() {
	const confirm = await confirmModal("Delete the Whisper CLI? Auto-generate needs it, so you will have to download it again.", "Delete", "Cancel");
	if (!confirm) return;

	try {
		const cliPath = getLinetimeWhisperCliPath();
		if (cliPath) fs.rmSync(path.dirname(cliPath), { recursive: true, force: true });
		await refreshLinetimeReport();
		await alertModal("Whisper CLI deleted");
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

function linetimeDownloadBinary(variant) {
	downloadLinetimeVariant("binary", variant);
}

function linetimeDownloadModel(variant) {
	downloadLinetimeVariant("model", variant);
}

function linetimeDownloadWhisper(variant) {
	downloadLinetimeVariant("whisper", variant);
}

function linetimeDownloadTokenizer() {
	downloadLinetimeVariant("tokenizer", "standard");
}

function linetimeDownloadWhisperCli() {
	downloadLinetimeVariant("whisper-cli", "whisper-cli");
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
