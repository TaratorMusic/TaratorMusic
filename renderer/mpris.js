const Player = require("mpris-service");

const player = Player({
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
		if (eventName === "raise") console.log("unused function for now:", eventName);
		else if (eventName === "quit") process.exit();
		else if (eventName === "next") playNextSong();
		else if (eventName === "previous") playPreviousSong();
		else if (eventName === "pause" && audioPlayer) audioPlayer.stdin.write("pause\n");
		else if (eventName === "playpause" && audioPlayer) audioPlayer.stdin.write("pause\n");
		else if (eventName === "stop") stopMusic();
		else if (eventName === "play") randomSongFunctionMainMenu();
		else if (eventName === "seek") console.log("unused function for now:", eventName);
		else if (eventName === "position") console.log("unused function for now:", eventName);
		else if (eventName === "open") console.log("unused function for now:", eventName);
		else if (eventName === "volume") console.log("unused function for now:", eventName);
		else if (eventName === "loopStatus") toggleLoop();
		else if (eventName === "shuffle") toggleShuffle();
	});
});

function editMPRIS(song) {
	const row = musicsDb.prepare("SELECT song_name, song_length, thumbnail_extension, artist FROM songs WHERE song_id = ?").get(song);
	player.metadata = {
		"mpris:trackid": player.objectPath("track/0"),
		"mpris:length": row.song_length,
		"mpris:artUrl": path.join(thumbnailFolder, song + "." + row.thumbnail_extension),
		"xesam:title": row.song_name,
		"xesam:artist": [row.artist],
	};
}
