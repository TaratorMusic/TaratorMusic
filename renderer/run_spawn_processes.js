let isFetchingSongInfo = false;

async function fetchSongInfoFromModal() {
	const setBusy = busy => {
		isFetchingSongInfo = busy;
		const btn = document.getElementById("fetchSongInfoButton");
		if (!btn) return;
		btn.disabled = busy;
		btn.textContent = busy ? "Fetching..." : "Fetch Song Info";
	};

	if (isFetchingSongInfo || document.getElementById("fetchSongInfoButton")?.disabled) return;

	setBusy(true);
	try {
		await grabAndStoreSongInfo("html");
	} catch (error) {
		logChange("error", error.message ?? String(error));
	} finally {
		setBusy(false);
	}
}

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

							const same = normalizeText(currentData.artist) == normalizeText(fetchedData.artist) && normalizeText(currentData.genre) == normalizeText(fetchedData.genre) && normalizeText(currentData.language) == normalizeText(fetchedData.language);

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
			query: "UPDATE songs SET artist = COALESCE(NULLIF(artist, ''), ?), genre = COALESCE(NULLIF(genre, ''), ?), language = COALESCE(NULLIF(language, ''), ?) WHERE song_id = ?",
			args: [meta.artist, meta.genre, meta.language, songIdUsed],
			fetch: false,
		});
	}

	const cached = songNameCache.get(songIdUsed);
	if (!cached) return;

	if (unconditional || cached.artist == null || cached.artist == "") cached.artist = meta.artist;
	if (unconditional || cached.genre == null || cached.genre == "") cached.genre = meta.genre;
	if (unconditional || cached.language == null || cached.language == "") cached.language = meta.language;

	logChange("debug", `New song info added for ${cached.song_name}: ${meta.artist}, ${meta.genre}, ${meta.language}, ${songIdUsed}`);

	const modal = document.getElementById("customiseModal");
	if (modal.style.display == "block" && songIdUsed == modal.dataset.songID) {
		document.getElementById("customiseSongGenre").value = meta.genre;
		document.getElementById("customiseSongArtist").value = meta.artist;
		document.getElementById("customiseSongLanguage").value = meta.language;

		modal.dataset.origGenre = meta.genre || "";
		modal.dataset.origArtist = meta.artist || "";
		modal.dataset.origLanguage = meta.language || "";
	}
}

async function startupCheck() {
	for (const [column, folder] of [
		["song_extension", musicFolder],
		["thumbnail_extension", thumbnailFolder],
	]) {
		const missing = [...songNameCache.entries()].filter(([, song]) => !song[column]);
		if (missing.length == 0) continue;

		const filesByName = new Map();
		for (const file of await fs.promises.readdir(folder)) {
			const name = path.parse(file).name;
			if (!filesByName.has(name)) filesByName.set(name, file);
		}

		for (const [songId, song] of missing) {
			const file = filesByName.get(songId);
			if (!file) continue;
			const ext = path.extname(file).slice(1);
			song[column] = ext;
			callSqlite({ db: "musics", query: `UPDATE songs SET ${column} = ? WHERE song_id = ?`, args: [ext, songId], fetch: false });
		}
	}

	const validSongIds = new Set([...songNameCache.keys(), ...streamedSongsCache.keys()]);
	for (const [playlistId, playlist] of playlistsMap.entries()) {
		const filtered = playlist.songs.filter(id => validSongIds.has(id));
		if (filtered.length != playlist.songs.length) {
			playlist.songs = filtered;
			callSqlite({ db: "playlists", query: "UPDATE playlists SET songs = ? WHERE id = ?", args: [JSON.stringify(filtered), playlistId], fetch: false });
		}
	}

	for (const query of ["DELETE FROM songs WHERE song_length = 0 OR song_length IS NULL", "UPDATE songs SET song_extension = LTRIM(song_extension, '.')", "UPDATE songs SET thumbnail_extension = LTRIM(thumbnail_extension, '.')"]) {
		callSqlite({ db: "musics", query, fetch: false });
	}

	const { output, code } = await new Promise((resolve, reject) => {
		const proc = spawn(path.join(backendFolder, "startup_check"), [musicFolder, thumbnailFolder, JSON.stringify(playlistIdsForStartup)], { windowsHide: true, stdio: ["pipe", "pipe", "inherit"] });
		let data = "";
		proc.on("error", reject);
		proc.stdout.on("data", chunk => (data += chunk));
		proc.on("close", exitCode => resolve({ output: data, code: exitCode }));
	});

	const folderSongs = JSON.parse(output);
	if (Object.keys(folderSongs).length != songNameCache.size) {
		foundNewSongs(folderSongs, Object.fromEntries(songNameCache)).catch(error => logChange("error", error.message ?? String(error)));
	}
	if (code != 0) throw new Error(`Go process exited with code ${code}`);
}

