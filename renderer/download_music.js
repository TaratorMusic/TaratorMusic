let pendingPlaylistAddsWithIds = new Map();

function getYtDlpPath() {
	if (platform == "win32") return path.join(backendFolder, "yt-dlp.exe");
	if (platform == "darwin") return path.join(backendFolder, "yt-dlp_macos");
	if (platform == "linux") return path.join(backendFolder, "yt-dlp_linux");
	return alertModal("Unsupported platform. Please create an issue in github.");
}

function differentiateMediaLinks(url) {
	const trimmedUrl = url.trim();

	const ytVideoRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
	const ytPlaylistRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/;
	const spotifyTrackRegex = /(?:https?:\/\/)?open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;
	const spotifyPlaylistRegex = /(?:https?:\/\/)?open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
	const spotifyAlbumRegex = /(?:https?:\/\/)?open\.spotify\.com\/album\/([a-zA-Z0-9]+)/;

	let cleanUrl = trimmedUrl;

	const ytVideoMatch = trimmedUrl.match(ytVideoRegex);
	if (ytVideoMatch) {
		const videoId = ytVideoMatch[1];
		const listMatch = trimmedUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
		cleanUrl = listMatch ? `https://www.youtube.com/watch?v=${videoId}&list=${listMatch[1]}` : `https://www.youtube.com/watch?v=${videoId}`;
		return { type: "youtube_video", url: cleanUrl };
	}

	const ytPlaylistMatch = trimmedUrl.match(ytPlaylistRegex);
	if (ytPlaylistMatch) {
		cleanUrl = `https://www.youtube.com/playlist?list=${ytPlaylistMatch[1]}`;
		return { type: "youtube_playlist", url: cleanUrl };
	}

	const spotifyTrackMatch = trimmedUrl.match(spotifyTrackRegex);
	if (spotifyTrackMatch) {
		cleanUrl = `https://open.spotify.com/track/${spotifyTrackMatch[1]}`;
		return { type: "spotify_track", url: cleanUrl };
	}

	const spotifyPlaylistMatch = trimmedUrl.match(spotifyPlaylistRegex);
	if (spotifyPlaylistMatch) {
		cleanUrl = `https://open.spotify.com/playlist/${spotifyPlaylistMatch[1]}`;
		return { type: "spotify_playlist", url: cleanUrl };
	}

	const spotifyAlbumMatch = trimmedUrl.match(spotifyAlbumRegex);
	if (spotifyAlbumMatch) {
		cleanUrl = `https://open.spotify.com/album/${spotifyAlbumMatch[1]}`;
		return { type: "spotify_album", url: cleanUrl };
	}

	return { type: "search", url: trimmedUrl };
}

function extractYoutubeVideoId(url) {
	try {
		const u = new URL(url.trim());

		if (u.hostname.includes("youtu.be")) {
			const id = u.pathname.slice(1);
			return id.length == 11 ? id : null;
		}

		if (u.hostname.includes("youtube.com")) {
			const id = u.searchParams.get("v") || u.pathname.split("/").pop();
			return id && id.length == 11 ? id : null;
		}

		return null;
	} catch {
		return null;
	}
}

function getCachedVideoIds() {
	const ids = new Set();
	for (const [, data] of songNameCache) {
		const id = extractYoutubeVideoId(data.song_url);
		if (id) ids.add(id);
	}
	return ids;
}

async function searchInYoutube(songName) {
	try {
		const entry = await getVideoInfo(`ytsearch1:${songName}`);
		searchedSongsUrl = entry.webpage_url;
		return searchedSongsUrl;
	} catch (error) {
		return logChange("error", error?.message ?? String(error));
	}
}

async function checkNameThumbnail(predetermined) {
	document.getElementById("downloadFirstButton").disabled = true;

	if (document.getElementById("downloadSecondPhase")) document.getElementById("downloadSecondPhase").remove();

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

	if (predetermined) return;

	const userInput = document.getElementById("downloadFirstInput").value.trim();
	if (userInput == "") {
		downloadModalText.innerHTML = "The input can not be empty.";
		document.getElementById("downloadFirstButton").disabled = false;
		return;
	}

	const { type: linkType, url: cleanedUrl } = differentiateMediaLinks(userInput);
	downloadingStyle = linkType;

	if (linkType == "youtube_video") {
		const cachedIds = getCachedVideoIds();
		const vid = extractYoutubeVideoId(cleanedUrl);
		if (vid && cachedIds.has(vid)) {
			const proceed = await confirmModal("Duplicate songs detected. Show them or hide them?", "Show", "Hide");
			if (!proceed) {
				downloadModalText.innerHTML = "";
				document.getElementById("downloadFirstButton").disabled = false;
				return;
			}
		}
		processVideoLink(cleanedUrl);
	} else if (linkType == "youtube_playlist") {
		fetchPlaylistData(cleanedUrl);
	} else if (linkType == "spotify_track") {
		getSpotifySongName(cleanedUrl);
	} else if (linkType == "spotify_playlist") {
		getPlaylistSongsAndArtists(cleanedUrl);
	} else if (linkType == "spotify_album") {
		getPlaylistSongsAndArtists(cleanedUrl, true);
	} else {
		const resolvedUrl = await searchInYoutube(userInput);
		const cachedIds = getCachedVideoIds();
		const vid = extractYoutubeVideoId(resolvedUrl);
		if (vid && cachedIds.has(vid)) {
			const proceed = await confirmModal("Duplicate songs detected. Show them or hide them?", "Show", "Hide");
			if (!proceed) {
				downloadModalText.innerHTML = "";
				document.getElementById("downloadFirstButton").disabled = false;
				return;
			}
		}
		processVideoLink(resolvedUrl);
	}
}

