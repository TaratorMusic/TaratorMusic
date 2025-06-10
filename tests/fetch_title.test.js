const { Innertube } = require("youtubei.js");

describe("YouTube Link Info", () => {
	jest.setTimeout(30000);

	test("Should fetch video info successfully", async () => {
		try {
			let youtube = await Innertube.create();

			const videoId = "dQw4w9WgXcQ";
			const videoInfo2 = await youtube.getInfo(videoId);
			const videoInfo = videoInfo2.basic_info;
			const title = videoInfo.title;

			console.log(title);

			expect(videoInfo).toBeDefined();
			expect(title).toBe("Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)");
		} catch (error) {
			throw error;
		}
	});
});
