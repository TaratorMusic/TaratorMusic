// Make sure to have a "not interested" button and a list, which this function will check. (Also add it to the customise modal)
// "Existing songs" set not really reliable

// If ytsr() of the song is in our db, fetch new ones

const popularityFactor = 0.1;
const artistStrengthFactor = 0.1;
const similarArtistsFactor = 0.6;
const userPreferenceFactor = 0.1;
const randomFactor = 0.1;

function getRecommendations() {
	const artistPreferenceScore = calculateArtistPreference();

	const songMap = new Map();
	const pointsMap = new Map();

	const existingSongsSet = new Set(
		musicsDb
			.prepare("SELECT song_name FROM songs")
			.all()
			.map(row => row.song_name)
	);

	const artists = musicsDb.prepare("SELECT artist_name, deezer_songs_array, artist_fan_amount FROM recommendations").all();

	artists.forEach(artist => {
		const songs = JSON.parse(artist.deezer_songs_array);
		const total = songs.length;
		songs.forEach((song, index) => {
			if (existingSongsSet.has(song)) return;

			const positionFraction = 1 - index / total;
			songMap.set(song, [positionFraction, artist.artist_name, artist.artist_fan_amount]);
		});
	});

	songMap.forEach((value, song) => {
		const [positionFraction, artistName, artistFanAmount] = value;

		const popularityPoints = positionFraction * popularityFactor;
		const artistStrengthPoints = (Math.log(artistFanAmount + 1) / 10) * artistStrengthFactor;

		const similarArtistsRow = musicsDb.prepare("SELECT similar_artists_array FROM recommendations WHERE artist_name = ?").get(artistName);

		let similarArtistsPoints = 0;
		if (similarArtistsRow) {
			const similarArtistsArray = JSON.parse(similarArtistsRow.similar_artists_array || "[]");
			if (similarArtistsArray.length > 0) {
				let totalSimilarScore = 0;
				similarArtistsArray.forEach(simArtist => {
					const listenTimeRow = musicsDb
						.prepare(
							`
                            SELECT SUM(end_time - start_time) AS totalListenTime 
                            FROM timers 
                            JOIN songs ON timers.song_id = songs.song_id 
                            WHERE songs.artist = ?
                        `
						)
						.get(simArtist);

					const totalListen = listenTimeRow?.totalListenTime || 60;
					totalSimilarScore += Math.log(1 + totalListen);
				});

				similarArtistsPoints = (totalSimilarScore / (similarArtistsArray.length + 1)) * similarArtistsFactor;
			}
		}

		const isExistingArtist = musicsDb.prepare("SELECT 1 FROM songs WHERE artist = ? LIMIT 1").get(artistName);
		const userPreferencePoints = isExistingArtist ? artistPreferenceScore * userPreferenceFactor : (1 - artistPreferenceScore) * userPreferenceFactor;

		const randomPoints = Math.random() * randomFactor;

		const totalPoints = popularityPoints + artistStrengthPoints + similarArtistsPoints + userPreferencePoints + randomPoints;

		pointsMap.set(song, [artistName, totalPoints]);
	});

	const sortedPointsArray = [...pointsMap.entries()].sort((a, b) => b[1][1] - a[1][1]);
	const sortedPointsMap = new Map(sortedPointsArray);

	console.log(sortedPointsMap);
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

	const artistDurations = Object.values(artistTimes);
	const sortedDurations = artistDurations.slice().sort((a, b) => a - b);

	const numArtists = sortedDurations.length;
	const cumulativeWeightedSum = sortedDurations.reduce((acc, duration, index) => acc + (index + 1) * duration, 0);
	const totalDuration = sortedDurations.reduce((sum, duration) => sum + duration, 0);

	const giniCoefficient = (2 * cumulativeWeightedSum) / (numArtists * totalDuration) - (numArtists + 1) / numArtists;
	console.log("Gini Coefficient (0 = equal, 1 = concentrated):", giniCoefficient);
	return giniCoefficient;
}

async function fetchRecommendationsData() {
	const recommendationRows = musicsDb.prepare("SELECT artist_name FROM recommendations").all();
	const existingArtists = new Set(recommendationRows.map(r => r.artist_name.toLowerCase()));

	const rows = musicsDb.prepare("SELECT DISTINCT artist FROM songs").all();
	const artists = rows.map(r => r.artist);
	const artistsToProcess = artists.filter(a => !existingArtists.has(a.toLowerCase()));

	console.log(`Processing ${artistsToProcess.length} new artists (${existingArtists.size} already in db)`);

	const artistsData = [];
	const similarArtistsSet = new Set();

	for (const artist of artistsToProcess) {
		try {
			const searchRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}`);
			const searchData = await searchRes.json();
			if (!searchData.data || searchData.data.length === 0) {
				console.log(`No match found for ${artist}`);
				continue;
			}

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

			console.log(`Processed ${exactMatch.name}: ${exactMatch.nb_fan} fans, ${similarArtists.length} similar artists, ${deezerSongs.length} songs`);
			await sleep(1100);
		} catch (err) {
			console.error(`Error processing ${artist}:`, err);
		}
	}

	const newSimilarArtists = Array.from(similarArtistsSet).filter(a => !existingArtists.has(a.toLowerCase()));

	for (const artist of newSimilarArtists) {
		try {
			const searchRes = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}`);
			const searchData = await searchRes.json();
			if (!searchData.data || searchData.data.length === 0) continue;

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

			console.log(`Processed ${exactMatch.name}: ${exactMatch.nb_fan} fans, ${similarArtists.length} similar artists, ${deezerSongs.length} songs`);
			await sleep(1100);
		} catch (err) {
			console.error(`Error processing similar artist ${artist}:`, err);
		}
	}

	if (artistsData.length > 0) {
		const insertStmt = musicsDb.prepare(`INSERT OR REPLACE INTO recommendations 
            (artist_id, artist_name, artist_fan_amount, similar_artists_array, deezer_songs_array) 
            VALUES (?, ?, ?, ?, ?)`);
		musicsDb.transaction(artists => {
			for (const a of artists) insertStmt.run(a.artist_id, a.artist_name, a.artist_fan_amount, JSON.stringify(a.similar_artists_array), JSON.stringify(a.deezer_songs_array));
		})(artistsData);

		console.log(`Saved ${artistsData.length} artists to recommendations table`);
	}
}