async function foundNewSongs(folderSongs, databaseSongs) {
	await alertModal("Found new songs in your folders.");

	for (const fileName of Object.keys(folderSongs)) {
		if (fileName in databaseSongs) continue;

		let songName = fileName;
		const songExt = folderSongs[fileName]?.song_extension ?? "";
		const thumbExt = folderSongs[fileName]?.thumbnail_extension ?? "";

		if (!fileName.includes("tarator")) {
			songName = await generateId();

			const originalMusicPath = path.join(musicFolder, fileName + songExt);
			if (fs.existsSync(originalMusicPath)) fs.renameSync(originalMusicPath, path.join(musicFolder, songName + songExt));

			if (thumbExt) {
				const originalThumbPath = path.join(thumbnailFolder, fileName + thumbExt);
				if (fs.existsSync(originalThumbPath)) fs.renameSync(originalThumbPath, path.join(thumbnailFolder, songName + thumbExt));
			}
		}

		const fullPath = path.join(musicFolder, songName + songExt);
		if (!fs.existsSync(fullPath)) continue;

		const metadata = await new Promise(resolve => {
			ffmpeg.ffprobe(fullPath, (err, meta) => resolve(err ? null : meta));
		});

		const duration = metadata?.format?.duration ? Math.round(metadata.format.duration) : null;
		const fileSize = fs.statSync(fullPath).size;
		const songExtension = songExt.replace(".", "") || null;
		const thumbnailExtension = thumbExt.replace(".", "") || null;

		callSqlite({
			db: "musics",
			query: "INSERT INTO songs (song_id, song_name, song_url, song_length, seconds_played, times_listened, stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
			args: [songName, fileName, null, duration, 0, 0, 0, fileSize, 100, null, null, null, 100, songExtension, thumbnailExtension, null, null, null],
			fetch: false,
		});

		songNameCache.set(songName, {
			song_name: fileName,
			song_length: duration,
			song_extension: songExtension,
			song_url: null,
			thumbnail_extension: thumbnailExtension,
			stabilised: 0,
			size: fileSize,
			genre: null,
			artist: null,
			language: null,
		});
	}

	const databaseOnly = Object.keys(databaseSongs).filter(key => !(key in folderSongs)).length;
	const songs = [...songNameCache.values()];
	const notStabilised = songs.filter(song => song.size == null).length;
	const noArtist = songs.filter(song => song.artist == null).length;

	let prompt = "";
	if (databaseOnly > 0) prompt += `You have ${databaseOnly} songs not installed. `;
	if (notStabilised != 0) prompt += `You have ${notStabilised} songs not stabilised. `;
	if (noArtist != 0) prompt += `You have ${noArtist} songs with no artist + genre + language information. `;
	if (prompt) await alertModal(prompt + "Complete your songs data using the options in the settings menu.");
}

const LINETIME_VARIANTS = Object.freeze({
	binary: [
		{ id: "cpu", label: "CPU", gpu: false },
		{ id: "gpu", label: "GPU (CUDA 12)", gpu: true },
	],
	model: [
		{ id: "standard", label: "Standard (FP32)", requiresData: true },
		{ id: "fast", label: "Fast (UINT8)", requiresData: false },
	],
	whisper: [
		{ id: "standard", label: "Standard (fp16)", reportId: "whisper-standard" },
		{ id: "whisper-q5", label: "Balanced (q5_0)", reportId: "whisper-q5" },
	],
});

const LINETIME_SINGLE_PARTS = Object.freeze({ tokenizer: "tokenizer", "whisper-cli": "cli", "gpu-cli": "cli" });
const LINETIME_SELECTABLE = ["binary", "model", "whisper"];
const LINETIME_STANDARD_ONNX = "mms_fa.onnx";
const LINETIME_STANDARD_DATA = "mms_fa.onnx.data";

// mirrors backend/linetime_fetch/main.go
const LINETIME_HF_FILES = Object.freeze({
	tokenizer: ["https://huggingface.co/xycld/lyric-align-mms-fa/resolve/main/tokenizer.json"],
	standard: ["https://huggingface.co/xycld/lyric-align-mms-fa/resolve/main/mms_fa.onnx", "https://huggingface.co/xycld/lyric-align-mms-fa/resolve/main/mms_fa.onnx.data"],
	fast: ["https://huggingface.co/xycld/lyric-align-mms-fa/resolve/main/mms_fa_uint8.onnx"],
	"whisper-standard": ["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin"],
	"whisper-q5": ["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin"],
});

const LINETIME_FETCH = Object.freeze({
	binary: {
		label: id => linetimeVariant("binary", id)?.label ?? "binary",
		args: id => [...(id == "gpu" ? ["--gpu"] : []), "--skip-model", "--skip-tokenizer", "--skip-whisper", "--skip-whisper-cli"],
	},
	model: {
		label: id => linetimeVariant("model", id)?.label ?? "CTC model",
		args: id => ["--skip-binary", "--skip-tokenizer", "--skip-whisper", "--skip-whisper-cli", "--model-" + id],
	},
	tokenizer: {
		label: () => "Tokenizer",
		args: () => ["--skip-binary", "--skip-model", "--skip-whisper", "--tokenizer-only"],
	},
	whisper: {
		label: id => linetimeVariant("whisper", id)?.label ?? "Whisper model",
		args: id => ["--skip-binary", "--skip-model", "--skip-tokenizer", "--skip-whisper-cli", "--model-" + (id == "standard" ? "whisper" : id)],
	},
	"whisper-cli": {
		label: () => "Whisper CLI",
		args: () => ["--skip-binary", "--skip-model", "--skip-tokenizer", "--skip-whisper", "--whisper-cli-only"],
	},
	"gpu-cli": {
		label: () => "CUDA Whisper CLI",
		args: () => ["--skip-binary", "--skip-model", "--skip-tokenizer", "--skip-whisper", "--whisper-cli-gpu-only"],
	},
});

