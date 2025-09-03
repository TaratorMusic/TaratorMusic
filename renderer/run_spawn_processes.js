const { spawn } = require("child_process");

function createAppThumbnailsFolder() {
	return new Promise((resolve, reject) => {
		const goFile = path.join(backendFolder, "create_app_thumbnails_folder");
		const proc = spawn("go", ["run", goFile, appThumbnailFolder], { stdio: "inherit" });

		proc.on("error", reject);
		proc.on("close", code => {
			if (code !== 0) return reject(new Error(`Go process exited with code ${code}`));
			alertModal("App thumbnails installed. App restart required for the effects.");
			resolve();
		});
	});
}