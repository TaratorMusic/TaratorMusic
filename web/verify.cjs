const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const assert = require("assert");

app.setPath("userData", fs.mkdtempSync(path.join(os.tmpdir(), "tarator-phone-check-")));
app.commandLine.appendSwitch("autoplay-policy", "document-user-activation-required");

function makeBrowserFixtures() {
	const bytes = new Uint8Array(2 * 1024 * 1024 + 44);
	const view = new DataView(bytes.buffer);
	const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
	text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVEfmt ");
	view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
	view.setUint32(24, 44100, true); view.setUint32(28, 88200, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
	text(36, "data"); view.setUint32(40, bytes.length - 44, true);
	const song = { id: "song", title: "New title", artist: "Artist", album: "", duration: 24, mime: "audio/wav", format: "wav", size: bytes.length, audioVersion: "new-audio", metaVersion: "new-meta", artworkVersion: "" };
	const check = (condition, message) => { if (!condition) throw new Error(message); };
	return { bytes, song, check };
}

async function firstBrowserChecks() {
	const { bytes, song, check } = makeBrowserFixtures();
	await phoneDB.open();
	if (navigator.locks) {
		await navigator.locks.request("tarator-phone-sync", async () => {
			let prepared = false, rejected = false;
			try { await phoneTransfer.run(async () => {}, async () => {}, async () => { prepared = true; }); } catch (_) { rejected = true; }
			check(rejected && !prepared, "Another window can edit a running queue");
		});
	}
	const old = { ...song, title: "Old title", audioVersion: "old-audio", metaVersion: "old-meta" };
	await phoneDB.commitSong({ id: song.id, song: old }, new Blob([bytes], { type: song.mime }), null);
	phoneState.saved = new Map([[old.id, old]]);
	phoneState.catalog = { songs: [song, { ...song, id: "new-song" }], playlists: [{ id: "list", name: "Playlist", songs: [song.id, "new-song"] }] };
	phoneState.selection = { songs: [], playlists: ["list"] };
	const plan = phonePlan();
	check(plan.additions.length == 1 && plan.updates.length == 1 && !plan.removals.length, "Selection comparison is incorrect");
	await phoneSaveSelection("songs", "new-song", true);
	check((await phoneDB.read("settings", "selection")).value.songs[0] == "new-song", "Selection was not persisted");
	phoneState.selection = { songs: [], playlists: [] };
	phoneState.compared = true;
	phoneRenderPlan();
	check(!document.querySelector("#removalChoices input").checked && !!await phoneDB.read("audio", song.id), "Comparison removed a file without confirmation");
	const checksum = await phoneDigest(new Blob([bytes]));
	const done = { ...song, id: "done", title: "Finished song" };
	for (const item of [done, song]) await phoneDB.resetPartial({ id: item.id, song: item, bytes: 0, state: "pending" });
	const calls = [];
	const request = async (url, options = {}) => {
		calls.push(url);
		if (url.includes("/info")) return Response.json({ size: bytes.length, audioVersion: song.audioVersion, sha256: checksum });
		const match = options.headers.Range.match(/bytes=(\d+)-(\d+)/);
		const start = Number(match[1]), end = Number(match[2]);
		if (url.includes("/song/") && start > 0) throw new Error("Simulated Wi-Fi interruption");
		return new Response(bytes.slice(start, end + 1), { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}`, ETag: `"${song.audioVersion}"` } });
	};
	await phoneTransfer.run(request, async () => {});
	check(!!await phoneDB.read("audio", "done"), "Finished download was lost");
	const job = await phoneDB.read("jobs", song.id);
	check(job.state == "failed" && job.bytes == 1024 * 1024, "Interrupted download did not save its completed chunk");
	check((await phoneDB.read("songs", song.id)).title == "Old title", "Interrupted update replaced old metadata");
	check((await phoneDB.read("audio", song.id)).version == "old-audio", "Interrupted update replaced old audio");
	await phoneDB.put("settings", { key: "catalog", value: { songs: [song, done], playlists: [] } });
	return { calls: calls.length, resumedOffset: job.bytes };
}

async function secondBrowserChecks() {
	const { bytes, song, check } = makeBrowserFixtures();
	check(!!await phoneDB.read("audio", "done"), "Completed file did not survive reopening");
	check((await phoneDB.read("jobs", song.id)).bytes == 1024 * 1024, "Partial download did not survive reopening");
	const offsets = [];
	const request = async (url, options) => {
		check(!url.includes("/info") && !url.includes("/done/"), "Resume retransferred a completed file or manifest");
		const match = options.headers.Range.match(/bytes=(\d+)-(\d+)/);
		const start = Number(match[1]), end = Number(match[2]);
		offsets.push(start);
		return new Response(bytes.slice(start, end + 1), { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}`, ETag: `"${song.audioVersion}"` } });
	};
	await phoneTransfer.run(request, async () => {});
	check(offsets[0] == 1024 * 1024 && !(await phoneDB.all("jobs")).length, "Transfer did not resume from its saved offset");
	check((await phoneDB.read("songs", song.id)).title == song.title, "Verified update was not committed");
	check(await phoneDigest((await phoneDB.read("audio", song.id)).blob) == await phoneDigest(new Blob([bytes])), "Saved audio checksum differs");
	const metadata = { ...song, title: "Renamed without audio", metaVersion: "metadata-only" };
	await phoneDB.put("jobs", { id: song.id, song: metadata, bytes: 0, state: "pending" });
	let requests = 0;
	await phoneTransfer.run(async () => { requests++; throw new Error("Metadata edit downloaded audio"); }, async () => {});
	check(requests == 0 && (await phoneDB.read("songs", song.id)).title == metadata.title, "Metadata-only update downloaded audio");
	phoneState.saved = new Map([[metadata.id, metadata]]);
	phoneState.catalog = { songs: [metadata], playlists: [] };
	phoneState.selection = { songs: [song.id], playlists: [] };
	check(phonePlan().additions.length == 0 && phonePlan().updates.length == 0, "Unchanged/renamed song looks like a new download");
	await phoneTransfer.run(async () => { requests++; }, async () => {});
	check(requests == 0, "Unchanged library transferred data");
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 160;
	canvas.getContext("2d").fillRect(0, 0, 160, 160);
	const cover = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg"));
	const withArtwork = { ...metadata, artworkVersion: "new-artwork", metaVersion: "artwork-only" };
	await phoneDB.put("jobs", { id: song.id, song: withArtwork, bytes: 0, state: "pending" });
	await phoneTransfer.run(async url => {
		check(url.includes("/artwork"), "Artwork change downloaded audio");
		return new Response(cover, { headers: { "Content-Type": "image/jpeg" } });
	}, async () => {});
	check((await phoneDB.read("artwork", song.id)).version == "new-artwork" && (await phoneDB.read("audio", song.id)).version == song.audioVersion, "Artwork update replaced audio");
	const bad = { ...song, audioVersion: "bad-update", metaVersion: "bad-meta" };
	await phoneDB.resetPartial({ id: song.id, song: bad, bytes: 0, state: "pending" });
	const checksum = await phoneDigest(new Blob([bytes]));
	await phoneTransfer.run(async (url, options) => {
		if (url.includes("/info")) return Response.json({ size: bytes.length, audioVersion: bad.audioVersion, sha256: checksum });
		const match = options.headers.Range.match(/bytes=(\d+)-(\d+)/);
		const start = Number(match[1]), end = Number(match[2]);
		const corrupt = bytes.slice(start, end + 1); corrupt[0] ^= 1;
		return new Response(corrupt, { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}`, ETag: `"${bad.audioVersion}"` } });
	}, async () => {});
	check((await phoneDB.read("jobs", song.id)).bytes == 0, "Corrupt chunks were retained");
	check((await phoneDB.read("audio", song.id)).version == song.audioVersion, "Corrupt update replaced a working file");
	await phoneDB.cancelJob(song.id);
	await phoneDB.resetPartial({ id: song.id, song: bad, bytes: 0, state: "pending" });
	const saveChunk = phoneDB.saveChunk;
	phoneDB.saveChunk = async () => { throw new DOMException("Storage full", "QuotaExceededError"); };
	await phoneTransfer.run(async (url, options) => {
		if (url.includes("/info")) return Response.json({ size: bytes.length, audioVersion: bad.audioVersion, sha256: checksum });
		const match = options.headers.Range.match(/bytes=(\d+)-(\d+)/);
		const start = Number(match[1]), end = Number(match[2]);
		return new Response(bytes.slice(start, end + 1), { status: 206, headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}`, ETag: `"${bad.audioVersion}"` } });
	}, async () => {});
	phoneDB.saveChunk = saveChunk;
	check((await phoneDB.read("jobs", song.id)).bytes == 0, "Failed chunk write advanced the saved offset");
	await phoneDB.cancelJob(song.id);
	await phoneDB.resetPartial({ id: song.id, song: bad, bytes: 0, state: "pending" });
	await phoneTransfer.run(async (url, options) => {
		if (url.includes("/info")) return Response.json({ size: bytes.length, audioVersion: bad.audioVersion, sha256: checksum });
		phoneTransfer.cancel();
		options.signal.throwIfAborted();
	}, async () => {});
	check((await phoneDB.read("jobs", song.id)).state == "pending", "Cancel did not preserve resumable work");
	await phoneDB.cancelJob(song.id);
	let aborted = false;
	try {
		await phoneDB.change(["songs", "audio"], transaction => {
			transaction.objectStore("songs").put(bad);
			transaction.objectStore("audio").put({ id: song.id, version: bad.audioVersion, blob: new Blob(["bad"]) });
			transaction.abort();
		});
	} catch (_) { aborted = true; }
	check(aborted && (await phoneDB.read("audio", song.id)).version == song.audioVersion && (await phoneDB.read("songs", song.id)).title == metadata.title, "Failed storage transaction lost the old copy");
	await phoneRefreshLocal();
	await navigator.serviceWorker.ready;
	const shellCaches = (await caches.keys()).filter(key => key.startsWith("tarator-phone-"));
	check(shellCaches.length == 1, "App shell cache is missing or outdated caches were retained");
	const keys = await (await caches.open(shellCaches[0])).keys();
	check(keys.length >= 11, "App shell was not fully cached");
	return { offsets, cachedFiles: keys.length };
}

