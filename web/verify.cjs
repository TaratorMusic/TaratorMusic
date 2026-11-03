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

async function setupBrowserChecks() {
	const { check } = makeBrowserFixtures();
	const originalFetch = window.fetch;
	const device = document.getElementById("setupDevice").value;
	const calls = [];
	let scenario = "expired";
	window.fetch = async (url, options) => {
		calls.push({ url, ...options });
		if (scenario == "network") throw new TypeError("Failed to fetch");
		if (options.method == "OPTIONS") return new Response(null, { status: scenario == "preview" ? 200 : 204 });
		return new Response("Pairing rejected", { status: scenario == "limited" ? 429 : scenario == "full" ? 409 : 401 });
	};
	try {
		check(await phoneCheckConnection(), "Connection precheck did not accept the sync server");
		document.getElementById("pairCode").value = "123 456";
		for (const test of [["expired", "Get a new pairing code"], ["limited", "Wait one minute before trying again"], ["full", "The desktop's device list is full"]]) {
			scenario = test[0];
			calls.length = 0;
			await phonePair({ preventDefault() {} });
			check(calls[0].method == "OPTIONS" && calls[1].method == "POST", "Pairing consumed a code before checking the connection");
			check(JSON.parse(calls[1].body).code == "123456", "Pasted code spaces were not removed");
			check(document.getElementById("setupFeedbackTitle").textContent == test[1] && document.getElementById("setupHelp").hidden, "Pairing failure showed unrelated certificate troubleshooting");
		}
		scenario = "network";
		calls.length = 0;
		await phonePair({ preventDefault() {} });
		check(calls.length == 1 && calls[0].method == "OPTIONS", "A blocked connection used a pairing attempt");
		check(!document.getElementById("setupHelp").hidden && document.getElementById("setupFixes").children.length > 0 && !document.getElementById("pairSubmit").disabled, "Network failure did not provide fixes or allow retry");
		scenario = "preview";
		check(!await phoneCheckConnection() && document.getElementById("setupFeedbackTitle").textContent.includes("not responding as the sync server"), "A static preview server passed the connection check");
		document.getElementById("server").value = location.origin.replace("http:", "https:");
		check(!await phoneCheckConnection() && document.getElementById("setupFeedbackText").textContent.includes("Keep http://"), "Incorrect HTTPS for local PC testing was not explained");
		document.getElementById("setupDevice").value = "windows";
		phoneSetupDevice();
		check(document.getElementById("phoneInstructions").textContent.includes("Current User"), "Windows received phone certificate instructions");
		return { preflight: true, actionableErrors: 5, formattedCodes: true };
	} finally {
		window.fetch = originalFetch;
		document.getElementById("server").value = location.origin;
		document.getElementById("server").removeAttribute("aria-invalid");
		document.getElementById("pairCode").value = "";
		document.getElementById("pairCode").removeAttribute("aria-invalid");
		document.getElementById("setupDevice").value = device;
		phoneSetupDevice();
		document.getElementById("setupFeedback").hidden = true;
	}
}

