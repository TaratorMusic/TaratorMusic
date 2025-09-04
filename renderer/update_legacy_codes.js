async function updateFunctions(version) {
	if (version == "null") {
		// "null" has to be between brackets
		await shortenSongIds();
	}
}

async function shortenSongIds() {
	await alertModal("Shortening song ID's... Press 'Okay' to begin. Might take a while...");

	const rows = musicsDb.prepare("SELECT song_id, song_extension, thumbnail_extension FROM songs").all();
	const renameMapping = [];

	for (const row of rows) {
		if (row.song_id.length > 15) {
			const oldId = row.song_id;
			const songExtension = row.song_extension;
			const thumbnailExtension = row.thumbnail_extension;
			const newId = generateId();

			const strippedOldId = oldId.replace("tarator", "").replace("-", "");
			const strippedNewId = newId.replace("tarator", "").replace("-", "");

			musicsDb.prepare("UPDATE songs SET song_id = ? WHERE song_id = ?").run(newId, oldId);
			musicsDb.prepare("UPDATE timers SET song_id = ? WHERE song_id = ?").run(strippedNewId, strippedOldId);

			const playlists = playlistsDb.prepare("SELECT id, songs FROM playlists").all();
			for (const playlist of playlists) {
				let songsArr = JSON.parse(playlist.songs);
				let changed = false;
				songsArr = songsArr.map(s => {
					if (s === strippedOldId) {
						changed = true;
						return strippedNewId;
					}
					return s;
				});
				if (changed) playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE id = ?").run(JSON.stringify(songsArr), playlist.id);
			}

			renameMapping.push({
				oldId,
				newId,
				songExtension,
				thumbnailExtension,
			});
		}
	}

	let queryArray = [renameMapping, musicFolder, thumbnailFolder];

	if (renameMapping.length > 0) {
		await loadNewPage("shortenSongIdsGoPart", queryArray);
	}

	await alertModal("Task complete.");
}
