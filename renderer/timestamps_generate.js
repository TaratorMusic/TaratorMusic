const os = require("os");
const { spawnSync } = require("child_process");

function getSoundDetectBinary() {
	const effective = getEffectiveLinetimeSelection();
	return getLinetimeBinaryPath(effective.binary);
}

// Only the GPU build needs a library path. The CPU build is self contained and
// would break if it inherited a GPU lib path from the environment. The directory
// comes from the binary_check report, not a table duplicated here.
function getSoundDetectLibDir() {
	const effective = getEffectiveLinetimeSelection();
	const v = LINETIME_BINARY_VARIANTS.find(x => x.id === effective.binary);
	if (!v || !v.gpu) return null;
	return getAppFilePart("gpu", "lib");
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

// The published v1.2 binary and the current Linetime source disagree on the CLI:
// the release takes --model-b with --method both and cannot transcribe, the source
// takes --model-c with --method c and transcribes through whisper-cli. Probe the
// installed binary so both work. Usage goes to stderr, so both streams are read.
const LINETIME_RELEASE_CLI_CAPS = Object.freeze({ newCli: false, hasBoth: true });
let soundDetectCapsCache = new Map();

// The probe has to run with the same library path as the real invocation. A GPU
// bundle cannot start at all without it, so probing without it makes --help print
// a loader error and every GPU build looks like an unrecognised CLI.
function detectSoundDetectCaps() {
	const binaryPath = getSoundDetectBinary();
	if (!binaryPath) return Object.assign({}, LINETIME_RELEASE_CLI_CAPS);
	if (soundDetectCapsCache.has(binaryPath)) return soundDetectCapsCache.get(binaryPath);

	const env = Object.assign({}, process.env);
	const libDir = getSoundDetectLibDir();
	if (libDir && process.platform !== "win32") {
		env.LD_LIBRARY_PATH = libDir + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "");
	}

	const result = spawnSync(binaryPath, ["--help"], {
		encoding: "utf8",
		timeout: 15000,
		windowsHide: true,
		cwd: getLinetimeFolder(),
		env,
	});
	const help = (result.stdout || "") + (result.stderr || "");

	let caps;
	if (result.error || (!help.trim() && result.status !== 0)) {
		caps = Object.assign({}, LINETIME_RELEASE_CLI_CAPS);
		logChange("warn", "Linetime capability probe failed for " + binaryPath
			+ ", assuming the released CLI.\n" + (result.error ? String(result.error.message) : "no help output"));
	} else {
		caps = {
			newCli: /--model-c/.test(help) && /--whisper-cli/.test(help),
			hasBoth: /a\|b\|both/.test(help),
		};
		if (!caps.newCli && !caps.hasBoth) {
			caps = Object.assign({}, LINETIME_RELEASE_CLI_CAPS);
			logChange("warn", "Linetime capability probe returned unrecognised help from " + binaryPath
				+ ", assuming the released CLI.");
		}
	}

	soundDetectCapsCache.set(binaryPath, caps);
	return caps;
}

function clearSoundDetectCapsCache() {
	soundDetectCapsCache = new Map();
}

// Death by signal, which is what an illegal instruction from a bundle built with
// -march=native looks like. A clean non-zero exit is a normal failure, not a
// signal-death, and is reported as-is.
function soundDetectCrashed(error) {
	return !!error?.signal;
}

// Linetime treats an explicitly requested provider as a requirement and exits 1
// with this on stderr rather than falling back. The CUDA provider library lists
// cuDNN as a hard dependency, so a bundle missing it cannot load the provider at
// all and the run would otherwise appear to succeed on the CPU.
function soundDetectProviderUnavailable(error) {
	return /refusing to fall back/i.test(error?.stderrTail || "");
}

// A GPU bundle built with -march=native on an AVX-512 machine takes SIGILL inside
// the whisper backend when run on a CPU without those instructions. It is not a
// CUDA problem: --provider cpu still crashes, because the code was compiled that
// way. The signal cannot be predicted, so the first crash is remembered and later
// Whisper runs refuse to start rather than paying a multi-gigabyte model load to
// crash again. Method a never loads a Whisper model, so it is unaffected.
const LINETIME_GPU_BUNDLE_BROKEN_KEY = "taratorLinetimeGpuBundleBroken";

