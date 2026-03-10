async function saveKeybinds() {
	const buttons = Array.from(document.querySelectorAll(".settingsKeybinds button")).map(b => b.innerText.trim());
	const test = findDuplicates(buttons);

	if (test.length > 0) {
		await alertModal(`This key is a duplicate: ${test[0]}`);
		return;
	}

	callSqlite({ db: "settings", query: "UPDATE settings SET key_Rewind = ?", args: [document.getElementById("settingsRewind").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Previous = ?", args: [document.getElementById("settingsPrevious").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_PlayPause = ?", args: [document.getElementById("settingsPlayPause").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Next = ?", args: [document.getElementById("settingsNext").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Skip = ?", args: [document.getElementById("settingsSkip").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Autoplay = ?", args: [document.getElementById("settingsAutoplay").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Shuffle = ?", args: [document.getElementById("settingsShuffle").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Mute = ?", args: [document.getElementById("settingsMute").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Speed = ?", args: [document.getElementById("settingsSpeed").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_Loop = ?", args: [document.getElementById("settingsLoop").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_searchSong = ?", args: [document.getElementById("settingsSearchSong").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_RandomSong = ?", args: [document.getElementById("settingsRandomSong").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_RandomPlaylist = ?", args: [document.getElementById("settingsRandomPlaylist").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_LastPlaylist = ?", args: [document.getElementById("settingsLastPlaylist").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_searchPlaylist = ?", args: [document.getElementById("settingsSearchPlaylist").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_searchShuffle = ?", args: [document.getElementById("settingsSearchShuffle").innerHTML] });
	callSqlite({ db: "settings", query: "UPDATE settings SET key_lyrics = ?", args: [document.getElementById("settingsOpenLyrics").innerHTML] });

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
	key_searchSong = document.getElementById("settingsSearchSong").innerHTML;
	key_RandomSong = document.getElementById("settingsRandomSong").innerHTML;
	key_RandomPlaylist = document.getElementById("settingsRandomPlaylist").innerHTML;
	key_LastPlaylist = document.getElementById("settingsLastPlaylist").innerHTML;
	key_searchPlaylist = document.getElementById("settingsSearchPlaylist").innerHTML;
	key_searchShuffle = document.getElementById("settingsSearchShuffle").innerHTML;
	key_lyrics = document.getElementById("settingsOpenLyrics").innerHTML;
}

document.querySelectorAll(".settingsKeybinds button").forEach(button => {
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
	callSqlite({ db: "settings", query: "UPDATE settings SET background = ?", args: [color] });
	document.body.style.background = "";
	document.body.className = "";
	document.body.style.color = "white !important";

	if (color.includes("#")) {
		document.body.style.background = color;
	} else {
		document.body.classList.add(`bg-gradient-${color}`);
	}
}

async function redownloadAllSongs() {
	const rows = [...songNameCache.entries()].map(([song_id, song]) => ({
		song_id,
		song_name: song.song_name,
		song_url: song.song_url,
		song_extension: song.song_extension,
		thumbnail_extension: song.thumbnail_extension,
	}));

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
		let info;
		try {
			info = await getVideoInfo(videoUrl);
			document.getElementById("downloadModalText").innerText = `Thumbnail found for ${row.song_name}. Progress: ${i + 1} of ${filteredRows.length}.`;
		} catch {
			if (checkAllSongs == "SkipAll") continue;
			if (checkAllSongs == "AskEach") {
				confirmed = await confirmModal(`No URL for "${row.song_name}". Search YouTube?`, "Yes", "No");
				if (!confirmed) continue;
			}
			if (checkAllSongs == "SearchAll" || (checkAllSongs == "AskEach" && confirmed)) {
				try {
					const newUrl = await searchInYoutube(row.song_name);
					info = await getVideoInfo(videoUrl);
				} catch {
					continue;
				}
			}
		}

		const thumbnails = info.thumbnails || [];
		const bestThumbnail = thumbnails.reduce((max, thumb) => {
			const size = (thumb.width || 0) * (thumb.height || 0);
			const maxSize = (max.width || 0) * (max.height || 0);
			return size > maxSize ? thumb : max;
		}, thumbnails[0] || {});

		songs.push({
			url: row.song_url,
			id: row.song_id,
			title: row.song_name,
			thumbnail: bestThumbnail.url || "",
		});

		if (i + 1 != filteredRows.length) await sleep(500);
	}

	await renderPlaylistUI("TaratorMusic Old Songs", path.join(appThumbnailFolder, "tarator_icon.png"), songs);
}

async function saveRecommendationWeights() {
	let total = 0;

	for (let i = 1; i <= 6; i++) {
		const theValue = Number(document.getElementById(`weight${i}`).value);
		if (!Number.isFinite(theValue)) return await alertModal("One of the weights is not a number.");
		if (theValue > 100) return await alertModal("A weight can not be over 100.");
		if (theValue < 0) return await alertModal("A weight can not be negative.");
		total += theValue;
	}

	if (total != 100) return await alertModal("The total of all weights must equal to 100.");

	popularityFactor = document.getElementById("weight1").value;
	artistStrengthFactor = document.getElementById("weight2").value;
	similarArtistsFactor = document.getElementById("weight3").value;
	userPreferenceFactor = document.getElementById("weight4").value;
	artistListenTimeFactor = document.getElementById("weight5").value;
	randomFactor = document.getElementById("weight6").value;

	callSqlite({ db: "settings", query: "UPDATE settings SET popularityFactor = ?", args: [popularityFactor] });
	callSqlite({ db: "settings", query: "UPDATE settings SET artistStrengthFactor = ?", args: [artistStrengthFactor] });
	callSqlite({ db: "settings", query: "UPDATE settings SET similarArtistsFactor = ?", args: [similarArtistsFactor] });
	callSqlite({ db: "settings", query: "UPDATE settings SET userPreferenceFactor = ?", args: [userPreferenceFactor] });
	callSqlite({ db: "settings", query: "UPDATE settings SET artistListenTimeFactor = ?", args: [artistListenTimeFactor] });
	callSqlite({ db: "settings", query: "UPDATE settings SET randomFactor = ?", args: [randomFactor] });

	alertModal("Success!");
}

async function resetRecommendationWeights() {
	if (await confirmModal("Are you sure you would like to reset your recommendation weights?", "Yes", "No")) {
		popularityFactor = 15;
		artistStrengthFactor = 8;
		similarArtistsFactor = 20;
		userPreferenceFactor = 17;
		artistListenTimeFactor = 25;
		randomFactor = 15;

		document.getElementById("weight1").value = 15;
		document.getElementById("weight2").value = 8;
		document.getElementById("weight3").value = 20;
		document.getElementById("weight4").value = 17;
		document.getElementById("weight5").value = 25;
		document.getElementById("weight6").value = 15;

		callSqlite({ db: "settings", query: "UPDATE settings SET popularityFactor = ?", args: [popularityFactor] });
		callSqlite({ db: "settings", query: "UPDATE settings SET artistStrengthFactor = ?", args: [artistStrengthFactor] });
		callSqlite({ db: "settings", query: "UPDATE settings SET similarArtistsFactor = ?", args: [similarArtistsFactor] });
		callSqlite({ db: "settings", query: "UPDATE settings SET userPreferenceFactor = ?", args: [userPreferenceFactor] });
		callSqlite({ db: "settings", query: "UPDATE settings SET artistListenTimeFactor = ?", args: [artistListenTimeFactor] });
		callSqlite({ db: "settings", query: "UPDATE settings SET randomFactor = ?", args: [randomFactor] });

		await alertModal("Success!");
	}
}

async function stabiliseVolumeToggleTogglerFunction() {
	stabiliseVolumeToggle = stabiliseVolumeToggle == 1 ? 0 : 1;
	await callSqlite({ db: "settings", query: "UPDATE settings SET stabiliseVolumeToggle = ?", args: [stabiliseVolumeToggle] });
	console.log("New stabiliseVolumeToggle", stabiliseVolumeToggle);
}

async function recommendationsToggleTogglerFunction() {
	recommendationsAfterDownload = recommendationsAfterDownload == 1 ? 0 : 1;
	await callSqlite({ db: "settings", query: "UPDATE settings SET recommendationsAfterDownload = ?", args: [recommendationsAfterDownload] });
	console.log("New recommendationsAfterDownload", recommendationsAfterDownload);
}

async function pictureInPictureTogglerFunction() {
	pictureInPicture = pictureInPicture == 1 ? 0 : 1;
	await callSqlite({ db: "settings", query: "UPDATE settings SET pictureInPicture = ?", args: [pictureInPicture] });
	console.log("New pictureInPicture", pictureInPicture);
	pictureInPicture == 1 ? ipcRenderer.send("open-miniplayer") : ipcRenderer.send("miniplayer-close");
}
