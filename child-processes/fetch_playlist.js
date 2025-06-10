const ytpl = require("@distube/ytpl");

async function main() {
	const playlistUrl = process.argv[2];
	/* console.log(playlistUrl); */

	try {
		const match = playlistUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
		if (!match) throw new Error("Invalid playlist URL");
		const playlistId = match[1];

		/* console.log(playlistId); */

		const playlist = await ytpl(playlistId, { pages: Infinity });
		const playlistTitle = playlist.title;
		/* console.log(playlistTitle); */

		const videoItems = playlist.items.map(video => ({
			title: video.title || "Unknown Title",
			url: video.url,
			thumbnail: video.thumbnail || "",
		}));

		const playlistThumbnail = videoItems[0].thumbnail;

		process.send({
			data: {
				playlistTitle,
				playlistThumbnail,
				videoItems,
			},
		});
	} catch (error) {
		process.send({ error: error.message });
	}
}

main();
