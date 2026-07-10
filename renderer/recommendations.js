async function getRecommendations(songIds) {
	const uniqueSongIds = songIds?.length ? songIds : [...songNameCache.keys()].map(id => String(id));
	const artistListenTimes = {};
	const inputArtists = new Set();

	const songTimes =
		(await callSqlite({
			db: "musics",
			query: "SELECT song_id, SUM(end_time - start_time) AS total_seconds FROM timers GROUP BY song_id",
			args: [],
			fetch: true,
		})) || [];

	const songTimesMap = new Map(songTimes.map(row => [`tarator-${row.song_id}`, row.total_seconds]));

	for (const songId of uniqueSongIds) {
		const song = songNameCache.get(songId);
		if (!song) continue;

		const listenTime = songTimesMap.get(songId) || 0;

		artistListenTimes[song.artist] = (artistListenTimes[song.artist] || 0) + listenTime;
		inputArtists.add(song.artist);
	}

	const artistPreferenceScore = calculateArtistPreferenceFromMap(artistListenTimes);

	if (artistPreferenceScore == 999) {
		return alertModal("No songs listened yet to give recommendations of.");
	}

	const existingSongsSet = new Set(Array.from(songNameCache.values()).map(song => song.song_name));
	const notInterestedSet = new Set(notInterestedSongs.map(song => song.song_name));
	const existingArtistSet = new Set(Object.keys(artistListenTimes));

	const maxListenTime = Math.max(...Object.values(artistListenTimes), 1);

	const artists = await callSqlite({
		db: "musics",
		query: "SELECT artist_name, deezer_songs_array, similar_artists_array, artist_fan_amount FROM recommendations",
		args: [],
		fetch: true,
	});

	const songMap = new Map();

	for (const artist of artists) {
		const songs = JSON.parse(artist.deezer_songs_array || "[]");
		const similarArtists = JSON.parse(artist.similar_artists_array || "[]");

		if (!songs.length) continue;

		let matchedListenTime = 0;

		for (const similarArtist of similarArtists) {
			matchedListenTime += artistListenTimes[similarArtist] || 0;
		}

		if (matchedListenTime == 0) continue;

		const totalSongs = songs.length;

		songs.forEach((song, index) => {
			if (existingSongsSet.has(song) || notInterestedSet.has(song)) return;

			const positionFraction = 1 - index / totalSongs;

			songMap.set(song, [positionFraction, artist.artist_name, artist.artist_fan_amount, similarArtists, matchedListenTime]);
		});
	}

	const pointsMap = new Map();

	songMap.forEach((value, song) => {
		const [positionFraction, artistName, artistFanAmount, similarArtists, matchedListenTime] = value;

		const popularityPoints = positionFraction * popularityFactor;

		const artistStrengthPoints = (Math.log(artistFanAmount + 1) / 10) * artistStrengthFactor;

		let similarArtistsPoints = 0;

		if (similarArtists.length > 0) {
			const listenedSimilarArtists = similarArtists.filter(artist => artistListenTimes[artist] > 0);

			if (listenedSimilarArtists.length > 0) {
				const totalSimilarScore = listenedSimilarArtists.reduce((acc, artist) => acc + Math.log(1 + artistListenTimes[artist]), 0);

				similarArtistsPoints = (totalSimilarScore / listenedSimilarArtists.length) * similarArtistsFactor;
			}
		}

		const artistListenTimePoints = (Math.log(1 + matchedListenTime) / Math.log(1 + maxListenTime)) * artistListenTimeFactor;

		const userPreferencePoints = existingArtistSet.has(artistName) ? artistPreferenceScore * userPreferenceFactor : (1 - artistPreferenceScore) * userPreferenceFactor;

		const randomPoints = Math.random() * randomFactor;

		const totalPoints = popularityPoints + artistStrengthPoints + similarArtistsPoints + artistListenTimePoints + userPreferencePoints + randomPoints;

		pointsMap.set(song, [artistName, totalPoints]);
	});

	const output = new Map([...pointsMap.entries()].sort((a, b) => b[1][1] - a[1][1]));
	console.log(output);
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
		const song = songNameCache.get(`tarator-${row.song_id}`);
		if (!song) continue;

		artistTimes[song.artist] = (artistTimes[song.artist] || 0) + row.total_seconds;
	}

	return calculateArtistPreferenceFromMap(artistTimes);
}

