"use strict";

const phoneLocalDev = location.protocol == "http:" && location.hostname == "127.0.0.1";
const phoneAppURL = new URL("./", location.href).href;
let phoneSetupPending = false;
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
	let url;
	try { url = new URL(phoneElement("server").value.trim()); } catch (_) { throw new Error("Paste the Desktop address from TaratorMusic Settings > Phone sync, including http:// or https://."); }
	const parts = url.hostname.split(".").map(Number);
	const privateIP = parts.length == 4 && parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255) &&
		(parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) || (parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31) || parts[0] == 127);
	const localServer = phoneLocalDev && url.origin == location.origin;
	if (phoneLocalDev && url.protocol == "https:" && url.hostname == location.hostname && url.port == location.port) throw new Error("Local PC testing uses " + location.origin + ". Keep http:// for this address.");
	if (!privateIP) throw new Error("This is not a desktop connection address. Copy Desktop address from Settings > Phone sync. The webapp address belongs in the desktop's Webapp address field.");
	if ((url.protocol != "https:" && !localServer) || !privateIP || url.username || url.password || url.search || url.hash || url.pathname != "/") throw new Error(phoneLocalDev ? "For local testing, use " + location.origin + ". For home Wi-Fi, use the desktop's HTTPS address." : "Use the desktop's private IPv4 HTTPS address, including :8443.");
	return url.origin;
}

function phoneSetupFeedback(state, title, message, fixes = []) {
	phoneElement("setupFeedback").hidden = false;
	phoneElement("setupFeedback").dataset.state = state;
	phoneElement("setupFeedbackTitle").textContent = title;
	phoneElement("setupFeedbackText").textContent = message;
	phoneElement("setupFixes").replaceChildren();
	for (const fix of fixes) {
		const item = document.createElement("li");
		item.textContent = fix;
		phoneElement("setupFixes").append(item);
	}
	phoneElement("setupHelp").hidden = !fixes.length;
	phoneElement("setupHelp").open = !!fixes.length;
	if (state != "checking") phoneElement("setupFeedback").scrollIntoView({ block: "nearest" });
}

function phoneSetupBusy(busy) {
	phoneSetupPending = busy;
	for (const id of ["checkDesktop", "pairSubmit", "testConnection"]) phoneElement(id).disabled = busy;
	phoneElement("testConnection").disabled = busy || !phoneState.connection;
	phoneElement("server").readOnly = busy;
	phoneElement("pairCode").readOnly = busy;
}

function phoneSetupFailure(error) {
	if (error.name == "AbortError" || error instanceof TypeError) {
		const fixes = phoneLocalDev
			? ["Keep the desktop app open with sharing enabled.", "Set Webapp address on the desktop to " + phoneAppURL + ". Stop any Python preview server using the same port.", "Restart the desktop app after updating it."]
			: ["Open certificate setup above. Install and trust your desktop's certificate on this device, then restart the browser.", "Keep both devices on the same home Wi-Fi and allow local network access when the browser asks.", "Set Webapp address on the desktop to " + phoneAppURL + ", then turn sharing off and on.", "Refresh addresses on the desktop and copy its current Desktop address here, including :8443."];
		phoneSetupFeedback("error", error.name == "AbortError" ? "The desktop did not respond in time" : "The browser could not complete the connection", phoneLocalDev ? "Check the local desktop setup below, then try Check connection again." : "The browser cannot tell us whether certificate trust, network access, or the webapp address blocked the request. Check these items, then try Check connection again.", fixes);
	} else phoneSetupFeedback("error", "Setup needs attention", error.message);
}

async function phoneSetupFetch(server, path, options = {}) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 10000);
	try {
		return await fetch(server + path, { ...options, mode: "cors", credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal });
	} finally { clearTimeout(timer); }
}

