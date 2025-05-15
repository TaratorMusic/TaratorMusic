const fetch = require("node-fetch");
const ytdl = require("@distube/ytdl-core");
const ytpl = require("@distube/ytpl");

function cleanDebugFiles() {
	const regex = /^174655\d+-player-script\.js$/;
	fs.readdirSync("./").forEach(file => {
		if (regex.test(file)) {
			fs.unlinkSync(path.join("./", file));
			console.log("Deleted debug file.");
		}
	});
}

function differentiateYouTubeLinks(url) {
	const videoRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/;
	const playlistRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=([^&]+)/;

	if (videoRegex.test(url.trim())) {
		return "video";
	} else if (playlistRegex.test(url.trim())) {
		return "playlist";
	} else {
		return "unknown";
	}
}

function checkNameThumbnail() {
	document.getElementById("downloadFirstButton").disabled = true;

	if (document.getElementById("downloadSecondPhase")) {
		document.getElementById("downloadSecondPhase").remove();
	}

	const downloadSecondPhase = document.createElement("div");
	downloadSecondPhase.id = "downloadSecondPhase";
	document.getElementById("downloadModalContent").appendChild(downloadSecondPhase);

	const downloadModalBottomRow = document.createElement("div");
	downloadModalBottomRow.id = "downloadModalBottomRow";
	downloadSecondPhase.appendChild(downloadModalBottomRow);

	const downloadModalText = document.createElement("div");
	downloadModalText.id = "downloadModalText";
	downloadModalBottomRow.appendChild(downloadModalText);
	downloadModalText.innerHTML = "Checking...";

	const userInput = document.getElementById("downloadFirstInput").value.trim();
	if (userInput === "") {
		downloadModalText.innerHTML = "The input can not be empty.";
		document.getElementById("downloadFirstButton").disabled = false;
		return;
	}

	const linkType = differentiateYouTubeLinks(userInput);

	if (linkType === "video") {
		processVideoLink(userInput, downloadSecondPhase, downloadModalBottomRow, downloadModalText);
	} else if (linkType === "playlist") {
		processPlaylistLink(userInput, downloadSecondPhase, downloadModalBottomRow, downloadModalText);
	} else {
		downloadModalText.innerHTML = "Link neither a video or playlist.";
		document.getElementById("downloadFirstButton").disabled = false;
		downloadSecondPhase.style.display = "block";
	}
}

async function processVideoLink(videoUrl, downloadSecondPhase, downloadModalBottomRow, downloadModalText) {
	try {
		const info = await ytdl.getInfo(videoUrl);
		const videoTitle = info.videoDetails.title;
		const thumbnailUrl = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url;

		const downloadPlaceofSongs = document.createElement("div");
		downloadPlaceofSongs.className = "flexrow";
		downloadPlaceofSongs.id = "downloadPlaceofSongs";
		downloadSecondPhase.appendChild(downloadPlaceofSongs);

		const songAndThumbnail = document.createElement("div");
		songAndThumbnail.className = "songAndThumbnail";
		downloadPlaceofSongs.appendChild(songAndThumbnail);

		const exampleDownloadColumn = document.createElement("div");
		exampleDownloadColumn.className = "exampleDownloadColumn";
		songAndThumbnail.appendChild(exampleDownloadColumn);

		const downloadSecondInput = document.createElement("input");
		downloadSecondInput.type = "text";
		downloadSecondInput.id = "downloadSecondInput";
		downloadSecondInput.value = videoTitle;
		downloadSecondInput.spellcheck = false;
		exampleDownloadColumn.appendChild(downloadSecondInput);

		const thumbnailInput = document.createElement("input");
		thumbnailInput.type = "file";
		thumbnailInput.id = "thumbnailInput";
		thumbnailInput.accept = "image/*";
		thumbnailInput.onchange = function (event) {
			updateThumbnailImage(event, 3);
		};
		exampleDownloadColumn.appendChild(thumbnailInput);

		const thumbnailImage = document.createElement("img");
		thumbnailImage.id = "thumbnailImage";
		thumbnailImage.className = "thumbnailImage";
		thumbnailImage.src = thumbnailUrl.trim();
		thumbnailImage.alt = "";

		thumbnailImage.onerror = function () {
			console.error("Error loading thumbnail image:", thumbnailUrl);
		};

		songAndThumbnail.appendChild(thumbnailImage);

		downloadModalText.innerHTML = "";

		const finalDownloadButton = document.createElement("button");
		finalDownloadButton.id = "finalDownloadButton";
		finalDownloadButton.onclick = function () {
			actuallyDownloadTheSong();
		};
		finalDownloadButton.textContent = "Download";
		downloadModalBottomRow.appendChild(finalDownloadButton);

		document.getElementById("downloadFirstButton").disabled = false;
		downloadSecondPhase.style.display = "block";
	} catch (error) {
		console.error("Error in processVideoLink:", error);
		document.getElementById("downloadFirstButton").disabled = false;
		if (error.message.includes("your age")) alert("You can't download this song because it is age limited.");
		if (error.message.includes("private video")) alert("You can't download this song because it is a private video.");
		downloadModalText.innerHTML = ``;
	}
}

