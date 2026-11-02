"use strict";

const phoneState = { connection: null, catalog: { songs: [], playlists: [] }, selection: { songs: [], playlists: [] }, saved: new Map(), jobs: new Map(), compared: false, transferTotal: 0, recentPlaylists: [], recentSongs: [], songPlaylists: new Map(), library: { sort: "name", view: "songs", playlist: "" }, theme: "green" };
try { phoneState.connection = JSON.parse(localStorage.getItem("taratorConnection") || "null"); } catch (_) {}
const phoneElement = id => document.getElementById(id);

function phoneMessage(message) {
	phoneElement("message").textContent = message;
	phoneElement("message").hidden = !message;
}

function phoneSetPage(page) {
	if (!["home", "music", "connection", "settings"].includes(page)) page = "home";
	for (const tab of document.querySelectorAll("[data-page]")) {
		const active = tab.dataset.page == page;
		tab.setAttribute("aria-selected", String(active));
		tab.tabIndex = active ? 0 : -1;
		phoneElement("page-" + tab.dataset.page).hidden = !active;
	}
	if (location.hash != "#" + page) history.replaceState(null, "", "#" + page);
	window.scrollTo(0, 0);
}

function phoneAddress() {
	const url = new URL(phoneElement("server").value.trim());
	const parts = url.hostname.split(".").map(Number);
	const privateIP = parts.length == 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
		(parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31) || parts[0] == 127);
	if (url.protocol != "https:" || !privateIP || url.username || url.password || url.search || url.hash || url.pathname != "/") throw new Error("Use the desktop's private IPv4 HTTPS address, including :8443.");
	return url.origin;
}

async function phoneRequest(path, options = {}) {
	if (!phoneState.connection) throw new Error("Pair this phone first.");
	const response = await fetch(phoneState.connection.server + path, {
		...options, mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
		headers: { ...options.headers, Authorization: "Bearer " + phoneState.connection.token },
	});
	if (!response.ok) throw new Error(await response.text());
	return response;
}

async function phoneDigest(blob) {
	const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
	return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}

async function phonePair(event) {
	event.preventDefault();
	try {
		const server = phoneAddress();
		phoneMessage("Connecting. Allow local network access if asked.");
		const response = await fetch(server + "/api/pair", {
			method: "POST", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error",
			headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: phoneElement("pairCode").value.trim() }),
		});
		if (!response.ok) throw new Error(await response.text());
		const paired = await response.json();
		const bound = await phoneDB.read("settings", "desktopId");
		if (bound && bound.value != paired.desktopId) throw new Error("This library belongs to another desktop. Erase this phone's library before pairing a different desktop.");
		await phoneDB.put("settings", { key: "desktopId", value: paired.desktopId });
		phoneState.connection = { server, ...paired };
		phoneElement("connectionStatus").textContent = "Desktop paired";
		localStorage.setItem("taratorConnection", JSON.stringify(phoneState.connection));
		phoneElement("pairCode").value = "";
		phoneMessage("Paired. Transfer the test file next.");
	} catch (error) {
		phoneMessage(error.message + " Check the certificate, Wi-Fi, desktop sharing, and browser local network permission.");
	}
}

async function phoneTest() {
	try {
		phoneReconnect();
		const response = await phoneRequest("/api/test");
		const blob = await response.blob();
		if (blob.size != Number(response.headers.get("Content-Length")) || await phoneDigest(blob) != response.headers.get("X-Checksum-SHA256")) throw new Error("Test file verification failed.");
		phoneMessage("Test file received and SHA-256 verified. Phone and desktop can talk over HTTPS.");
	} catch (error) {
		phoneMessage(error.message + " Open certificate setup and check local network permissions.");
	}
}

function phoneSetupLink() {
	try {
		const setup = new URL(phoneAddress());
		setup.protocol = "http:";
		setup.port = "8444";
		phoneElement("setupLink").href = setup.href;
		phoneElement("setupLink").hidden = false;
	} catch (_) {
		phoneElement("setupLink").hidden = true;
	}
}

phoneElement("pairForm").addEventListener("submit", phonePair);
phoneElement("testConnection").addEventListener("click", phoneTest);
phoneElement("server").addEventListener("input", phoneSetupLink);
if (phoneState.connection) phoneElement("server").value = phoneState.connection.server;
phoneSetupLink();
const isApplePhone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform == "MacIntel" && navigator.maxTouchPoints > 1);
phoneElement("phoneInstructions").textContent = isApplePhone
	? "In Safari, install the desktop .mobileconfig profile, then enable Full Trust in Settings > General > About > Certificate Trust Settings."
	: "On Android, set a screen lock. Install the desktop .crt file as a CA certificate in Security > Encryption & credentials, then restart Chrome.";