async function processVideoLink(videoUrl, songId = null) {
	try {
		if (songId) {
			document.getElementById("downloadModal").style.display = "block";
			document.getElementById("downloadFirstButton").disabled = true;
			document.getElementById("downloadFirstInput").value = `https://www.youtube.com/watch?v=${songId}`;

			if (document.getElementById("downloadSecondPhase")) document.getElementById("downloadSecondPhase").remove();

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
		}

		let videoTitle, thumbnailUrl;
		if (songId) {
			videoTitle = streamedSongsHtmlMap.get(songId)?.name;
			thumbnailUrl = streamedSongsHtmlMap.get(songId)?.thumbnail || "";
		} else {
			const info = await getVideoInfo(videoUrl);
			videoTitle = info.title;
			const thumbnails = info.thumbnails || [];
			const bestThumbnail = thumbnails.reduce((max, thumb) => {
				const size = (thumb.width || 0) * (thumb.height || 0);
				const maxSize = (max.width || 0) * (max.height || 0);
				return size > maxSize ? thumb : max;
			}, thumbnails[0] || {});
			thumbnailUrl = bestThumbnail.url || "";
		}

		const downloadPlaceofSongs = document.createElement("div");
		downloadPlaceofSongs.className = "flexrow";
		downloadPlaceofSongs.id = "downloadPlaceofSongs";
		document.getElementById("downloadSecondPhase").appendChild(downloadPlaceofSongs);

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
		thumbnailImage.src = thumbnailUrl.url ?? thumbnailUrl;
		thumbnailImage.alt = "";
		thumbnailImage.onerror = function () {
			logChange("error", `Error loading thumbnail image: ${thumbnailUrl}`);
		};
		songAndThumbnail.appendChild(thumbnailImage);

		const addToPlaylistBtn = document.createElement("button");
		addToPlaylistBtn.className = "addToPlaylist";
		addToPlaylistBtn.innerHTML = "Playlists";
		addToPlaylistBtn.onclick = () => openAddToPlaylistModalStaging("songAndThumbnail");
		exampleDownloadColumn.appendChild(addToPlaylistBtn);

		const songInfoInputsDiv = document.createElement("div");
		songInfoInputsDiv.style = "display: flex; flex-direction: row;";
		exampleDownloadColumn.appendChild(songInfoInputsDiv);

		const artistInput = document.createElement("input");
		const languageInput = document.createElement("input");
		const genreInput = document.createElement("input");

		artistInput.placeholder = "Artist name here, or leave it empty for auto-fetch.";
		languageInput.placeholder = "Language here, or leave it empty for auto-fetch.";
		genreInput.placeholder = "Genre here, or leave it empty for auto-fetch.";

		artistInput.id = "artistInput";
		languageInput.id = "languageInput";
		genreInput.id = "genreInput";

		songInfoInputsDiv.appendChild(artistInput);
		songInfoInputsDiv.appendChild(languageInput);
		songInfoInputsDiv.appendChild(genreInput);

		document.getElementById("downloadModalText").innerHTML = "";

		const finalDownloadButton = document.createElement("button");
		finalDownloadButton.id = "finalDownloadButton";
		if (songId) finalDownloadButton.setAttribute("data-file-name", songId);
		finalDownloadButton.onclick = function () {
			actuallyDownloadTheSong();
		};
		finalDownloadButton.textContent = "Download";
		document.getElementById("downloadModalBottomRow").appendChild(finalDownloadButton);

		document.getElementById("downloadFirstButton").disabled = false;
		document.getElementById("downloadSecondPhase").style.display = "block";
		if (songId) downloadingStyle = "youtube_video";
	} catch (error) {
		logChange("error", `Error in processVideoLink: ${error.message ?? String(error)}`);
		document.getElementById("downloadFirstButton").disabled = false;
		if (error.message.includes("age")) await alertModal("You can't download this song because it is age restricted.");
		if (error.message.includes("private")) await alertModal("You can't download this song because it is a private video.");
		if (document.getElementById("downloadSecondPhase")) document.getElementById("downloadSecondPhase").remove();
	}
}

async function fetchPlaylistData(url) {
	const ytpl = require("@distube/ytpl");

	try {
		const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
		if (!match) throw new Error("Invalid playlist URL");
		const playlistID = match[1];
		const playlist = await ytpl(playlistID, { pages: Infinity });
		const playlistTitle = playlist.title;
		let videoItems = playlist.items.map(video => ({
			title: video.title || "Unknown Title",
			url: video.url,
			thumbnail: video.thumbnail || "",
		}));
		const playlistThumbnail = videoItems.length ? videoItems[0].thumbnail : "";

		const cachedIds = getCachedVideoIds();
		const dupeCount = videoItems.filter(item => {
			const vid = extractYoutubeVideoId(item.url);
			return vid && cachedIds.has(vid);
		}).length;

		if (dupeCount > 0) {
			const proceed = await confirmModal("Duplicate songs detected. Show them or hide them?", "Show", "Hide");
			if (!proceed) {
				videoItems = videoItems.filter(item => {
					const vid = extractYoutubeVideoId(item.url);
					return !(vid && cachedIds.has(vid));
				});
			}
		}

		renderPlaylistUI(playlistTitle, playlistThumbnail, videoItems);
	} catch (error) {
		logChange("error", `Error fetching playlist data: ${error.message ?? String(error)}`);
		document.getElementById("downloadModalText").innerHTML = `Error: ${error.message}`;
		document.getElementById("downloadFirstButton").disabled = false;
	}
}