// Identifies the exact binary the crash was recorded against, so replacing the
// bundle clears the flag by itself. Without this a fixed or rebuilt binary stays
// permanently blocked by a verdict about the old one.
function gpuBundleFingerprint() {
	const p = getLinetimeBinaryPath("gpu");
	if (!p) return "";
	try {
		const s = fs.statSync(p);
		return s.size + ":" + s.mtimeMs;
	} catch (_) {
		return "";
	}
}

function isLinetimeGpuBundleBroken() {
	return !!linetimeGpuBundleBrokenReason();
}

// Why the bundle was recorded as broken, or "" if it was not. The two reasons
// are not equivalent: a Whisper crash leaves method a usable, while a provider
// that cannot load fails inside the CTC aligner and takes every method with it.
function linetimeGpuBundleBrokenReason() {
	try {
		const raw = localStorage.getItem(LINETIME_GPU_BUNDLE_BROKEN_KEY);
		if (!raw) return "";
		// A bare "1" predates fingerprinting and cannot be tied to a binary, so it
		// is discarded rather than trusted.
		if (raw === "1") {
			localStorage.removeItem(LINETIME_GPU_BUNDLE_BROKEN_KEY);
			return "";
		}
		const rec = JSON.parse(raw);
		if (!rec || rec.fp !== gpuBundleFingerprint()) {
			localStorage.removeItem(LINETIME_GPU_BUNDLE_BROKEN_KEY);
			return "";
		}
		// Records written before the reason was stored mean a Whisper crash, which
		// is the only cause that existed then.
		return rec.reason || "crash";
	} catch (_) {
		return "";
	}
}

function markLinetimeGpuBundleBroken(reason) {
	try {
		localStorage.setItem(LINETIME_GPU_BUNDLE_BROKEN_KEY,
			JSON.stringify({ fp: gpuBundleFingerprint(), at: Date.now(), reason: reason || "crash" }));
	} catch (_) {}
}

function clearLinetimeGpuBundleBroken() {
	try { localStorage.removeItem(LINETIME_GPU_BUNDLE_BROKEN_KEY); } catch (_) {}
}

// True when this run must be refused because the GPU bundle already crashed on
// this machine. Method a never loads a Whisper model, so it stays allowed.
function gpuBundleBlocksWhisper(binaryId, method) {
	const reason = linetimeGpuBundleBrokenReason();
	if (binaryId !== "gpu" || !reason) return false;
	// A provider that cannot load fails while the CTC aligner initialises, so
	// every method is blocked, not only the ones that run Whisper.
	if (reason === "provider") return true;
	return (method === "b" || method === "c") && isLinetimeGpuBundleBroken();
}

// CUDA only accelerates the ONNX CTC model. On the released binary the Whisper
// pass is statically linked without CUDA, so asking for cuda there kills the
// process at whisper model init. Methods b and c always run Whisper, so on the
// old CLI they must stay on cpu. Method a is CTC only, so cuda genuinely helps.
function pickLinetimeProvider(binaryId, method, caps) {
	if (binaryId !== "gpu") return "cpu";
	if (!caps.newCli && (method === "b" || method === "c")) return "cpu";
	return "cuda";
}

function runSoundDetectOnce(binaryPath, args, env, task) {
	return new Promise((resolve, reject) => {
		const proc = spawn(binaryPath, args, {
			windowsHide: true,
			cwd: getLinetimeFolder(),
			env: env,
		});

		let stderr = "";
		let stderrTail = "";
		proc.stderr.on("data", chunk => {
			const text = chunk.toString();
			stderr += text;
			stderrTail = (stderrTail + text).split("\n").slice(-12).join("\n");
			// Newer builds report "[progress] 42% Stage". Only the number matters.
			for (const line of text.split("\n")) {
				const match = /^\[progress\]\s+(\d+)%\s*/.exec(line.trim());
				if (match && task) task.creep(parseInt(match[1], 10) / 100);
			}
		});
		proc.stdout.on("data", () => {});

		proc.on("close", (code, signal) => {
			if (code === 0) return resolve();
			// A null code means the process died on a signal. SIGILL in particular
			// means the bundle was compiled with instructions this CPU does not have.
			const cause = signal ? "killed by " + signal : "exited with code " + code;
			const err = new Error("Linetime aligner " + cause);
			err.signal = signal || null;
			err.stderrTail = stderrTail;
			reject(err);
		});
		proc.on("error", err => reject(err));
	});
}