async function firstBrowserChecks() {
	const { bytes, song, check } = makeBrowserFixtures();
	await phoneDB.open();
	check(phoneAddress() == location.origin && document.getElementById("setupLink").hidden, "Local testing did not use its own origin without certificate setup");
	for (const address of ["http://192.168.1.20:8080", "http://127.0.0.1:1", location.origin + "/other", "http://user:password@" + location.host]) {
		document.getElementById("server").value = address;
		let rejected = false;
		try { phoneAddress(); } catch (_) { rejected = true; }
		check(rejected, "Unsafe local desktop address was accepted: " + address);
	}
	document.getElementById("server").value = "https://192.168.1.20:8443";
	check(phoneAddress() == "https://192.168.1.20:8443", "HTTPS desktop addresses stopped working");
	document.getElementById("server").value = location.origin;
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
	check(plan.additions.length == 1 && plan.updates.length == 1 && !Object.hasOwn(plan, "removals"), "Selection comparison is incorrect");
	phoneRenderChoices();
	check(document.getElementById("selectAllSongs").checked, "Playlist selection was not included in select-all state");
	await phoneSelectAllSongs(false);
	check(phoneWanted().size == 0 && !phoneState.selection.playlists.length && !document.querySelector("#playlistChoices input").checked, "Deselecting all left a playlist selected");
	phoneState.catalog.songs.push({ ...song, id: "unsupported", mime: "audio/x-tarator-unsupported" });
	document.getElementById("catalogSearch").value = "no matching songs";
	await phoneSelectAllSongs(true);
	check(phoneState.selection.songs.length == 2 && !phoneState.selection.songs.includes("unsupported") && !document.getElementById("songChoices").children.length, "Select all did not include supported songs outside the search");
	check((await phoneDB.read("settings", "selection")).value.songs.length == 2 && document.getElementById("selectAllSongs").checked, "Bulk selection was not persisted");
	await phoneSaveSelection("songs", "new-song", false);
	check(document.getElementById("selectAllSongs").indeterminate && !document.getElementById("selectAllSongs").checked, "Partial selection did not update select-all state");
	check(!!await phoneDB.read("audio", song.id), "Changing bulk selection deleted saved audio");
	phoneState.catalog.songs.pop();
	phoneState.selection = { songs: [], playlists: ["list"] };
	document.getElementById("catalogSearch").value = "";
	phoneRenderChoices();
	await phoneSaveSelection("songs", "new-song", true);
	check((await phoneDB.read("settings", "selection")).value.songs[0] == "new-song", "Selection was not persisted");
	phoneState.selection = { songs: [], playlists: [] };
	phoneState.compared = true;
	phoneRenderPlan();
	check(!document.querySelector("#page-connection #removalChoices") && !document.querySelector("#page-connection #removeSongs") && !!await phoneDB.read("audio", song.id), "Connection offered song deletion or removed a saved file");
	phoneState.catalog.songs = phoneState.catalog.songs.filter(item => item.id != song.id);
	phoneRenderPlan();
	check(!phonePlan().additions.length && !phonePlan().updates.length && !!await phoneDB.read("audio", song.id), "A desktop-deleted or deselected song was removed from the phone");
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
	const originalPlay = audio.play;
	const originalRead = phoneDB.read;
	let startedImmediately = false;
	let readsBeforeStart = 0;
	phoneDB.read = async (...args) => {
		if (!startedImmediately) readsBeforeStart++;
		return await originalRead(...args);
	};
	audio.play = function() { startedImmediately = true; return originalPlay.call(this); };
	try {
		const advancing = new Promise((resolve, reject) => {
			const changed = () => {
				if (phonePlayer.currentId != "done" || audio.currentTime <= 0 || audio.paused) return;
				clearTimeout(timer);
				audio.removeEventListener("timeupdate", changed);
				resolve();
			};
			const timer = setTimeout(() => { audio.removeEventListener("timeupdate", changed); reject(new Error("Next track title changed but audio did not advance")); }, 4000);
			audio.addEventListener("timeupdate", changed);
		});
		audio.dispatchEvent(new Event("ended"));
		const synchronous = startedImmediately && !readsBeforeStart;
		await advancing;
		check(synchronous, "Next-track playback waited for storage after the ended event");
	} finally {
		audio.play = originalPlay;
		phoneDB.read = originalRead;
	}
	await phonePlayer.play("song");
	const actions = new Map();
	const session = navigator.mediaSession;
	const originalHandler = session.setActionHandler;
	session.setActionHandler = function(name, handler) { actions.set(name, handler); return originalHandler.call(this, name, handler); };
	try {
		for (const event of ["visibilitychange", "pageshow"]) {
			actions.clear();
			(event == "visibilitychange" ? document : window).dispatchEvent(new Event(event));
			check(typeof actions.get("nexttrack") == "function" && typeof actions.get("previoustrack") == "function", "Track controls were not restored on " + event);
		}
		await actions.get("nexttrack")();
		check(phonePlayer.currentId == "done" && !audio.paused && session.metadata.title == "Finished song", "System Next did not play the next saved song");
		await actions.get("previoustrack")();
		check(phonePlayer.currentId == "song" && !audio.paused && session.playbackState == "playing", "System Previous did not restore the previous song");
	} finally { session.setActionHandler = originalHandler; }
	const audioSession = navigator.audioSession;
	audioSession.state = "interrupted";
	audioSession.dispatchEvent(new Event("statechange"));
	check(audio.paused && session.playbackState == "paused" && document.getElementById("togglePlayback").getAttribute("aria-label") == "Play", "Audio interruption did not pause playback and controls");
	const interruptedId = phonePlayer.currentId;
	audio.dispatchEvent(new Event("ended"));
	check(phonePlayer.currentId == interruptedId && audio.paused, "An interruption advanced the queue");
	audioSession.state = "active";
	audioSession.dispatchEvent(new Event("statechange"));
	check(audio.paused, "Playback resumed automatically after another app took audio");
	await phonePlayer.play(interruptedId);
	check(!audio.paused && audioSession.type == "playback", "Playback could not be resumed after an interruption");
	await new Promise(resolve => {
		document.getElementById("audio").addEventListener("pause", resolve, { once: true });
		document.getElementById("audio").pause();
	});
	check(document.getElementById("togglePlayback").getAttribute("aria-label") == "Play", "Pause event did not update the control");
	return { songs: phoneState.saved.size, playingFrom: document.getElementById("audio").src.split(":")[0], preparedNextAdvances: true, interruptionPauses: true };
}

