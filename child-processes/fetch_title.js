const ytdl = require("@distube/ytdl-core");

function getYouTubeVideoId(url) {
	const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
	return match ? match[1] : null;
}

async function main() {
	const videoUrl = process.argv[2];
	try {
		const videoId = getYouTubeVideoId(videoUrl);
		if (!videoId) throw new Error("Invalid YouTube URL");

		const info = await ytdl.getInfo(videoId);
		const videoTitle = info.videoDetails.title;

		const thumbnails = info.videoDetails.thumbnails || [];
		const bestThumbnail = thumbnails.reduce((max, thumb) => {
			const size = (thumb.width || 0) * (thumb.height || 0);
			const maxSize = (max.width || 0) * (max.height || 0);
			return size > maxSize ? thumb : max;
		}, thumbnails[0] || {});

		const thumbnailUrl = bestThumbnail.url || "";

		process.send({ videoTitle, thumbnailUrl });
	} catch (error) {
		process.send({ error: error.message });
	}
}

main();
