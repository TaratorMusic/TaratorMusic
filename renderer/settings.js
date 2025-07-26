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
	const rows = musicsDb.prepare("SELECT song_id, song_name, song_url, rms FROM songs WHERE song_url IS NOT NULL").all();
	const existingFiles = fs.readdirSync(musicFolder);
	const existingIds = new Set(existingFiles.map(file => path.parse(file).name));
	const filteredRows = rows.filter(row => !existingIds.has(row.song_id));

	if (filteredRows.length == 0) {
		await alertModal("No songs to redownload.");
		return;
	}

	await openThisModal("download");
	await checkNameThumbnail(true);

	downloadingStyle = "redownload";

	const songs = [];

	for (let i = 0; i < filteredRows.length; i++) {
		const row = filteredRows[i];
		const info = await ytdl.getInfo(row.song_url);

		const thumbnails = info.videoDetails.thumbnails || [];
		const bestThumbnail = thumbnails.reduce((max, thumb) => {
			const size = (thumb.width || 0) * (thumb.height || 0);
			const maxSize = (max.width || 0) * (max.height || 0);
			return size > maxSize ? thumb : max;
		}, thumbnails[0] || {});

		const thumbnailUrl = bestThumbnail.url || "";

		songs.push({
			url: row.song_url,
			id: row.song_id,
			title: row.song_name,
			rms: row.rms,
			thumbnail: thumbnailUrl,
		});

		document.getElementById("downloadModalText").innerText = `Thumbnail found for ${row.song_name}. Progress: ${i + 1} of ${filteredRows.length}.`;
		if (i + 1 != filteredRows.length) await sleep(2000);
	}

	await renderPlaylistUI("TaratorMusic Old Songs", path.join(appThumbnailFolder, "tarator_icon.png"), songs);
}
