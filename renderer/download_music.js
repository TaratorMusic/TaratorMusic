const fetch = require("node-fetch");
const ytdl = require("@distube/ytdl-core");
const ytpl = require("@distube/ytpl");

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
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

function extractVideoId(url) {
	if (!url) return null;

	const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube-nocookie\.com\/embed\/)([^\/\?&#]+)/, /i\.ytimg\.com\/vi(?:_webp)?\/([^\/]+)\//, /youtube\.com\/attribution_link\?.*v%3D([^%&]+)/];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match && match[1]) {
			return match[1];
		}
	}

	return null;
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
		const getYouTubeVideoId = url => {
			const match = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
			return match ? match[1] : null;
		};

		const videoId = getYouTubeVideoId(videoUrl);
		if (!videoId) throw new Error("Invalid YouTube URL");

		const info = await ytdl.getInfo(videoId);
		const videoTitle = info.videoDetails.title;

		const thumbnails = info.videoDetails.thumbnails || [];
		const bestThumbnail = thumbnails.reduce((max, thumb) => {
			const size = (thumb.width || 0) * (thumb.height || 0);
			const maxSize = (max.width || 0) * (max.height || 0);
			return size > maxSize ? thumb : max;
		}, thumbnails[0] || {});

		const thumbnailUrl = bestThumbnail.url || "";

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
		if (error.message.includes("age")) alert("You can't download this song because it is age restricted.");
		if (error.message.includes("private")) alert("You can't download this song because it is a private video.");
		downloadModalText.innerHTML = ``;
	}
}

