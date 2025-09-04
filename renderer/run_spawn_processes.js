const { spawn } = require("child_process");

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
