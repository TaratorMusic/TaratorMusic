const ytdl = require("@distube/ytdl-core");

describe("YouTube Link Info", () => {
	jest.setTimeout(30000);

	test("Should fetch video info successfully", async () => {
		try {
			const videoId = "dQw4w9WgXcQ";
			const info = await ytdl.getInfo(videoId);
			const title = info.videoDetails.title;

			console.log(title);

			expect(info).toBeDefined();
			expect(title).toBe("Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)");
		} catch (error) {
			throw error;
		}
	});
});
