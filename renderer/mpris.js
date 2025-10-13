const Player = require("mpris-service");

player = Player({
	name: "TaratorMusic",
	identity: "TaratorMusic",
	supportedUriSchemes: ["file"],
	supportedMimeTypes: ["audio/mpeg", "application/ogg"],
	supportedInterfaces: ["player"],
});

const events = ["raise", "quit", "next", "previous", "pause", "playpause", "stop", "play", "seek", "position", "open", "volume", "loopStatus", "shuffle"];

events.forEach(eventName => {
	player.on(eventName, (...args) => {
		if (eventName === "raise") ipcRenderer.invoke("raise-window");
		else if (eventName === "quit") ipcRenderer.invoke("close-app");
		else if (eventName === "next") playNextSong();
		else if (eventName === "previous") playPreviousSong();
		else if (eventName === "pause") {
			playPause();
			playing = false;
		} else if (eventName === "playpause") playingSongsID ? playPause() : randomSongFunctionMainMenu();
		else if (eventName === "stop") {
			playPause();
			playing = false;
		} else if (eventName === "play") {
			console.log("unused function for now:", eventName);
			playing = true;
		}
		else if (eventName === "seek" && audioPlayer) audioPlayer.stdin.write(`seek ${args[0].position / 1000000}\n`);
		else if (eventName === "position" && audioPlayer) audioPlayer.stdin.write(`seek ${args[0].position / 1000000}\n`);
		else if (eventName === "open") console.log("unused function for now:", eventName, args);
		else if (eventName === "volume") console.log("unused function for now:", eventName, args);
		else if (eventName === "loopStatus") toggleLoop();
		else if (eventName === "shuffle") toggleShuffle();
	});
});

function editMPRIS() {
	if (playingSongsID.includes("tarator")) {
		const row = musicsDb.prepare("SELECT song_name, song_length, thumbnail_extension, artist FROM songs WHERE song_id = ?").get(playingSongsID);
		player.metadata = {
			"mpris:trackid": player.objectPath("track/0"),
			"mpris:length": row.song_length * 1000000,
			"mpris:artUrl": path.join(thumbnailFolder, playingSongsID + "." + row.thumbnail_extension),
			"xesam:title": row.song_name,
			"xesam:artist": [row.artist],
		};
	} else {
		player.metadata = {
			"mpris:trackid": player.objectPath("track/0"),
			"mpris:length": recommendedSongsHtmlMap.get(playingSongsID)?.length * 1000000,
			"mpris:artUrl": recommendedSongsHtmlMap.get(playingSongsID)?.thumbnail.url,
			"xesam:title": recommendedSongsHtmlMap.get(playingSongsID)?.name,
			"xesam:artist": "TaratorMusic", // Not doing this
		};
	}
}
