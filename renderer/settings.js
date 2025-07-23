async function saveKeybinds() {
	const buttons = Array.from(document.querySelectorAll(".settingsKeybindsButton")).map(button => button.innerText.trim());
	const test = findDuplicates(buttons);

	if (test.length > 0) {
		await alertModal(`This key is a duplicate: ${test[0]}`);
		return;
	}

	updateDatabase("key_Rewind", document.getElementById("settingsRewind").innerHTML, settingsDb);
	updateDatabase("key_Previous", document.getElementById("settingsPrevious").innerHTML, settingsDb);
	updateDatabase("key_PlayPause", document.getElementById("settingsPlayPause").innerHTML, settingsDb);
	updateDatabase("key_Next", document.getElementById("settingsNext").innerHTML, settingsDb);
	updateDatabase("key_Skip", document.getElementById("settingsSkip").innerHTML, settingsDb);
	updateDatabase("key_Autoplay", document.getElementById("settingsAutoplay").innerHTML, settingsDb);
	updateDatabase("key_Shuffle", document.getElementById("settingsShuffle").innerHTML, settingsDb);
	updateDatabase("key_Mute", document.getElementById("settingsMute").innerHTML, settingsDb);
	updateDatabase("key_Speed", document.getElementById("settingsSpeed").innerHTML, settingsDb);
	updateDatabase("key_Loop", document.getElementById("settingsLoop").innerHTML, settingsDb);

	key_Rewind = document.getElementById("settingsRewind").innerHTML;
	key_Previous = document.getElementById("settingsPrevious").innerHTML;
	key_PlayPause = document.getElementById("settingsPlayPause").innerHTML;
	key_Next = document.getElementById("settingsNext").innerHTML;
	key_Skip = document.getElementById("settingsSkip").innerHTML;
	key_Autoplay = document.getElementById("settingsAutoplay").innerHTML;
	key_Shuffle = document.getElementById("settingsShuffle").innerHTML;
	key_Mute = document.getElementById("settingsMute").innerHTML;
	key_Speed = document.getElementById("settingsSpeed").innerHTML;
	key_Loop = document.getElementById("settingsLoop").innerHTML;
}

document.querySelectorAll(".settingsKeybindsButton").forEach(button => {
	button.addEventListener("click", function () {
		const currentButton = this;
		currentButton.innerText = "Press a key...";
		disableKeyPresses = 1;

		function handleKeyPress(event) {
			currentButton.innerText = event.key;
			document.removeEventListener("keydown", handleKeyPress);
			disableKeyPresses = 0;
		}

		document.addEventListener("keydown", handleKeyPress);
	});
});

function changeBackground(color) {
	background = color;
	updateDatabase("background", color, settingsDb);
	if (background === "blue") {
		document.body.className = "bg-gradient-blue";
	} else if (background === "red") {
		document.body.className = "bg-gradient-red";
	} else if (background === "green") {
		document.body.className = "bg-gradient-green";
	} else if (background === "purple") {
		document.body.className = "bg-gradient-purple";
	} else if (background === "black") {
		document.body.className = "bg-gradient-black";
	}
}

function stabiliseVolumeToggleTogglerFunction() {
	stabiliseVolumeToggle = stabiliseVolumeToggle == 1 ? 0 : 1;
	updateDatabase("stabiliseVolumeToggle", stabiliseVolumeToggle, settingsDb);
}

async function redownloadAllSongs() {
	openThisModal("redownload");

	const rows = musicsDb.prepare("SELECT song_id, song_name, song_url, rms FROM songs WHERE song_url IS NOT NULL").all();

	if (rows.length === 0) {
		await alertModal("No songs to redownload.");
		return;
	}

	const songMap = new Map();

	for (const row of rows) {
		if (!row.song_url) continue;
		songMap.set(row.song_url, {
			song_id: row.song_id,
			song_name: row.song_name,
			rms: row.rms,
		});
	}

	// if (song.doesnt.exist) {wanna search for a similar song?} ytsr() --> Bunu renderPlaylistUI içine yapsak?

	renderPlaylistUI("TaratorMusic Old Songs", path.join(appThumbnailsFolder, "tarator_icon.png"), songMap); // TODO: Configure songMap to work in this function.

	console.log(songMap); // TODO: Remove
}