const LINETIME_PROGRESS_STEPS = [
	["Downloading binary", 10],
	["Downloading standard CTC", 30],
	["Downloading fast CTC", 30],
	["Downloading tokenizer", 30],
	["Downloading Whisper large-v3 model", 30],
	["Downloading Whisper CLI", 30],
];

const EXTERNAL_LINKABLE = Object.freeze({
	ytdlp: { key: "ytdlp", accept: "", trial: ["--version"], label: "yt-dlp" },
	cpu: { key: "cpu:binary", accept: "", trial: ["--help"], label: "CPU binary" },
	gpu: { key: "gpu:binary", accept: "", trial: ["--help"], label: "GPU binary" },
	tokenizer: { key: "tokenizer:tokenizer", accept: ".json", trial: null, label: "Tokenizer" },
	standard: { key: "standard:model", accept: ".onnx", trial: null, label: "Standard model", pair: { basename: LINETIME_STANDARD_ONNX, sibling: LINETIME_STANDARD_DATA } },
	fast: { key: "fast:model", accept: ".onnx", trial: null, label: "Fast model" },
	"whisper-standard": { key: "whisper-standard:model", accept: ".bin", trial: null, label: "Whisper model" },
	"whisper-q5": { key: "whisper-q5:model", accept: ".bin", trial: null, label: "Whisper model" },
	"whisper-cli": { key: "whisper-cli:cli", accept: "", trial: ["--help"], label: "Whisper CLI" },
	"gpu-cli": { key: "gpu-cli:cli", accept: "", trial: ["--help"], label: "CUDA Whisper CLI" },
});

const linetimeSelected = { binary: "", model: "", whisper: "" };
let linetimeReleaseSizes = {};
let linetimeDownloadInProgress = false;
let externalPaths = {};
let appBinaryReport = null;
let binaryCheckRunning = false;

function parseJsonObject(text) {
	try {
		const value = JSON.parse(text || "{}");
		return value && typeof value == "object" ? value : {};
	} catch (_) {
		return {};
	}
}

function getLinetimeFolder() {
	return path.join(taratorFolder, "bin");
}

function linetimePlatformAsset(id) {
	if (id === "cpu") {
		if (process.platform === "darwin") return "linetime-macos-universal.tar.gz";
		if (process.platform === "win32") return "linetime-windows-x64-cpu.tar.gz";
		return "linetime-linux-x64-cpu.tar.gz";
	}
	if (id === "gpu") {
		if (process.platform === "win32") return "linetime-windows-x64-gpu.zip";
		return "linetime-linux-x64-gpu.tar.gz";
	}
	if (id === "whisper-cli") {
		if (process.platform === "win32") return process.arch === "ia32" ? "whisper-bin-Win32.zip" : "whisper-bin-x64.zip";
		if (process.arch === "arm64") return "whisper-bin-ubuntu-arm64.tar.gz";
		return "whisper-bin-ubuntu-x64.tar.gz";
	}
	if (id === "gpu-cli") {
		if (process.platform === "win32") return "linetime-whisper-cli-cuda-x64-windows.zip";
		return "linetime-whisper-cli-cuda-x64.tar.gz";
	}
	return null;
}

function linetimeBytesText(total) {
	if (total < 1048576) return Math.max(1, Math.round(total / 1024)) + " KB";
	if (total < 1073741824) return Math.round(total / 104857.6) / 10 + " MB";
	return Math.round(total / 107374182.4) / 10 + " GB";
}

async function pathBytes(target) {
	try {
		const stat = await fs.promises.stat(target);
		if (stat.isFile()) return stat.size;
		if (!stat.isDirectory()) return 0;
		let total = 0;
		for (const name of await fs.promises.readdir(target)) {
			total += await pathBytes(path.join(target, name));
		}
		return total;
	} catch (_) {
		return 0;
	}
}

function getAppFile(id) {
	if (!Array.isArray(appBinaryReport?.components)) return null;
	return appBinaryReport.components.find(c => c.id === id) ?? null;
}

function getAppFilePart(id, part) {
	return getAppFile(id)?.parts?.[part] ?? null;
}

function getExternalPath(key) {
	const p = externalPaths[key];
	if (!p || typeof p !== "string") return null;
	try {
		const stat = fs.statSync(p);
		return stat.isFile() && stat.size > 0 ? p : null;
	} catch (_) {
		return null;
	}
}

async function saveExternalPaths() {
	await callSqlite({
		db: "settings",
		query: "UPDATE statistics SET external_paths_json = ?",
		args: [JSON.stringify(externalPaths)],
		fetch: false,
	});
	refreshLinetimeStatus();
	refreshYtdlpStatus();
}

function linetimeVariant(kind, id) {
	return (LINETIME_VARIANTS[kind] || []).find(v => v.id === id);
}

function linetimeReportId(kind, id) {
	if (!LINETIME_VARIANTS[kind]) return kind;
	return linetimeVariant(kind, id)?.reportId || id;
}