function calculateArtistPreferenceFromMap(artistTimes) {
	const artistDurations = Object.values(artistTimes);

	if (artistDurations.length == 0) return 999;

	const sortedDurations = artistDurations.slice().sort((a, b) => a - b);

	const numArtists = sortedDurations.length;
	const cumulativeWeightedSum = sortedDurations.reduce((acc, duration, index) => acc + (index + 1) * duration, 0);
	const totalDuration = sortedDurations.reduce((sum, duration) => sum + duration, 0);

	const giniCoefficient = (2 * cumulativeWeightedSum) / (numArtists * totalDuration) - (numArtists + 1) / numArtists;

	logChange("log", `Gini Coefficient (0 = equal, 1 = concentrated): ${giniCoefficient}`);

	return Number.isNaN(giniCoefficient) ? 999 : giniCoefficient;
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

	logChange("log", `Processing ${artistsToProcess.length} new artists (${existingArtists.size} already in db)`);

	const artistsData = [];
	const similarArtistsSet = new Set();

	for (const artist of artistsToProcess) {
		try {
			const searchRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}`);
			const searchData = await searchRes.json();
			if (!searchData.data || searchData.data.length == 0) {
				logChange("warn", `No match found for ${artist}`);
				continue;
			}

			let exactMatch = searchData.data.find(art => art.name.toLowerCase().includes(artist.toLowerCase()));
			if (!exactMatch) exactMatch = searchData.data[0];

			const relatedRes = await fetch(`https://api.deezer.com/artist/${exactMatch.id}/related`);
			const relatedData = await relatedRes.json();
			const similarArtists = relatedData.error ? [] : (relatedData.data || []).map(a => a.name);
			similarArtists.forEach(art => similarArtistsSet.add(art));

			const tracksRes = await fetch(`https://api.deezer.com/artist/${exactMatch.id}/top?limit=100`);
			const tracksData = await tracksRes.json();
			const deezerSongs = (tracksData.data || []).map(track => track.title);

			artistsData.push({
				artist_id: exactMatch.id,
				artist_name: exactMatch.name,
				artist_fan_amount: exactMatch.nb_fan,
				similar_artists_array: similarArtists,
				deezer_songs_array: deezerSongs,
			});

			logChange("log", `Processed ${exactMatch.name}: ${exactMatch.nb_fan} fans, ${similarArtists.length} similar artists, ${deezerSongs.length} songs`);
			await sleep(1100);
		} catch (error) {
			logChange("error", `Error processing ${artist}: ${error.message ?? String(error)}`);
		}
	}

	const newSimilarArtists = Array.from(similarArtistsSet).filter(artist => !existingArtists.has(artist.toLowerCase()));

	for (const artist of newSimilarArtists) {
		try {
			const searchRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}`);
			const searchData = await searchRes.json();
			if (!searchData.data || searchData.data.length == 0) continue;

			let exactMatch = searchData.data.find(a => a.name.toLowerCase().includes(artist.toLowerCase()));
			if (!exactMatch) exactMatch = searchData.data[0];

			const relatedRes = await fetch(`https://api.deezer.com/artist/${exactMatch.id}/related`);
			const relatedData = await relatedRes.json();
			const similarArtists = relatedData.error ? [] : (relatedData.data || []).map(a => a.name);
			similarArtists.forEach(a => similarArtistsSet.add(a));

			const tracksRes = await fetch(`https://api.deezer.com/artist/${exactMatch.id}/top?limit=100`);
			const tracksData = await tracksRes.json();
			const deezerSongs = (tracksData.data || []).map(track => track.title);

			artistsData.push({
				artist_id: exactMatch.id,
				artist_name: exactMatch.name,
				artist_fan_amount: exactMatch.nb_fan,
				similar_artists_array: similarArtists,
				deezer_songs_array: deezerSongs,
			});

			logChange("log", `Processed ${exactMatch.name}: ${exactMatch.nb_fan} fans, ${similarArtists.length} similar artists, ${deezerSongs.length} songs`);
			await sleep(1100);
		} catch (error) {
			logChange("error", `Error processing similar artist ${artist}: ${error.message ?? String(error)}`);
		}
	}

	if (artistsData.length > 0) {
		for (const artist of artistsData) {
			await callSqlite({
				db: "musics",
				query: "INSERT OR REPLACE INTO recommendations (artist_id, artist_name, artist_fan_amount, similar_artists_array, deezer_songs_array) VALUES (?, ?, ?, ?, ?)",
				args: [artist.artist_id, artist.artist_name, artist.artist_fan_amount, JSON.stringify(artist.similar_artists_array), JSON.stringify(artist.deezer_songs_array)],
				fetch: false,
			});
			logChange("log", `Inserted: ${(artist.artist_id, artist.artist_name, artist.artist_fan_amount, JSON.stringify(artist.similar_artists_array), JSON.stringify(artist.deezer_songs_array))}`);
		}

		logChange("log", `Saved ${artistsData.length} artists to recommendations table`);
		if (!input) alertModal(`Saved ${artistsData.length} artists to recommendations table`);
	} else {
		if (!input) alertModal(`Fetch of recommendations done, no new artists found.`);
	}
}
