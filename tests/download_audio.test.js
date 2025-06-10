/* Jest tests will be included here.

TODO Tests:

Multiple tests for all the functions
Download Music
Download Music with name changed, thumbnail changed, both
Same for playlists
Render databases
Change volume
Render musics
"Playing" text on boxes
Change stuff from settings and check if it goes to the db
Check randomness of the main menu functions
Check keybinds
Check customisation - remove song & playlists
Discord Connection on-off
Check if playlists work correctly
Check audio & sound stabilisation

*/

const ytdl = require("@distube/ytdl-core");
const fs = require("fs");
const path = require("path");

describe("ytdl-core full download test", () => {
	const videoId = "dQw4w9WgXcQ";
	const outputFile = path.resolve(__dirname, "test-audio.mp4");

	jest.setTimeout(120000);

	test("should download full best audio and save to file", done => {
		const stream = ytdl(videoId, {
			quality: "highestaudio",
			requestOptions: {
				headers: {
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
				},
			},
		});

		const writeStream = fs.createWriteStream(outputFile);

		stream.pipe(writeStream);

		writeStream.on("finish", () => {
			try {
				const stats = fs.statSync(outputFile);
				expect(stats.size).toBeGreaterThan(0);
				done();
			} finally {
				fs.unlinkSync(outputFile);
			}
		});

		writeStream.on("error", err => {
			done(err);
		});
		stream.on("error", err => {
			done(err);
		});
	});
});
