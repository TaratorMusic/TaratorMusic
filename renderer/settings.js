async function saveKeybinds() {
	const buttons = Array.from(document.querySelectorAll(".settingsKeybindsButton")).map(button => button.innerText.trim());
	const test = findDuplicates(buttons);

	if (test.length > 0) {
		await alertModal(`This key is a duplicate: ${test[0]}`);
		return;
	}

	updateDatabase("key_Rewind", document.getElementById("settingsRewind").innerHTML, settingsDb, "settings");
	updateDatabase("key_Previous", document.getElementById("settingsPrevious").innerHTML, settingsDb, "settings");
	updateDatabase("key_PlayPause", document.getElementById("settingsPlayPause").innerHTML, settingsDb, "settings");
	updateDatabase("key_Next", document.getElementById("settingsNext").innerHTML, settingsDb, "settings");
	updateDatabase("key_Skip", document.getElementById("settingsSkip").innerHTML, settingsDb, "settings");
	updateDatabase("key_Autoplay", document.getElementById("settingsAutoplay").innerHTML, settingsDb, "settings");
	updateDatabase("key_Shuffle", document.getElementById("settingsShuffle").innerHTML, settingsDb, "settings");
	updateDatabase("key_Mute", document.getElementById("settingsMute").innerHTML, settingsDb, "settings");
	updateDatabase("key_Speed", document.getElementById("settingsSpeed").innerHTML, settingsDb, "settings");
	updateDatabase("key_Loop", document.getElementById("settingsLoop").innerHTML, settingsDb, "settings");

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
	updateDatabase("background", color, settingsDb, "settings");
	document.body.className = `bg-gradient-${color}`;
}

async function redownloadAllSongs() {
	const rows = musicsDb.prepare("SELECT song_id, song_name, song_url FROM songs").all();
	const existingFiles = fs.readdirSync(musicFolder);
	const existingIds = new Set(existingFiles.map(file => path.parse(file).name));
	const filteredRows = rows.filter(row => !existingIds.has(row.song_id));

	if (filteredRows.length == 0) {
		await alertModal("No songs to redownload.");
		return;
	}

	await loadNewPage("download");
	await loadNewPage("downloadModal");
	await checkNameThumbnail(true);
	downloadingStyle = "redownload";
	const songs = [];

	let checkAllSongs = await threeWayModal("How would you like to handle songs with missing URLs?", "Search All", "Ask for Each", "Skip All", "SearchAll", "AskEach", "SkipAll");

	for (let i = 0; i < filteredRows.length; i++) {
		const row = filteredRows[i];
		let confirmed = false;
		try {
			info = await ytdl.getInfo(row.song_url);
			document.getElementById("downloadModalText").innerText = `Thumbnail found for ${row.song_name}. Progress: ${i + 1} of ${filteredRows.length}.`;
		} catch (err) {
			if (checkAllSongs == "SkipAll") {
				continue;
			} else if (checkAllSongs == "AskEach") {
				confirmed = await confirmModal(`No URL for "${row.song_name}". Search YouTube?`, "Yes", "No");
				if (!confirmed) {
					continue;
				}
			}

			if (checkAllSongs == "SearchAll" || (checkAllSongs == "AskEach" && confirmed)) {
				try {
					const newUrl = await searchInYoutube(row.song_name);
					info = await ytdl.getInfo(newUrl);
				} catch (e) {
					continue;
				}
			}
		}

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
			thumbnail: thumbnailUrl,
		});

		if (i + 1 != filteredRows.length) await sleep(500); // For not overloading Youtube API
	}

	await renderPlaylistUI("TaratorMusic Old Songs", path.join(appThumbnailFolder, "tarator_icon.png"), songs);
}

function stabiliseVolumeToggleTogglerFunction() {
	stabiliseVolumeToggle = stabiliseVolumeToggle == 1 ? 0 : 1;
	updateDatabase("stabiliseVolumeToggle", stabiliseVolumeToggle, settingsDb, "settings");
}

async function updateThumbnailImage(event, mode) {
	const file = event.target.files[0];
	if (file && file.type == "image/jpeg") {
		const reader = new FileReader();
		reader.onload = e => {
			if (typeof mode == "number") {
				const id = mode == 1 ? "customiseImage" : mode == 2 ? "editPlaylistThumbnail" : mode == 3 ? "thumbnailImage" : null;
				if (id) document.getElementById(id).src = e.target.result;
			} else if (mode instanceof HTMLElement) {
				mode.style.backgroundImage = `url(${e.target.result})`;
			}
		};
		reader.readAsDataURL(file);
	} else {
		await alertModal("Please select a valid JPG image.");
	}
}