// No fallback to another bundle. If the selected one cannot run on this CPU the
// run stops and says why, rather than silently switching binaries behind the
// user's back.
async function runSoundDetect(args, env, task, method) {
	const effective = getEffectiveLinetimeSelection();
	const binaryPath = getLinetimeBinaryPath(effective.binary);

	if (gpuBundleBlocksWhisper(effective.binary, method)) {
		const message = linetimeGpuBundleBrokenReason() === "provider"
			? "The GPU Linetime bundle cannot load CUDA, so it will not run any method on the "
				+ "GPU. Its libraries are incomplete, most often a missing cuDNN, and nothing was "
				+ "retried. Download the CPU binary in Settings > Linetime Aligner and select it."
			: "The GPU Linetime bundle is not compatible with this CPU and is already "
				+ "recorded as broken. Nothing was retried. Download the CPU binary in "
				+ "Settings > Linetime Aligner and select it, or use Method A, which does not "
				+ "load a Whisper model.";
		logChange("warn", "Linetime run refused before starting.\n" + message
			+ "\nbinary: " + binaryPath + "\nmethod: " + method);
		throw new Error(message);
	}

	try {
		await runSoundDetectOnce(binaryPath, args, env, task);
	} catch (error) {
		if (effective.binary !== "gpu") throw error;

		if (soundDetectProviderUnavailable(error)) {
			markLinetimeGpuBundleBroken("provider");
			const reason = "The GPU Linetime bundle could not load CUDA. The ONNX Runtime CUDA "
				+ "provider depends on cuDNN, so the bundle is incomplete and the run would have "
				+ "silently used the CPU instead.";
			logChange("warn", reason + "\nbinary: " + binaryPath
				+ "\nmethod: " + method
				+ "\n" + (error.stderrTail || ""));
			throw new Error(reason + "\n\nNothing was retried, and no method will use this "
				+ "bundle until it is replaced. Download the CPU binary in "
				+ "Settings > Linetime Aligner and select it.");
		}

		if (!soundDetectCrashed(error)) throw error;

		markLinetimeGpuBundleBroken("crash");
		const reason = error.signal === "SIGILL"
			? "The GPU Linetime bundle was compiled with CPU instructions this machine does not "
				+ "have (SIGILL). The Whisper step cannot run here."
			: "The GPU Linetime bundle crashed (" + (error.signal || "unknown signal") + ").";
		logChange("warn", reason + "\nbinary: " + binaryPath
			+ "\nmethod: " + method
			+ "\n" + (error.stderrTail || ""));
		throw new Error(reason + "\n\nNothing was retried. Download the CPU binary in "
			+ "Settings > Linetime Aligner and select it, or use Method A, which does not "
			+ "load a Whisper model.");
	}
}

// The user only cares that the number goes up, so progress is task based: every
// finished step advances a fixed slice. Creep may only move within the current
// step, never past it, so the bar cannot claim a step is done before it is.
const TIMESTAMPS_PROGRESS_STEPS = 5;

function setTimestampsProgress(fraction) {
	const btn = document.getElementById("generateTimestampsBtn");
	if (!btn) return;
	const clamped = Math.max(0, Math.min(1, fraction));
	btn.textContent = Math.round(clamped * 100) + "%";
}

function timestampsTask() {
	let done = 0;
	const span = 1 / TIMESTAMPS_PROGRESS_STEPS;
	return {
		complete() {
			done++;
			setTimestampsProgress(done * span);
		},
		creep(fractionOfStep) {
			setTimestampsProgress(done * span + span * Math.max(0, Math.min(0.9, fractionOfStep)));
		},
	};
}

function parseSrtLyrics(srtPath) {
	const raw = fs.readFileSync(srtPath, "utf8");
	const lines = [];
	for (const block of raw.split(/\r?\n\s*\r?\n/)) {
		const parts = block.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
		if (parts.length < 2) continue;
		if (!parts[1].includes("-->")) continue;
		const text = parts.slice(2).join(" ").trim();
		if (text) lines.push(text);
	}
	return lines;
}