async function phoneCheckConnection() {
	if (phoneSetupPending) return false;
	phoneSetupBusy(true);
	try {
		const server = phoneAddress();
		phoneElement("server").removeAttribute("aria-invalid");
		phoneSetupFeedback("checking", "Checking the desktop connection...", "Allow local network access if your browser asks. This check does not use your pairing code.");
		const response = await phoneSetupFetch(server, "/api/pair", { method: "OPTIONS" });
		if (response.status != 204) {
			phoneSetupFeedback("error", "This address is not responding as the sync server", "Copy Desktop address from the desktop's Phone sync settings. The certificate setup address (:8444) and a Python preview server cannot pair devices.");
			return false;
		}
		phoneSetupFeedback("success", "Desktop connection is ready", "This browser can reach the sync server. Enter the current six-digit code below to pair.");
		return true;
	} catch (error) {
		if (!(error instanceof TypeError) && error.name != "AbortError") phoneElement("server").setAttribute("aria-invalid", "true");
		phoneSetupFailure(error);
		return false;
	} finally { phoneSetupBusy(false); }
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
	if (phoneSetupPending) return;
	const code = phoneElement("pairCode").value.replace(/\s/g, "");
	if (!/^\d{6}$/.test(code)) {
		phoneElement("pairCode").setAttribute("aria-invalid", "true");
		phoneSetupFeedback("error", "Enter all six digits", "Use the pairing code shown in the desktop app. Spaces are fine when pasting.");
		phoneElement("pairCode").focus();
		return;
	}
	phoneElement("pairCode").removeAttribute("aria-invalid");
	if (!await phoneCheckConnection()) return;
	phoneSetupBusy(true);
	try {
		const server = phoneAddress();
		phoneSetupFeedback("checking", "Pairing with your desktop...", "Keep the desktop app open.");
		const response = await phoneSetupFetch(server, "/api/pair", {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
		});
		if (response.status == 401) {
			phoneElement("pairCode").setAttribute("aria-invalid", "true");
			phoneSetupFeedback("error", "Get a new pairing code", "The desktop is reachable, but this code was incorrect, expired, or already used. Press New pairing code on the desktop, then enter the new six digits here.");
			return;
		}
		if (response.status == 429) {
			phoneSetupFeedback("error", "Wait one minute before trying again", "The desktop has received too many pairing attempts. Wait a full minute, request a new code on the desktop, then try again.");
			return;
		}
		if (response.status == 409) {
			phoneSetupFeedback("error", "The desktop's device list is full", "In desktop Settings > Phone sync, choose Forget paired devices, then generate a new pairing code. Existing saved music stays on each device.");
			return;
		}
		if (!response.ok) throw new Error(await response.text());
		const paired = await response.json();
		const bound = await phoneDB.read("settings", "desktopId");
		if (bound && bound.value != paired.desktopId) throw new Error("This library belongs to another desktop. Erase this phone's library before pairing a different desktop.");
		await phoneDB.put("settings", { key: "desktopId", value: paired.desktopId });
		phoneState.connection = { server, ...paired };
		phoneElement("connectionStatus").textContent = "Desktop paired";
		localStorage.setItem("taratorConnection", JSON.stringify(phoneState.connection));
		phoneElement("pairCode").value = "";
		phoneSetupFeedback("success", "Paired with your desktop", "Press Transfer test file to verify the connection before copying your music.");
	} catch (error) {
		phoneSetupFailure(error);
	} finally { phoneSetupBusy(false); }
}

async function phoneTest() {
	if (phoneSetupPending) return;
	phoneSetupBusy(true);
	try {
		phoneReconnect();
		phoneSetupFeedback("checking", "Transferring a test file...", "Checking that the complete file arrives correctly.");
		const response = await phoneSetupFetch(phoneState.connection.server, "/api/test", { headers: { Authorization: "Bearer " + phoneState.connection.token } });
		if (!response.ok) throw new Error(response.status == 401 ? "This pairing is no longer valid. Request a new pairing code on the desktop and pair again." : await response.text());
		const blob = await response.blob();
		if (blob.size != Number(response.headers.get("Content-Length")) || await phoneDigest(blob) != response.headers.get("X-Checksum-SHA256")) throw new Error("Test file verification failed.");
		phoneSetupFeedback("success", "Connection verified. You're ready to copy music.", "The test file arrived and passed its checksum check. Choose Connect and compare below, select songs or playlists, then copy your additions.");
	} catch (error) {
		phoneSetupFailure(error);
	} finally { phoneSetupBusy(false); }
}

