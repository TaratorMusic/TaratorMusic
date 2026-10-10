function getTaratorKey(songId) {
	return `tarator-${songId}`;
}

function normalizeSongTitle(title) {
	if (!title) return "";
	return title
		.toLowerCase()
		.replace(/\(feat\.?[^)]*\)/g, "")
		.replace(/\(with[^)]*\)/g, "")
		.replace(/\(remaster(ed)?[^)]*\)/g, "")
		.replace(/\(live[^)]*\)/g, "")
		.replace(/\(radio edit\)/g, "")
		.replace(/\(deluxe[^)]*\)/g, "")
		.replace(/-\s*(remaster(ed)?|radio edit|live|deluxe)[^-]*$/g, "")
		.replace(/[^\w\s]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

async function getRecommendations(songIds) {
	const uniqueSongIds = songIds?.length ? songIds : [...songNameCache.keys()].map(id => String(id));
	const artistListenTimes = {};

	const songTimes =
		(await callSqlite({
			db: "musics",
			query: "SELECT song_id, SUM(end_time - start_time) AS total_seconds FROM timers GROUP BY song_id",
			args: [],
			fetch: true,
		})) || [];

	const songTimesMap = new Map(songTimes.map(row => [getTaratorKey(row.song_id), row.total_seconds]));

	for (const songId of uniqueSongIds) {
		const song = songNameCache.get(songId);
		if (!song) continue;
		if (!song.artist) continue;

		const listenTime = songTimesMap.get(songId) || 0;
		artistListenTimes[song.artist] = (artistListenTimes[song.artist] || 0) + listenTime;
	}

	const artistPreferenceScore = calculateArtistPreferenceFromMap(artistListenTimes);

	if (artistPreferenceScore == 999) {
		return alertModal("No songs listened yet to give recommendations of.");
	}

	const existingSongsSet = new Set(Array.from(songNameCache.values()).map(song => normalizeSongTitle(song.song_name)));
	const notInterestedSet = new Set(notInterestedSongs.map(song => normalizeSongTitle(song.song_name)));

	const existingArtists = Object.keys(artistListenTimes);
	const existingArtistSet = new Set(existingArtists);

	const maxListenTime = Math.max(...Object.values(artistListenTimes), 1);

	const artists = await callSqlite({
		db: "musics",
		query: "SELECT artist_name, deezer_songs_array, similar_artists_array, artist_fan_amount FROM recommendations",
		args: [],
		fetch: true,
	});

	const maxFanAmount = Math.max(...artists.map(artist => artist.artist_fan_amount || 0), 1);

	function normalizeName(name) {
		return normalizeText(name);
	}

	const localArtistTokens = existingArtists.map(localArtist => {
		const normalized = normalizeName(localArtist);
		return {
			artist: localArtist,
			normalized,
			words: normalized.split(/\s+/).filter(w => w.length > 2),
		};
	});
	const normalizedArtistMap = new Map(localArtistTokens.map(t => [t.normalized, t.artist]));

	const wordIndex = new Map();
	for (const token of localArtistTokens) {
		for (const word of token.words) {
			if (!wordIndex.has(word)) wordIndex.set(word, []);
			wordIndex.get(word).push(token);
		}
	}

	const matchCache = new Map();

	function matchArtist(deezerName) {
		if (matchCache.has(deezerName)) return matchCache.get(deezerName);

		const dn = normalizeName(deezerName);
		let result;
		if (normalizedArtistMap.has(dn)) {
			result = normalizedArtistMap.get(dn);
		} else {
			const wordsDN = dn.split(/\s+/).filter(w => w.length > 2);

			result = null;

			const candidates = new Set();
			for (const word of wordsDN) {
				const matches = wordIndex.get(word);
				if (!matches) continue;
				for (const token of matches) candidates.add(token);
			}

			for (const { artist: localArtist, words: wordsLA } of candidates) {
				const shorter = wordsDN.length <= wordsLA.length ? wordsDN : wordsLA;
				const longer = wordsDN.length <= wordsLA.length ? wordsLA : wordsDN;
				if (shorter.length == 0) continue;
				if (shorter.every(w => longer.includes(w))) {
					result = localArtist;
					break;
				}
			}
		}

		matchCache.set(deezerName, result);
		return result;
	}

	const listenTimeCache = new Map();

	function getListenTime(deezerName) {
		if (listenTimeCache.has(deezerName)) return listenTimeCache.get(deezerName);
		const matched = matchArtist(deezerName);
		const time = matched ? artistListenTimes[matched] : 0;
		listenTimeCache.set(deezerName, time);
		return time;
	}

	const reverseSignal = {};

	for (const artist of artists) {
		const localMatch = matchArtist(artist.artist_name);
		if (!localMatch || !artistListenTimes[localMatch]) continue;

		const listenTime = artistListenTimes[localMatch];
		const similarArtists = JSON.parse(artist.similar_artists_array || "[]");

		for (const similarArtist of similarArtists) {
			const normalized = normalizeName(similarArtist);
			reverseSignal[normalized] = (reverseSignal[normalized] || 0) + listenTime;
		}
	}

	const songMap = new Map();

	for (const artist of artists) {
		const songs = JSON.parse(artist.deezer_songs_array || "[]");
		const similarArtists = JSON.parse(artist.similar_artists_array || "[]");

		if (!songs.length) continue;

		let matchedListenTime = 0;
		let matchTier = null;

		const selfMatch = matchArtist(artist.artist_name);
		if (selfMatch) {
			matchedListenTime = artistListenTimes[selfMatch];
			matchTier = "self";
		} else {
			let listenedSimilarCount = 0;
			for (const similarArtist of similarArtists) {
				const similarListenTime = getListenTime(similarArtist);
				if (similarListenTime > 0) {
					matchedListenTime += similarListenTime;
					listenedSimilarCount++;
				}
			}

			if (listenedSimilarCount > 0) matchedListenTime /= listenedSimilarCount;

			if (matchedListenTime > 0) {
				matchTier = "similar";
			} else {
				matchedListenTime = reverseSignal[normalizeName(artist.artist_name)] || 0;
				if (matchedListenTime > 0) matchTier = "reverse";
			}
		}

		if (matchedListenTime == 0) continue;

		const totalSongs = songs.length;

		const dynamicCap = Math.round(5 + 20 * (matchedListenTime / maxListenTime));
		const maxSongsPerArtist = Math.min(totalSongs, Math.max(5, Math.min(25, dynamicCap)));

		for (let index = 0; index < maxSongsPerArtist; index++) {
			const song = songs[index];
			const normalizedSong = normalizeSongTitle(song);
			if (existingSongsSet.has(normalizedSong) || notInterestedSet.has(normalizedSong)) continue;

			const positionFraction = 1 - index / totalSongs;

			songMap.set(song, [positionFraction, artist.artist_name, artist.artist_fan_amount, similarArtists, matchedListenTime, matchTier]);
		}
	}

	const matchTierWeights = { self: 1.0, similar: 0.7, reverse: 0.4 };

	const pointsMap = new Map();

	songMap.forEach((value, song) => {
		const [positionFraction, artistName, artistFanAmount, similarArtists, matchedListenTime, matchTier] = value;

		const popularityPoints = positionFraction * popularityFactor;

		const artistStrengthPoints = (Math.log(artistFanAmount + 1) / Math.log(maxFanAmount + 1)) * artistStrengthFactor;

		let similarArtistsPoints = 0;

		if (similarArtists.length > 0) {
			const listenedSimilarArtists = similarArtists.filter(artist => getListenTime(artist) > 0);

			if (listenedSimilarArtists.length > 0) {
				const totalSimilarScore = listenedSimilarArtists.reduce((acc, artist) => acc + Math.log(1 + getListenTime(artist)), 0);

				const coverageRatio = listenedSimilarArtists.length / similarArtists.length;

				similarArtistsPoints = (totalSimilarScore / listenedSimilarArtists.length) * Math.sqrt(coverageRatio) * similarArtistsFactor;
			}
		}

		const artistListenTimePoints = (Math.log(1 + matchedListenTime) / Math.log(1 + maxListenTime)) * artistListenTimeFactor;

		const tierWeight = matchTierWeights[matchTier] ?? 0;
		const userPreferencePoints =
			matchTier == "self" ? artistPreferenceScore * userPreferenceFactor * tierWeight : (1 - artistPreferenceScore) * userPreferenceFactor * tierWeight;

		const randomPoints = Math.random() * randomFactor;

		const totalPoints = popularityPoints + artistStrengthPoints + similarArtistsPoints + artistListenTimePoints + userPreferencePoints + randomPoints;

		pointsMap.set(song, [artistName, totalPoints]);
	});

	const sortedEntries = [...pointsMap.entries()].sort((a, b) => b[1][1] - a[1][1]);

	const maxSongsPerArtistOutput = 5;
	const artistCounts = {};
	const cappedEntries = [];

	for (const entry of sortedEntries) {
		const artistName = entry[1][0];
		artistCounts[artistName] = (artistCounts[artistName] || 0) + 1;
		if (artistCounts[artistName] > maxSongsPerArtistOutput) continue;
		cappedEntries.push(entry);
	}

	const output = new Map(cappedEntries);
	return output;
}

async function calculateArtistPreference() {
	const songTimes =
		(await callSqlite({
			db: "musics",
			query: "SELECT song_id, SUM(end_time - start_time) AS total_seconds FROM timers GROUP BY song_id",
			args: [],
			fetch: true,
		})) || [];

	const artistTimes = {};

	for (const row of songTimes) {
		const song = songNameCache.get(getTaratorKey(row.song_id));
		if (!song) continue;

		artistTimes[song.artist] = (artistTimes[song.artist] || 0) + row.total_seconds;
	}

	return calculateArtistPreferenceFromMap(artistTimes);
}

function calculateArtistPreferenceFromMap(artistTimes) {
	const artistDurations = Object.values(artistTimes);

	if (artistDurations.length == 0) return 999;
	if (artistDurations.length == 1) return 1;

	const sortedDurations = artistDurations.slice().sort((a, b) => a - b);

	const numArtists = sortedDurations.length;
	const cumulativeWeightedSum = sortedDurations.reduce((acc, duration, index) => acc + (index + 1) * duration, 0);
	const totalDuration = sortedDurations.reduce((sum, duration) => sum + duration, 0);

	const giniCoefficient = (2 * cumulativeWeightedSum) / (numArtists * totalDuration) - (numArtists + 1) / numArtists;

	logChange("debug", `Gini Coefficient (0 = equal, 1 = concentrated): ${giniCoefficient}`);

	return Number.isNaN(giniCoefficient) ? 999 : giniCoefficient;
}

async function fetchWithStatusCheck(url) {
	const res = await fetch(url);
	if (!res.ok) {
		const error = new Error(`HTTP ${res.status} for ${url}`);
		error.status = res.status;
		throw error;
	}
	return res.json();
}

async function fetchArtistFromDeezerOnce(artistName) {
	const searchData = await fetchWithStatusCheck(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`);
	if (!searchData.data || searchData.data.length == 0) {
		logChange("warn", `No match found for ${artistName}`);
		return null;
	}

	let exactMatch = searchData.data.find(art => art.name.toLowerCase().includes(artistName.toLowerCase()));
	if (!exactMatch) exactMatch = searchData.data[0];

	const relatedData = await fetchWithStatusCheck(`https://api.deezer.com/artist/${exactMatch.id}/related`);
	const similarArtists = relatedData.error ? [] : (relatedData.data || []).map(a => a.name);

	const tracksData = await fetchWithStatusCheck(`https://api.deezer.com/artist/${exactMatch.id}/top?limit=100`);
	const deezerSongs = (tracksData.data || []).map(track => track.title);

	logChange("debug", `Processed ${exactMatch.name}: ${exactMatch.nb_fan} fans, ${similarArtists.length} similar artists, ${deezerSongs.length} songs`);

	return {
		artist_id: exactMatch.id,
		artist_name: exactMatch.name,
		artist_fan_amount: exactMatch.nb_fan,
		similar_artists_array: similarArtists,
		deezer_songs_array: deezerSongs,
	};
}

async function fetchArtistFromDeezer(artistName) {
	const maxAttempts = 3;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fetchArtistFromDeezerOnce(artistName);
		} catch (error) {
			if (attempt == maxAttempts) {
				logChange("error", `Error processing ${artistName} after ${maxAttempts} attempts: ${error.message ?? String(error)}`);
				return null;
			}
			const backoff = 1000 * Math.pow(2, attempt - 1);
			logChange("warn", `Attempt ${attempt} failed for ${artistName}, retrying in ${backoff}ms: ${error.message ?? String(error)}`);
			await sleep(backoff);
		}
	}
}