async function offlineBrowserChecks() {
	const { check } = makeBrowserFixtures();
	let networkBlocked = false;
	try { await fetch("./network-probe.txt"); } catch (_) { networkBlocked = true; }
	check(networkBlocked, "Browser network requests are not blocked");
	check(document.querySelector("#page-home h1").textContent == "Main Menu" && !document.getElementById("page-home").hidden, "App shell did not reopen offline");
	await phoneRefreshLocal();
	check(phoneState.saved.size == 2, "Offline library did not reopen");
	await phonePlayer.play("song");
	await new Promise(resolve => setTimeout(resolve, 1000));
	const audio = document.getElementById("audio");
	check(!audio.paused && audio.readyState >= 3 && audio.duration > 0, "Offline Blob could not decode and start: " + JSON.stringify({ paused: audio.paused, position: audio.currentTime, duration: audio.duration, ready: audio.readyState, error: audio.error?.message }));
	check(document.querySelectorAll("audio").length == 1, "Playback created more than one audio element");
	check(navigator.mediaSession.metadata.title == "Renamed without audio", "Media Session metadata was not updated");
	await new Promise(resolve => {
		document.getElementById("audio").addEventListener("pause", resolve, { once: true });
		document.getElementById("audio").pause();
	});
	check(document.getElementById("togglePlayback").getAttribute("aria-label") == "Play", "Pause event did not update the control");
	return { songs: phoneState.saved.size, playingFrom: document.getElementById("audio").src.split(":")[0] };
}