async function renderPlaylistUI(playlistTitle, playlistThumbnail, videoItems) {
	const playlistTitles = [playlistTitle, ...videoItems.map(item => item.title)];
	const videoLinks = videoItems.map(item => item.url);
	const playlistThumbnails = [playlistThumbnail, ...videoItems.map(item => item.thumbnail)];

	const downloadPlaceofSongs = document.createElement("div");
	downloadPlaceofSongs.id = "downloadPlaceofSongs";
	document.getElementById("downloadSecondPhase").appendChild(downloadPlaceofSongs);

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

		if (i == 0) {
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
			if (videoItems[i - 1].id) songAndThumbnail.setAttribute("data-id", videoItems[i - 1].id);
			const deleteThisPlaylistSong = document.createElement("button");
			deleteThisPlaylistSong.id = "deleteThisPlaylistSong" + i;
			deleteThisPlaylistSong.className = "deleteThisPlaylistSong";
			deleteThisPlaylistSong.innerHTML = "Delete";
			songAndThumbnail.appendChild(deleteThisPlaylistSong);
			deleteThisPlaylistSong.onclick = function () {
				this.parentNode.remove();
			};

			const addToPlaylistBtn = document.createElement("button");
			addToPlaylistBtn.className = "addToPlaylist";
			addToPlaylistBtn.innerHTML = "Playlists";
			addToPlaylistBtn.onclick = () => openAddToPlaylistModalStaging(songAndThumbnail.id);
			songAndThumbnail.appendChild(addToPlaylistBtn);
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

		if (i == 0) {
			thumbnailDiv.style.backgroundImage = `url(${playlistThumbnails[0]})`;
		} else {
			thumbnailDiv.style.backgroundImage = `url(${playlistThumbnails[i]})`;
			if (i - 1 < videoLinks.length) {
				songAndThumbnail.dataset.link = videoLinks[i - 1];
				songAndThumbnail.dataset.thumbnail = playlistThumbnails[i];
			}

			const songInfoInputsDiv = document.createElement("div");
			songInfoInputsDiv.style = "display: flex; flex-direction: row;";
			exampleDownloadColumn.appendChild(songInfoInputsDiv);

			const artistInput = document.createElement("input");
			const languageInput = document.createElement("input");
			const genreInput = document.createElement("input");

			artistInput.placeholder = "Artist name here, or leave it empty for auto-fetch.";
			languageInput.placeholder = "Language here, or leave it empty for auto-fetch.";
			genreInput.placeholder = "Genre here, or leave it empty for auto-fetch.";

			artistInput.id = `artistInput${i}`;
			languageInput.id = `languageInput${i}`;
			genreInput.id = `genreInput${i}`;

			songInfoInputsDiv.appendChild(artistInput);
			songInfoInputsDiv.appendChild(languageInput);
			songInfoInputsDiv.appendChild(genreInput);
		}
		thumbnailDiv.alt = "";
		songAndThumbnail.appendChild(thumbnailDiv);
	}

	document.getElementById("downloadModalText").innerHTML = "";

	const finalDownloadButton = document.createElement("button");
	finalDownloadButton.id = "finalDownloadButton";
	finalDownloadButton.onclick = function () {
		actuallyDownloadTheSong();
	};
	finalDownloadButton.textContent = "Download";
	document.getElementById("downloadModalBottomRow").appendChild(finalDownloadButton);

	document.getElementById("downloadFirstButton").disabled = false;
	document.getElementById("downloadSecondPhase").style.display = "block";
}

