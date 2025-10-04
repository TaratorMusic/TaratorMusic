// If the user listened to the artists less popular songs, it makes more points.
// Since we dont have song popularity numbers, we will give percentages to the songs. Artists 1. song: %100. 100. song: 20-50%

// Make sure to have a "not interested" button and a list, which this function will check. (Also add it to the customise modal)

// Create new array: All the songs that are in the recommendations db but not in musicsdb. And their positions in the arrays.
// Create new map: Artist - Artist fan count - log(artistTotalListenTime)
// We have: users artists preference (gini)
// Add a bit of randomness. Like 10%

function getRecommendations() {
	// const artistPreferenceScore = calculateArtistPreference();
	// const recommendedSongs = {};

	// getSameArtistSongs(artistPreferenceScore);
	// getNewArtistSongs(10 - artistPreferenceScore);
}

function calculateArtistPreference() {
	const songTimes = musicsDb
		.prepare(
			`
            SELECT song_id, SUM(end_time - start_time) AS total_seconds
            FROM timers
            GROUP BY song_id
            `
		)
		.all();

	const artistTimes = {};

	for (const row of songTimes) {
		const song = musicsDb.prepare("SELECT artist FROM songs WHERE song_id = ?").get(`tarator-${row.song_id}`);
		if (!song) continue;
		artistTimes[song.artist] = (artistTimes[song.artist] || 0) + row.total_seconds;
	}

	const sorted = Object.values(artistTimes)
		.slice()
		.sort((a, b) => a - b);
	const n = sorted.length;
	const cum = sorted.reduce((acc, v, i) => acc + (i + 1) * v, 0);
	const total = sorted.reduce((a, b) => a + b, 0);

	const giniScore = (2 * cum) / (n * total) - (n + 1) / n;
	console.log("Gini Coefficient (0 = equal, 1 = concentrated):", giniScore);
	return giniScore;
}

async function fetchRecommendationsData() {
	// TODO: Similar artist fetch is bugged?
	const recommendationRows = musicsDb.prepare("SELECT artist_name FROM recommendations").all();
	const existingArtists = new Set(recommendationRows.map(row => row.artist_name.toLowerCase()));

	const rows = musicsDb.prepare("SELECT DISTINCT artist FROM songs").all();
	const artists = rows.map(row => row.artist);

	const artistsToProcess = artists.filter(artist => !existingArtists.has(artist.toLowerCase()));
	console.log(`Processing ${artistsToProcess.length} new artists (${existingArtists.size} already in db)`);

	const artistsData = [];
	const allSimilarArtists = new Set();

	for (const artist of artistsToProcess) {
		try {
			const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}`;
			const searchRes = await fetch(searchUrl);
			const searchData = await searchRes.json();

			if (!searchData.data || searchData.data.length == 0) {
				console.log(`No results for artist: ${artist}`);
				continue;
			}

			const exactMatch = searchData.data.find(a => a.name.toLowerCase() == artist.toLowerCase());
			if (!exactMatch) {
				console.log(`Exact Deezer match not found for artist: ${artist}`);
				continue;
			}

			const artistId = exactMatch.id;

			const relatedRes = await fetch(`https://api.deezer.com/artist/${artistId}/related`);
			const relatedData = await relatedRes.json();
			const similarArtists = (relatedData.data || []).map(a => a.name);
			similarArtists.forEach(a => allSimilarArtists.add(a));

			const tracksRes = await fetch(`https://api.deezer.com/artist/${artistId}/top?limit=100`);
			const tracksData = await tracksRes.json();
			const deezerSongs = (tracksData.data || []).map(track => track.title);

			artistsData.push({
				artist_id: artistId,
				artist_name: exactMatch.name,
				artist_fan_amount: exactMatch.nb_fan,
				similar_artists_array: similarArtists,
				deezer_songs_array: deezerSongs,
			});

			console.log(`Processed ${exactMatch.name}: ${exactMatch.nb_fan} fans, ${similarArtists.length} similar artists, ${deezerSongs.length} songs`);
			await sleep(1100);
		} catch (error) {
			console.error(`Error processing artist ${artist}:`, error);
			continue;
		}
	}

	const newSimilarArtists = Array.from(allSimilarArtists).filter(a => !existingArtists.has(a.toLowerCase()));
	for (const artist of newSimilarArtists) {
		try {
			const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}`;
			const searchRes = await fetch(searchUrl);
			const searchData = await searchRes.json();
			const exactMatch = searchData.data.find(a => a.name.toLowerCase() == artist.toLowerCase());
			if (!exactMatch) continue;

			const artistId = exactMatch.id;

			const tracksRes = await fetch(`https://api.deezer.com/artist/${artistId}/top?limit=100`);
			const tracksData = await tracksRes.json();
			const deezerSongs = (tracksData.data || []).map(track => track.title);

			artistsData.push({
				artist_id: artistId,
				artist_name: exactMatch.name,
				artist_fan_amount: exactMatch.nb_fan,
				similar_artists_array: [],
				deezer_songs_array: deezerSongs,
			});

			console.log(`Processed similar artist ${exactMatch.name}: ${exactMatch.nb_fan} fans, ${deezerSongs.length} songs`);
			await sleep(1100);
		} catch (error) {
			console.error(`Error processing similar artist ${artist}:`, error);
			continue;
		}
	}

	if (artistsData.length > 0) {
		const insertStmt = musicsDb.prepare(`INSERT OR REPLACE INTO recommendations 
            (artist_id, artist_name, artist_fan_amount, similar_artists_array, deezer_songs_array) 
            VALUES (?, ?, ?, ?, ?)`);

		musicsDb.transaction(artists => {
			for (const artist of artists) insertStmt.run(artist.artist_id, artist.artist_name, artist.artist_fan_amount, JSON.stringify(artist.similar_artists_array), JSON.stringify(artist.deezer_songs_array));
		})(artistsData);

		console.log(`Saved ${artistsData.length} artists to recommendations table`);
	}
}