function linetimeParts(kind, id) {
	if (!LINETIME_VARIANTS[kind]) return [[kind, LINETIME_SINGLE_PARTS[kind]]];

	const variant = linetimeVariant(kind, id);
	if (!variant) return null;

	const reportId = linetimeReportId(kind, id);
	if (kind == "binary") {
		const parts = [
			[reportId, "binary"],
			["cpu", "ffmpeg"],
		];
		if (variant.gpu) parts.push(["gpu", "lib"]);
		return parts;
	}
	if (kind == "model") {
		const parts = [[reportId, "model"]];
		if (variant.requiresData) parts.push([reportId, "data"]);
		return parts;
	}
	return [[reportId, "model"]];
}

function linetimeFile(reportId, part, downloadedOnly = false) {
	if (!downloadedOnly) {
		const external = getExternalPath(reportId + ":" + (part == "data" ? "model" : part));
		if (external) return part == "data" ? path.join(path.dirname(external), LINETIME_STANDARD_DATA) : external;
	}
	return getAppFilePart(reportId, part);
}

function getLinetimePath(kind, id) {
	const parts = linetimeParts(kind, id);
	return parts ? linetimeFile(...parts[0]) : null;
}

function linetimePartsExist(kind, id, downloadedOnly) {
	const parts = linetimeParts(kind, id);
	if (!parts) return false;
	return parts.every(([reportId, part]) => {
		const file = linetimeFile(reportId, part, downloadedOnly);
		return !!file && fs.existsSync(file);
	});
}

function isLinetimeInstalled(kind, id) {
	if (getAppFile(linetimeReportId(kind, id))?.state === "unsupported") return false;
	return linetimePartsExist(kind, id, false);
}

function isLinetimeDownloaded(kind, id) {
	return linetimePartsExist(kind, id, true);
}

function isLinetimeUsingGpuBinary() {
	return linetimeSelected.binary === "gpu" && isLinetimeInstalled("binary", "gpu");
}

function getLinetimeWhisperCli() {
	const gpuCli = linetimeFile("gpu-cli", "cli");
	const gpu = isLinetimeUsingGpuBinary() && !!gpuCli && fs.existsSync(gpuCli);
	const cliPath = gpu ? gpuCli : linetimeFile("whisper-cli", "cli");
	const dir = cliPath ? path.dirname(cliPath) : path.join(getLinetimeFolder(), "whisper_cli");
	// the GPU bundle lib folder must come first so libcudart and libcublas resolve there before the CLI's own RUNPATH
	const libDir = gpu ? [getAppFilePart("gpu", "lib"), dir].filter(Boolean).join(":") : dir;
	return { path: cliPath, dir, libDir, gpu };
}

function getEffectiveLinetimeSelection() {
	const effective = {};
	for (const kind of LINETIME_SELECTABLE) {
		const variants = LINETIME_VARIANTS[kind];
		const chosen = linetimeSelected[kind];
		const fallback = variants.find(v => isLinetimeInstalled(kind, v.id))?.id ?? (kind == "whisper" ? null : variants[0].id);
		effective[kind] = chosen && isLinetimeInstalled(kind, chosen) ? chosen : fallback;
	}
	return effective;
}

async function linetimeBytes(kind, id) {
	let total = 0;
	for (const [reportId, part] of linetimeParts(kind, id) || []) {
		if (part == "ffmpeg") continue;
		const file = linetimeFile(reportId, part);
		if (!file) continue;
		const isOwnCliFolder = part == "cli" && !getExternalPath(reportId + ":cli");
		total += await pathBytes(isOwnCliFolder ? path.dirname(file) : file);
	}
	return total;
}

async function linetimeRow(kind, id, label, effective, gpuCliActive) {
	const reportId = linetimeReportId(kind, id);
	const supported = getAppFile(reportId)?.state !== "unsupported";
	const installed = isLinetimeInstalled(kind, id);
	const [, firstPart] = linetimeParts(kind, id)[0];

	let sizeText = "N/A";
	if (supported) {
		const bytes = installed ? await linetimeBytes(kind, id) : 0;
		sizeText = bytes > 0 ? linetimeBytesText(bytes) : linetimeReleaseSizes[linetimePlatformAsset(reportId) || "hf-" + reportId] || "";
	}

	let active = false;
	if (kind == "whisper-cli") active = installed && !gpuCliActive;
	else if (kind == "gpu-cli") active = gpuCliActive;
	else if (LINETIME_SELECTABLE.includes(kind)) active = installed && effective[kind] === id;

	return {
		kind,
		id,
		label,
		supported,
		installed,
		downloaded: isLinetimeDownloaded(kind, id),
		external: supported ? getExternalPath(reportId + ":" + firstPart) : null,
		linkKey: reportId,
		active,
		version: kind == "binary" ? (typeof getAppFile(reportId)?.version === "string" ? getAppFile(reportId).version : "") : "",
		sizeText,
	};
}