async function processThumbnail(imageUrl, songId, songIndex = null) {
	try {
		logChange("log", `Processing thumbnail for ${songId}`);

		const thumbnailPath = path.join(thumbnailFolder, `${songId}.jpg`);

		let imgElement = null;
		if (songIndex != null) {
			imgElement = document.getElementById(`thumbnailImage${songIndex}`);
		} else {
			imgElement = document.getElementById("thumbnailImage");
		}

		async function saveBufferFromUrl(url, pathToSave) {
			const https = require("https");

			return new Promise((resolve, reject) => {
				https
					.get(url, res => {
						if (res.statusCode != 200) {
							reject(new Error(`Failed to fetch thumbnail: ${res.statusCode}`));
							return;
						}
						const data = [];
						res.on("data", chunk => data.push(chunk));
						res.on("end", () => {
							const buffer = Buffer.concat(data);
							fs.writeFileSync(pathToSave, buffer);
							resolve(true);
						});
					})
					.on("error", reject);
			});
		}

		if (imgElement) {
			if (imgElement.tagName == "IMG" && imgElement.src) {
				if (imgElement.src.startsWith("data:image")) {
					const base64data = imgElement.src.split(",")[1];
					fs.writeFileSync(thumbnailPath, Buffer.from(base64data, "base64"));
					logChange("log", `Saved thumbnail from DOM img element for ${songId}`);
					return true;
				} else if (imgElement.src.startsWith("http")) {
					try {
						await saveBufferFromUrl(imgElement.src, thumbnailPath);
						logChange("log", `Saved thumbnail from DOM img src for ${songId}`);
						return true;
					} catch (error) {
						logChange("error", `Error fetching thumbnail from DOM img: ${error.message ?? String(error)}`);
					}
				}
			} else if (imgElement.style?.backgroundImage) {
				const bgUrl = imgElement.style.backgroundImage.replace(/^url\(['"](.+)['"]\)$/, "$1");
				if (bgUrl && bgUrl != "none") {
					if (bgUrl.startsWith("data:image")) {
						const base64data = bgUrl.split(",")[1];
						fs.writeFileSync(thumbnailPath, Buffer.from(base64data, "base64"));
						logChange("log", `Saved thumbnail from DOM background image base64 for ${songId}`);
						return true;
					} else if (bgUrl.startsWith("http")) {
						try {
							await saveBufferFromUrl(bgUrl, thumbnailPath);
							logChange("log", `Saved thumbnail from DOM background image URL for ${songId}`);

							return true;
						} catch (e) {
							logChange("log", `Error fetching background image: ${e}`);
						}
					}
				}
			}
		}

		if (imageUrl) {
			if (imageUrl.startsWith("data:image")) {
				const base64data = imageUrl.split(",")[1];
				fs.writeFileSync(thumbnailPath, Buffer.from(base64data, "base64"));
				logChange("log", `Saved thumbnail from passed imageUrl base64 for ${songId}`);
				return true;
			} else if (imageUrl.startsWith("http")) {
				try {
					await saveBufferFromUrl(imageUrl, thumbnailPath);
					logChange("log", `Saved thumbnail from passed imageUrl for ${songId}`);

					return true;
				} catch (e) {
					logChange("log", `Error fetching thumbnail from imageUrl: ${e.message}`);
				}
			}
		}

		function extractVideoId(url) {
			const match = url?.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
			return match ? match[1] : null;
		}

		const videoId = extractVideoId(imageUrl);
		if (videoId) {
			try {
				const info = await getVideoInfo(videoUrl);
				const thumbnails = info.thumbnails;
				if (!thumbnails?.length) throw new Error("No thumbnails found");
				const thumbnailUrl = thumbnails[thumbnails.length - 1].url;
				await saveBufferFromUrl(thumbnailUrl, thumbnailPath);
				return true;
			} catch (error) {
				logChange("error", `Youtube thumbnail fetch failed: ${error.message ?? String(error)}`);
			}
		}

		const placeholderData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAAJC0lEQVR4nO3d0XLbRhJAUWjz/395v5JsecnuFkWCGKB7+pwXV1I71dXpHg4Jiv75+fkHFP1v9gZgJgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAst+zN9Dy8/Mzewt", "base64");
		fs.writeFileSync(thumbnailPath, placeholderData);
		logChange("log", `Created placeholder thumbnail for ${songId}`);
		return true;
	} catch (error) {
		logChange("error", `Error in processThumbnail for ${songId}: ${error}`);
		return false;
	}
}

async function actuallyDownloadTheSong() {
	document.getElementById("finalDownloadButton").disabled = true;
	const firstInput = downloadingStyle == "search" ? searchedSongsUrl : document.getElementById("downloadFirstInput").value.trim();

	if (downloadingStyle == "youtube_video" || downloadingStyle == "spotify_track" || downloadingStyle == "search") {
		const secondInput = document.getElementById("downloadSecondInput").value.trim();
		const oldId = document.getElementById("finalDownloadButton").getAttribute("data-file-name");
		const songID = await generateId();
		const outputFilePath = path.join(musicFolder, `${songID}.mp3`);
		const img = document.getElementById("thumbnailImage");

		const artist = document.getElementById("artistInput").value;
		const genre = document.getElementById("genreInput").value;
		const language = document.getElementById("languageInput").value;

		const existingPlaylists = pendingPlaylistAddsWithIds.get("songAndThumbnail") || [];
		pendingPlaylistAddsWithIds.delete("songAndThumbnail");
		pendingPlaylistAddsWithIds.set(songID, existingPlaylists);

		if (secondInput.length > 100) {
			document.getElementById("downloadModalText").innerText = "Invalid song name. The name must be shorter than 100 characters.";
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		document.getElementById("downloadModalText").innerText = "Downloading Song...";

		try {
			let lastUpdate = 0;

			await downloadAudio(firstInput, outputFilePath, progressMsg => {
				const now = Date.now();
				if (now - lastUpdate > 200) {
					document.getElementById("downloadModalText").innerText = `Downloading: ${progressMsg}`;
					lastUpdate = now;
				}
			});

			if (stabiliseVolumeToggle == 1) {
				try {
					document.getElementById("downloadModalText").innerText = "Song downloaded successfully! Stabilising volume...";
					await normalizeAudio(outputFilePath);
					document.getElementById("downloadModalText").innerText = "Audio normalized! Processing thumbnail...";
				} catch (error) {
					logChange("error", `Audio normalisation failed: ${error.message ?? String(error)}`);
					stabiliseVolumeToggle = 0;
					document.getElementById("downloadModalText").innerText = "Audio normalization failed, but continuing...";
				}
			} else {
				document.getElementById("downloadModalText").innerText = "Song downloaded successfully! Processing thumbnail...";
			}

			let duration = 0;
			try {
				const metadata = await new Promise((resolve, reject) => {
					ffmpeg.ffprobe(outputFilePath, (err, meta) => {
						if (err) return reject(err);
						resolve(meta);
					});
				});

				duration = Math.round(metadata.format.duration);
			} catch (error) {
				logChange("error", `Failed to retrieve metadata: ${error.message ?? String(error)}`);
			}

			const fileSize = fs.statSync(outputFilePath).size;

			await processThumbnail(img.src, songID);

			if (oldId) {
				document.querySelectorAll(".music-item").forEach(musicElement => {
					if (removeExtensions(musicElement.getAttribute("data-file-name")) == oldId) {
						musicElement.setAttribute("data-file-name", songID);
						const newElement = musicElement.cloneNode(true);
						newElement.addEventListener("click", () => playMusic(songID, null));
						musicElement.replaceWith(newElement);
					}
				});

				callSqlite({
					db: "musics",
					query: "DELETE FROM streams WHERE song_id = ?",
					args: [songID],
					fetch: false,
				});

				callSqlite({
					db: "musics",
					query: "UPDATE timers SET song_id = ? WHERE song_id = ?",
					args: [songID, oldId],
					fetch: false,
				});
			}

			try {
				callSqlite({
					db: "musics",
					query: `INSERT INTO songs (song_id, song_name, song_url, song_length, seconds_played, times_listened, stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [songID, secondInput, firstInput, duration, 0, 0, stabiliseVolumeToggle, fileSize, 100, null, null, null, 100, "mp3", "jpg", artist, genre, language],
					fetch: false,
				});

				songNameCache.set(songID, {
					song_name: secondInput,
					song_length: duration,
					song_extension: "mp3",
					song_url: firstInput,
					thumbnail_extension: "jpg",
					genre: genre,
					artist: artist,
					language: language,
				});

				await commitStagedPlaylistAdds();
			} catch (error) {
				logChange("error", `Failed to insert song into the database: ${error.message ?? String(error)}`);
			}

			document.getElementById("downloadModalText").innerText = "Download complete!";
			document.getElementById("finalDownloadButton").disabled = false;
			if (document.getElementById("my-music-content").style.display == "block") renderMusics();
			if (!genre || !artist || !language) grabAndStoreSongInfo(songID);
			if (recommendationsAfterDownload == 1) await fetchRecommendationsData();
		} catch (error) {
			logChange("error", error);
			document.getElementById("downloadModalText").innerText = `Error downloading song: ${error}`;
			document.getElementById("finalDownloadButton").disabled = false;
			if (document.getElementById("my-music-content").style.display == "block") renderMusics();
		}
	} else {
		const playlistName = document.getElementById("playlistTitle0").value.trim();
		const songElements = document.querySelectorAll(".songAndThumbnail");

		const songLinks = [];
		const songTitles = [];
		const songIds = [];

		for (let i = 1; i < songElements.length; i++) {
			const songElement = songElements[i];
			const link = songElement.dataset.link;
			const titleInput = songElement.querySelector(".playlistTitle");

			if (link && titleInput) {
				songLinks.push(link);
				songTitles.push(titleInput.value.trim());
				songElement.hasAttribute("data-id") ? songIds.push(songElement.getAttribute("data-id")) : songIds.push(await generateId());
			}
		}

		const totalSongs = songLinks.length;

		if (songTitles.length == 0) {
			document.getElementById("downloadModalText").innerText = "No valid songs found in playlist.";
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		const invalidTitles = [];

		for (let i = 0; i < songTitles.length; i++) {
			if (songTitles[i].length > 100) {
				invalidTitles.push(`Song #${i + 1}: Song name too long`);
			}
		}

		if (invalidTitles.length > 0) {
			document.getElementById("downloadModalText").innerText = `Validation errors: ${invalidTitles.join("\n")}`;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}
		const playlistID = await generateId();

		try {
			document.getElementById("downloadModalText").innerText = totalSongs > 50 ? "Downloading... This might take some time..." : "Downloading...";

			const playlistThumbnailEl = document.getElementById("thumbnailImage0");
			const bgImage = playlistThumbnailEl?.style?.backgroundImage || "";
			const playlistThumbnailUrl = bgImage.replace(/^url\(['"]?(.+?)['"]?\)$/, "$1") || "";

			downloadPlaylist(songLinks, songTitles, songIds, playlistName, playlistID, playlistThumbnailUrl);
		} catch (err) {
			document.getElementById("downloadModalText").innerText = "Database error: " + err.message;
			document.getElementById("finalDownloadButton").disabled = false;
		}
	}
}

async function downloadPlaylist(songLinks, songTitles, songIds, playlistName, playlistID, playlistThumbnailUrl) {
	const fetch = require("node-fetch");

	for (const [key, _] of pendingPlaylistAddsWithIds) {
		const element = document.getElementById(key);
		if (!element) continue;

		const dataLink = element.getAttribute("data-link");
		if (!dataLink) continue;

		const index = songLinks.indexOf(dataLink);
		if (index == -1) continue;

		const songId = songIds[index];
		pendingPlaylistAddsWithIds.set(songId, _);
	}

	const totalSongs = songLinks.length;
	let completedDownloads = 0;

	try {
		let artists = [];
		let genres = [];
		let languages = [];

		for (let i = 0; i < totalSongs; i++) {
			const songTitle = songTitles[i];
			const songLink = songLinks[i];
			const songId = songIds[i];

			artists[i] = document.getElementById(`artistInput${i + 1}`)?.value ?? "";
			genres[i] = document.getElementById(`genreInput${i + 1}`)?.value ?? "";
			languages[i] = document.getElementById(`languageInput${i + 1}`)?.value ?? "";

			if (!songTitle || !songLink || !songId) {
				logChange("warn", `Skipping index ${i}: missing title/link/id`);
				continue;
			}

			const outputPath = path.join(musicFolder, `${songId}.mp3`);

			const result = await downloadAudio(songLink, outputPath, progressMsg => {
				document.getElementById("downloadModalText").innerText = `[${completedDownloads}/${totalSongs}] Downloading: ${progressMsg}`;
			});

			if (result == "AGE_RESTRICTED") {
				await alertModal("This song requires age confirmation. Skipping...");
				continue;
			}

			if (stabiliseVolumeToggle == 1) {
				try {
					document.getElementById("downloadModalText").innerText = `[${completedDownloads}/${totalSongs}] Stabilising volume: ${songTitle}`;
					await normalizeAudio(outputPath);
				} catch (error) {
					stabiliseVolumeToggle = 0;
					logChange("error", `Audio normalization failed for ${songTitle}: ${error.message ?? String(error)}`);
				}
			} else {
				document.getElementById("downloadModalText").innerText = `Song downloaded! Volume stabilisation is disabled.`;
			}

			let duration = 0;
			const metadata = await new Promise((resolve, reject) => {
				ffmpeg.ffprobe(outputPath, (err, meta) => {
					if (err) return reject(err);
					resolve(meta);
				});
			});

			if (metadata.format && metadata.format.duration) {
				duration = Math.round(metadata.format.duration);
			}

			const fileSize = fs.statSync(outputPath).size;

			const songElements = document.querySelectorAll(".songAndThumbnail");
			let thumbnailUrl = null;
			let thumbnailElement = null;

			for (let j = 1; j < songElements.length; j++) {
				const element = songElements[j];
				if (element.dataset.link == songLink) {
					thumbnailElement = element.querySelector(".thumbnailImage");
					if (element.dataset.thumbnail) {
						thumbnailUrl = element.dataset.thumbnail;
					}
					break;
				}
			}

			if (!thumbnailUrl && thumbnailElement) {
				if (thumbnailElement.style && thumbnailElement.style.backgroundImage) {
					const bgImage = thumbnailElement.style.backgroundImage;
					thumbnailUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");
				} else if (thumbnailElement.src) {
					thumbnailUrl = thumbnailElement.src;
				}
			}

			await processThumbnail(thumbnailUrl, songId);

			if (songId && songTitle && songLink && duration != null) {
				try {
					callSqlite({
						db: "musics",
						query: `INSERT INTO songs (song_id, song_name, song_url, song_length, seconds_played, times_listened, stabilised, size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						args: [songId, songTitle, songLink, duration, 0, 0, stabiliseVolumeToggle, fileSize, 100, null, null, null, 100, "mp3", "jpg", artists[i], genres[i], languages[i]],
						fetch: false,
					});

					songNameCache.set(songId, {
						song_name: songTitle,
						song_length: duration,
						song_extension: "mp3",
						song_url: songLink,
						thumbnail_extension: "jpg",
						genre: genres[i],
						artist: artists[i],
						language: languages[i],
					});
				} catch (error) {
					logChange("error", `DB insert failed for ${songTitle}: ${error.message ?? String(error)}`);
				}
			} else {
				logChange("error", `Data undefined at index ${i}:`, { songId, songTitle, songLink, duration });
			}

			completedDownloads++;
			document.getElementById("downloadModalText").innerText = `[${completedDownloads}/${totalSongs}] Processed: ${songTitle}`;
			if (document.getElementById("my-music-content").style.display == "block") renderMusics();

			await sleep(500);
		}

		callSqlite({
			db: "settings",
			query: `UPDATE statistics SET ${["spotify_track", "spotify_playlist", "spotify_album"].includes(downloadingStyle) ? "songs_downloaded_spotify" : "songs_downloaded_youtube"} = ${["spotify_track", "spotify_playlist", "spotify_album"].includes(downloadingStyle) ? "songs_downloaded_spotify" : "songs_downloaded_youtube"} + ${totalSongs}`,
			args: [],
			fetch: false,
		});

		if (window.isSaveAsPlaylistActive) {
			const thumbnailPath = path.join(thumbnailFolder, `${playlistID}.jpg`);
			await processThumbnail(playlistThumbnailUrl, playlistID);
			const songsJson = JSON.stringify(songIds.map(id => id.trim()));

			try {
				callSqlite({
					db: "playlists",
					query: `
                        INSERT INTO playlists (id, name, songs, thumbnail_extension)
                        VALUES (?, ?, ?, ?)
                    `,
					args: [playlistID, playlistName, songsJson, "jpg"],
				});
				let parsedSongs = [];

				if (songsJson) {
					try {
						parsedSongs = JSON.parse(songsJson);
					} catch {
						parsedSongs = [];
					}
				}

				playlistsMap.set(playlistID, {
					id: playlistID,
					name: playlistName,
					songs: parsedSongs,
					thumbnail_extension: "jpg",
				});
			} catch (error) {
				logChange("error", `Failed to save playlist: ${error.message ?? String(error)}`);
			}
		}

		document.getElementById("downloadModalText").innerText = "All songs downloaded successfully!";
		await commitStagedPlaylistAdds();
		const idsNeedingInfo = [];

		for (let i = 0; i < songIds.length; i++) {
			if (!artists[i] || !genres[i] || !languages[i]) idsNeedingInfo.push(songIds[i]);
		}

		if (idsNeedingInfo.length > 0) grabAndStoreSongInfo(idsNeedingInfo);
		if (recommendationsAfterDownload == 1) await fetchRecommendationsData();
	} catch (error) {
		document.getElementById("downloadModalText").innerText = `Error downloading playlist: ${error.message}`;
	}

	document.getElementById("finalDownloadButton").disabled = false;
	if (document.getElementById("my-music-content").style.display == "block") renderMusics();
}

async function downloadAudio(videoUrl, outputFilePath, onProgress) {
	return new Promise((resolve, reject) => {
		if (!videoUrl || typeof videoUrl != "string") {
			return reject(new Error("Invalid YouTube URL"));
		}

		let stderrBuffer = "";
		let lastLine = "";

		const yt = spawn(getYtDlpPath(), ["--js-runtimes", "node", "-x", "--ignore-errors", "--audio-format", "mp3", "--ffmpeg-location", ffmpegPath, "-o", outputFilePath, videoUrl.split("&")[0]]);

		yt.stdout.on("data", data => {
			const chunks = data.toString().split("\r");

			for (let msg of chunks) {
				if (!msg.includes("[download]")) continue;

				const cleanMsg = msg.replace("[download]", "").trim();

				if (cleanMsg && cleanMsg !== lastLine) {
					lastLine = cleanMsg;
					if (onProgress) onProgress(cleanMsg);
				}
			}
		});

		yt.stderr.on("data", data => {
			stderrBuffer += data.toString();
		});

		yt.on("error", error => reject(error));

		yt.on("close", code => {
			if (stderrBuffer.includes("confirm your age")) {
				return resolve("AGE_RESTRICTED");
			}

			if (code == 0 && fs.existsSync(outputFilePath)) {
				resolve();
			} else {
				reject(new Error(stderrBuffer || `yt-dlp exited with code ${code}`));
			}
		});
	});
}

function openAddToPlaylistModalStaging(songId) {
	document.getElementById("addToPlaylistModal").style.display = "block";
	const checkboxContainer = document.getElementById("playlist-checkboxes");
	checkboxContainer.innerHTML = "";

	const allPlaylists =
		Array.from(playlistsMap.entries()).map(([id, data]) => ({
			id,
			...data,
		})) || [];
	allPlaylists.forEach(playlist => {
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = playlist.id;
		checkbox.value = songId;
		if ((pendingPlaylistAddsWithIds.get(songId) || []).includes(playlist.id)) checkbox.checked = true;
		const label = document.createElement("label");
		label.textContent = playlist.name;
		label.htmlFor = checkbox.id;
		checkboxContainer.appendChild(checkbox);
		checkboxContainer.appendChild(label);
		checkboxContainer.appendChild(document.createElement("br"));
	});

	const doneButton = document.createElement("button");
	doneButton.id = "addToPlaylistDoneStaging";
	doneButton.textContent = "Done";
	doneButton.onclick = () => {
		const selectedPlaylists = Array.from(document.querySelectorAll('#playlist-checkboxes input[type="checkbox"]:checked')).map(checkbox => checkbox.id);
		if (selectedPlaylists.length) {
			pendingPlaylistAddsWithIds.set(songId, selectedPlaylists);
		} else {
			pendingPlaylistAddsWithIds.delete(songId);
		}
		closeModal();
	};
	checkboxContainer.appendChild(doneButton);
}

async function commitStagedPlaylistAdds() {
	for (const [song, lists] of pendingPlaylistAddsWithIds.entries()) {
		for (const listID of lists) {
			const playlistRes = [];

			const cached = playlistsMap.get(listID);
			if (cached) {
				playlistRes.push({
					id: listID,
					name: cached.name,
					songs: JSON.stringify(cached.songs || []),
					thumbnail_extension: cached.thumbnail_extension,
				});
			}

			const playlist = playlistRes[0];
			let songs = JSON.parse(playlist.songs || "[]");

			if (!songs.includes(song)) {
				songs.push(song);
				callSqlite({
					db: "playlists",
					query: "UPDATE playlists SET songs = ? WHERE id = ?",
					args: [JSON.stringify(songs), listID],
				});
			}
		}
	}
	pendingPlaylistAddsWithIds.clear();
}

function getVideoInfo(url, retryCount = 0, seenIds = new Set()) {
	return new Promise((resolve, reject) => {
		const args = ["-J", "--skip-download", "--no-playlist", "--quiet", "--no-warnings", "--no-check-certificate", "--socket-timeout", "5"];
		const yt = spawn(getYtDlpPath(), [...args, url]);
		let data = "";
		let err = "";
		yt.stdout.on("data", chunk => (data += chunk));
		yt.stderr.on("data", chunk => (err += chunk));
		yt.on("close", code => {
			if (code != 0) {
				if (err.includes("This video is not available") && retryCount < 5) {
					logChange("warn", `Video unavailable, trying next result (attempt ${retryCount + 1})...`);
					const nextUrl = url.replace(/ytsearch\d*:/, `ytsearch${retryCount + 2}:`);
					return resolve(getVideoInfo(nextUrl, retryCount + 1, seenIds));
				}
				return reject(new Error(err || `yt-dlp exited ${code}`));
			}
			try {
				const parsed = JSON.parse(data);
				const entry = parsed.entries?.[0] ?? (parsed._type === "video" ? parsed : null);

				if (!entry) {
					if (retryCount >= 5) return reject(new Error("No valid entries found after retries"));
					logChange("warn", `No results found, trying next result (attempt ${retryCount + 1})...`);
					const nextUrl = url.replace(/ytsearch\d*:/, `ytsearch${retryCount + 2}:`);
					return resolve(getVideoInfo(nextUrl, retryCount + 1, seenIds));
				}

				if (entry.is_live || entry.live_status === "is_live") {
					if (retryCount >= 5) return reject(new Error("No valid entries found after retries"));
					logChange("warn", `Live video, skipping (attempt ${retryCount + 1})...`);
					seenIds.add(entry.id);
					const nextUrl = url.replace(/ytsearch\d*:/, `ytsearch${retryCount + 2}:`);
					return resolve(getVideoInfo(nextUrl, retryCount + 1, seenIds));
				}

				if (seenIds.has(entry.id)) {
					if (retryCount >= 5) return reject(new Error("No valid entries found after retries"));
					logChange("warn", `Duplicate result, skipping (attempt ${retryCount + 1})...`);
					const nextUrl = url.replace(/ytsearch\d*:/, `ytsearch${retryCount + 2}:`);
					return resolve(getVideoInfo(nextUrl, retryCount + 1, seenIds));
				}

				resolve(entry);
			} catch (e) {
				reject(e);
			}
		});
	});
}

async function getSpotifySongName(link) {
	const fetch = require("node-fetch");
	const cheerio = require("cheerio");

	const trackMatch = link.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
	if (!trackMatch) throw new Error("Invalid Spotify track URL.");
	const cleanLink = `https://open.spotify.com/track/${trackMatch[1]}`;

	const response = await fetch(cleanLink, {
		headers: {
			"User-Agent": "Mozilla/5.0",
		},
	});

	if (!response.ok) return;

	const html = await response.text();
	const $ = cheerio.load(html);

	const title = $("title").text();
	const name = title.replace(" song and lyrics by", "").replace("| Spotify", "").trim();

	const resolvedUrl = await searchInYoutube(name, 1);
	const cachedIds = getCachedVideoIds();
	const vid = extractYoutubeVideoId(resolvedUrl);
	if (vid && cachedIds.has(vid)) {
		const proceed = await confirmModal("Duplicate songs detected. Show them or hide them?", "Show", "Hide");
		if (!proceed) {
			document.getElementById("downloadModalText").innerHTML = "";
			document.getElementById("downloadFirstButton").disabled = false;
			return;
		}
	}
	processVideoLink(resolvedUrl);
}

async function getPlaylistSongsAndArtists(link, isAlbum = false) {
	const puppeteer = require("puppeteer");

	const typeRegex = isAlbum ? /open\.spotify\.com\/album\/([a-zA-Z0-9]+)/ : /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
	const typeMatch = link.match(typeRegex);
	if (!typeMatch) throw new Error(`Invalid Spotify ${isAlbum ? "album" : "playlist"} URL.`);
	const cleanLink = `https://open.spotify.com/${isAlbum ? "album" : "playlist"}/${typeMatch[1]}`;

	document.getElementById("downloadModalText").innerText = "Launching browser...";
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();

	await page.setViewport({ width: 1920, height: 1080 });
	await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");

	document.getElementById("downloadModalText").innerText = "Navigating to playlist page...";
	await page.goto(cleanLink, { waitUntil: "networkidle2" });

	document.getElementById("downloadModalText").innerText = "Waiting for the tracks to load...";
	await page.waitForSelector('a[data-testid="internal-track-link"]', { timeout: 30000 });

	const scrollContainer = await page.evaluateHandle(() => {
		function isScrollable(element) {
			const style = getComputedStyle(element);
			return (style.overflowY == "auto" || style.overflowY == "scroll") && element.scrollHeight > element.clientHeight;
		}

		const allDivs = Array.from(document.querySelectorAll("div"));
		return allDivs.find(div => isScrollable(div) && div.querySelectorAll('a[data-testid="internal-track-link"]').length > 0);
	});

	if (!scrollContainer) {
		document.getElementById("downloadModalText").innerText = "Scroll container not found. The playlist page might have been changed. Wait until the next TaratorMusic update for the fix.";
		await browser.close();
		return;
	}

	page.on("console", msg => {
		const text = msg.text();
		if (text.match(/^\d+\. song: /)) {
			document.getElementById("downloadModalText").innerText = text;
		}
	});

	const playlistNameRaw = await page.title();
	const playlistName = isAlbum ? playlistNameRaw.replace(/\s*[-–]\s*.*?\|\s*Spotify\s*$/i, "").trim() : playlistNameRaw.replace(/\s*-\s*playlist by .*?\| Spotify$/, "").trim();

	const { imageUrl } = await page.evaluate(isAlbum => {
		let imageUrl = null;
		const testId = isAlbum ? "album-image" : "playlist-image";
		const thumbnailElement = document.querySelector(`[data-testid="${testId}"] img`);

		if (thumbnailElement && thumbnailElement.src) {
			imageUrl = thumbnailElement.src;
		} else {
			const allDivs = Array.from(document.querySelectorAll("div"));
			const backgroundDiv = allDivs.find(element => {
				const style = getComputedStyle(element);
				const backgroundImage = style.backgroundImage;
				return backgroundImage.includes("scdn.co/image/") && element.clientHeight > 200 && element.clientWidth > 200;
			});

			if (backgroundDiv) {
				const match = getComputedStyle(backgroundDiv).backgroundImage.match(/url\("?([^"]+)"?\)/);
				if (match && match[1]) imageUrl = match[1];
			}
		}

		return { imageUrl };
	}, isAlbum);

	const playlistThumbnail = imageUrl || path.join(appThumbnailFolder, "placeholder.jpg");

	const songs = await page.evaluate(
		async (container, isAlbum) => {
			const seen = new Map();
			let sameCount = 0;
			let lastRowIndex = 0;

			while (sameCount < 3) {
				container.scrollBy(0, 800);
				await new Promise(resolve => setTimeout(resolve, 800));

				const rows = container.querySelectorAll("[aria-rowindex]");
				let newFound = 0;

				rows.forEach(row => {
					const rowIndex = parseInt(row.getAttribute("aria-rowindex"), 10);

					if (rowIndex <= lastRowIndex) return;

					const trackLink = row.querySelector('a[data-testid="internal-track-link"]');
					if (!trackLink) return;

					const title = row.querySelector("div[data-encore-id='text']")?.textContent.trim();

					let artist;
					if (isAlbum) {
						const artistLink = row.querySelector("span a[href^='/artist'], a[href^='/artist']");
						artist = artistLink?.textContent.trim();
						if (!artist) {
							artist = row.querySelector("span[data-encore-id='text'] a")?.textContent.trim();
						}
					} else {
						const artistLink = row.querySelector("span a[href^='/artist']");
						artist = artistLink?.textContent.trim();
					}

					if (title && artist) {
						const key = title + "||" + artist;

						if (!seen.has(key)) {
							seen.set(key, { title, artist });
							newFound++;
							lastRowIndex = Math.max(lastRowIndex, rowIndex);
						}
					}
				});

				if (newFound == 0) {
					sameCount++;
				} else {
					sameCount = 0;
				}
			}

			return Array.from(seen.values());
		},
		scrollContainer,
		isAlbum,
	);

	document.getElementById("downloadModalText").innerText = `Extracted ${songs.length} tracks. Searching for the tracks in Youtube...`;

	let foundCount = 0;
	const total = songs.length;
	let videoItems = [];

	for (let i = 0; i < songs.length; i++) {
		const video = songs[i];

		try {
			const query = `${video.title} ${video.artist}`;
			const url = await searchInYoutube(query);

			if (url) {
				const info = await getVideoInfo(url);
				videoItems.push({
					title: query,
					url: url,
					thumbnail: info.thumbnail || null,
				});
			} else {
				videoItems.push({
					title: `${video.title} ${video.artist}`,
					url: null,
					thumbnail: null,
				});
			}
		} catch (err) {
			videoItems.push({
				title: `${video.title} ${video.artist}`,
				url: null,
				thumbnail: null,
			});
		}

		foundCount++;
		document.getElementById("downloadModalText").innerText = `Found ${foundCount} out of ${total} songs in YouTube...`;

		if ((i + 1) % 30 == 0 && i + 1 < songs.length) {
			document.getElementById("downloadModalText").innerText = `Fetched ${foundCount} songs. Waiting 300s to avoid Youtube API rate limits...`;
			await new Promise(r => setTimeout(r, 300000));
		}
	}

	await browser.close();

	const cachedIds = getCachedVideoIds();
	const dupeCount = videoItems.filter(item => {
		const vid = extractYoutubeVideoId(item.url);
		return vid && cachedIds.has(vid);
	}).length;

	if (dupeCount > 0) {
		const proceed = await confirmModal("Duplicate songs detected. Show them or hide them?", "Show", "Hide");
		if (!proceed) {
			videoItems = videoItems.filter(item => {
				const vid = extractYoutubeVideoId(item.url);
				return !(vid && cachedIds.has(vid));
			});
		}
	}

	renderPlaylistUI(playlistName, playlistThumbnail, videoItems);
}