function phoneSetupDevice() {
	const device = phoneElement("setupDevice").value;
	let instructions = "Open certificate setup, download your desktop's certificate, and trust it in your device or browser's certificate settings. Restart the browser afterward.";
	let help = "";
	if (device == "iphone") {
		instructions = "Open certificate setup in Safari and install the downloaded profile in Settings > General > VPN & Device Management. Then enable Full Trust in Settings > General > About > Certificate Trust Settings.";
		help = "https://support.apple.com/en-us/102390";
	} else if (device == "android") {
		instructions = "Open certificate setup and download the .crt file. In Android Settings > Security > Encryption & credentials, install it as a CA certificate. Set a screen lock if asked, then restart Chrome.";
		help = "https://support.google.com/pixelphone/answer/2844832";
	} else if (device == "windows") {
		instructions = "Download the .crt file from certificate setup. In Windows Certificate Manager (certmgr.msc), import it into Current User > Trusted Root Certification Authorities > Certificates. Restart your browser afterward.";
		help = "https://learn.microsoft.com/en-us/windows-server/identity/ad-cs/inspect-certificates-manage-certificate-stores";
	} else if (device == "mac") {
		instructions = "Download your desktop's certificate from certificate setup and import it in Keychain Access. Open its Trust settings and trust it for SSL, then restart your browser.";
		help = "https://support.apple.com/guide/keychain-access/kyca11871/mac";
	}
	phoneElement("phoneInstructions").textContent = instructions;
	phoneElement("deviceHelpLink").hidden = !help;
	if (help) phoneElement("deviceHelpLink").href = help;
}

function phoneSetupLink() {
	if (phoneLocalDev) {
		phoneElement("setupLink").hidden = true;
		return;
	}
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
phoneElement("checkDesktop").addEventListener("click", phoneCheckConnection);
phoneElement("testConnection").addEventListener("click", phoneTest);
phoneElement("setupDevice").addEventListener("change", phoneSetupDevice);
phoneElement("server").addEventListener("input", () => {
	phoneSetupLink();
	phoneElement("server").removeAttribute("aria-invalid");
	phoneElement("setupFeedback").hidden = true;
});
phoneElement("pairCode").addEventListener("input", () => phoneElement("pairCode").removeAttribute("aria-invalid"));
phoneElement("setupAppUrl").textContent = phoneAppURL;
phoneElement("setupMode").textContent = phoneLocalDev ? "Local PC testing. Pair this browser with the desktop app on this computer." : "Follow these three steps. Check the connection before using your pairing code.";
phoneElement("setupDesktopHint").textContent = phoneLocalDev ? "Start the desktop with npm start for local testing. No certificate installation is needed for this address." : "Keep the desktop open and connect both devices to the same home Wi-Fi. The desktop address in step 2 is different from the webapp address above.";
phoneElement("copyAppAddress").addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(phoneAppURL);
		phoneElement("copyAppAddress").textContent = "Copied";
		setTimeout(() => { phoneElement("copyAppAddress").textContent = "Copy webapp address"; }, 2000);
	} catch (_) { phoneSetupFeedback("error", "Copy the webapp address manually", "Select and copy the address in step 1, then paste it into Webapp address on the desktop."); }
});
if (phoneState.connection) phoneElement("server").value = phoneState.connection.server;
if (phoneLocalDev) {
	phoneElement("server").value = location.origin;
	phoneElement("server").placeholder = location.origin;
	phoneElement("serverLabel").textContent = "Desktop address on this PC";
	phoneElement("serverHelp").textContent = "Keep " + location.origin + " here. Local PC testing uses http://, so changing it to https:// will prevent pairing.";
	phoneElement("certificateSetup").hidden = true;
}
phoneSetupLink();
const isApplePhone = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform == "MacIntel" && navigator.maxTouchPoints > 1);
phoneElement("setupDevice").value = isApplePhone ? "iphone" : /Android/.test(navigator.userAgent) ? "android" : /Win/.test(navigator.platform) ? "windows" : /Mac/.test(navigator.platform) ? "mac" : "other";
phoneSetupDevice();
phoneSetupBusy(false);

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
	return { additions, updates, wanted };
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
	phoneRenderAllSelection();
	phoneRenderPlan();
}

