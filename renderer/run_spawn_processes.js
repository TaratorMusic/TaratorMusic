function createAppThumbnailsFolder() {
	return new Promise((resolve, reject) => {
		const goBinary = path.join(backendFolder, "create_app_thumbnails_folder");
		const proc = spawn(goBinary, [appThumbnailFolder], { stdio: "inherit" });

		proc.on("error", reject);
		proc.on("close", code => {
			if (code !== 0) return reject(alertModal(`Go process exited with code ${code}`));
			alertModal("App thumbnails installed. App restart required for the effects.");
			resolve();
		});
	});
}

function shortenSongIdsGoPart(queryArray) {
	return new Promise((resolve, reject) => {
		const goBinary = path.join(backendFolder, "shorten_song_ids");
		const proc = spawn(goBinary, [queryArray[1], queryArray[2]], { stdio: ["pipe", "inherit", "inherit"] });

		proc.on("error", reject);

		proc.stdin.write(JSON.stringify(queryArray[0]));
		proc.stdin.end();

		proc.on("close", async code => {
			if (code !== 0) {
				await alertModal(`Go process exited with code ${code}`);
				return reject(new Error(`Go process exited with code ${code}`));
			}
			resolve();
		});
	});
}

async function grabAndStoreSongInfo() {
    return new Promise((resolve, reject) => {
        const goBinary = path.join(backendFolder, "musicbrainz_fetch");
        const songs = musicsDb.prepare(`
            SELECT song_name FROM songs
            WHERE artist IS NULL OR genre IS NULL OR language IS NULL
        `).all().map(r => r.song_name);

        if (!songs.length) return resolve();

        const proc = spawn(goBinary, songs);
        const stmt = musicsDb.prepare(`
            UPDATE songs
            SET artist = ?, genre = ?, language = ?
            WHERE song_name = ?
        `);

        let buffer = "";
        proc.stdout.on("data", chunk => {
            buffer += chunk.toString();
            let idx;
            while ((idx = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, idx).trim();
                buffer = buffer.slice(idx + 1);
                if (!line) continue;
                try {
                    const meta = JSON.parse(line);
                    console.log("New song:", meta.artist, meta.genre, meta.language, meta.title);
                    stmt.run(meta.artist, meta.genre, meta.language, meta.title);
                } catch (e) {
                    console.error("Bad JSON:", e);
                }
            }
        });

        proc.stderr.on("data", e => console.error(e.toString()));
        proc.on("error", reject);
        proc.on("close", code => code === 0 ? resolve() : reject(new Error(`Go exited ${code}`)));
    });
}
