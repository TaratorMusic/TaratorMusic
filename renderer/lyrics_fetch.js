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

function tokenizeText(input) {
	return (normalizeText(input) || "")
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.filter(t => t.length > 0);
}

function cleanSearchTitle(input) {
	return (input || "")
		.replace(/\s*\((?:official video|official music video|official audio|official lyrics|lyric video|remastered|remaster|lyrics|audio|video|hd|4k|official)\)/gi, "")
		.replace(/\s*\[(?:official video|official music video|official audio|official lyrics|lyric video|remastered|remaster|lyrics|audio|video|hd|4k|official)\]/gi, "")
		.replace(/\s*\((?:feat|featuring|ft|f\.)\s*\.?\s*[^)]*\)/gi, "")
		.replace(/\s*\[(?:feat|featuring|ft|f\.)\s*\.?\s*[^\]]*\]/gi, "")
		.replace(/\s*-\s*(?:official video|official music video|official audio|official lyrics|lyrics|audio|video|remastered|remaster)\s*$/i, "")
		.replace(/\s+(?:feat\.?|featuring|ft\.?)\s+.+$/i, "")
		.replace(/[,.;:]+\s*$/g, "")
		.trim();
}

function cleanArtistName(input) {
	return (input || "")
		.replace(/\s*-\s*topic\s*$/i, "")
		.replace(/\bofficial\s+artist\s+channels?\b/gi, "")
		.replace(/\bofficial\s+channels?\b/gi, "")
		.replace(/\bchannels?\s*$/i, "")
		.replace(/vevo/gi, "")
		.replace(/\bofficial\b/gi, "")
		.replace(/\s+/g, " ")
		.replace(/[^\p{L}\p{N}]+$/u, "")
		.trim();
}

function trackMatchScore(storedTitle, itemTitle) {
	const storedKey = normalizeText(cleanSearchTitle(storedTitle));
	const itemKey = normalizeText(cleanSearchTitle(itemTitle));
	if (storedKey && itemKey && storedKey == itemKey) return 10;

	const storedTokens = tokenizeText(storedTitle).filter(t => t.length >= 3);
	const itemTokens = tokenizeText(itemTitle).filter(t => t.length >= 3);
	if (!storedTokens.length || !itemTokens.length) return 0;

	const matches = storedTokens.filter(t => itemTokens.some(tt => t.includes(tt) || tt.includes(t))).length;
	const ratio = matches / storedTokens.length;
	if (ratio >= 0.8) return 6;
	if (ratio >= 0.5) return 3;
	if (ratio > 0) return 1;
	return 0;
}

function artistMatchScore(storedArtist, itemArtist) {
	const stored = cleanArtistName(storedArtist);
	const item = cleanArtistName(itemArtist);
	const storedTokens = tokenizeText(stored);
	const itemTokens = tokenizeText(item);
	if (!storedTokens.length || !itemTokens.length) return 0;
	if (normalizeText(stored) == normalizeText(item)) return 5;

	const longStored = storedTokens.filter(t => t.length >= 2);
	if (!longStored.length) return 0;

	const matches = longStored.filter(t => itemTokens.some(tt => tt.length >= 2 && (t.includes(tt) || tt.includes(t)))).length;
	if (matches >= Math.ceil(longStored.length / 2) && longStored.length > 1) return 4;
	if (matches > 0) return 2;
	return 0;
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
			id: data.id,
		};
	} catch (err) {
		console.error("Error fetching lyrics from LRCLIB:", err);
		return null;
	}
}

async function searchLyricsOnLrclib(params) {
	try {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value) query.set(key, value);
		}
		if (!query.toString()) return [];
		const response = await fetch(`${LRCLIB_BASE}/search?${query.toString()}`);
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

	const cleanTitle = cleanSearchTitle(trackName);
	const cleanArtist = cleanArtistName(artistName);
	const cleanDiffers = artistName && cleanArtist && normalizeText(cleanArtist) != normalizeText(artistName);

	const [exactMatch, cleanedExactMatch, artistSearch, trackSearch] = await Promise.all([
		fetchLyricsFromLrclib(trackName, artistName, ""),
		cleanDiffers ? fetchLyricsFromLrclib(cleanTitle, cleanArtist, "") : Promise.resolve(null),
		artistName ? searchLyricsOnLrclib({ track_name: trackName, artist_name: artistName }) : Promise.resolve([]),
		searchLyricsOnLrclib({ track_name: trackName }),
	]);

	const byId = new Map();
	const addItem = item => {
		if (item && !byId.has(item.id)) byId.set(item.id, item);
	};

	addItem(exactMatch);
	addItem(cleanedExactMatch);
	(await artistSearch).forEach(addItem);
	(await trackSearch).forEach(addItem);

	const scored = [];
	for (const item of byId.values()) {
		let score = trackMatchScore(trackName, item.trackName);
		if (artistName) score += artistMatchScore(artistName, item.artistName);
		if (item.id == exactMatch?.id) score += 20;
		if (item.id == cleanedExactMatch?.id) score += 20;

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

	const allResults = scored.slice(0, 12);
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
