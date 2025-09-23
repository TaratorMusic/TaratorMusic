const Player = require("mpris-service");

player = Player({
	name: "TaratorMusic",
	identity: "TaratorMusic",
	supportedUriSchemes: ["file"],
	supportedMimeTypes: ["audio/mpeg", "application/ogg"],
	supportedInterfaces: ["player"],
});

player.on("quit", function () {
	process.exit(); // BUGGED
});

const events = ["raise", "quit", "next", "previous", "pause", "playpause", "stop", "play", "seek", "position", "open", "volume", "loopStatus", "shuffle"];

events.forEach(eventName => {
	player.on(eventName, (...args) => {
		if (eventName === "raise") console.log("unused function for now:", eventName, args); // TODO, will raise the app
		else if (eventName === "quit") process.exit(); // TODO: Bugged
		else if (eventName === "next") playNextSong();
		else if (eventName === "previous") playPreviousSong();
		else if (eventName === "pause" && audioPlayer) audioPlayer.stdin.write("pause\n");
		else if (eventName === "playpause" && audioPlayer) playingSongsID ? audioPlayer.stdin.write("pause\n") : randomSongFunctionMainMenu();
		else if (eventName === "stop" && audioPlayer) audioPlayer.stdin.write("pause\n"); // TODO stopMusic();
		else if (eventName === "play") console.log("unused function for now:", eventName); // TODO
		else if (eventName === "seek") console.log("unused function for now:", eventName); // TODO
		else if (eventName === "position" && audioPlayer) audioPlayer.stdin.write(`seek ${args[0].position / 1000000}\n`);
		else if (eventName === "open") console.log("unused function for now:", eventName, args); // TODO
		else if (eventName === "volume") console.log("unused function for now:", eventName, args); // TODO
		else if (eventName === "loopStatus") toggleLoop();
		else if (eventName === "shuffle") toggleShuffle();
	});
});

function editMPRIS() {
	const row = musicsDb.prepare("SELECT song_name, song_length, thumbnail_extension, artist FROM songs WHERE song_id = ?").get(playingSongsID);
	player.metadata = {
		"mpris:trackid": player.objectPath("track/0"),
		"mpris:length": row.song_length * 1000000,
		"mpris:artUrl": path.join(thumbnailFolder, playingSongsID + "." + row.thumbnail_extension),
		"xesam:title": row.song_name,
		"xesam:artist": [row.artist],
	};
}