async function fetchRecommendationsData(input) {
	if (!input) alertModal("Checking all songs for recommendations... You can close this modal.");

	const recommendationRows = await callSqlite({
		db: "musics",
		query: "SELECT artist_name FROM recommendations",
		args: [],
		fetch: true,
	});

	const existingArtists = new Set(recommendationRows.map(row => (row.artist_name ?? "").toLowerCase()).filter(Boolean));
	const artists = Array.isArray(input) ? input : input ? [input] : Array.from(new Set(Array.from(songNameCache.values()).map(song => song.artist)));
	const artistsToProcess = artists.filter(artist => artist && !existingArtists.has(artist.toLowerCase()));

	logChange("info", `Processing ${artistsToProcess.length} new artists (${existingArtists.size} already in db)`);

	const artistsData = [];
	const similarArtistsSet = new Set();

	for (const artist of artistsToProcess) {
		const result = await fetchArtistFromDeezer(artist);
		if (result) {
			result.similar_artists_array.forEach(art => similarArtistsSet.add(art));
			artistsData.push(result);
		}
		await sleep(1100);
	}

	const newSimilarArtists = Array.from(similarArtistsSet).filter(artist => !existingArtists.has(artist.toLowerCase()));

	for (const artist of newSimilarArtists) {
		const result = await fetchArtistFromDeezer(artist);
		if (result) {
			result.similar_artists_array.forEach(art => similarArtistsSet.add(art));
			artistsData.push(result);
		}
		await sleep(1100);
	}

	if (artistsData.length > 0) {
		for (const artist of artistsData) {
			await callSqlite({
				db: "musics",
				query: "INSERT OR REPLACE INTO recommendations (artist_id, artist_name, artist_fan_amount, similar_artists_array, deezer_songs_array) VALUES (?, ?, ?, ?, ?)",
				args: [artist.artist_id, artist.artist_name, artist.artist_fan_amount, JSON.stringify(artist.similar_artists_array), JSON.stringify(artist.deezer_songs_array)],
				fetch: false,
			});
			logChange("debug", `Inserted: ${artist.artist_id} ${artist.artist_name} ${artist.artist_fan_amount} ${JSON.stringify(artist.similar_artists_array)} ${JSON.stringify(artist.deezer_songs_array)}`);
		}

		logChange("info", `Saved ${artistsData.length} artists to recommendations table`);
		if (!input) alertModal(`Saved ${artistsData.length} artists to recommendations table`);
	} else {
		if (!input) alertModal(`Fetch of recommendations done, no new artists found.`);
	}
}