function renderLinetimeTable(containerId, title, desc, items) {
	const el = document.getElementById(containerId);
	if (!el) return;

	const busy = linetimeDownloadInProgress;
	const columns = "150px 80px 100px 1fr";
	const button = (text, action, extraClass = "") => `<button class="linetime-action-btn ${extraClass}" ${busy || !action ? "disabled" : `onclick="${action}"`}>${text}</button>`;

	const rows = items
		.map(item => {
			let statusClass = "linetime-status-missing";
			let statusText = "Not installed";
			if (!item.supported) {
				statusText = "Not available on this OS";
			} else if (item.active) {
				statusClass = "linetime-status-active";
				statusText = "Active";
			} else if (item.external) {
				statusClass = "linetime-status-external";
				statusText = "External";
			} else if (item.installed) {
				statusClass = "linetime-status-ok";
				statusText = "Installed";
			}
			if (item.version) statusText += " · v" + item.version;

			let labelHtml = item.label;
			if (item.external) {
				labelHtml += `<div class="linetime-external-path" title="${item.external}">${item.external.split(/[\\/]/).pop()}</div>`;
			}

			let actionBtns = "";
			if (item.supported) {
				const ref = `'${item.kind}','${item.id}'`;

				if (LINETIME_SELECTABLE.includes(item.kind)) {
					const pickable = item.installed && !item.active && !busy;
					actionBtns += `<button class="linetime-action-btn linetime-btn-pick" ${pickable ? `onclick="linetimeAction('use',${ref})"` : "disabled"}>${item.active ? "Active" : "Pick"}</button>`;
				}

				if (!item.installed) {
					actionBtns += button("Download", `linetimeAction('download',${ref})`);
				} else if (item.downloaded) {
					actionBtns += button("Delete", `linetimeAction('delete',${ref})`, "linetime-btn-delete");
				}

				if (item.external) {
					actionBtns += button("Unlink", `unlinkExternal('${item.linkKey}')`);
				} else {
					actionBtns += button("Link", `linkExternal('${item.linkKey}')`);
				}
			}

			return `
				<div style="display:grid;grid-template-columns:${columns};gap:8px;margin:4px 0;align-items:center;padding:4px 0;border-bottom:1px solid #333;">
					<div>${labelHtml}</div>
					<div>${item.sizeText}</div>
					<div><span class="${statusClass}">${statusText}</span></div>
					<div>${actionBtns}</div>
				</div>`;
		})
		.join("");

	el.innerHTML = `
		<div class="linetime-table-title">${title}</div>
		<div class="linetime-table-desc">${desc}</div>
		<div class="linetime-box">
		<div style="display:grid;grid-template-columns:${columns};gap:8px;font-weight:bold;color:#ccc;margin-bottom:4px;">
			<div>Variant</div><div>Size</div><div>Status</div><div>Action</div>
		</div>${rows}</div>`;
}

let linetimeStatusRevision = 0;

async function refreshLinetimeStatus() {
	const revision = ++linetimeStatusRevision;
	const effective = getEffectiveLinetimeSelection();
	const gpuCliActive = isLinetimeInstalled("gpu-cli") && getLinetimeWhisperCli().gpu;
	const row = (kind, id, label) => linetimeRow(kind, id, label, effective, gpuCliActive);
	const [binaries, models, whispers, clis] = await Promise.all([
		Promise.all(LINETIME_VARIANTS.binary.map(v => row("binary", v.id, v.label))),
		Promise.all([row("tokenizer", "tokenizer", "Tokenizer (required)"), ...LINETIME_VARIANTS.model.map(v => row("model", v.id, v.label))]),
		Promise.all(LINETIME_VARIANTS.whisper.map(v => row("whisper", v.id, v.label))),
		Promise.all([row("whisper-cli", "whisper-cli", "Whisper CLI"), row("gpu-cli", "gpu-cli", "Whisper CLI (CUDA)")]),
	]);
	if (revision !== linetimeStatusRevision) return;

	renderLinetimeTable(
		"linetimeBinaryTable",
		"Binary",
		"The aligner program itself. CPU runs everywhere, GPU needs an NVIDIA card with CUDA 12.",
		binaries,
	);

	renderLinetimeTable("linetimeModelTable", "Alignment models", "Acoustic models that place each lyric line in time. The tokenizer is required for any of them to work.", models);

	renderLinetimeTable(
		"linetimeWhisperTable",
		"Whisper models (optional)",
		"Turn audio into lyric text. Only needed for Auto-generate, so pick one or skip this.",
		whispers,
	);

	renderLinetimeTable("linetimeCliTable", "Transcription (auto-generate lyrics)", "Runs the transcription that makes Auto-generate work. whisper.cpp publishes no macOS build, so it is unavailable there.", clis);

	renderAppFileNotice();
}