function phoneRenderAllSelection() {
	const songs = phoneState.catalog.songs.filter(phonePlayer.supported);
	const wanted = phoneWanted();
	const selected = songs.filter(song => wanted.has(song.id)).length;
	const checkbox = phoneElement("selectAllSongs");
	checkbox.checked = songs.length > 0 && selected == songs.length;
	checkbox.indeterminate = selected > 0 && selected < songs.length;
	checkbox.disabled = !songs.length || phoneTransfer.running;
	phoneElement("selectAllStatus").textContent = selected + " of " + songs.length + " songs selected";
}

async function phoneSelectAllSongs(checked) {
	if (phoneTransfer.running) return;
	phoneState.selection = { songs: checked ? phoneState.catalog.songs.filter(phonePlayer.supported).map(song => song.id) : [], playlists: checked ? phoneState.selection.playlists : [] };
	await phoneDB.put("settings", { key: "selection", value: phoneState.selection });
	phoneRenderChoices();
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
	phoneRenderAllSelection();
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
	phoneElement("comparisonInfo").textContent = `${plan.additions.length} additions · ${plan.updates.length} updates. Audio: ${phoneSize(audioBytes)}, plus small artwork files.`;
	const items = phoneElement("comparisonItems");
	const more = phoneElement("comparisonMore");
	const moreItems = phoneElement("comparisonMoreItems");
	items.replaceChildren();
	moreItems.replaceChildren();
	for (const [index, song] of transfers.entries()) {
		const item = document.createElement("p");
		const saved = phoneState.saved.get(song.id);
		item.textContent = `${saved ? "Update" : "Add"}: ${song.title} (${saved?.audioVersion == song.audioVersion ? "metadata / artwork only" : phoneSize(song.size) + " audio"})`;
		if (index < 3) items.append(item);
		else moreItems.append(item);
	}
	more.hidden = !moreItems.children.length;
	if (more.hidden) more.open = false;
	phoneElement("comparisonMoreSummary").textContent = more.open ? "Show less" : "... Show " + moreItems.children.length + " more";
	phoneElement("startSync").disabled = !transfers.length || phoneTransfer.running;
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
	for (const id of ["startSync", "resumeSync", "discardQueue", "compareDesktop", "removeSongs", "erasePhone", "selectAllSongs"]) phoneElement(id).disabled = true;
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
	if (songs.some(song => song.id == resumeId)) await phonePlayer.play(resumeId);
	else await phonePlayer.playFirst();
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
	phoneElement("libraryRemoval").hidden = !phoneState.saved.size;
	const removals = phoneElement("removalChoices");
	removals.replaceChildren();
	for (const song of songs) {
		const row = phoneChoice(song.title + " · " + (song.artist || "Unknown artist"), false, () => {});
		row.querySelector("input").dataset.songId = song.id;
		row.querySelector("input").disabled = phoneTransfer.running;
		removals.append(row);
	}
	phoneElement("removeSongs").disabled = !songs.length || phoneTransfer.running;
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
phoneElement("selectAllSongs").addEventListener("change", phoneAction(() => phoneSelectAllSongs(phoneElement("selectAllSongs").checked)));
phoneElement("comparisonMore").addEventListener("toggle", () => {
	phoneElement("comparisonMoreSummary").textContent = phoneElement("comparisonMore").open ? "Show less" : "... Show " + phoneElement("comparisonMoreItems").children.length + " more";
});
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
	await phonePlayer.playFirst();
}));
phoneElement("libraryPlayAll").addEventListener("click", phoneAction(async () => {
	const songs = phoneLibrarySongs().filter(phonePlayer.supported);
	if (!songs.length) return;
	phonePlayer.setLibrary(songs, phoneState.library.playlist || null);
	await phonePlayer.playFirst();
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