async function transcribeLyrics(wavPath, language, onProgress) {
	const cliPath = getLinetimeWhisperCliPath();
	if (!fs.existsSync(cliPath)) {
		throw new Error("Whisper CLI not found. Download it in Settings > Linetime Aligner.");
	}

	const effective = getEffectiveLinetimeSelection();
	if (!effective.whisper) {
		throw new Error("No Whisper model installed. Download one in Settings > Linetime Aligner.");
	}
	const modelPath = getLinetimeWhisperPath(effective.whisper);
	if (!fs.existsSync(modelPath)) {
		throw new Error("Whisper model file not found. Re-download it in Settings > Linetime Aligner.");
	}

	const outPrefix = path.join(os.tmpdir(), "tarator_transcribe_" + Date.now());
	const args = ["-m", modelPath, "-f", wavPath, "-osrt", "-of", outPrefix, "-np"];
	if (language) args.push("-l", language);
	if (process.platform === "linux") args.push("-t", String(Math.max(1, os.cpus().length - 1)));
	if (process.platform === "win32") args.push("-ng");

	try {
		await new Promise((resolve, reject) => {
			const env = Object.assign({}, process.env);
			const libDir = getLinetimeWhisperCliLibDir();
			if (libDir && process.platform !== "win32") {
				env.LD_LIBRARY_PATH = libDir + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "");
			}
			const proc = spawn(cliPath, args, { windowsHide: true, cwd: getLinetimeWhisperCliFolder(), env });

			let stderr = "";
			proc.stderr.on("data", chunk => { stderr += chunk.toString(); });
			proc.stdout.on("data", chunk => {
				const text = chunk.toString();
				const m = text.match(/\[(\d{2}):(\d{2}):(\d{2})\.\d{3} --> (\d{2}):(\d{2}):(\d{2})\.\d{3}\]/g);
				if (m && m.length > 0) onProgress?.(m.length);
			});

			proc.on("close", code => {
				if (code === 0) resolve();
				else reject(new Error("whisper-cli exited with code " + code + "\n" + stderr));
			});
			proc.on("error", err => reject(err));
		});

		const srtPath = outPrefix + ".srt";
		if (!fs.existsSync(srtPath)) throw new Error("whisper-cli produced no output file.");
		const lines = parseSrtLyrics(srtPath);
		if (lines.length === 0) throw new Error("No speech was detected in this track.");
		return lines;
	} finally {
		for (const ext of [".srt", ".wav", ".json", ".txt"]) {
			try { fs.unlinkSync(outPrefix + ext); } catch (_) {}
		}
	}
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
	if (!isLinetimeBinaryInstalled(effective.binary)) {
		return await alertModal("Linetime is not installed. Go to Settings > Linetime Aligner to download it.");
	}

	const modelPath = getLinetimeModelPath(effective.model);
	if (!isLinetimeModelInstalled(effective.model)) {
		return await alertModal("Alignment model not found. Go to Settings > Linetime Aligner to download it.");
	}

	const tokenizerPath = getLinetimeTokenizerPath();
	if (!fs.existsSync(tokenizerPath)) {
		return await alertModal("Tokenizer not found. Go to Settings > Linetime Aligner to download it.");
	}

	const whisperPath = effective.whisper ? getLinetimeWhisperPath(effective.whisper) : null;
	const ffmpegPath = getLinetimeFfmpegPath();

	const methodChoice = await showMethodSelectionModal(plainLyrics, !!whisperPath, isLinetimeWhisperCliInstalled());
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
	if (libDir && process.platform !== "win32") {
		env.LD_LIBRARY_PATH = libDir + (env.LD_LIBRARY_PATH ? ":" + env.LD_LIBRARY_PATH : "");
	}

	const task = timestampsTask();
	setTimestampsProgress(0);
	const bail = async message => {
		btn.textContent = "Failed";
		logChange("warn", "Timestamp generation stopped: " + message);
		return await alertModal(message);
	};

	try {
		await convertToWav16k(audioPath, wavPath);
		task.complete();

		const caps = detectSoundDetectCaps();
		const cliInstalled = isLinetimeWhisperCliInstalled();

		// The released binary's plain "b" is Whisper DTW only. It skips CTC, drifts
		// across a track and eventually collapses several lines onto the same
		// timestamp. The hybrid runs CTC and merges, which is what this flow needs.
		// The source build's "b" already refines with CTC internally, so it stays.
		const alignerMethod = method === "c"
			? (caps.hasBoth ? "both" : "c")
			: (method === "b" && caps.hasBoth ? "both" : method);
		const alignerUsesWhisper = alignerMethod === "b" || alignerMethod === "c" || alignerMethod === "both";
		// The source CLI re-times its transcription with the CTC model inside method b
		// and silently keeps whisper's raw segment times when that model is absent.
		// So method b needs the alignment model too, or the timestamps are the coarse
		// per-segment ones rather than per-line.
		const alignerUsesCtc = alignerMethod === "a" || alignerMethod === "c"
			|| alignerMethod === "both" || (caps.newCli && alignerMethod === "b");

		// The source CLI transcribes through whisper-cli itself and rejects a lyrics
		// file for method b ("method b does not accept a lyrics file"). The released
		// CLI cannot transcribe at all, so that one still needs the text supplied.
		const cliTranscribes = caps.newCli && alignerMethod === "b";
		const passesLyrics = !cliTranscribes;

		let lyricsForAligner = plainLyrics;
		if (passesLyrics && (!lyricsForAligner || !lyricsForAligner.trim())) {
			try {
				const transcribed = await transcribeLyrics(wavPath, language, n => {
					task.creep(Math.min(0.9, n / 40));
				});
				lyricsForAligner = transcribed.join("\n");
			} catch (tErr) {
				return await bail(tErr.message ?? String(tErr));
			}
		}
		task.complete();
		if (passesLyrics) fs.writeFileSync(lyricsTmpPath, lyricsForAligner, "utf8");

		const args = passesLyrics ? [wavPath, lyricsTmpPath] : [wavPath];
		args.push("--method", alignerMethod);
		if (alignerUsesWhisper) {
			if (!whisperPath || !fs.existsSync(whisperPath)) {
				return await bail(`Whisper model not found for Method ${method.toUpperCase()}. Download it in Settings > Linetime Aligner.`);
			}
			args.push(caps.newCli ? "--model-c" : "--model-b", whisperPath);
			if (caps.newCli) {
				if (!cliInstalled) {
					return await bail("Whisper CLI not found. Go to Settings > Linetime Aligner to download it.");
				}
				args.push("--whisper-cli", getLinetimeWhisperCliPath());
			}
		}
		if (alignerUsesCtc) {
			args.push("--model-a", modelPath);
			args.push("--tokenizer", tokenizerPath);
		}
		if (language) args.push("--language", language);
		args.push("--ffmpeg", ffmpegPath);
		const provider = pickLinetimeProvider(effective.binary, method, caps);
		logChange("info", "Linetime run: binary=" + getLinetimeBinaryPath(effective.binary)
			+ "\nmethod=" + method + " aligner=" + alignerMethod + " provider=" + provider
			+ " cli=" + (caps.newCli ? "source" : "release"));
		args.push("--provider", provider, "-o", outputLrcPath);

		await runSoundDetect(args, env, task, method);
		task.complete();

		if (!fs.existsSync(outputLrcPath)) {
			return await bail("Generation completed but no output file was created.");
		}

		const syncedText = fs.readFileSync(outputLrcPath, "utf8").trim();
		if (!syncedText) {
			return await bail("Generation completed but LRC output was empty.");
		}
		task.complete();

		const applied = await stageTimestampsInEditor(syncedText, method);
		if (!applied) {
			btn.textContent = "Cancelled";
			return;
		}
		task.complete();

		btn.textContent = "Press Save";

		// The baseline datasets are left untouched on purpose so isCustomiseModalDirty
		// reports the staged result as unsaved and closing the modal offers to save.
		if (playingSongsID == songId && pipShowLyrics == 1) {
			updateMiniPlayer({
				lyrics: document.getElementById("lyricsArea").value,
				syncedLyrics: parseLrc(syncedText),
			});
			lastPipLyricsSongId = "";
		}

		if (lyricsPanelVisible && playingSongsID == songId) renderMainLyrics();
	} catch (error) {
		btn.textContent = "Failed";
		const detail = error.message || String(error);
		logChange("error", "Timestamp generation failed: " + detail);
		// The GPU incompatibility message is already a complete explanation with its
		// own next step, so do not wrap it in a generic prefix.
		await alertModal(detail.startsWith("The GPU Linetime bundle")
			? detail
			: "Failed to generate timestamps: " + detail);
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

function showMethodSelectionModal(plainLyrics, hasWhisperModel, hasWhisperCli) {
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
				desc: "Transcribes the audio from scratch with the Whisper CLI, then times it. Use when you don't have lyrics. Slow, and needs both a Whisper model and the Whisper CLI.",
				needsLang: true,
				disabledReason: hasLyrics
					? "Auto-generate is only available when no lyrics exist. Use the hybrid option to fix existing lyrics."
					: (!hasWhisperModel
						? "Download Whisper model in Settings > Linetime Aligner"
						: (!hasWhisperCli ? "Download Whisper CLI in Settings > Linetime Aligner" : null)),
				available: !hasLyrics && hasWhisperModel && hasWhisperCli
			},
			{ 
				id: "c", 
				name: "Auto-generate + fix my lyrics", 
				desc: "Runs Whisper and CTC alignment together, then merges the best result. Fixes typos and restores missing parts. Needs a Whisper model and the alignment model.",
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

// Strips LRC timestamps and id tags so the text fits back in the plain lyrics box.
function lrcToPlainLines(lrcText) {
	const lines = [];
	for (const raw of lrcText.split(/\r?\n/)) {
		let line = raw.trim();
		if (!line) continue;
		if (/^\[(ti|ar|al|au|by|re|ve|length|offset|la|lang):/i.test(line)) continue;
		line = line.replace(/^(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])+/, "").trim();
		if (line) lines.push(line);
	}
	return lines;
}

function escapeForPreview(text) {
	const escaped = String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return '<div class="comparison-empty" style="white-space:pre-wrap;font-family:monospace;font-size:12px;line-height:1.5;">' + escaped + "</div>";
}

// Stages the result in the editor and never writes the database. With nothing to
// compare against it applies directly. Otherwise the modal asks first, and
// cancelling discards the whole run.
async function stageTimestampsInEditor(syncedText, method) {
	const lyricsArea = document.getElementById("lyricsArea");
	const existingPlain = lyricsArea.value.trim();
	const generatedLines = lrcToPlainLines(syncedText);

	if (generatedLines.length === 0) {
		await alertModal("Generation produced no usable lyric lines.");
		return false;
	}

	// Method A keeps the words it was given, so it only has something to compare
	// when timestamps are already saved. B and C rewrite words, so any existing
	// lyrics are worth comparing against.
	const generatesWords = method === "b" || method === "c";
	const songId = document.getElementById("customiseModal").dataset.songID;
	const existingRow = (songLyricsCache.get(songId) || []).find(r => !r.language);
	const existingSynced = existingRow && existingRow.synced_lyrics ? existingRow.synced_lyrics.trim() : "";
	const hasSomethingToCompare = !!existingSynced || (generatesWords && !!existingPlain);

	if (hasSomethingToCompare) {
		// With timestamps already saved the comparison is about timing, so the
		// generated side must show its timestamps too.
		const choice = await comparisonModal({
			title: "Compare Timestamps — Method " + method.toUpperCase(),
			currentLabel: existingSynced ? "Saved" : "Current lyrics",
			fetchedLabel: "Generated",
			current: existingSynced || existingPlain || null,
			results: [existingSynced ? syncedText : generatedLines.join("\n")],
			renderPreview: escapeForPreview,
		});
		if (choice === null) return false;
	}

	// Method A must never overwrite the user's wording. B and C rewrite the words,
	// so the generated text is authoritative there.
	if (!existingPlain || generatesWords) {
		lyricsArea.value = generatedLines.join("\n");
		lyricsArea.dispatchEvent(new Event("input", { bubbles: true }));
	}

	renderLyricsTimestampCol(syncedText);
	return true;
}