function renderAppFileNotice() {
	const el = document.getElementById("appFileNotice");
	if (!el) return;

	if (!Array.isArray(appBinaryReport?.components)) {
		el.className = "app-file-notice";
		el.textContent = binaryCheckRunning ? "Checking installed components..." : "Component inventory unavailable: binary_check did not run, so these rows cannot be verified. Run npm run gobuild to build it. Downloads still work.";
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
	if (required.length > 0) parts.push("Missing: " + required.map(c => c.label).join(", ") + ".");
	if (optional.length > 0) parts.push("Optional, not downloaded yet: " + optional.map(c => c.label).join(", ") + ".");

	el.className = required.length > 0 ? "app-file-notice" : "app-file-notice optional";
	el.textContent = parts.join(" ");
	el.style.display = "block";
}

async function runBinaryCheck() {
	binaryCheckRunning = true;
	const bin = path.join(backendFolder, process.platform === "win32" ? "binary_check.exe" : "binary_check");

	const result = await new Promise(resolve => {
		const proc = spawn(bin, [backendFolder, getLinetimeFolder()], { windowsHide: true });
		let out = "";
		proc.stdout.on("data", d => (out += d.toString()));
		proc.on("error", error => resolve({ error }));
		proc.on("close", code => {
			if (code !== 0 || !out.trim()) return resolve({ error: new Error("exited with code " + code) });
			try {
				resolve({ report: JSON.parse(out) });
			} catch (error) {
				resolve({ error });
			}
		});
	});

	binaryCheckRunning = false;

	if (result.error) {
		appBinaryReport = null;
		logChange("warn", "Component inventory unavailable, binary_check did not run (" + (result.error.message ?? result.error) + "). Filenames come from it, so the Linetime rows cannot be verified. Run npm run gobuild.");
	} else {
		appBinaryReport = result.report;
		const missing = appBinaryReport.components.filter(c => c.state === "missing" && !c.optional);
		if (missing.length > 0) logChange("warn", "Missing required files: " + missing.map(c => c.label).join(", "));
		const unsupported = appBinaryReport.components.filter(c => c.state === "unsupported");
		if (unsupported.length > 0) logChange("info", "Not available on " + process.platform + ": " + unsupported.map(c => c.label).join(", "));
	}

	refreshLinetimeStatus();
}

async function fetchLinetimeReleaseSizes() {
	const sizes = {};
	const github = { headers: { Accept: "application/vnd.github+json", "User-Agent": "TaratorMusic" } };
	// the whisper.cpp tag must match whisperCppTag in backend/linetime_fetch/main.go
	const releases = [
		["Linetime", "https://api.github.com/repos/Victiniiiii/Linetime/releases/latest"],
		["Whisper CLI", "https://api.github.com/repos/ggml-org/whisper.cpp/releases/tags/b5130"],
	];

	await Promise.all([
		...releases.map(async ([name, url]) => {
			try {
				const resp = await fetch(url, github);
				if (!resp.ok) throw new Error("HTTP " + resp.status);
				const release = await resp.json();
				for (const asset of release.assets || []) {
					if (asset.name && asset.size) sizes[asset.name] = linetimeBytesText(asset.size);
				}
			} catch (e) {
				logChange("warn", `${name} release size fetch failed: ${e.message}`);
			}
		}),
		...Object.entries(LINETIME_HF_FILES).map(async ([id, urls]) => {
			let total = 0;
			for (const url of urls) {
				try {
					const resp = await fetch(url, { method: "HEAD" });
					const length = Number(resp.headers.get("content-length"));
					if (!resp.ok || !Number.isFinite(length) || length <= 0) throw new Error("HTTP " + resp.status);
					total += length;
				} catch (e) {
					logChange("warn", "Linetime size HEAD failed for " + url + ": " + e.message);
					return;
				}
			}
			if (total > 0) sizes["hf-" + id] = linetimeBytesText(total);
		}),
	]);

	if (Object.keys(sizes).length === 0) return;
	linetimeReleaseSizes = { ...linetimeReleaseSizes, ...sizes };
	try {
		await callSqlite({
			db: "settings",
			query: "UPDATE statistics SET linetime_sizes_json = ?",
			args: [JSON.stringify(linetimeReleaseSizes)],
			fetch: false,
		});
	} catch (e) {
		logChange("warn", "Linetime size cache save failed: " + e.message);
	}
	refreshLinetimeStatus();
}

async function linetimeAction(action, kind, id) {
	const label = linetimeVariant(kind, id)?.label ?? id;

	if (action == "use") {
		if (!isLinetimeInstalled(kind, id)) {
			await requireLinetimeComponent(`${label}${kind == "binary" ? " binary" : ""} is not installed.`);
			return;
		}
		linetimeSelected[kind] = id;
		await callSqlite({ db: "settings", query: `UPDATE statistics SET linetime_selected_${kind} = ?`, args: [id], fetch: false });
		refreshLinetimeStatus();
	} else if (action == "download") {
		if (kind == "gpu-cli") {
			if (getAppFile("gpu-cli")?.state === "unsupported") {
				await alertModal("The CUDA Whisper CLI needs an NVIDIA GPU with CUDA 12, which this app does not support on this system.");
				return;
			}
			if (!(await confirmModal("Download the CUDA Whisper CLI? It is about 100 MB and is what makes transcription run on the GPU instead of the CPU.", "Download", "Cancel"))) return;
		}
		await downloadLinetimeComponent(kind, id);
	} else if (action == "delete") {
		await deleteLinetimeComponent(kind, id, label);
	}
}

async function deleteLinetimeComponent(kind, id, label) {
	let question;
	let done;
	if (kind == "binary") {
		question = `Delete the ${label} binary?`;
		done = `${label} binary deleted`;
	} else if (kind == "model") {
		question = `Delete the ${label} CTC model?`;
		done = `${label} CTC model deleted`;
	} else if (kind == "whisper") {
		question = `Delete the ${label} Whisper model?`;
		done = `${label} Whisper model deleted`;
	} else if (kind == "tokenizer") {
		question = "Delete the tokenizer? Alignment needs it, so you will have to download it again.";
		done = "Tokenizer deleted";
	} else if (kind == "whisper-cli") {
		question = "Delete the Whisper CLI? Auto-generate needs it, so you will have to download it again.";
		done = "Whisper CLI deleted";
	} else {
		question = "Delete the CUDA Whisper CLI? GPU transcription will stop working and fall back to the CPU CLI, which is much slower.";
		done = "CUDA Whisper CLI deleted";
	}
	if (!(await confirmModal(question, "Delete", "Cancel"))) return;

	const isCli = kind == "whisper-cli" || kind == "gpu-cli";
	const reportId = linetimeReportId(kind, id);
	const [[, partName]] = linetimeParts(kind, id);
	const own = getAppFilePart(reportId, partName);

	if (!own && !isCli) {
		await alertModal("No downloaded copy to delete. An external link is removed with Unlink, the file itself is left alone.");
		return;
	}

	try {
		const files = [];
		const folders = [];
		if (isCli) {
			if (own) folders.push(path.dirname(own));
		} else {
			files.push(own);
			if (kind == "binary" && id == "gpu") folders.push(getAppFilePart("gpu", "lib"));
			if (kind == "model" && linetimeVariant("model", id).requiresData) files.push(getAppFilePart(id, "data"));
		}
		for (const file of files) {
			if (file) fs.rmSync(file, { force: true });
		}
		for (const folder of folders) {
			if (folder) fs.rmSync(folder, { recursive: true, force: true });
		}
		if (kind == "binary") {
			if (id == "gpu") clearLinetimeGpuBundleBroken();
			clearSoundDetectCapsCache();
		}
		await runBinaryCheck();
		await alertModal(done);
	} catch (e) {
		await alertModal(`Failed to delete: ${e.message}`);
	}
}

async function downloadLinetimeComponent(kind, id) {
	if (linetimeDownloadInProgress) {
		await alertModal("A download is already in progress. Please wait.");
		return;
	}
	linetimeDownloadInProgress = true;
	refreshLinetimeStatus();

	const progressContainer = document.getElementById("linetimeProgressContainer");
	const progressBar = document.getElementById("linetimeProgressBar");
	const progressText = document.getElementById("linetimeProgressText");

	const fetchSpec = LINETIME_FETCH[kind];
	const label = fetchSpec.label(id);
	const args = ["--force", "--asset-dir=" + getLinetimeFolder(), "--release=latest", ...fetchSpec.args(id)];

	progressContainer.style.display = "block";
	progressBar.style.width = "0%";
	progressText.textContent = `Downloading ${label}...`;

	let lastErrorLine = "";

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "linetime_fetch.exe" : "linetime_fetch");
		await new Promise((resolve, reject) => {
			const proc = spawn(bin, args, { windowsHide: true, cwd: getLinetimeFolder() });
			let reportedError = false;

			proc.stdout.on("data", d => {
				const msg = d.toString();
				const percent = msg.match(/(\d+)%/);
				const step = LINETIME_PROGRESS_STEPS.find(([text]) => msg.includes(text));

				if (percent) {
					progressBar.style.width = parseInt(percent[1]) + "%";
				} else if (step) {
					progressText.textContent = `Downloading ${label}...`;
					progressBar.style.width = step[1] + "%";
				} else if (msg.includes("Extracting")) {
					progressText.textContent = "Extracting...";
					progressBar.style.width = "90%";
				} else if (msg.includes("Done")) {
					progressBar.style.width = "100%";
				}
			});

			proc.stderr.on("data", d => {
				const firstLine = d
					.toString()
					.split("\n")
					.map(l => l.trim())
					.find(l => l);
				if (!firstLine) return;
				if (!reportedError) {
					reportedError = true;
					logChange("error", "[linetime_fetch] " + firstLine);
				}
				lastErrorLine = firstLine;
				progressText.textContent = firstLine;
			});

			proc.on("error", reject);
			proc.on("close", code => (code !== 0 ? reject(new Error(`linetime_fetch exited with code ${code}`)) : resolve()));
		});

		progressBar.style.width = "100%";
		progressText.textContent = "Done!";

		clearSoundDetectCapsCache();
		if (kind == "binary" && id == "gpu") clearLinetimeGpuBundleBroken();

		await alertModal(`${label} downloaded and installed successfully.`);
	} catch (error) {
		const reason = lastErrorLine || error.message || String(error);
		progressText.textContent = reason;
		progressBar.style.width = "0%";
		await alertModal(`Failed to download ${label}: ${reason}`);
	}

	linetimeDownloadInProgress = false;
	await runBinaryCheck();

	setTimeout(() => {
		progressContainer.style.display = "none";
	}, 3000);
}

