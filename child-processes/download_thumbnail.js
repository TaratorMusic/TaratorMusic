const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const https = require("https");

async function main() {
	const [videoId, thumbnailPath] = process.argv.slice(2);

	if (!videoId || !thumbnailPath) {
		console.error("Missing arguments: videoId thumbnailPath");
		process.exit(1);
	}

	try {
		const info = await ytdl.getInfo(videoId);
		const thumbnails = info.videoDetails.thumbnails;

		if (!thumbnails || thumbnails.length === 0) {
			throw new Error("No thumbnails found");
		}

		const thumbnailUrl = thumbnails[thumbnails.length - 1].url;

		https
			.get(thumbnailUrl, res => {
				if (res.statusCode !== 200) {
					console.error(`Failed to fetch thumbnail: ${res.statusCode}`);
					if (process.send) process.send({ error: "Thumbnail fetch failed" });
					process.exit(1);
				}

				const file = fs.createWriteStream(thumbnailPath);
				res.pipe(file);

				file.on("finish", () => {
					file.close(() => {
						console.log("Thumbnail saved");
						if (process.send) process.send({ done: true });
						process.exit(0);
					});
				});

				file.on("error", err => {
					console.error("File write error:", err.message);
					if (process.send) process.send({ error: err.message });
					process.exit(1);
				});
			})
			.on("error", err => {
				console.error("HTTPS request error:", err.message);
				if (process.send) process.send({ error: err.message });
				process.exit(1);
			});
	} catch (err) {
		console.error("YouTube fallback failed:", err.message);
		if (process.send) process.send({ error: err.message });
		process.exit(1);
	}
}

main();