function phoneSize(bytes) {
	return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function phoneAction(action) {
	return async () => {
		try { await action(); } catch (error) { phoneMessage(error.message); }
	};
}

function phoneReconnect() {
	if (!phoneState.connection) throw new Error("Pair this phone first.");
	phoneState.connection.server = phoneAddress();
	localStorage.setItem("taratorConnection", JSON.stringify(phoneState.connection));
}

function phoneWanted() {
	const ids = new Set(phoneState.selection.songs);
	for (const playlist of phoneState.catalog.playlists) {
		if (phoneState.selection.playlists.includes(playlist.id)) for (const id of playlist.songs) ids.add(id);
	}
	return ids;
}

function phonePlan() {
	const wanted = phoneWanted();
	const additions = [], updates = [];
	for (const song of phoneState.catalog.songs) {
		if (!wanted.has(song.id) || !phonePlayer.supported(song)) continue;
		const saved = phoneState.saved.get(song.id);
		if (!saved) additions.push(song);
		else if (saved.audioVersion != song.audioVersion || saved.metaVersion != song.metaVersion) updates.push(song);
	}
	const available = new Set(phoneState.catalog.songs.map(song => song.id));
	const removals = [...phoneState.saved.values()].filter(song => !wanted.has(song.id) || !available.has(song.id));
	return { additions, updates, removals, wanted };
}

function phoneSongStatus(song) {
	if (!phonePlayer.supported(song)) return "not supported on this phone";
	const job = phoneState.jobs.get(song.id);
	if (job) return (job.state == "downloading" && !phoneTransfer.running ? "pending" : job.state) + (job.error ? ": " + job.error : "");
	const saved = phoneState.saved.get(song.id);
	if (!saved) return "pending";
	if (saved.audioVersion != song.audioVersion || saved.metaVersion != song.metaVersion) return "update available";
	return "saved";
}

async function phoneSaveSelection(kind, id, checked) {
	const values = new Set(phoneState.selection[kind]);
	if (checked) values.add(id);
	else values.delete(id);
	phoneState.selection[kind] = [...values];
	await phoneDB.put("settings", { key: "selection", value: phoneState.selection });
	phoneRenderPlan();
}

function phoneChoice(name, checked, changed, detail = "") {
	const row = document.createElement("label");
	row.className = "song-row";
	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.checked = checked;
	checkbox.addEventListener("change", phoneAction(() => changed(checkbox.checked)));
	const text = document.createElement("span");
	text.textContent = name;
	if (detail) { const small = document.createElement("small"); small.textContent = detail; text.append(small); }
	row.append(checkbox, text);
	return row;
}

function phoneRenderChoices() {
	const lists = phoneElement("playlistChoices");
	lists.replaceChildren();
	for (const playlist of phoneState.catalog.playlists) {
		lists.append(phoneChoice(playlist.name, phoneState.selection.playlists.includes(playlist.id), checked => phoneSaveSelection("playlists", playlist.id, checked), playlist.songs.length + " songs"));
	}
	phoneRenderSongChoices();
}

function phoneRenderSongChoices() {
	const songs = phoneElement("songChoices");
	songs.replaceChildren();
	const search = phoneElement("catalogSearch").value.toLowerCase();
	for (const song of phoneState.catalog.songs) {
		if (!(song.title + " " + song.artist).toLowerCase().includes(search)) continue;
		const detail = [song.artist, phoneSize(song.size), phoneSongStatus(song)].filter(Boolean).join(" · ");
		const row = phoneChoice(song.title, phoneState.selection.songs.includes(song.id), checked => phoneSaveSelection("songs", song.id, checked), detail);
		row.querySelector("input").disabled = !phonePlayer.supported(song);
		songs.append(row);
	}
}

function phoneRenderPlan() {
	if (!phoneState.compared) return;
	phoneElement("comparison").hidden = false;
	const plan = phonePlan();
	const transfers = [...plan.additions, ...plan.updates];
	const audioBytes = transfers.reduce((total, song) => total + (phoneState.saved.get(song.id)?.audioVersion == song.audioVersion ? 0 : song.size), 0);
	phoneElement("comparisonInfo").textContent = `${plan.additions.length} additions · ${plan.updates.length} updates · ${plan.removals.length} possible removals. Audio: ${phoneSize(audioBytes)}, plus small artwork files.`;
	const items = phoneElement("comparisonItems");
	items.replaceChildren();
	for (const song of transfers) {
		const item = document.createElement("p");
		const saved = phoneState.saved.get(song.id);
		item.textContent = `${saved ? "Update" : "Add"}: ${song.title} (${saved?.audioVersion == song.audioVersion ? "metadata / artwork only" : phoneSize(song.size) + " audio"})`;
		items.append(item);
	}
	const removals = phoneElement("removalChoices");
	removals.replaceChildren();
	for (const song of plan.removals) {
		const row = phoneChoice(song.title, false, () => {});
		row.querySelector("input").dataset.songId = song.id;
		removals.append(row);
	}
	phoneElement("startSync").disabled = !transfers.length || phoneTransfer.running;
	phoneElement("removeSongs").disabled = !plan.removals.length || phoneTransfer.running;
}

async function phoneCompare() {
	if (phoneTransfer.running) throw new Error("Cancel the current transfer before comparing again.");
	phoneReconnect();
	phoneMessage("Reading desktop library. Allow local network access if asked.");
	const response = await phoneRequest("/api/catalog");
	const catalog = await response.json();
	if (catalog.desktopId != phoneState.connection.desktopId) throw new Error("This is a different desktop. Pair with the original desktop.");
	await phoneDB.put("settings", { key: "catalog", value: catalog });
	phoneState.catalog = catalog;
	phoneState.compared = true;
	await phoneRefreshLocal();
	phoneRenderChoices();
	phoneRenderPlan();
	phoneMessage("Review the changes, then copy additions and updates. Unsupported songs are skipped.");
}

async function phoneStartSync() {
	if (!phoneState.compared || phoneTransfer.running) return;
	const plan = phonePlan();
	await phoneRunQueue(async () => {
		for (const job of await phoneDB.all("jobs")) if (!plan.wanted.has(job.id)) await phoneDB.cancelJob(job.id);
		for (const song of [...plan.additions, ...plan.updates]) {
			let job = await phoneDB.read("jobs", song.id);
			if (!job || job.song.audioVersion != song.audioVersion) {
				job = { id: song.id, song, bytes: 0, state: "pending" };
				await phoneDB.resetPartial(job);
			} else {
				job.song = song;
				job.state = "pending";
				await phoneDB.put("jobs", job);
			}
		}
	});
}

async function phoneRefreshLocal() {
	phoneState.saved = new Map((await phoneDB.all("songs")).map(song => [song.id, song]));
	phoneState.jobs = new Map((await phoneDB.all("jobs")).map(job => [job.id, job]));
	phoneRenderSaved();
}

async function phoneQueueProgress(activeJob) {
	const jobs = await phoneDB.all("jobs");
	phoneState.jobs = new Map(jobs.map(job => [job.id, job]));
	let remaining = 0;
	for (const job of jobs) if (phoneState.saved.get(job.id)?.audioVersion != job.song.audioVersion) remaining += Math.max(0, job.song.size - job.bytes);
	const total = Math.max(phoneState.transferTotal, remaining);
	phoneElement("transferProgress").max = Math.max(1, total);
	phoneElement("transferProgress").value = total ? total - remaining : jobs.length ? 0 : 1;
	phoneElement("queueInfo").textContent = `${phoneSize(total - remaining)} of ${phoneSize(total)} · ${jobs.length} pending${activeJob ? " · " + activeJob.song.title : ""}${jobs.some(job => job.state == "failed") ? " · Some transfers failed. Press retry." : ""}`;
	if (!activeJob) {
		await phoneRefreshLocal();
		phoneRenderSongChoices();
		phoneRenderPlan();
		await phoneStorageInfo();
	}
}

async function phoneRunQueue(prepare) {
	if (phoneTransfer.running) return;
	phoneReconnect();
	for (const id of ["startSync", "resumeSync", "discardQueue", "compareDesktop", "removeSongs", "erasePhone"]) phoneElement(id).disabled = true;
	phoneElement("cancelSync").disabled = false;
	try {
		phoneMessage("Syncing. Keep this app open. Cancel keeps verified files and completed chunks.");
		await phoneTransfer.run(phoneRequest, phoneQueueProgress, async () => {
			if (prepare) await prepare();
			const jobs = await phoneDB.all("jobs");
			phoneState.transferTotal = jobs.reduce((total, job) => total + (phoneState.saved.get(job.id)?.audioVersion == job.song.audioVersion ? 0 : job.song.size), 0);
		});
		phoneMessage("Queue stopped. Saved songs are ready offline. Resume / retry continues unfinished transfers.");
	} finally {
		for (const id of ["resumeSync", "discardQueue", "compareDesktop", "erasePhone"]) phoneElement(id).disabled = false;
		phoneElement("cancelSync").disabled = true;
		await phoneQueueProgress();
		phoneRenderPlan();
	}
}

async function phoneRemoveSongs() {
	if (phoneTransfer.running) return;
	const ids = [...phoneElement("removalChoices").querySelectorAll("input:checked")].map(input => input.dataset.songId);
	if (!ids.length || !confirm(`Remove ${ids.length} checked songs from this phone? Desktop originals stay on the desktop.`)) return;
	await phoneTransfer.edit(async () => { for (const id of ids) await phoneDB.removeSong(id); });
	await phoneRefreshLocal();
	phoneRenderPlan();
	await phoneStorageInfo();
}

let phoneArtworkURLs = [];
const phoneArtworkObserver = new IntersectionObserver(entries => {
	for (const entry of entries) {
		if (!entry.isIntersecting) continue;
		const img = entry.target;
		phoneArtworkObserver.unobserve(img);
		phoneDB.read("artwork", img.dataset.songId).then(artwork => {
			if (!artwork || !img.isConnected) return;
			const url = URL.createObjectURL(artwork.blob);
			phoneArtworkURLs.push(url);
			img.src = url;
		}).catch(() => {});
	}
});

function phoneRenderSaved() {
	for (const url of phoneArtworkURLs) URL.revokeObjectURL(url);
	phoneArtworkURLs = [];
	phoneArtworkObserver.disconnect();
	phoneState.songPlaylists = new Map();
	for (const playlist of phoneSavedPlaylists()) {
		for (const id of playlist.songs) {
			if (!phoneState.songPlaylists.has(id)) phoneState.songPlaylists.set(id, []);
			phoneState.songPlaylists.get(id).push(playlist.name);
		}
	}
	const playlistSelect = phoneElement("offlinePlaylist");
	playlistSelect.replaceChildren(new Option("All saved songs", ""));
	for (const playlist of phoneSavedPlaylists()) playlistSelect.add(new Option(playlist.name, playlist.id));
	playlistSelect.value = phoneState.library.playlist;
	if (playlistSelect.selectedIndex == -1) playlistSelect.value = "";
	phoneState.library.playlist = playlistSelect.value;
	phoneElement("librarySort").value = phoneState.library.sort;
	phonePlayer.refreshLibrary([...phoneState.saved.values()]);
	phoneElement("libraryCount").textContent = phoneState.saved.size + (phoneState.saved.size == 1 ? " song saved" : " songs saved");
	phoneRenderHome();
	phoneRenderLibrary();
	phoneRenderPlayback();
}

function phoneSavedPlaylists() {
	return phoneState.catalog.playlists.filter(playlist => playlist.songs.some(id => phoneState.saved.has(id))).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function phonePlaylistSongs(playlist) {
	return playlist.songs.map(id => phoneState.saved.get(id)).filter(Boolean);
}

function phoneSongPlaylist(song) {
	return phoneState.songPlaylists.get(song.id)?.[0] || "Other songs";
}

function phoneLibrarySongs() {
	const playlist = phoneState.catalog.playlists.find(item => item.id == phoneState.library.playlist);
	const songs = playlist ? phonePlaylistSongs(playlist) : [...phoneState.saved.values()];
	const search = phoneElement("librarySearch").value.trim().toLowerCase();
	return songs.filter(song => {
		const playlists = (phoneState.songPlaylists.get(song.id) || []).join(" ");
		return (song.title + " " + song.artist + " " + playlists).toLowerCase().includes(search);
	}).sort((a, b) => {
		let first = a.title, second = b.title;
		if (phoneState.library.sort == "artist") { first = a.artist || "Unknown artist"; second = b.artist || "Unknown artist"; }
		else if (phoneState.library.sort == "playlist") { first = phoneSongPlaylist(a); second = phoneSongPlaylist(b); }
		return first.localeCompare(second, undefined, { sensitivity: "base" }) || a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
	});
}

function phoneArtwork(id, className) {
	const img = document.createElement("img");
	img.src = "./icon-512.png";
	img.alt = "";
	img.className = className;
	if (id && phoneState.saved.get(id)?.artworkVersion) {
		img.dataset.songId = id;
		phoneArtworkObserver.observe(img);
	}
	return img;
}

function phoneIconButton(label, action) {
	const button = document.createElement("button");
	button.className = "icon-button";
	button.setAttribute("aria-label", label);
	button.title = label;
	const icon = document.createElement("img");
	icon.src = "./play.svg";
	icon.alt = "";
	button.append(icon);
	button.addEventListener("click", phoneAction(action));
	return button;
}

async function phonePlaySong(id, songs = phoneLibrarySongs(), context = phoneState.library.playlist || null) {
	if (phonePlayer.currentId == id) {
		if (phonePlayer.playing) phoneElement("audio").pause();
		else await phoneElement("audio").play();
		return;
	}
	phonePlayer.setLibrary(songs, context);
	await phonePlayer.play(id);
}

async function phonePlayPlaylist(id, resumeId) {
	const playlist = phoneState.catalog.playlists.find(item => item.id == id);
	if (!playlist) return;
	const songs = phonePlaylistSongs(playlist).filter(phonePlayer.supported);
	if (!songs.length) return;
	phonePlayer.setLibrary(songs, id);
	await phonePlayer.play(songs.some(song => song.id == resumeId) ? resumeId : songs[0].id);
}

function phoneSongRow(song, action) {
	const row = document.createElement("div");
	row.className = "song-row";
	row.dataset.songId = song.id;
	const title = document.createElement("button");
	title.className = "song-title";
	const name = document.createElement("strong");
	name.textContent = song.title;
	const artist = document.createElement("small");
	artist.textContent = song.artist || "Unknown artist";
	const playable = phonePlayer.supported(song);
	if (!playable) artist.textContent += " · Not supported on this phone";
	title.append(name, artist);
	title.disabled = !playable;
	title.addEventListener("click", phoneAction(action));
	const duration = document.createElement("span");
	duration.className = "song-duration";
	duration.textContent = phonePlayer.formatTime(song.duration);
	const play = phoneIconButton("Play " + song.title, action);
	play.dataset.playId = song.id;
	play.dataset.title = song.title;
	play.disabled = !playable;
	row.append(phoneArtwork(song.id, "song-cover"), title, duration, play);
	return row;
}

function phonePlaylistCard(playlist) {
	const songs = phonePlaylistSongs(playlist);
	const card = document.createElement("article");
	card.className = "playlist-card";
	const cover = document.createElement("div");
	cover.className = "playlist-cover";
	const play = phoneIconButton("Play " + playlist.name, () => phonePlayPlaylist(playlist.id));
	play.disabled = !songs.some(phonePlayer.supported);
	cover.append(phoneArtwork(songs[0]?.id, ""), play);
	const title = document.createElement("button");
	title.className = "playlist-title";
	title.textContent = playlist.name;
	title.title = playlist.name;
	title.addEventListener("click", phoneAction(async () => {
		phoneState.library.playlist = playlist.id;
		phoneState.library.view = "songs";
		phoneElement("librarySearch").value = "";
		await phoneSaveLibraryView();
		phoneSetPage("music");
	}));
	const count = document.createElement("small");
	count.textContent = songs.length + (songs.length == 1 ? " saved song" : " saved songs");
	card.append(cover, title, count);
	return card;
}

function phoneRenderLibrary() {
	const playlistsView = phoneState.library.view == "playlists";
	phoneElement("librarySongsView").hidden = playlistsView;
	phoneElement("libraryPlaylistsView").hidden = !playlistsView;
	phoneElement("librarySortLabel").hidden = playlistsView;
	phoneElement("libraryPlayAll").hidden = playlistsView;
	for (const button of document.querySelectorAll("[data-library-view]")) button.setAttribute("aria-pressed", String(button.dataset.libraryView == phoneState.library.view));
	const playlists = phoneElement("libraryPlaylistsView");
	playlists.replaceChildren();
	const search = phoneElement("librarySearch").value.trim().toLowerCase();
	for (const playlist of phoneSavedPlaylists()) if (playlist.name.toLowerCase().includes(search)) playlists.append(phonePlaylistCard(playlist));
	if (!playlists.children.length) playlists.append(phoneEmpty("No saved playlists match. Choose playlists in Connection to keep them on this phone."));
	const songs = phoneLibrarySongs();
	phoneElement("libraryResults").textContent = songs.length + (songs.length == 1 ? " song" : " songs") + " · Saved on this phone";
	phoneElement("libraryPlayAll").disabled = !songs.some(phonePlayer.supported);
	const container = phoneElement("savedSongs");
	container.replaceChildren();
	if (!songs.length) container.append(phoneEmpty(phoneState.saved.size ? "No songs match your search or playlist." : "No saved songs yet. Connect your desktop to add music."));
	let group = "";
	for (const song of songs) {
		if (phoneState.library.sort == "playlist" && phoneSongPlaylist(song) != group) {
			group = phoneSongPlaylist(song);
			const heading = document.createElement("h3");
			heading.className = "song-group";
			heading.textContent = group;
			container.append(heading);
		}
		container.append(phoneSongRow(song, () => phonePlaySong(song.id)));
	}
}

function phoneEmpty(text) {
	const empty = document.createElement("p");
	empty.className = "empty-state";
	empty.textContent = text;
	return empty;
}

function phoneRenderHome() {
	phoneElement("homeEmpty").hidden = !!phoneState.saved.size;
	phoneElement("homeContent").hidden = !phoneState.saved.size;
	phoneElement("homePlayAll").disabled = ![...phoneState.saved.values()].some(phonePlayer.supported);
	const playlists = phoneSavedPlaylists();
	const recent = phoneElement("recentPlaylists");
	recent.replaceChildren();
	for (const entry of phoneState.recentPlaylists.slice(0, 6)) {
		const playlist = playlists.find(item => item.id == entry.id);
		if (!playlist) continue;
		const button = document.createElement("button");
		button.className = "recent-playlist";
		button.setAttribute("aria-label", "Resume " + playlist.name);
		button.dataset.playlistId = playlist.id;
		const title = document.createElement("span");
		title.textContent = playlist.name;
		button.append(phoneArtwork(playlist.songs.find(id => phoneState.saved.has(id)), ""), title);
		button.addEventListener("click", phoneAction(() => phonePlayPlaylist(playlist.id, entry.songId)));
		recent.append(button);
	}
	if (!recent.children.length) recent.append(phoneEmpty("Play a playlist to keep it one tap away here."));
	const shelf = phoneElement("homePlaylists");
	shelf.replaceChildren();
	shelf.classList.toggle("empty-shelf", !playlists.length);
	for (const playlist of playlists.slice(0, 8)) shelf.append(phonePlaylistCard(playlist));
	if (!playlists.length) shelf.append(phoneEmpty("Save playlists from Connection to find them here."));
	const songs = phoneElement("recentSongs");
	songs.replaceChildren();
	for (const entry of phoneState.recentSongs.slice(0, 5)) {
		const song = phoneState.saved.get(entry.id);
		if (!song) continue;
		songs.append(phoneSongRow(song, () => phonePlaySong(song.id, [...phoneState.saved.values()], null)));
	}
	if (!songs.children.length) songs.append(phoneEmpty("Your recently played songs will appear here."));
}

function phoneRenderPlayback() {
	for (const row of document.querySelectorAll(".song-row[data-song-id]")) row.classList.toggle("playing", row.dataset.songId == phonePlayer.currentId);
	for (const button of document.querySelectorAll("[data-play-id]")) {
		const playing = button.dataset.playId == phonePlayer.currentId && phonePlayer.playing;
		button.querySelector("img").src = playing ? "./pause.svg" : "./play.svg";
		const label = (playing ? "Pause " : "Play ") + button.dataset.title;
		button.setAttribute("aria-label", label);
		button.title = label;
	}
}

async function phoneRememberPlayback(entry) {
	if (!phoneState.saved.has(entry.id)) return;
	const playedAt = Date.now();
	phoneState.recentSongs = [{ ...entry, playedAt }, ...phoneState.recentSongs.filter(item => item.id != entry.id)].slice(0, 12);
	if (entry.playlistId) phoneState.recentPlaylists = [{ id: entry.playlistId, songId: entry.id, playedAt }, ...phoneState.recentPlaylists.filter(item => item.id != entry.playlistId)].slice(0, 12);
	await phoneDB.change(["settings"], transaction => {
		transaction.objectStore("settings").put({ key: "recentSongs", value: phoneState.recentSongs });
		transaction.objectStore("settings").put({ key: "recentPlaylists", value: phoneState.recentPlaylists });
	});
	phoneRenderSaved();
}

async function phoneSaveLibraryView() {
	await phoneDB.put("settings", { key: "libraryView", value: phoneState.library });
	phoneRenderSaved();
}

function phoneApplyTheme() {
	const custom = /^#[a-f0-9]{6}$/i.test(phoneState.theme);
	document.body.dataset.theme = custom ? "custom" : phoneState.theme;
	for (const property of ["--theme-start", "--theme-end"]) {
		if (custom) document.body.style.setProperty(property, phoneState.theme);
		else document.body.style.removeProperty(property);
	}
	for (const button of document.querySelectorAll("[data-theme-choice]")) button.setAttribute("aria-pressed", String(button.dataset.themeChoice == phoneState.theme));
	if (custom) phoneElement("customTheme").value = phoneState.theme;
}

async function phoneChangeTheme(theme) {
	if (!["blue", "red", "green", "purple", "black"].includes(theme) && !/^#[a-f0-9]{6}$/i.test(theme)) return;
	phoneState.theme = theme;
	phoneApplyTheme();
	await phoneDB.put("settings", { key: "appearance", value: theme });
}

async function phoneStorageInfo() {
	const storage = navigator.storage;
	if (!storage?.estimate) { phoneElement("storageInfo").textContent = "Storage estimates are unavailable in this browser."; return; }
	const estimate = await storage.estimate();
	const persistent = storage.persisted ? await storage.persisted() : false;
	phoneElement("storageInfo").textContent = `${phoneSize(estimate.usage || 0)} used / ${phoneSize(estimate.quota || 0)} quota · ${persistent ? "persistent storage granted" : "storage may be evicted"}`;
}

async function phonePersist() {
	const granted = navigator.storage?.persist ? await navigator.storage.persist() : false;
	phoneMessage(granted ? "Persistent storage granted." : "Persistent storage was not granted. Install the app, keep free space, and retain desktop originals.");
	await phoneStorageInfo();
}

async function phoneLocalPermission() {
	try { return (await navigator.permissions.query({ name: "local-network" })).state; } catch (_) { return "prompt"; }
}

async function phoneInitialize() {
	await phoneDB.open();
	phoneState.catalog = (await phoneDB.read("settings", "catalog"))?.value || phoneState.catalog;
	phoneState.selection = (await phoneDB.read("settings", "selection"))?.value || phoneState.selection;
	phoneState.recentPlaylists = (await phoneDB.read("settings", "recentPlaylists"))?.value || [];
	phoneState.recentSongs = (await phoneDB.read("settings", "recentSongs"))?.value || [];
	phoneState.library = { ...phoneState.library, ...(await phoneDB.read("settings", "libraryView"))?.value };
	if (!["name", "artist", "playlist"].includes(phoneState.library.sort)) phoneState.library.sort = "name";
	if (!["songs", "playlists"].includes(phoneState.library.view)) phoneState.library.view = "songs";
	phoneState.theme = (await phoneDB.read("settings", "appearance"))?.value || "green";
	phoneApplyTheme();
	phoneElement("connectionStatus").textContent = phoneState.connection ? "Desktop paired" : "Not paired";
	await phoneRefreshLocal();
	phoneRenderChoices();
	await phoneQueueProgress();
	if (navigator.storage?.persist) await navigator.storage.persist();
	await phoneStorageInfo();
	if ("serviceWorker" in navigator) {
		await navigator.serviceWorker.register("./sw.js");
		navigator.serviceWorker.ready.then(() => { phoneElement("shellStatus").textContent = "App shell cached. Test airplane mode after saving songs."; }).catch(() => {});
	} else phoneElement("shellStatus").textContent = "Offline app caching requires HTTPS and service worker support.";
	if (phoneState.jobs.size) {
		phoneMessage("Unfinished transfers found. On home Wi-Fi, press Resume / retry.");
		if (await phoneLocalPermission() == "granted" && navigator.onLine) await phoneRunQueue();
	}
}

phoneElement("compareDesktop").addEventListener("click", phoneAction(phoneCompare));
phoneElement("startSync").addEventListener("click", phoneAction(phoneStartSync));
phoneElement("resumeSync").addEventListener("click", phoneAction(phoneRunQueue));
phoneElement("cancelSync").addEventListener("click", () => phoneTransfer.cancel());
phoneElement("removeSongs").addEventListener("click", phoneAction(phoneRemoveSongs));
phoneElement("persistStorage").addEventListener("click", phoneAction(phonePersist));
phoneElement("catalogSearch").addEventListener("input", phoneRenderSongChoices);
phoneElement("offlinePlaylist").addEventListener("change", phoneAction(async () => {
	phoneState.library.playlist = phoneElement("offlinePlaylist").value;
	await phoneSaveLibraryView();
}));
phoneElement("librarySearch").addEventListener("input", phoneRenderSaved);
phoneElement("librarySort").addEventListener("change", phoneAction(async () => {
	phoneState.library.sort = phoneElement("librarySort").value;
	await phoneSaveLibraryView();
}));
for (const button of document.querySelectorAll("[data-library-view]")) {
	button.addEventListener("click", phoneAction(async () => {
		phoneState.library.view = button.dataset.libraryView;
		await phoneSaveLibraryView();
	}));
}
for (const button of document.querySelectorAll("[data-page], [data-open-page]")) {
	button.addEventListener("click", () => phoneSetPage(button.dataset.page || button.dataset.openPage));
}
for (const tab of document.querySelectorAll("[data-page]")) {
	tab.addEventListener("keydown", event => {
		const tabs = [...document.querySelectorAll("[data-page]")];
		let index = tabs.indexOf(tab);
		if (event.key == "ArrowRight") index = (index + 1) % tabs.length;
		else if (event.key == "ArrowLeft") index = (index + tabs.length - 1) % tabs.length;
		else if (event.key == "Home") index = 0;
		else if (event.key == "End") index = tabs.length - 1;
		else return;
		event.preventDefault();
		phoneSetPage(tabs[index].dataset.page);
		tabs[index].focus();
	});
}
window.addEventListener("hashchange", () => phoneSetPage(location.hash.slice(1)));
window.addEventListener("phone-playback-change", phoneRenderPlayback);
window.addEventListener("phone-track-play", event => { phoneRememberPlayback(event.detail).catch(error => phoneMessage(error.message)); });
phoneElement("homePlayAll").addEventListener("click", phoneAction(async () => {
	const songs = [...phoneState.saved.values()].filter(phonePlayer.supported).sort((a, b) => a.title.localeCompare(b.title));
	if (!songs.length) return;
	phonePlayer.setLibrary(songs);
	await phonePlayer.play(songs[0].id);
}));
phoneElement("libraryPlayAll").addEventListener("click", phoneAction(async () => {
	const songs = phoneLibrarySongs().filter(phonePlayer.supported);
	if (!songs.length) return;
	phonePlayer.setLibrary(songs, phoneState.library.playlist || null);
	await phonePlayer.play(songs[0].id);
}));
phoneElement("seePlaylists").addEventListener("click", phoneAction(async () => {
	phoneState.library.view = "playlists";
	phoneElement("librarySearch").value = "";
	await phoneSaveLibraryView();
	phoneSetPage("music");
}));
for (const button of document.querySelectorAll("[data-theme-choice]")) button.addEventListener("click", phoneAction(() => phoneChangeTheme(button.dataset.themeChoice)));
phoneElement("customTheme").addEventListener("input", phoneAction(() => phoneChangeTheme(phoneElement("customTheme").value)));
phoneElement("discardQueue").addEventListener("click", phoneAction(async () => {
	if (phoneTransfer.running) return;
	await phoneTransfer.edit(async () => { for (const job of await phoneDB.all("jobs")) await phoneDB.cancelJob(job.id); });
	await phoneQueueProgress();
}));
phoneElement("erasePhone").addEventListener("click", phoneAction(async () => {
	if (phoneTransfer.running || !confirm("Erase all songs, partial downloads, selections, and pairing saved by TaratorMusic on this phone?")) return;
	await phoneTransfer.edit(async () => {
		await phoneDB.change(["songs", "audio", "artwork", "jobs", "chunks", "settings"], transaction => {
			for (const name of ["songs", "audio", "artwork", "jobs", "chunks", "settings"]) transaction.objectStore(name).clear();
		});
	});
	localStorage.removeItem("taratorConnection");
	location.reload();
}));

let phoneInstallPrompt;
window.addEventListener("beforeinstallprompt", event => {
	event.preventDefault();
	phoneInstallPrompt = event;
	phoneElement("installApp").hidden = false;
});
phoneElement("installApp").addEventListener("click", phoneAction(async () => {
	if (phoneInstallPrompt) await phoneInstallPrompt.prompt();
	phoneInstallPrompt = null;
	phoneElement("installApp").hidden = true;
}));
phoneElement("installInstructions").textContent = isApplePhone
	? "Safari: Share > Add to Home Screen. Open the installed app and pair there, then save songs and test airplane mode."
	: "Chrome: use Install app above or the browser menu > Add to Home screen / Install app. Open the installed app before syncing.";

phoneSetPage(location.hash.slice(1));
phoneInitialize().catch(error => phoneMessage("Could not prepare offline storage: " + error.message));