async function shuffleBrowserChecks() {
	const { check } = makeBrowserFixtures();
	const audio = document.getElementById("audio");
	const button = document.getElementById("shufflePlayback");
	const originalRandom = Math.random;
	const source = await phoneDB.read("songs", "song");
	const stored = await phoneDB.read("audio", "song");
	for (const id of ["third", "outside"]) {
		const song = { ...source, id, title: id + " shuffle test", artworkVersion: "" };
		await phoneDB.commitSong({ id, song }, stored.blob, null);
	}
	await phoneRefreshLocal();
	const songs = ["song", "done", "third"].map(id => phoneState.saved.get(id));
	const changeTrack = async action => {
		await new Promise((resolve, reject) => {
			const started = () => { clearTimeout(timer); resolve(); };
			const timer = setTimeout(() => { audio.removeEventListener("playing", started); reject(new Error("Shuffle track did not start")); }, 4000);
			audio.addEventListener("playing", started, { once: true });
			action();
		});
		await phoneRefreshLocal();
	};
	try {
		Math.random = () => 0.999;
		phonePlayer.setLibrary(songs, "shuffle-test");
		await phonePlayer.play("song");
		await phoneRefreshLocal();
		if (button.getAttribute("aria-pressed") == "true") button.click();
		button.click();
		check(button.getAttribute("aria-pressed") == "true" && localStorage.getItem("taratorShuffle") == "1", "Shuffle toggle was not enabled or saved");
		await changeTrack(() => document.getElementById("nextTrack").click());
		check(phonePlayer.currentId == "third", "Shuffle followed sequential order instead of a random track");
		await changeTrack(() => document.getElementById("previousTrack").click());
		check(phonePlayer.currentId == "song", "Previous did not return to the played track");
		await changeTrack(() => document.getElementById("nextTrack").click());
		check(phonePlayer.currentId == "third", "Next did not follow playback history after Previous");
		await changeTrack(() => document.getElementById("nextTrack").click());
		check(phonePlayer.currentId == "done", "Shuffle repeated a song before completing its cycle");
		await changeTrack(() => document.getElementById("nextTrack").click());
		check(phonePlayer.currentId != "done" && songs.some(song => song.id == phonePlayer.currentId), "New shuffle cycle repeated immediately or left the current playlist");
		const beforeEnded = phonePlayer.currentId;
		await changeTrack(() => audio.dispatchEvent(new Event("ended")));
		check(phonePlayer.currentId != beforeEnded && phonePlayer.currentId != "outside", "Automatic next track ignored shuffle or playlist scope");
		button.click();
		await phonePlayer.play("song");
		await phoneRefreshLocal();
		await changeTrack(() => document.getElementById("nextTrack").click());
		check(phonePlayer.currentId == "done" && localStorage.getItem("taratorShuffle") == "0", "Turning shuffle off did not restore sequential playback");
		phonePlayer.setLibrary([phoneState.saved.get("done")], "single");
		check(button.disabled, "Shuffle was enabled for a one-song queue");
		phonePlayer.setLibrary(songs, "shuffle-test");
		button.click();
		await phonePlayer.playFirst();
		await phoneRefreshLocal();
		check(phonePlayer.currentId == "third", "Play all ignored enabled shuffle");
		audio.pause();
		return { cycle: true, previous: true, automaticNext: true, scope: true, playAll: true };
	} finally { Math.random = originalRandom; }
}

