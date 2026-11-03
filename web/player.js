"use strict";

const phonePlayer = (() => {
	const audio = document.getElementById("audio");
	let library = [];
	let currentId;
	let audioURL;
	let artworkURL;
	let loading = 0;
	let playlistId = null;
	let seeking = false;
	let shuffle = false;
	let shuffleRemaining = [];
	let shuffleHistory = [];
	let shufflePosition = -1;
	try { shuffle = localStorage.getItem("taratorShuffle") == "1"; } catch (_) {}
	const progress = document.getElementById("playbackProgress");

	function formatTime(value) {
		const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
		return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
	}

	function updateControls() {
		const playing = !audio.paused;
		const button = document.getElementById("togglePlayback");
		button.setAttribute("aria-label", playing ? "Pause" : "Play");
		button.title = playing ? "Pause" : "Play";
		document.getElementById("playbackIcon").src = playing ? "./pause.svg" : "./play.svg";
		const playable = library.filter(supported).length;
		button.disabled = !playable;
		document.getElementById("previousTrack").disabled = playable < 2;
		document.getElementById("nextTrack").disabled = playable < 2;
		const shuffleButton = document.getElementById("shufflePlayback");
		shuffleButton.disabled = playable < 2;
		shuffleButton.setAttribute("aria-pressed", String(shuffle));
		shuffleButton.title = shuffle ? "Disable shuffle" : "Enable shuffle";
		progress.disabled = !Number.isFinite(audio.duration) || audio.duration <= 0;
		progress.max = progress.disabled ? 1 : audio.duration;
		if (!seeking) progress.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
		document.getElementById("elapsedTime").textContent = formatTime(seeking ? Number(progress.value) : audio.currentTime);
		document.getElementById("durationTime").textContent = formatTime(audio.duration);
	}

	function supported(song) {
		return !!song.mime && audio.canPlayType(song.mime) != "";
	}

	function updatePosition() {
		updateControls();
		if (!navigator.mediaSession) return;
		navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
		if (navigator.mediaSession.setPositionState && Number.isFinite(audio.duration) && audio.duration > 0) {
			try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.duration, Math.max(0, audio.currentTime)) }); } catch (_) {}
		}
	}

	function resetShuffle() {
		shuffleRemaining = library.filter(supported).map(song => song.id).filter(id => id != currentId);
		shuffleHistory = currentId ? [currentId] : [];
		shufflePosition = shuffleHistory.length - 1;
	}

	async function play(id, historyPosition = null) {
		const song = library.find(item => item.id == id);
		if (!song) return;
		if (!supported(song)) throw new Error("This song is not supported on this phone.");
		const sequence = ++loading;
		const stored = await phoneDB.read("audio", id);
		const artwork = await phoneDB.read("artwork", id);
		if (sequence != loading) return;
		if (!stored?.blob || stored.version != song.audioVersion) throw new Error("No verified offline copy. Sync this song first.");
		if (shuffle) {
			if (historyPosition != null) shufflePosition = historyPosition;
			else {
				shuffleHistory = shuffleHistory.slice(0, shufflePosition + 1);
				if (shuffleHistory[shuffleHistory.length - 1] != id) shuffleHistory.push(id);
				shufflePosition = shuffleHistory.length - 1;
			}
			shuffleRemaining = shuffleRemaining.filter(songId => songId != id);
		}
		if (audioURL) URL.revokeObjectURL(audioURL);
		if (artworkURL) URL.revokeObjectURL(artworkURL);
		audioURL = URL.createObjectURL(stored.blob);
		artworkURL = artwork?.blob ? URL.createObjectURL(artwork.blob) : null;
		currentId = id;
		audio.src = audioURL;
		document.getElementById("nowPlaying").textContent = song.title;
		document.getElementById("nowArtist").textContent = song.artist || "Unknown artist";
		const cover = document.getElementById("nowArtwork");
		cover.src = artworkURL || "./icon-512.png";
		if (navigator.mediaSession && window.MediaMetadata) {
			navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, album: song.album, artwork: [{ src: artworkURL || new URL("./icon-512.png", location.href).href, type: artworkURL ? artwork.blob.type : "image/png" }] });
		}
		await audio.play();
		updatePosition();
	}

	async function skip(direction) {
		const playable = library.filter(supported);
		if (!playable.length) return;
		if (shuffle) {
			if (direction < 0 && shufflePosition >= 0) {
				const position = Math.max(0, shufflePosition - 1);
				await play(shuffleHistory[position], position);
			} else if (direction > 0 && shufflePosition + 1 < shuffleHistory.length) {
				const position = shufflePosition + 1;
				await play(shuffleHistory[position], position);
			} else {
				if (!shuffleRemaining.length) shuffleRemaining = playable.map(song => song.id).filter(id => id != currentId);
				await play(shuffleRemaining.length ? shuffleRemaining[Math.floor(Math.random() * shuffleRemaining.length)] : playable[0].id);
			}
			return;
		}
		const index = playable.findIndex(song => song.id == currentId);
		const next = (index + direction + playable.length) % playable.length;
		await play(playable[next].id);
	}

	async function playFirst() {
		let playable = library.filter(supported);
		if (!playable.length) return;
		if (shuffle) {
			const otherSongs = playable.filter(song => song.id != currentId);
			if (otherSongs.length) playable = otherSongs;
		}
		await play(playable[shuffle ? Math.floor(Math.random() * playable.length) : 0].id);
	}

	async function toggle() {
		if (audio.paused) {
			if (audio.src) await audio.play();
			else await playFirst();
		} else audio.pause();
	}

	function playbackError(error) {
		document.getElementById("message").textContent = error.message || "Playback failed. This file's codec may not be supported on this phone.";
		document.getElementById("message").hidden = false;
	}

	for (const event of ["play", "pause", "ended", "loadedmetadata", "timeupdate", "seeked", "ratechange"]) {
		audio.addEventListener(event, () => {
			updatePosition();
			if (["play", "pause", "ended"].includes(event)) window.dispatchEvent(new Event("phone-playback-change"));
		});
	}
	audio.addEventListener("playing", () => {
		if (currentId) window.dispatchEvent(new CustomEvent("phone-track-play", { detail: { id: currentId, playlistId } }));
	});
	progress.addEventListener("input", () => { seeking = true; updateControls(); });
	progress.addEventListener("change", () => {
		if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, Number(progress.value));
		seeking = false;
		updatePosition();
	});
	audio.addEventListener("ended", () => { skip(1).catch(playbackError); });
	audio.addEventListener("error", () => playbackError(new Error("Playback failed. This file's codec may not be supported on this phone.")));
	document.getElementById("togglePlayback").addEventListener("click", () => { toggle().catch(playbackError); });
	document.getElementById("previousTrack").addEventListener("click", () => { skip(-1).catch(playbackError); });
	document.getElementById("nextTrack").addEventListener("click", () => { skip(1).catch(playbackError); });
	document.getElementById("shufflePlayback").addEventListener("click", () => {
		shuffle = !shuffle;
		resetShuffle();
		try { localStorage.setItem("taratorShuffle", shuffle ? "1" : "0"); } catch (_) {}
		updateControls();
	});
	if (navigator.mediaSession) {
		const handlers = {
			play: () => { togglePlay().catch(playbackError); },
			pause: () => audio.pause(),
			nexttrack: () => { skip(1).catch(playbackError); },
			previoustrack: () => { skip(-1).catch(playbackError); },
			seekto: details => { if (Number.isFinite(details.seekTime) && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(audio.duration, details.seekTime)); },
		};
		for (const [name, handler] of Object.entries(handlers)) {
			try { navigator.mediaSession.setActionHandler(name, handler); } catch (_) {}
		}
	}

	async function togglePlay() {
		if (audio.paused) await toggle();
	}

	function setLibrary(songs, context = null) {
		const changed = context != playlistId || songs.length != library.length || songs.some((song, index) => song.id != library[index].id);
		library = songs;
		playlistId = context;
		if (currentId && !songs.some(song => song.id == currentId)) {
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
			if (audioURL) URL.revokeObjectURL(audioURL);
			if (artworkURL) URL.revokeObjectURL(artworkURL);
			audioURL = artworkURL = currentId = null;
			document.getElementById("nowPlaying").textContent = "Choose a saved song";
			document.getElementById("nowArtist").textContent = "TaratorMusic";
			document.getElementById("nowArtwork").src = "./icon-512.png";
			if (navigator.mediaSession) navigator.mediaSession.metadata = null;
		}
		if (changed) resetShuffle();
		updateControls();
	}

	function refreshLibrary(songs) {
		const available = new Map(songs.map(song => [song.id, song]));
		const queue = currentId ? library.map(song => available.get(song.id)).filter(Boolean) : songs;
		setLibrary(queue, currentId ? playlistId : null);
	}

	return { supported, play, playFirst, setLibrary, refreshLibrary, formatTime, get currentId() { return currentId; }, get playing() { return !audio.paused; } };
})();
