async function updateFunctions(version) {
	if (version == "null") { // Has to be between brackets
		await shortenSongIds();
	}
}

async function shortenSongIds() {
	await alertModal("Shortening song ID's... Press 'Okay' to begin.");
	const rows = musicsDb.prepare("SELECT song_id FROM songs").all();

	for (const row of rows) {
		if (row.song_id.length > 15) {
			const oldId = row.song_id;
			const newId = generateId();

			musicsDb.prepare("UPDATE songs SET song_id = ? WHERE song_id = ?").run(newId, oldId);
			musicsDb.prepare("UPDATE timers SET song_id = ? WHERE song_id = ?").run(newId.replace("tarator", "").replace("-", ""), oldId.replace("tarator", "").replace("-", ""));

			const musicOldPath = path.join(musicFolder, oldId + ".mp3");
			const musicNewPath = path.join(musicFolder, newId + ".mp3");
			if (fs.existsSync(musicOldPath)) fs.renameSync(musicOldPath, musicNewPath);

			const thumbOldPath = path.join(thumbnailFolder, oldId + ".jpg");
			const thumbNewPath = path.join(thumbnailFolder, newId + ".jpg");
			if (fs.existsSync(thumbOldPath)) fs.renameSync(thumbOldPath, thumbNewPath);
		}
	}
	await alertModal("Task complete.");
}