async function libraryRemovalBrowserChecks() {
	const { check } = makeBrowserFixtures();
	const originalConfirm = window.confirm;
	const originalFetch = window.fetch;
	let requests = 0;
	window.fetch = async () => { requests++; throw new Error("Removal must work offline"); };
	try {
		await phoneRefreshLocal();
		phoneState.library.view = "songs";
		phoneState.library.playlist = "";
		document.getElementById("librarySearch").value = "third shuffle test";
		phoneSetPage("music");
		phoneRenderLibrary();
		const choices = [...document.querySelectorAll("#page-music #removalChoices input")];
		check(choices.length == 1 && choices[0].dataset.songId == "third" && !choices[0].checked, "My Music removal did not follow the search or started checked");
		const song = phoneState.saved.get("third");
		await phoneDB.resetPartial({ id: song.id, song, state: "pending", bytes: 0 });
		await phoneDB.saveChunk({ id: song.id, song, state: "pending", bytes: 4 }, 0, new Blob(["test"]));
		await phoneDB.put("artwork", { id: song.id, version: "test", blob: new Blob(["artwork"]) });
		phonePlayer.setLibrary([...phoneState.saved.values()]);
		await phonePlayer.play(song.id);
		await phoneRefreshLocal();
		const select = () => { document.querySelector("#removalChoices input").checked = true; };
		select();
		window.confirm = () => false;
		await phoneRemoveSongs();
		check(!!await phoneDB.read("audio", song.id), "Cancelling removal deleted a saved song");
		window.confirm = () => true;
		if (navigator.locks) {
			await navigator.locks.request("tarator-phone-sync", async () => {
				let rejected = false;
				try { await phoneRemoveSongs(); } catch (_) { rejected = true; }
				check(rejected && !!await phoneDB.read("audio", song.id), "Removal changed files during another window's transfer");
			});
		}
		select();
		const others = [...phoneState.saved.keys()].filter(id => id != song.id);
		await phoneRemoveSongs();
		for (const store of ["songs", "audio", "artwork", "jobs"]) check(!await phoneDB.read(store, song.id), "Removal left data in " + store);
		check(!await phoneDB.read("chunks", [song.id, 0]), "Removal left unfinished chunks");
		check(!phonePlayer.currentId && document.getElementById("audio").paused, "Removing the current song left playback active");
		for (const id of others) check(!!await phoneDB.read("audio", id) && !!await phoneDB.read("songs", id), "Removal changed an unchecked song");
		check(!requests, "Local removal requested the desktop");
		check(document.getElementById("removeSongs").disabled && !document.querySelector("#removalChoices input"), "The removed song remained available for deletion");
		return { filtered: true, confirmed: true, offline: true, uncheckedRetained: true, playbackStopped: true };
	} finally {
		window.confirm = originalConfirm;
		window.fetch = originalFetch;
	}
}

async function main() {
	await app.whenReady();
	const server = http.createServer((request, response) => {
		const file = path.join(__dirname, new URL(request.url, "http://localhost").pathname.replace(/^\//, "") || "index.html");
		if (path.dirname(file) != __dirname) { response.writeHead(404).end(); return; }
		const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" }[path.extname(file)] || "text/plain";
		fs.readFile(file, (error, data) => {
			response.writeHead(error ? 404 : 200, { "Content-Type": type });
			if (!error && path.extname(file) == ".html") data = data.toString().replace("<head>", '<head><script>const testAudioSession = new EventTarget(); testAudioSession.state = "inactive"; Object.defineProperty(navigator, "audioSession", { value: testAudioSession });</script>');
			response.end(error ? "Not found" : data);
		});
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	const window = new BrowserWindow({ show: false, width: 420, height: 900, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
	const url = `http://127.0.0.1:${server.address().port}/`;
	await window.loadURL(url);
	await window.webContents.executeJavaScript(`window.makeBrowserFixtures = ${makeBrowserFixtures.toString()}; true`);
	process.stdout.write("Guided setup, connection checks, pairing errors: " + JSON.stringify(await window.webContents.executeJavaScript(`(${setupBrowserChecks.toString()})()`)) + "\n");
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
	process.stdout.write("Shuffle playback: " + JSON.stringify(await window.webContents.executeJavaScript(`(${shuffleBrowserChecks.toString()})()`, true)) + "\n");
	await window.loadURL(url);
	assert.equal(await window.webContents.executeJavaScript("phoneRefreshLocal().then(() => document.getElementById('shufflePlayback').getAttribute('aria-pressed'))"), "true");
	assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('audio').length"), 1);
	await window.webContents.executeJavaScript(`window.makeBrowserFixtures = ${makeBrowserFixtures.toString()}; true`);
	process.stdout.write("My Music removal: " + JSON.stringify(await window.webContents.executeJavaScript(`(${libraryRemovalBrowserChecks.toString()})()`, true)) + "\n");
	window.destroy();
	app.quit();
}

main().catch(error => { process.stderr.write(error.stack + "\n"); app.exit(1); });

