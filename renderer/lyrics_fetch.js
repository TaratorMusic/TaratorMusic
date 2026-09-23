const LRCLIB_BASE = "https://lrclib.net/api";

function parseLrc(lrcString) {
	if (!lrcString) return [];
	const lines = lrcString.split(/\r?\n/);
	const result = [];
	const timestampRegex = /\[(\d{1,2}):(\d{1,2})(?:[.:,](\d{1,3}))?\]/g;
	const stripRegex = /\[\d{1,2}:\d{1,2}(?:[.:,]\d{1,3})?\]/g;

	for (const line of lines) {
		const timestamps = [];
		let match;
		timestampRegex.lastIndex = 0;
		while ((match = timestampRegex.exec(line)) !== null) {
			const minutes = parseInt(match[1], 10);
			const seconds = parseInt(match[2], 10);
			const fraction = match[3] || "";
			let centiseconds = 0;
			if (fraction.length == 1) centiseconds = parseInt(fraction, 10) * 100;
			else if (fraction.length == 2) centiseconds = parseInt(fraction, 10) * 10;
			else if (fraction.length == 3) centiseconds = parseInt(fraction, 10);
			timestamps.push(minutes * 60 + seconds + centiseconds / 1000);
		}
		if (timestamps.length == 0) continue;
		const text = line.replace(stripRegex, "").replace(/\r$/, "").trim();
		for (const time of timestamps) result.push({ time, text });
	}

	return result;
}

function findCurrentLyricIndex(currentTime, syncedLyrics) {
	if (!syncedLyrics || syncedLyrics.length == 0) return -1;
	let index = -1;
	for (let i = 0; i < syncedLyrics.length; i++) {
		if (syncedLyrics[i].time <= currentTime) {
			index = i;
		} else {
			break;
		}
	}
	return index;
}

async function fetchLyricsFromLrclib(trackName, artistName, albumName) {
	const params = new URLSearchParams({
		track_name: trackName,
		artist_name: artistName,
	});
	if (albumName) params.set("album_name", albumName);

	try {
		const response = await fetch(`${LRCLIB_BASE}/get?${params.toString()}`);
		if (!response.ok) return null;
		const data = await response.json();
		return {
			plainLyrics: data.plainLyrics || "",
			syncedLyrics: data.syncedLyrics || "",
			parsedSyncedLyrics: parseLrc(data.syncedLyrics),
			trackName: data.trackName,
			artistName: data.artistName,
			albumName: data.albumName,
		};
	} catch (err) {
		console.error("Error fetching lyrics from LRCLIB:", err);
		return null;
	}
}

async function searchLyricsOnLrclib(query) {
	try {
		const response = await fetch(`${LRCLIB_BASE}/search?q=${encodeURIComponent(query)}`);
		if (!response.ok) throw new Error(`LRCLIB search returned ${response.status}`);
		const data = await response.json();
		return data.map(item => ({
			id: item.id,
			trackName: item.trackName,
			artistName: item.artistName,
			albumName: item.albumName,
			duration: item.duration,
			plainLyrics: item.plainLyrics || "",
			syncedLyrics: item.syncedLyrics || "",
			parsedSyncedLyrics: parseLrc(item.syncedLyrics),
		}));
	} catch (err) {
		console.error("Error searching lyrics on LRCLIB:", err);
		return [];
	}
}

async function fetchSongLyrics(songId) {
	const row = songNameCache.get(songId);
	if (!row) return { bestMatch: null, allResults: [] };

	const trackName = row.song_name;
	const artistName = row.artist && row.artist != "unknown" ? row.artist : "";
	const duration = row.song_length || 0;

	if (!trackName) return { bestMatch: null, allResults: [] };

	const exactMatch = await fetchLyricsFromLrclib(trackName, artistName, "");

	const searchQuery = artistName ? `${artistName} ${trackName}` : trackName;
	const searchResults = await searchLyricsOnLrclib(searchQuery);

	const allResults = [];

	if (exactMatch) {
		allResults.push(exactMatch);
	}

	const normalizedTrack = normalizeText(trackName);
	const normalizedArtist = normalizeText(artistName);
	const scored = [];

	for (const item of searchResults) {
		let score = 0;
		const normalizedItemTrack = normalizeText(item.trackName);
		const normalizedItemArtist = normalizeText(item.artistName);

		if (normalizedItemTrack == normalizedTrack) {
			score += 10;
		} else if (normalizedItemTrack.includes(normalizedTrack) || normalizedTrack.includes(normalizedItemTrack)) {
			score += 6;
		}

		if (normalizedArtist && normalizedItemArtist.includes(normalizedArtist)) score += 5;
		else if (normalizedArtist && normalizedArtist.includes(normalizedItemArtist)) score += 3;

		if (duration > 0 && item.duration) {
			const diff = Math.abs(item.duration - duration);
			if (diff <= 2) score += 3;
			else if (diff <= 5) score += 1;
		}
		if (item.syncedLyrics) score += 2;
		if (item.plainLyrics) score += 1;

		item._score = score;
		scored.push(item);
	}

	scored.sort((a, b) => b._score - a._score);

	for (const item of scored) {
		if (!allResults.some(r => r.id === item.id)) {
			allResults.push(item);
		}
	}

	const withLyrics = allResults.filter(r => r.plainLyrics);
	const bestMatch = withLyrics[0] || allResults[0] || null;

	return { bestMatch, allResults };
}

async function saveFetchedLyrics(songId, lyricsData) {
	const cachedRows = songLyricsCache.get(songId) || [];
	const existingOriginal = cachedRows.find(r => !r.language);

	const plainText = (lyricsData.plainLyrics || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	const syncedText = (lyricsData.syncedLyrics || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

	if (existingOriginal) {
		existingOriginal.lyrics = plainText;
		existingOriginal.synced_lyrics = syncedText;
		await callSqlite({
			db: "musics",
			query: "UPDATE lyrics SET lyrics = ?, synced_lyrics = ? WHERE song_id = ? AND (language IS NULL OR language = '')",
			args: [plainText, syncedText, songId],
			fetch: false,
		});
	} else {
		cachedRows.push({ lyrics: plainText, language: null, synced_lyrics: syncedText });
		await callSqlite({
			db: "musics",
			query: "INSERT INTO lyrics (song_id, lyrics, language, synced_lyrics) VALUES (?, ?, NULL, ?)",
			args: [songId, plainText, syncedText],
			fetch: false,
		});
	}

	songLyricsCache.set(songId, cachedRows);
	return { plainLyrics: plainText, syncedLyrics: syncedText, parsedSyncedLyrics: parseLrc(syncedText) };
}