function pickExternalFile(accept) {
	return new Promise(resolve => {
		const input = document.getElementById("externalFilePicker");
		if (!input) return resolve(null);

		let done = false;
		const finish = value => {
			if (done) return;
			done = true;
			window.removeEventListener("focus", onFocus);
			resolve(value);
		};
		const onFocus = () =>
			setTimeout(() => {
				if (!input.files.length) finish(null);
			}, 500);

		input.accept = accept || "";
		input.onchange = () => {
			const picked = input.files.length > 0 ? input.files[0].path : null;
			input.value = "";
			finish(picked);
		};
		window.addEventListener("focus", onFocus);
		input.click();
	});
}

function probeExternalBinary(picked, args, label) {
	return new Promise((resolve, reject) => {
		let out = "";
		let settled = false;
		let proc;

		const settle = (error, kill) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (kill) {
				try {
					proc.kill();
				} catch (_) {}
			}
			if (error) reject(new Error(error));
			else resolve();
		};

		const timer = setTimeout(() => settle(`${label} did not respond within 20 seconds.`, true), 20000);

		try {
			proc = spawn(picked, args, { windowsHide: true });
		} catch (e) {
			return settle(`${label} could not start: ${e.message}`);
		}

		proc.stdout.on("data", d => (out += d.toString()));
		proc.stderr.on("data", d => (out += d.toString()));
		proc.on("error", e => settle(`${label} could not start: ${e.message}`));
		proc.on("close", code => {
			if (code === 127) return settle(`${label} is missing libraries it needs to start.`);
			if (code !== 0 && !out.trim()) return settle(`${label} exited with code ${code}.`);
			settle(null);
		});
	});
}