async function processPlaylistLink(playlistUrl, downloadSecondPhase, downloadModalBottomRow, downloadModalText) {
	try {
		const playlist = await ytpl(playlistUrl);
		const playlistTitle = playlist.title;
		const playlistThumbnail = playlist.thumbnail.url;
		const videoItems = playlist.items;

		if (videoItems.length > 10) {
			downloadModalText.innerHTML = "Checking... Might take long...";
		}

		const playlistTitles = [playlistTitle, ...videoItems.map(item => item.title)];
		const videoLinks = videoItems.map(item => item.url);
		const playlistThumbnails = [playlistThumbnail, ...videoItems.map(item => item.thumbnail)];

		const downloadPlaceofSongs = document.createElement("div");
		downloadPlaceofSongs.id = "downloadPlaceofSongs";
		downloadSecondPhase.appendChild(downloadPlaceofSongs);

		window.isSaveAsPlaylistActive = false;

		for (let i = 0; i < playlistTitles.length; i++) {
			const songAndThumbnail = document.createElement("div");
			songAndThumbnail.className = "songAndThumbnail";
			songAndThumbnail.id = "songAndThumbnail" + i;
			downloadPlaceofSongs.appendChild(songAndThumbnail);

			const exampleDownloadColumn = document.createElement("div");
			exampleDownloadColumn.className = "exampleDownloadColumn";
			songAndThumbnail.appendChild(exampleDownloadColumn);

			const downloadSecondInput = document.createElement("input");
			downloadSecondInput.type = "text";
			downloadSecondInput.className = "playlistTitle";
			downloadSecondInput.id = "playlistTitle" + i;
			downloadSecondInput.value = playlistTitles[i];
			downloadSecondInput.spellcheck = false;
			exampleDownloadColumn.appendChild(downloadSecondInput);

			if (i === 0) {
				const saveAsPlaylist = document.createElement("button");
				saveAsPlaylist.id = "saveAsPlaylist";
				saveAsPlaylist.innerHTML = "Save as playlist";
				songAndThumbnail.appendChild(saveAsPlaylist);
				saveAsPlaylist.style.backgroundColor = "red";

				saveAsPlaylist.onclick = function () {
					window.isSaveAsPlaylistActive = !window.isSaveAsPlaylistActive;
					saveAsPlaylist.style.backgroundColor = window.isSaveAsPlaylistActive ? "green" : "red";
				};
			} else {
				const deleteThisPlaylistSong = document.createElement("button");
				deleteThisPlaylistSong.id = "deleteThisPlaylistSong" + i;
				deleteThisPlaylistSong.className = "deleteThisPlaylistSong";
				deleteThisPlaylistSong.innerHTML = "Delete";
				songAndThumbnail.appendChild(deleteThisPlaylistSong);
				deleteThisPlaylistSong.onclick = function () {
					this.parentNode.remove();
				};
			}

			const theDivsNumber = document.createElement("div");
			theDivsNumber.innerHTML = i;
			theDivsNumber.className = "numberingTheBoxes";
			exampleDownloadColumn.appendChild(theDivsNumber);

			const thumbnailInput = document.createElement("input");
			thumbnailInput.type = "file";
			thumbnailInput.className = "thumbnailInput";
			thumbnailInput.id = "thumbnailInput" + i;
			thumbnailInput.accept = "image/*";
			const currentIndex = i;
			thumbnailInput.onchange = function (event) {
				updateThumbnailImage(event, document.getElementById("thumbnailImage" + currentIndex));
			};
			exampleDownloadColumn.appendChild(thumbnailInput);

			const thumbnailDiv = document.createElement("div");
			thumbnailDiv.className = "thumbnailImage";
			thumbnailDiv.id = "thumbnailImage" + i;

			if (i === 0) {
				thumbnailDiv.style.backgroundImage = `url(${playlistThumbnails[0]})`;
			} else {
				thumbnailDiv.style.backgroundImage = `url(${playlistThumbnails[i]})`;
				if (i - 1 < videoLinks.length) {
					songAndThumbnail.dataset.link = videoLinks[i - 1];
				}
			}
			thumbnailDiv.alt = "";
			songAndThumbnail.appendChild(thumbnailDiv);
		}

		downloadModalText.innerHTML = "";

		const finalDownloadButton = document.createElement("button");
		finalDownloadButton.id = "finalDownloadButton";
		finalDownloadButton.onclick = function () {
			actuallyDownloadTheSong();
		};
		finalDownloadButton.textContent = "Download";
		downloadModalBottomRow.appendChild(finalDownloadButton);

		document.getElementById("downloadFirstButton").disabled = false;
		downloadSecondPhase.style.display = "block";
	} catch (error) {
		console.error("Error processing playlist:", error);
		downloadModalText.innerHTML = `Error: ${error.message}`;
		document.getElementById("downloadFirstButton").disabled = false;
	}
}

