// TODO: Make sure to have a "not interested" button and a list, which this function will check. (Also add it to the customise modal, playMusic will check if the song is ignored)

const popularityFactor = 0.15; // Ranking each artists songs 1-100, just inside their list
const artistStrengthFactor = 0.08; // Amount of fans the songs artist has in Deezer
const similarArtistsFactor = 0.20; // The songs artists similar artists and how much they are liked by the user
const userPreferenceFactor = 0.17; // If the user prefers to listen to the same artists or likes to explore new ones
const artistListenTimeFactor = 0.25; // How much the user listened to the artist of the song
const randomFactor = 0.15; // Randomness to change the recommendations each time

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

	const notInterestedSet = new Set(
		musicsDb
			.prepare("SELECT song_name FROM not_interested")
			.all()
			.map(row => row.song_name)
	);

	const existingArtistSet = new Set(
		musicsDb
			.prepare("SELECT DISTINCT artist FROM songs")
			.all()
			.map(row => row.artist)
	);

	const listenTimesMap = musicsDb
		.prepare(
			`
            SELECT songs.artist, SUM(end_time - start_time) AS totalListenTime
            FROM timers
            JOIN songs ON timers.song_id = songs.song_id
            GROUP BY songs.artist
            `
		)
		.all()
		.reduce((acc, row) => {
			acc[row.artist] = row.totalListenTime || 0;
			return acc;
		}, {});

	const maxListenTime = Math.max(...Object.values(listenTimesMap), 1);

	const artists = musicsDb.prepare("SELECT artist_name, deezer_songs_array, similar_artists_array, artist_fan_amount FROM recommendations").all();

	artists.forEach(artist => {
		const songs = JSON.parse(artist.deezer_songs_array);
		const similarArtists = JSON.parse(artist.similar_artists_array || "[]");
		const totalSongs = songs.length;

		songs.forEach((song, index) => {
			if (existingSongsSet.has(song) || notInterestedSet.has(song)) return;

			const positionFraction = 1 - index / totalSongs;
			songMap.set(song, [positionFraction, artist.artist_name, artist.artist_fan_amount, similarArtists]);
		});
	});

	songMap.forEach((value, song) => {
		const [positionFraction, artistName, artistFanAmount, similarArtists] = value;

		const popularityPoints = positionFraction * popularityFactor;

		const artistStrengthPoints = (Math.log(artistFanAmount + 1) / 10) * artistStrengthFactor;

		let similarArtistsPoints = 0;
		if (similarArtists.length > 0) {
			const listenedSimilarArtists = similarArtists.filter(simArtist => listenTimesMap[simArtist] && listenTimesMap[simArtist] > 0);

			if (listenedSimilarArtists.length > 0) {
				const totalSimilarScore = listenedSimilarArtists.reduce((acc, simArtist) => {
					return acc + Math.log(1 + listenTimesMap[simArtist]);
				}, 0);
				similarArtistsPoints = (totalSimilarScore / listenedSimilarArtists.length) * similarArtistsFactor;
			}
		}

		const artistListenTime = listenTimesMap[artistName] || 0;
		const artistListenTimePoints = artistListenTime > 0 ? (Math.log(1 + artistListenTime) / Math.log(1 + maxListenTime)) * artistListenTimeFactor : 0;

		const userPreferencePoints = existingArtistSet.has(artistName) ? artistPreferenceScore * userPreferenceFactor : (1 - artistPreferenceScore) * userPreferenceFactor;

		const randomPoints = Math.random() * randomFactor;

		const totalPoints = popularityPoints + artistStrengthPoints + similarArtistsPoints + userPreferencePoints + artistListenTimePoints + randomPoints;

		pointsMap.set(song, [artistName, totalPoints]);
	});

	const sortedPointsArray = [...pointsMap.entries()].sort((a, b) => b[1][1] - a[1][1]);
	const sortedPointsMap = new Map(sortedPointsArray);

	return sortedPointsMap;
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
	// console.log("Gini Coefficient (0 = equal, 1 = concentrated):", giniCoefficient);
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
			if (!searchData.data || searchData.data.length == 0) {
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
