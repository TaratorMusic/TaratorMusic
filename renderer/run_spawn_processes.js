const {spawn} = require("child_process");

function createAppThumbnailsFolder() {
	return new Promise((resolve, reject) => {
		const goBinary = path.join(backendFolder, "create_app_thumbnails_folder");
		const proc = spawn(goBinary, [appThumbnailFolder], {stdio: "inherit"});

		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code !== 0) return reject(alertModal(`Go process exited with code ${code}`));
			alertModal("App thumbnails installed. App restart required for the effects.");
			resolve();
		});
	});
}