async function main() {
	await app.whenReady();
	const server = http.createServer((request, response) => {
		const file = path.join(__dirname, new URL(request.url, "http://localhost").pathname.replace(/^\//, "") || "index.html");
		if (path.dirname(file) != __dirname) { response.writeHead(404).end(); return; }
		const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" }[path.extname(file)] || "text/plain";
		fs.readFile(file, (error, data) => { response.writeHead(error ? 404 : 200, { "Content-Type": type }); response.end(error ? "Not found" : data); });
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const window = new BrowserWindow({ show: false, width: 420, height: 900, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
	const url = `http://127.0.0.1:${server.address().port}/`;
	await window.loadURL(url);
	await window.webContents.executeJavaScript(`window.makeBrowserFixtures = ${makeBrowserFixtures.toString()}; true`);
	process.stdout.write("Selection, interrupted transfer: " + JSON.stringify(await window.webContents.executeJavaScript(`(${firstBrowserChecks.toString()})()`)) + "\n");
	await window.loadURL(url);
	await window.webContents.executeJavaScript(`window.makeBrowserFixtures = ${makeBrowserFixtures.toString()}; true`);
	process.stdout.write("Resume, versions, integrity, cancel, atomic storage: " + JSON.stringify(await window.webContents.executeJavaScript(`(${secondBrowserChecks.toString()})()`)) + "\n");
	if (process.env.TARATOR_PHONE_SCREENSHOT) {
		await window.webContents.executeJavaScript("phoneSetPage('connection'); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
		fs.writeFileSync(path.join(process.env.TARATOR_PHONE_SCREENSHOT, "phone-sync-top.png"), (await window.webContents.capturePage()).toPNG());
		await window.webContents.executeJavaScript("phoneSetPage('music'); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
		fs.writeFileSync(path.join(process.env.TARATOR_PHONE_SCREENSHOT, "phone-sync-library.png"), (await window.webContents.capturePage()).toPNG());
	}
	server.closeAllConnections();
	await new Promise(resolve => server.close(resolve));
	await window.loadURL(url);
	await window.webContents.executeJavaScript(`window.makeBrowserFixtures = ${makeBrowserFixtures.toString()}; true`);
	process.stdout.write("Offline reopen and playback: " + JSON.stringify(await window.webContents.executeJavaScript(`(${offlineBrowserChecks.toString()})()`, true)) + "\n");
	assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('audio').length"), 1);
	window.destroy();
	app.quit();
}

main().catch(error => { process.stderr.write(error.stack + "\n"); app.exit(1); });

