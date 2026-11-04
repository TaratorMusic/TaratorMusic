"use strict";

const phoneTransfer = (() => {
	const CHUNK_SIZE = 1024 * 1024;
	let controller;
	let running = false;

	function cancel() {
		controller?.abort();
	}

	function mediaPath(song, action, version = song.audioVersion) {
		return "/api/songs/" + encodeURIComponent(song.id) + "/" + action + "?v=" + encodeURIComponent(version);
	}

	async function downloadAudio(job, request, signal, progress) {
		if (!job.sha256) {
			const response = await request(mediaPath(job.song, "info"), { signal });
			const info = await response.json();
			if (info.size != job.song.size || info.audioVersion != job.song.audioVersion || !/^[a-f0-9]{64}$/.test(info.sha256)) throw new Error("Desktop audio changed. Compare again.");
			job.sha256 = info.sha256;
			await phoneDB.put("jobs", job);
		}
		while (job.bytes < job.song.size) {
			signal.throwIfAborted();
			const offset = job.bytes;
			const end = Math.min(offset + CHUNK_SIZE, job.song.size) - 1;
			const response = await request(mediaPath(job.song, "file"), { signal, headers: { Range: `bytes=${offset}-${end}`, "If-Range": `"${job.song.audioVersion}"` } });
			if (response.status != 206 || response.headers.get("Content-Range") != `bytes ${offset}-${end}/${job.song.size}` || response.headers.get("ETag") != `"${job.song.audioVersion}"`) throw new Error("Desktop did not return the requested audio range. Compare again.");
			const blob = await response.blob();
			if (blob.size != end - offset + 1) throw new Error("Incomplete audio chunk. Retry to resume.");
			signal.throwIfAborted();
			job.bytes = end + 1;
			try { await phoneDB.saveChunk(job, offset, blob); } catch (error) { job.bytes = offset; throw error; }
			await progress(job);
		}
		const blob = await phoneDB.partialBlob(job);
		if (blob.size != job.song.size || await phoneDigest(blob) != job.sha256) {
			await phoneDB.resetPartial(job);
			throw new Error("Audio checksum failed. Retry to download a clean copy.");
		}
		return blob;
	}

	async function transferSong(job, request, signal, progress) {
		job.state = "downloading";
		job.error = "";
		await phoneDB.put("jobs", job);
		await progress(job);
		const saved = await phoneDB.read("songs", job.id);
		let artwork;
		if (!job.song.artworkVersion) artwork = null;
		else if (saved?.artworkVersion != job.song.artworkVersion) {
			const response = await request(mediaPath(job.song, "artwork", job.song.artworkVersion), { signal });
			artwork = await response.blob();
			if (!artwork.size || artwork.size > 1024 * 1024 || !["image/jpeg", "image/svg+xml"].includes(artwork.type)) throw new Error("Invalid artwork download. Compare again.");
		}
		const needsAudio = !saved || saved.audioVersion != job.song.audioVersion;
		const blob = needsAudio ? await downloadAudio(job, request, signal, progress) : undefined;
		signal.throwIfAborted();
		await phoneDB.commitSong(job, blob, artwork);
	}

	async function withLock(action) {
		if (!navigator.locks) return await action();
		return await navigator.locks.request("tarator-phone-sync", { ifAvailable: true }, async lock => {
			if (!lock) throw new Error("Sync is running in another TaratorMusic window.");
			return await action();
		});
	}

	async function run(request, progress, prepare) {
		if (running) return;
		running = true;
		controller = new AbortController();
		const signal = controller.signal;
		try {
			const work = async () => {
				if (prepare) await prepare();
				const jobs = await phoneDB.all("jobs");
				for (const job of jobs) {
					if (signal.aborted) break;
					try {
						await transferSong(job, request, signal, progress);
					} catch (error) {
						job.state = signal.aborted ? "pending" : "failed";
						job.error = signal.aborted ? "" : error.message;
						await phoneDB.put("jobs", job);
					}
					await progress();
				}
			};
			await withLock(work);
		} finally {
			running = false;
			controller = null;
		}
	}

	return { run, cancel, edit: withLock, get running() { return running; } };
})();