function actuallyDownloadTheSong() {
	document.getElementById("finalDownloadButton").disabled = true;
	const firstInput = document.getElementById("downloadFirstInput").value.trim();
	const linkType = differentiateYouTubeLinks(firstInput);

	if (linkType === "video") {
		const secondInput = document.getElementById("downloadSecondInput").value.trim();
		const songID = generateId();
		const outputFilePath = path.join(musicFolder, `${songID}.mp3`);
		const img = document.getElementById("thumbnailImage");

		if (secondInput.length > 100) {
			document.getElementById("downloadModalText").innerText = "Invalid filename. The file must be shorter than 100 characters.";
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		document.getElementById("downloadModalText").innerText = "Downloading Song...";

		ytdl(firstInput, { filter: "audioonly", quality: "highestaudio" })
			.pipe(fs.createWriteStream(outputFilePath))
			.on("finish", () => {
				document.getElementById("downloadModalText").innerText = "Song downloaded successfully! Processing thumbnail...";

				processThumbnail(img.src, songID)
					.then(() => {
						const songName = secondInput;
						const songUrl = firstInput;
						const songThumbnail = `${songID}.jpg`;

						try {
							musicsDb
								.prepare(
									`
									INSERT INTO songs (
										song_id, song_name, song_url, song_thumbnail,
										seconds_played, times_listened, rms
									) VALUES (?, ?, ?, ?, 0, 0, NULL)
									`
								)
								.run(songID, songName, songUrl, songThumbnail);

							console.log(`Inserted ${songName} into database.`);
						} catch (err) {
							console.error("Failed to insert song into DB:", err);
						}

						document.getElementById("downloadModalText").innerText = "Download complete!";
						document.getElementById("finalDownloadButton").disabled = false;

						cleanDebugFiles();
						processAllFiles();
					})
					.catch(error => {
						document.getElementById("downloadModalText").innerText = `Error processing thumbnail: ${error.message}`;
						document.getElementById("finalDownloadButton").disabled = false;
					});
			})
			.on("error", error => {
				document.getElementById("downloadModalText").innerText = `Error downloading song: ${error.message}`;
				document.getElementById("finalDownloadButton").disabled = false;
			});
	} else if (linkType === "playlist") {
		const playlistName = document.getElementById("playlistTitle0").value.trim();
		const songLinks = [];
		const songTitles = [];
		const songIds = [];

		const songElements = document.querySelectorAll(".songAndThumbnail");

		for (let i = 1; i < songElements.length; i++) {
			const songElement = songElements[i];
			const link = songElement.dataset.link;
			const titleInput = songElement.querySelector(".playlistTitle");

			if (link && titleInput) {
				songLinks.push(link);
				songTitles.push(titleInput.value.trim());
				songIds.push(generateId());
			}
		}

		const totalSongs = songLinks.length;

		if (songTitles.length === 0) {
			document.getElementById("downloadModalText").innerText = "No valid songs found in playlist.";
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		const invalidTitles = [];

		for (let i = 0; i < songTitles.length; i++) {
			if (songTitles[i] > 100) {
				invalidTitles.push(`Song #${i + 1}: Song name too long`);
			}
		}

		if (invalidTitles.length > 0) {
			document.getElementById("downloadModalText").innerText = `Validation errors: ${invalidTitles.join("\n")}`;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		try {
			const stmt = playlistsDb.prepare("SELECT name FROM playlists WHERE name = ?");
			const existing = stmt.get(playlistName);

			if (existing) {
				document.getElementById("downloadModalText").innerText = "A playlist with this name already exists.";
				document.getElementById("finalDownloadButton").disabled = false;
				return;
			}

			if (window.isSaveAsPlaylistActive) {
				saveAsPlaylist(songIds, playlistName);
			}

			document.getElementById("downloadModalText").innerText = totalSongs > 50 ? "Downloading... This might take some time..." : "Downloading...";

			downloadPlaylist(songLinks, songTitles, songIds, playlistName);
		} catch (err) {
			document.getElementById("downloadModalText").innerText = "Database error: " + err.message;
			document.getElementById("finalDownloadButton").disabled = false;
		}
	} else {
		document.getElementById("downloadModalText").innerText = "The URL is neither a valid video nor playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

async function downloadPlaylist(songLinks, songTitles, songIds, playlistName) {
	const totalSongs = songLinks.length;
	let completedDownloads = 0;

	try {
		if (window.isSaveAsPlaylistActive) {
			const playlistThumbnailElement = document.getElementById("thumbnailImage0");
			if (playlistThumbnailElement) {
				const thumbnailPath = path.join(thumbnailFolder, `${playlistName}_playlist.jpg`);

				if (playlistThumbnailElement.style && playlistThumbnailElement.style.backgroundImage) {
					const bgImage = playlistThumbnailElement.style.backgroundImage;
					const thumbnailUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");

					try {
						const response = await fetch(thumbnailUrl);
						if (response.ok) {
							const arrayBuffer = await response.arrayBuffer();
							const buffer = Buffer.from(arrayBuffer);
							fs.writeFileSync(thumbnailPath, buffer);
							console.log(`Saved playlist thumbnail for ${playlistName}`);
						}
					} catch (error) {
						console.error(`Error saving playlist thumbnail: ${error.message}`);
					}
				}
			}
		}

		for (let i = 0; i < songLinks.length; i++) {
			const songTitle = songTitles[i];
			const songLink = songLinks[i];
			const songId = songIds[i];
			const songThumbnail = `${songId}.jpg`;
			const outputPath = path.join(musicFolder, `${songId}.mp3`);

			document.getElementById("downloadModalText").innerText = `Downloading song ${i + 1} of ${totalSongs}: ${songTitle}`;

			try {
				await new Promise((resolve, reject) => {
					const stream = ytdl(songLink, {
						quality: "highestaudio",
						filter: "audioonly",
					});

					const writer = fs.createWriteStream(outputPath);
					stream.pipe(writer);

					stream.on("error", error => {
						if (error.message && error.message.includes("Sign in to confirm your age")) {
							alert("This song requires age confirmation. Skipping...");
							document.getElementById("downloadModalText").innerText = `Skipping song ${i + 1} due to age restriction.`;
							reject("Age confirmation required");
						} else {
							reject(error);
						}
					});

					writer.on("finish", () => {
						resolve();
						cleanDebugFiles();
					});

					writer.on("error", err => reject(err));
				});

				completedDownloads++;

				const thumbnailElement = document.getElementById(`thumbnailImage${i + 1}`);
				let thumbnailUrl = null;

				if (thumbnailElement) {
					if (thumbnailElement.style?.backgroundImage) {
						const bgImage = thumbnailElement.style.backgroundImage;
						thumbnailUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");
					} else if (thumbnailElement.src) {
						thumbnailUrl = thumbnailElement.src;
					}
				}

				await processThumbnail(thumbnailUrl, songId);

				try {
					musicsDb
						.prepare(
							`
						INSERT INTO songs (
							song_id, song_name, song_url, song_thumbnail,
							seconds_played, times_listened, rms
						) VALUES (?, ?, ?, ?, 0, 0, NULL)
					`
						)
						.run(songId, songTitle, songLink, songThumbnail);
					console.log(`Inserted ${songTitle} into database.`);
				} catch (err) {
					console.error(`DB insert failed for ${songTitle}:`, err);
				}

				document.getElementById("downloadModalText").innerText = `Downloaded song ${i + 1} of ${totalSongs}. Progress: ${completedDownloads}/${totalSongs}`;
			} catch (error) {
				console.error(`Error downloading song ${i + 1}:`, error);
				document.getElementById("downloadModalText").innerText = `Error downloading song ${i + 1}: ${error.message}`;
			}
		}

		document.getElementById("downloadModalText").innerText = "All songs downloaded successfully!";
		document.getElementById("finalDownloadButton").disabled = false;

		cleanDebugFiles();
		processAllFiles();
	} catch (error) {
		document.getElementById("downloadModalText").innerText = `Error downloading playlist: ${error.message}`;
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

async function processThumbnail(imageUrl, songId) {
	try {
		console.log(`Processing thumbnail for ${songId}`);
		const thumbnailPath = path.join(thumbnailFolder, `${songId}.jpg`);

		let imgElement = document.getElementById(`thumbnailImage`);

		if (!imgElement) {
			const titleNum = parseInt(songId.match(/\d+$/)?.[0] || "");
			if (!isNaN(titleNum)) {
				imgElement = document.getElementById(`thumbnailImage${titleNum}`);
			}
		}

		if (imgElement) {
			if (imgElement.tagName === "IMG" && imgElement.src) {
				console.log(`Using DOM img element for ${songId}`);

				if (imgElement.src.startsWith("data:image")) {
					const base64data = imgElement.src;
					const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
					fs.writeFileSync(thumbnailPath, thumbnailBuffer);
					console.log(`Saved thumbnail from base64 for ${songId}`);
					return true;
				} else {
					try {
						const response = await fetch(imgElement.src);
						if (!response.ok) throw new Error(`HTTP error ${response.status}`);

						const arrayBuffer = await response.arrayBuffer();
						const buffer = Buffer.from(arrayBuffer);
						fs.writeFileSync(thumbnailPath, buffer);
						console.log(`Saved thumbnail from img src for ${songId}`);
						return true;
					} catch (fetchError) {
						console.error(`Error fetching thumbnail from img: ${fetchError}`);
					}
				}
			} else if (imgElement.style && imgElement.style.backgroundImage) {
				const bgImage = imgElement.style.backgroundImage;
				const bgUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");

				if (bgUrl) {
					try {
						const response = await fetch(bgUrl);
						if (!response.ok) throw new Error(`HTTP error ${response.status}`);

						const arrayBuffer = await response.arrayBuffer();
						const buffer = Buffer.from(arrayBuffer);
						fs.writeFileSync(thumbnailPath, buffer);
						console.log(`Saved thumbnail from background-image for ${songId}`);
						return true;
					} catch (bgFetchError) {
						console.error(`Error fetching background image: ${bgFetchError}`);
					}
				}
			}
		}

		if (imageUrl) {
			if (imageUrl.startsWith("data:image")) {
				const base64data = imageUrl;
				const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
				fs.writeFileSync(thumbnailPath, thumbnailBuffer);
				console.log(`Saved thumbnail from passed base64 for ${songId}`);
				return true;
			}

			try {
				const response = await fetch(imageUrl);
				if (!response.ok) throw new Error(`HTTP error ${response.status}`);

				const arrayBuffer = await response.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);
				fs.writeFileSync(thumbnailPath, buffer);
				console.log(`Saved thumbnail from URL for ${songId}`);
				return true;
			} catch (fetchError) {
				console.error(`Error fetching thumbnail for ${songId}: ${fetchError}`);
			}
		}

		console.log(`Attempting YouTube fallback method for ${songId}`);

		let videoId = null;
		if (imageUrl) {
			const standardMatch = imageUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|vi\/|vi_webp\/|embed\/|youtube\.com\/embed\/|ytimg\.com\/vi(?:_webp)?\/|youtube\.com\/user\/[^\/]+\/|youtube\.com\/v\/|user\/[^\/]+\/|u\/\w+\/|embed\?video_id=|youtube\.com\/embed\/|v\/|e\/|youtube\.com\/user\/[^\/]+#p\/u\/\d+\/|youtube\.com\/attribution_link\?.*v%3D|youtube-nocookie\.com\/embed\/)([^\/\?&#]+)/);

			if (standardMatch && standardMatch[1]) {
				videoId = standardMatch[1];
			}

			if (!videoId) {
				const imageMatch = imageUrl.match(/i\.ytimg\.com\/vi(?:_webp)?\/([^\/]+)\//);
				if (imageMatch && imageMatch[1]) {
					videoId = imageMatch[1];
				}
			}
		}

		if (videoId) {
			try {
				const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
				const info = await ytdl.getBasicInfo(youtubeUrl);
				const thumbnailUrl = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url;

				const response = await fetch(thumbnailUrl);
				if (!response.ok) throw new Error(`HTTP error ${response.status}`);

				const arrayBuffer = await response.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);

				fs.writeFileSync(thumbnailPath, buffer);
				console.log(`YouTube fallback method succeeded for ${songId}`);
				return true;
			} catch (ytError) {
				console.error(`YouTube fallback failed: ${ytError.message}`);
			}
		}

		try {
			const placeholderData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAAJC0lEQVR4nO3d0XLbRhJAUWjz/395v5JsecnuFkWCGKB7+pwXV1I71dXpHg4Jiv75+fkHFP1v9gZgJgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAst+zN9Dy8/Mzewt", "base64");
			fs.writeFileSync(thumbnailPath, placeholderData);
			console.log(`Created placeholder thumbnail for ${songId}`);
			return true;
		} catch (placeholderError) {
			console.error(`Failed to create placeholder: ${placeholderError.message}`);
			return false;
		}
	} catch (error) {
		console.error(`Error in processThumbnail for ${songId}:`, error);
		return false;
	}
}

function saveAsPlaylist(songIds, playlistName) {
	const trimmedArray = songIds.map(id => id.trim());

	const existing = playlistsDb.prepare(`SELECT 1 FROM playlists WHERE name = ?`).get(playlistName);

	if (existing) {
		console.error("A playlist with this name already exists.");
		return;
	}

	const thumbnailPath = path.join(thumbnailFolder, `${playlistName}_playlist.jpg`);
	const songsJson = JSON.stringify(trimmedArray);

	try {
		playlistsDb
			.prepare(
				`
            INSERT INTO playlists (name, songs, thumbnail)
            VALUES (?, ?, ?)
        `
			)
			.run(playlistName, songsJson, thumbnailPath);

		alert("New playlist added successfully!");
	} catch (err) {
		console.error("Failed to save playlist:", err);
	}
}