async function processPlaylistLink(playlistUrl, downloadSecondPhase, downloadModalBottomRow, downloadModalText) {
	try {
		async function fetchPlaylistData(url) {
			const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
			if (!match) throw new Error("Invalid playlist URL");
			const playlistId = match[1];
			const playlist = await ytpl(playlistId, { pages: Infinity });
			const playlistTitle = playlist.title;
			const videoItems = playlist.items.map(video => ({
				title: video.title || "Unknown Title",
				url: video.url,
				thumbnail: video.thumbnail || "",
			}));
			const playlistThumbnail = videoItems.length ? videoItems[0].thumbnail : "";
			return { playlistTitle, playlistThumbnail, videoItems };
		}

		const { playlistTitle, playlistThumbnail, videoItems } = await fetchPlaylistData(playlistUrl);

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

async function processThumbnail(imageUrl, songId, songIndex = null) {
	try {
		console.log(`Processing thumbnail for ${songId}`);
		const thumbnailPath = path.join(thumbnailFolder, `${songId}.jpg`);

		let imgElement = null;
		if (songIndex !== null) {
			imgElement = document.getElementById(`thumbnailImage${songIndex}`);
		} else {
			imgElement = document.getElementById("thumbnailImage");
		}

		async function saveBufferFromUrl(url) {
			return new Promise((resolve, reject) => {
				https
					.get(url, res => {
						if (res.statusCode !== 200) {
							reject(new Error(`Failed to fetch thumbnail: ${res.statusCode}`));
							return;
						}
						const data = [];
						res.on("data", chunk => data.push(chunk));
						res.on("end", () => {
							const buffer = Buffer.concat(data);
							fs.writeFileSync(thumbnailPath, buffer);
							resolve(true);
						});
					})
					.on("error", reject);
			});
		}

		if (imgElement) {
			if (imgElement.tagName === "IMG" && imgElement.src) {
				if (imgElement.src.startsWith("data:image")) {
					const base64data = imgElement.src;
					const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
					fs.writeFileSync(thumbnailPath, thumbnailBuffer);
					console.log(`Saved thumbnail from DOM img element for ${songId}`);
					return true;
				} else if (imgElement.src.startsWith("http")) {
					try {
						await saveBufferFromUrl(imgElement.src);
						console.log(`Saved thumbnail from DOM img src for ${songId}`);
						return true;
					} catch (e) {
						console.error(`Error fetching thumbnail from DOM img: ${e.message}`);
					}
				}
			} else if (imgElement.style && imgElement.style.backgroundImage) {
				const bgImage = imgElement.style.backgroundImage;
				const bgUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");

				if (bgUrl && bgUrl !== "none") {
					if (bgUrl.startsWith("data:image")) {
						const base64data = bgUrl;
						const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
						fs.writeFileSync(thumbnailPath, thumbnailBuffer);
						console.log(`Saved thumbnail from DOM background image base64 for ${songId}`);
						return true;
					} else if (bgUrl.startsWith("http")) {
						try {
							await saveBufferFromUrl(bgUrl);
							console.log(`Saved thumbnail from DOM background image URL for ${songId}`);
							return true;
						} catch (e) {
							console.error(`Error fetching background image: ${e.message}`);
						}
					}
				}
			}
		}

		if (imageUrl) {
			if (imageUrl.startsWith("data:image")) {
				const base64data = imageUrl;
				const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
				fs.writeFileSync(thumbnailPath, thumbnailBuffer);
				console.log(`Saved thumbnail from passed imageUrl base64 for ${songId}`);
				return true;
			} else if (imageUrl.startsWith("http")) {
				try {
					await saveBufferFromUrl(imageUrl);
					console.log(`Saved thumbnail from passed imageUrl for ${songId}`);
					return true;
				} catch (e) {
					console.error(`Error fetching thumbnail from imageUrl: ${e.message}`);
				}
			}
		}

		function extractVideoId(url) {
			const match = url && url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
			return match ? match[1] : null;
		}

		const videoId = extractVideoId(imageUrl);

		if (videoId) {
			try {
				const info = await ytdl.getInfo(videoId);
				const thumbnails = info.videoDetails.thumbnails;
				if (!thumbnails || thumbnails.length === 0) throw new Error("No thumbnails found");

				const thumbnailUrl = thumbnails[thumbnails.length - 1].url;
				await saveBufferFromUrl(thumbnailUrl);
				console.log("Thumbnail fetch succeeded");
				return true;
			} catch (err) {
				console.error("YouTube thumbnail fetch failed:", err.message);
			}
		}

		try {
			const placeholderData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAAJC0lEQVR4nO3d0XLbRhJAUWjz/395v5JsecnuFkWCGKB7+pwXV1I71dXpHg4Jiv75+fkHFP1v9gZgJgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAst+zN9Dy8/Mzewt", "base64");
			fs.writeFileSync(thumbnailPath, placeholderData);
			console.log(`Created placeholder thumbnail for ${songId}`);
			return true;
		} catch (placeholderError) {
			console.error(`Failed to create placeholder for ${songId}: ${placeholderError.message}`);
			return false;
		}
	} catch (error) {
		console.error(`Error in processThumbnail for ${songId}:`, error);
		return false;
	}
}

async function actuallyDownloadTheSong() {
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

		try {
			await downloadAudio(firstInput, outputFilePath, (downloaded, total) => {
				const downloadedMB = (downloaded / (1024 * 1024)).toFixed(2);
				const totalMB = total ? ` / ${(total / (1024 * 1024)).toFixed(2)} MB` : "";
				document.getElementById("downloadModalText").innerText = `Downloading: ${downloadedMB} MB${totalMB}`;
			});

			document.getElementById("downloadModalText").innerText = "Song downloaded successfully! Stabilising volume...";

			if (stabiliseVolumeToggle) {
				try {
					await normalizeAudio(outputFilePath);
					document.getElementById("downloadModalText").innerText = "Audio normalized! Processing thumbnail...";
				} catch (error) {
					console.error("Audio normalization failed:", error);
					document.getElementById("downloadModalText").innerText = "Audio normalization failed, but continuing...";
				}
			}

			let duration = 0;
			try {
				const metadata = await new Promise((resolve, reject) => {
					ffmpeg.ffprobe(outputFilePath, (err, meta) => {
						if (err) return reject(err);
						resolve(meta);
					});
				});
				if (metadata.format && metadata.format.duration) {
					duration = Math.round(metadata.format.duration);
				}
			} catch (error) {
				console.error("Failed to retrieve metadata:", error);
			}

			await processThumbnail(img.src, songID);

			try {
				musicsDb
					.prepare(
						`INSERT INTO songs (
                song_id, song_name, song_url, song_thumbnail,
                song_length, seconds_played, times_listened, rms
            ) VALUES (?, ?, ?, ?, ?, 0, 0, NULL)`
					)
					.run(songID, secondInput, firstInput, `${songID}.jpg`, duration);
			} catch (err) {
				console.error("Failed to insert song into DB:", err);
			}

			document.getElementById("downloadModalText").innerText = "Download complete!";
			document.getElementById("finalDownloadButton").disabled = false;
			cleanDebugFiles();
		} catch (error) {
			document.getElementById("downloadModalText").innerText = `Error downloading song: ${error.message}`;
			console.log(error);
			document.getElementById("finalDownloadButton").disabled = false;
		}
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
			if (songTitles[i].length > 100) {
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

			if (window.isSaveAsPlaylistActive && existing) {
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
	if (songLinks.length !== songTitles.length || songLinks.length !== songIds.length) {
		throw new Error("Array length mismatch: songLinks, songTitles, and songIds must all be the same length");
	}

	const totalSongs = songLinks.length;
	let completedDownloads = 0;

	try {
		if (window.isSaveAsPlaylistActive) {
			const playlistThumbnailElement = document.getElementById("thumbnailImage0");
			if (playlistThumbnailElement && playlistThumbnailElement.style && playlistThumbnailElement.style.backgroundImage) {
				const thumbnailPath = path.join(thumbnailFolder, `${playlistName}_playlist.jpg`);
				const bgImage = playlistThumbnailElement.style.backgroundImage;
				const thumbnailUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");
				if (thumbnailUrl.startsWith("data:image")) {
					const base64Data = thumbnailUrl.split(",")[1];
					const buffer = Buffer.from(base64Data, "base64");
					fs.writeFileSync(thumbnailPath, buffer);
				} else if (thumbnailUrl.startsWith("http://") || thumbnailUrl.startsWith("https://")) {
					const response = await fetch(thumbnailUrl);
					if (response.ok) {
						const arrayBuffer = await response.arrayBuffer();
						const buffer = Buffer.from(arrayBuffer);
						fs.writeFileSync(thumbnailPath, buffer);
					}
				}
			}
		}

		for (let i = 0; i < totalSongs; i++) {
			const songTitle = songTitles[i];
			const songLink = songLinks[i];
			const songId = songIds[i];

			if (!songTitle || !songLink || !songId) {
				console.error(`Skipping index ${i}: missing title/link/id`);
				continue;
			}

			const songThumbnail = `${songId}.jpg`;
			const outputPath = path.join(musicFolder, `${songId}.mp3`);

			let success = false;
			let attempt = 0;

			while (!success && attempt < 3) {
				attempt++;

				try {
					await downloadAudio(songLink, outputPath, (downloaded, total) => {
						const downloadedMB = (downloaded / (1024 * 1024)).toFixed(2);
						document.getElementById("downloadModalText").innerText = `Downloading song ${i + 1} of ${totalSongs}: ${songTitle}. Progress: ${downloadedMB} MB`;
					});

					success = true;
				} catch (error) {
					if (error.message.includes("Age confirmation required")) {
						alert("This song requires age confirmation. Skipping...");
						document.getElementById("downloadModalText").innerText = `Skipping song ${i + 1} due to age restriction.`;
						break;
					}

					if (attempt < 3) await new Promise(r => setTimeout(r, 5000));
					else throw error;
				}
			}

			if (!success) continue;

			if (stabiliseVolumeToggle) {
				try {
					document.getElementById("downloadModalText").innerText = `Stabilising volume for song ${i + 1} of ${totalSongs}: ${songTitle}`;
					await normalizeAudio(outputPath);
				} catch (error) {
					console.error(`Audio normalization failed for ${songTitle}:`, error);
				}
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

			const thumbnailElement = document.getElementById(`thumbnailImage${i + 1}`);
			let thumbnailUrl = null;
			if (thumbnailElement) {
				if (thumbnailElement.style && thumbnailElement.style.backgroundImage) {
					const bgImage = thumbnailElement.style.backgroundImage;
					thumbnailUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");
				} else if (thumbnailElement.src) {
					thumbnailUrl = thumbnailElement.src;
				}
			}

			await processThumbnail(thumbnailUrl, songId, i + 1);

			if (songId != null && songTitle != null && songLink != null && songThumbnail != null && duration != null) {
				try {
					musicsDb
						.prepare(
							`INSERT INTO songs (
                                    song_id, song_name, song_url, song_thumbnail,
                                    song_length, seconds_played, times_listened, rms
                                ) VALUES (?, ?, ?, ?, ?, 0, 0, NULL)`
						)
						.run(songId, songTitle, songLink, songThumbnail, duration);
				} catch (err) {
					console.error(`DB insert failed for ${songTitle}: ${err.message}`);
				}
			} else {
				console.error(`Data undefined at index ${i}:`, {
					songId,
					songTitle,
					songLink,
					songThumbnail,
					duration,
				});
			}

			completedDownloads++;
			document.getElementById("downloadModalText").innerText = `Processed song ${i + 1} of ${totalSongs}. Progress: ${completedDownloads}/${totalSongs}`;

			await sleep(1000);
		}

		document.getElementById("downloadModalText").innerText = "All songs downloaded and normalized successfully!";
		document.getElementById("finalDownloadButton").disabled = false;

		cleanDebugFiles();
	} catch (error) {
		document.getElementById("downloadModalText").innerText = `Error downloading playlist: ${error.message}`;
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

async function downloadAudio(videoUrl, outputFilePath, onProgress) {
	return new Promise(async (resolve, reject) => {
		const videoId = (videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/) || [])[1] || null;

		if (!videoId) return reject(new Error("Invalid YouTube URL"));

		try {
			const stream = ytdl(videoId, { quality: "highestaudio" });
			const writeStream = fs.createWriteStream(outputFilePath);

			let downloaded = 0;
			let total = 0;

			stream.on("response", response => {
				total = parseInt(response.headers["content-length"], 10);
				if (onProgress) onProgress(downloaded, total);
			});

			stream.on("data", chunk => {
				downloaded += chunk.length;
				if (onProgress) onProgress(downloaded, total);
			});

			writeStream.on("finish", () => resolve());
			writeStream.on("error", reject);

			stream.pipe(writeStream);
		} catch (err) {
			reject(err);
		}
	});
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
	} catch (err) {
		console.error("Failed to save playlist:", err);
	}
}
