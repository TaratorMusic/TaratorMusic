const LRCLIB_BASE = "https://lrclib.net/api";

function parseLrc(lrcString) {
	if (!lrcString) return [];
	const lines = lrcString.split("\n");
	const result = [];
	const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/;

	for (const line of lines) {
		const match = line.match(regex);
		if (!match) continue;
		const minutes = parseInt(match[1], 10);
		const seconds = parseInt(match[2], 10);
		let centiseconds = parseInt(match[3], 10);
		if (match[3].length == 2) centiseconds *= 10;
		const time = minutes * 60 + seconds + centiseconds / 1000;
		const text = match[4].trim();
		result.push({ time, text });
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
	if (!row) return null;

	const trackName = row.song_name;
	const artistName = row.artist || "";
	const duration = row.song_length || 0;

	if (!trackName) return null;

	const result = await fetchLyricsFromLrclib(trackName, artistName, "");
	if (result) return result;

	const searchQuery = artistName ? `${artistName} ${trackName}` : trackName;
	const results = await searchLyricsOnLrclib(searchQuery);
	if (results.length == 0) return null;

	const normalizedTrack = normalizeText(trackName);
	const normalizedArtist = normalizeText(artistName);
	let bestMatch = null;
	let bestScore = -1;

	for (const item of results) {
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
		if (score > bestScore) {
			bestScore = score;
			bestMatch = item;
		}
	}

	if (bestMatch && bestMatch.plainLyrics) return bestMatch;

	const withLyrics = results.find(r => r.plainLyrics);
	return withLyrics || bestMatch;
}

async function saveFetchedLyrics(songId, lyricsData) {
	const cachedRows = songLyricsCache.get(songId) || [];
	const existingOriginal = cachedRows.find(r => !r.language);

	const plainText = lyricsData.plainLyrics || "";
	const syncedText = lyricsData.syncedLyrics || "";

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