async function linkExternal(rowId) {
	const cfg = EXTERNAL_LINKABLE[rowId];
	if (!cfg) return;

	const picked = await pickExternalFile(cfg.accept);
	if (!picked) return;
	if (await pathBytes(picked) <= 0) {
		await alertModal("That file is empty or unreadable.");
		return;
	}
	if (cfg.pair) {
		if (path.basename(picked) !== cfg.pair.basename) {
			await alertModal(`That model only loads as ${cfg.pair.basename} with ${cfg.pair.sibling} beside it.`);
			return;
		}
		if (await pathBytes(path.join(path.dirname(picked), cfg.pair.sibling)) <= 0) {
			await alertModal(`${cfg.pair.sibling} was not found next to the picked file.`);
			return;
		}
	}
	if (cfg.trial) {
		try {
			await probeExternalBinary(picked, cfg.trial, cfg.label);
		} catch (e) {
			await alertModal(e.message);
			return;
		}
	}
	externalPaths[cfg.key] = picked;
	await saveExternalPaths();
}

async function unlinkExternal(rowId) {
	const cfg = EXTERNAL_LINKABLE[rowId];
	if (!cfg || !externalPaths[cfg.key]) return;
	if (!(await confirmModal(`Stop using the linked ${cfg.label} at ${externalPaths[cfg.key]}? The file itself is left alone.`, "Unlink", "Cancel"))) return;
	delete externalPaths[cfg.key];
	await saveExternalPaths();
}

function linkYtdlp() {
	return linkExternal("ytdlp");
}

function unlinkYtdlp() {
	return unlinkExternal("ytdlp");
}

function refreshYtdlpStatus() {
	const installed = isYtdlpInstalled();
	const external = getExternalPath("ytdlp");
	const btn = document.getElementById("updateYtdlpButton");
	const versionEl = document.getElementById("ytdlpCurrentVersion");
	const descEl = document.getElementById("ytdlpLastUpdateText");
	const titleEl = document.getElementById("ytdlpCardTitle");
	const linkBtn = document.getElementById("linkYtdlpButton");
	const unlinkBtn = document.getElementById("unlinkYtdlpButton");
	const pathEl = document.getElementById("ytdlpExternalPath");
	if (!btn || !versionEl || !descEl) return;

	btn.innerText = installed ? "Update" : "Install";
	if (titleEl) titleEl.innerText = installed ? "Update yt-dlp" : "Install yt-dlp";
	versionEl.innerText = installed ? `Current version: ${ytdlpVersion || "unknown"}` : "Not installed";
	if (linkBtn) linkBtn.style.display = external ? "none" : "";
	if (unlinkBtn) unlinkBtn.style.display = external ? "" : "none";
	if (pathEl) {
		pathEl.style.display = external ? "" : "none";
		if (external) {
			pathEl.textContent = external;
			pathEl.title = external;
		}
	}
	descEl.innerText = installed ? "Updates yt-dlp to the latest version. Useful if downloads keep failing." : "Downloads yt-dlp. Needed for downloading songs, streaming and recommendations.";
}

async function updateYtdlp() {
	const btn = document.getElementById("updateYtdlpButton");
	const wasInstalled = isYtdlpInstalled();
	btn.disabled = true;
	btn.innerText = wasInstalled ? "Updating..." : "Installing...";

	try {
		const bin = path.join(backendFolder, process.platform === "win32" ? "ytdlp_fetch.exe" : "ytdlp_fetch");
		const result = await new Promise((resolve, reject) => {
			// ytdlp_fetch writes to a relative bin/<name>, so cwd must be the writable userData folder and not the app bundle
			const proc = spawn(bin, ["--force"], { windowsHide: true, cwd: taratorFolder });
			let stdout = "";
			let stderr = "";
			proc.stdout.on("data", d => (stdout += d.toString()));
			proc.stderr.on("data", d => (stderr += d.toString()));
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
		btn.innerText = wasInstalled ? "Updated!" : "Installed!";

		refreshYtdlpStatus();
		await alertModal(wasInstalled ? `yt-dlp updated to ${result.version}!` : `yt-dlp ${result.version} installed!`);
	} catch (error) {
		btn.innerText = "Failed";
		await alertModal(`Failed to ${wasInstalled ? "update" : "install"} yt-dlp: ${error.message ?? String(error)}`);
	}

	btn.disabled = false;
	setTimeout(refreshYtdlpStatus, 2000);
}
