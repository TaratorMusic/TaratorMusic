const ytdl = require("@distube/ytdl-core");
const fs = require("fs");

async function main() {
	const [videoUrl, outputFilePath] = process.argv.slice(2);
	const videoId = (videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/) || [])[1] || null;

	if (!videoId) {
		console.error("Invalid YouTube URL");
		process.exit(1);
	}

	try {
		console.log(`Fetching info for video ID: ${videoId}`);
		const info = await ytdl.getInfo(videoId);

		const adaptiveFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo);
		const regularFormats = info.formats.filter(f => f.hasAudio && f.hasVideo);

		console.log(`Found ${adaptiveFormats.length} adaptive audio formats and ${regularFormats.length} regular formats.`);

		console.log("Downloading best audio using ytdl-core...");
		const stream = ytdl(videoId, { quality: "highestaudio" });

		const writeStream = fs.createWriteStream(outputFilePath);
		stream.pipe(writeStream);

		let downloaded = 0;
		stream.on("data", chunk => {
			downloaded += chunk.length;
			console.log(`Downloaded ${downloaded} bytes`);
			if (process.send) process.send({ progress: { downloaded } });
		});

		writeStream.on("finish", () => {
			console.log("Download finished");
			if (process.send) process.send({ done: true });
			const regex = /^174655\d+-player-script\.js$/;
			fs.readdirSync("./").forEach(file => {
				if (regex.test(file)) {
					fs.unlinkSync(path.join("./", file));
					console.log(`Cleaning debug files...`);
				}
			});
			process.exit(0);
		});

		writeStream.on("error", err => {
			console.error("Write stream error:", err);
			if (process.send) process.send({ error: err.message });
			process.exit(1);
		});
	} catch (err) {
		console.error("Error downloading song:", err.message);
		if (process.send) process.send({ error: err.message });
		process.exit(1);
	}
}

main();
