const fetch = require("node-fetch");
const https = require("https");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer");
const ytdl = require("@distube/ytdl-core");
const ytpl = require("@distube/ytpl");
const ytsr = require("@distube/ytsr");

let pendingPlaylistAddsWithIds = new Map();

function differentiateMediaLinks(url) {
	const trimmedUrl = url.trim();

	const ytVideoRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/;
	const ytPlaylistRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/playlist\?list=([^&]+)/;

	const spotifyTrackRegex = /(?:https?:\/\/)?open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;
	const spotifyPlaylistRegex = /(?:https?:\/\/)?open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;

	if (ytVideoRegex.test(trimmedUrl)) {
		return "youtube_video";
	} else if (ytPlaylistRegex.test(trimmedUrl)) {
		return "youtube_playlist";
	} else if (spotifyTrackRegex.test(trimmedUrl)) {
		return "spotify_track";
	} else if (spotifyPlaylistRegex.test(trimmedUrl)) {
		return "spotify_playlist";
	} else {
		return "search";
	}
}

async function searchInYoutube(songName, resultLimit = 1) {
	const result = await ytsr(songName, { safeSearch: false, limit: resultLimit });
	searchedSongsUrl = result.items[resultLimit - 1].url;
	return searchedSongsUrl;
}

function checkNameThumbnail(redownload) {
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

	if (redownload) return;

	const userInput = document.getElementById("downloadFirstInput").value.trim();
	if (userInput == "") {
		downloadModalText.innerHTML = "The input can not be empty.";
		document.getElementById("downloadFirstButton").disabled = false;
		return;
	}

	downloadingStyle = differentiateMediaLinks(userInput);

	if (downloadingStyle == "youtube_video") {
		processVideoLink(userInput);
	} else if (downloadingStyle == "youtube_playlist") {
		fetchPlaylistData(userInput);
	} else if (downloadingStyle == "spotify_track") {
		getSpotifySongName(userInput);
	} else if (downloadingStyle == "spotify_playlist") {
		getPlaylistSongsAndArtists(userInput);
	} else {
		processVideoLink(searchInYoutube(userInput, 1));
	}
}

async function getSpotifySongName(link) {
	const response = await fetch(link, {
		headers: {
			"User-Agent": "Mozilla/5.0",
		},
	});

	if (!response.ok) return;

	const html = await response.text();
	const $ = cheerio.load(html);

	const title = $("title").text();
	const name = title.replace(" song and lyrics by", "").replace("| Spotify", "").trim();
	processVideoLink(searchInYoutube(name, 1));
}

async function getPlaylistSongsAndArtists(link) {
	document.getElementById("downloadModalText").innerText = "Launching browser...";
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	await page.setViewport({ width: 1920, height: 1080 });
	await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");

	document.getElementById("downloadModalText").innerText = "Navigating to playlist page...";
	await page.goto(link, { waitUntil: "networkidle2" });

	document.getElementById("downloadModalText").innerText = "Waiting for the tracks to load...";
	await page.waitForSelector('a[data-testid="internal-track-link"]', { timeout: 30000 });

	const scrollContainer = await page.evaluateHandle(() => {
		function isScrollable(el) {
			const style = getComputedStyle(el);
			return (style.overflowY == "auto" || style.overflowY == "scroll") && el.scrollHeight > el.clientHeight;
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
	const playlistName = playlistNameRaw.replace(/\s*-\s*playlist by .*?\| Spotify$/, "");

	const { imageUrl } = await page.evaluate(() => {
		let imageUrl = null;
		const thumbnailElement = document.querySelector('[data-testid="playlist-image"] img');
		if (thumbnailElement && thumbnailElement.src) {
			imageUrl = thumbnailElement.src;
		} else {
			const allDivs = Array.from(document.querySelectorAll("div"));
			const backgroundDiv = allDivs.find(el => {
				const style = getComputedStyle(el);
				const bg = style.backgroundImage;
				return bg.includes("scdn.co/image/") && el.clientHeight > 200 && el.clientWidth > 200;
			});
			if (backgroundDiv) {
				const match = getComputedStyle(backgroundDiv).backgroundImage.match(/url\("?([^"]+)"?\)/);
				if (match && match[1]) imageUrl = match[1];
			}
		}
		return { imageUrl };
	});

	const playlistThumbnail = imageUrl || path.join(appThumbnailFolder, "placeholder.jpg");

	const songs = await page.evaluate(async container => {
		function sleep(ms) {
			return new Promise(r => setTimeout(r, ms));
		}

		const seen = new Map();
		let sameCount = 0;
		let lastRowIndex = 0;

		while (sameCount < 3) {
			container.scrollBy(0, 800);
			await sleep(800);

			const rows = container.querySelectorAll("[aria-rowindex]");
			let newFound = 0;

			rows.forEach(row => {
				const rowIndex = parseInt(row.getAttribute("aria-rowindex"), 10);

				console.log(`Processing row ${rowIndex}, lastRowIndex: ${lastRowIndex}`);

				if (rowIndex <= lastRowIndex) {
					console.log(`Skipping row ${rowIndex} (already processed)`);
					return;
				}

				const trackLink = row.querySelector('a[data-testid="internal-track-link"]');
				if (!trackLink) {
					console.log(`No track link found in row ${rowIndex}`);
					return;
				}

				const title = row.querySelector("div[data-encore-id='text']")?.textContent.trim();
				const artistLink = row.querySelector("span a[href^='/artist']");
				const artist = artistLink?.textContent.trim();

				console.log(`Row ${rowIndex}: title="${title}", artist="${artist}"`);

				if (title && artist) {
					const key = title + "||" + artist;
					if (!seen.has(key)) {
						seen.set(key, { title, artist });
						console.log(`${seen.size}. song: ${title} by ${artist}`);
						newFound++;
						lastRowIndex = Math.max(lastRowIndex, rowIndex);
					} else {
						console.log(`Duplicate found: ${key}`);
					}
				} else {
					console.log(`Missing title or artist in row ${rowIndex}`);
				}
			});

			console.log(`Scroll iteration complete. New found: ${newFound}, Same count: ${sameCount}`);

			if (newFound == 0) {
				sameCount++;
			} else {
				sameCount = 0;
			}
		}

		return Array.from(seen.values());
	}, scrollContainer);

	document.getElementById("downloadModalText").innerText = `Extracted ${songs.length} tracks. Searching for the tracks in Youtube...`;

	async function fetchWithRetry(video, retries = 5) {
		const query = `${video.title} ${video.artist}`;
		for (let i = 0; i < retries; i++) {
			const result = await ytsr(query, { limit: 1, type: "video" });
			if (result.items.length) {
				const yt = result.items[0];
				return { title: query, url: yt.url, thumbnail: yt.thumbnail };
			}
			await new Promise(r => setTimeout(r, 1000 * (i + 1)));
		}
		throw new Error(`Failed to fetch video for: ${query}`);
	}

	async function asyncPool(concurrency, items, iteratorFn) {
		const ret = [];
		const executing = [];
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const p = Promise.resolve().then(() => iteratorFn(item, i));
			ret.push(p);
			if (executing.length >= concurrency) {
				await Promise.race(executing);
			}
			const e = p.then(() => executing.splice(executing.indexOf(e), 1));
			executing.push(e);
		}
		return Promise.all(ret);
	}

	let foundCount = 0;
	const total = songs.length;
	const videoItems = await asyncPool(5, songs, async video => {
		const item = await fetchWithRetry(video);
		foundCount++;
		document.getElementById("downloadModalText").innerText = `Found ${foundCount} out of ${total} songs in Youtube...`;
		return item;
	});

	await browser.close();
	renderPlaylistUI(playlistName, playlistThumbnail, videoItems);
}

async function processVideoLink(videoUrl) {
	try {
		const videoId = await videoUrl;
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
		thumbnailImage.src = thumbnailUrl.trim();
		thumbnailImage.alt = "";

		thumbnailImage.onerror = function () {
			console.log("Error loading thumbnail image:", thumbnailUrl);
		};

		songAndThumbnail.appendChild(thumbnailImage);

		const addToPlaylistBtn = document.createElement("button");
		addToPlaylistBtn.className = "addToPlaylist";
		addToPlaylistBtn.innerHTML = "Playlists";
		addToPlaylistBtn.onclick = () => openAddToPlaylistModalStaging("songAndThumbnail");
		exampleDownloadColumn.appendChild(addToPlaylistBtn);

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
	} catch (error) {
		console.log("Error in processVideoLink:", error);
		document.getElementById("downloadFirstButton").disabled = false;
		if (error.message.includes("age")) await alertModal("You can't download this song because it is age restricted.");
		if (error.message.includes("private")) await alertModal("You can't download this song because it is a private video.");
		if (document.getElementById("downloadSecondPhase")) document.getElementById("downloadSecondPhase").remove();
	}
}

async function fetchPlaylistData(url) {
	try {
		const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
		if (!match) throw new Error("Invalid playlist URL");
		const playlistID = match[1];
		const playlist = await ytpl(playlistID, { pages: Infinity });
		const playlistTitle = playlist.title;
		const videoItems = playlist.items.map(video => ({
			title: video.title || "Unknown Title",
			url: video.url,
			thumbnail: video.thumbnail || "",
		}));
		const playlistThumbnail = videoItems.length ? videoItems[0].thumbnail : "";
		renderPlaylistUI(playlistTitle, playlistThumbnail, videoItems);
	} catch (error) {
		console.log("Error fetching playlist data:", error);
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
		console.log(`Processing thumbnail for ${songId}`);

		const thumbnailPath = path.join(thumbnailFolder, `${songId}.jpg`);

		let imgElement = null;
		if (songIndex !== null) {
			imgElement = document.getElementById(`thumbnailImage${songIndex}`);
		} else {
			imgElement = document.getElementById("thumbnailImage");
		}

		async function saveBufferFromUrl(url, pathToSave) {
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
							fs.writeFileSync(pathToSave, buffer);
							resolve(true);
						});
					})
					.on("error", reject);
			});
		}

		if (imgElement) {
			if (imgElement.tagName === "IMG" && imgElement.src) {
				if (imgElement.src.startsWith("data:image")) {
					const base64data = imgElement.src.split(",")[1];
					fs.writeFileSync(thumbnailPath, Buffer.from(base64data, "base64"));
					console.log(`Saved thumbnail from DOM img element for ${songId}`);
					return true;
				} else if (imgElement.src.startsWith("http")) {
					try {
						await saveBufferFromUrl(imgElement.src, thumbnailPath);
						console.log(`Saved thumbnail from DOM img src for ${songId}`);
						return true;
					} catch (e) {
						console.log(`Error fetching thumbnail from DOM img: ${e.message}`);
					}
				}
			} else if (imgElement.style?.backgroundImage) {
				const bgUrl = imgElement.style.backgroundImage.replace(/^url\(['"](.+)['"]\)$/, "$1");
				if (bgUrl && bgUrl !== "none") {
					if (bgUrl.startsWith("data:image")) {
						const base64data = bgUrl.split(",")[1];
						fs.writeFileSync(thumbnailPath, Buffer.from(base64data, "base64"));
						console.log(`Saved thumbnail from DOM background image base64 for ${songId}`);
						return true;
					} else if (bgUrl.startsWith("http")) {
						try {
							await saveBufferFromUrl(bgUrl, thumbnailPath);
							console.log(`Saved thumbnail from DOM background image URL for ${songId}`);
							return true;
						} catch (e) {
							console.log(`Error fetching background image: ${e.message}`);
						}
					}
				}
			}
		}

		if (imageUrl) {
			if (imageUrl.startsWith("data:image")) {
				const base64data = imageUrl.split(",")[1];
				fs.writeFileSync(thumbnailPath, Buffer.from(base64data, "base64"));
				console.log(`Saved thumbnail from passed imageUrl base64 for ${songId}`);
				return true;
			} else if (imageUrl.startsWith("http")) {
				try {
					await saveBufferFromUrl(imageUrl, thumbnailPath);
					console.log(`Saved thumbnail from passed imageUrl for ${songId}`);
					return true;
				} catch (e) {
					console.log(`Error fetching thumbnail from imageUrl: ${e.message}`);
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
				const info = await ytdl.getInfo(videoId);
				const thumbnails = info.videoDetails.thumbnails;
				if (!thumbnails?.length) throw new Error("No thumbnails found");
				const thumbnailUrl = thumbnails[thumbnails.length - 1].url;
				await saveBufferFromUrl(thumbnailUrl, thumbnailPath);
				console.log("Thumbnail fetch succeeded");
				return true;
			} catch (err) {
				console.log("YouTube thumbnail fetch failed:", err.message);
			}
		}

		const placeholderData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAAJC0lEQVR4nO3d0XLbRhJAUWjz/395v5JsecnuFkWCGKB7+pwXV1I71dXpHg4Jiv75+fkHFP1v9gZgJgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAst+zN9Dy8/Mzewt", "base64");
		fs.writeFileSync(thumbnailPath, placeholderData);
		console.log(`Created placeholder thumbnail for ${songId}`);
		return true;
	} catch (error) {
		console.log(`Error in processThumbnail for ${songId}:`, error);
		return false;
	}
}

async function actuallyDownloadTheSong() {
	document.getElementById("finalDownloadButton").disabled = true;
	const firstInput = downloadingStyle == "search" ? searchedSongsUrl : document.getElementById("downloadFirstInput").value.trim();

	if (downloadingStyle == "youtube_video" || downloadingStyle == "spotify_track" || downloadingStyle == "search") {
		const secondInput = document.getElementById("downloadSecondInput").value.trim();
		const songID = generateId();
		const outputFilePath = path.join(musicFolder, `${songID}.mp3`);
		const img = document.getElementById("thumbnailImage");

		const existingPlaylists = pendingPlaylistAddsWithIds.get("songAndThumbnail") || [];
		pendingPlaylistAddsWithIds.delete("songAndThumbnail");
		pendingPlaylistAddsWithIds.set(songID, existingPlaylists);

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

			if (stabiliseVolumeToggle == 1) {
				try {
					document.getElementById("downloadModalText").innerText = "Song downloaded successfully! Stabilising volume...";
					await normalizeAudio(outputFilePath);
					document.getElementById("downloadModalText").innerText = "Audio normalized! Processing thumbnail...";
				} catch (error) {
					console.log("Audio normalization failed:", error);
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
				console.log("Failed to retrieve metadata:", error);
			}

			const fileSize = fs.statSync(outputFilePath).size;

			await processThumbnail(img.src, songID);

			try {
				musicsDb
					.prepare(
						`INSERT INTO songs (
							song_id, song_name, song_url,
							song_length, seconds_played, times_listened, stabilised,
							size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.run(songID, secondInput, firstInput, duration, 0, 0, stabiliseVolumeToggle, fileSize, 100, null, null, null, 100, "mp3", "jpg", null, null, null);

				settingsDb
					.prepare(
						`UPDATE statistics SET
                        ${["spotify_track", "spotify_playlist"].includes(downloadingStyle) ? "songs_downloaded_spotify" : "songs_downloaded_youtube"} =
                        ${["spotify_track", "spotify_playlist"].includes(downloadingStyle) ? "songs_downloaded_spotify" : "songs_downloaded_youtube"} + 1`
					)
					.run();

				await commitStagedPlaylistAdds();
			} catch (err) {
				console.log("Failed to insert song into DB:", err);
			}

			document.getElementById("downloadModalText").innerText = "Download complete!";
			document.getElementById("finalDownloadButton").disabled = false;
			if (document.getElementById("my-music-content").style.display == "block") await myMusicOnClick();
		} catch (error) {
			document.getElementById("downloadModalText").innerText = `Error downloading song: ${error.message}`;
			console.log(error);
			document.getElementById("finalDownloadButton").disabled = false;
			if (document.getElementById("my-music-content").style.display == "block") await myMusicOnClick();
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
				songElement.hasAttribute("data-id") ? songIds.push(songElement.getAttribute("data-id")) : songIds.push(generateId());
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
		const playlistID = generateId();

		try {
			document.getElementById("downloadModalText").innerText = totalSongs > 50 ? "Downloading... This might take some time..." : "Downloading...";
			downloadPlaylist(songLinks, songTitles, songIds, playlistName, playlistID);
		} catch (err) {
			document.getElementById("downloadModalText").innerText = "Database error: " + err.message;
			document.getElementById("finalDownloadButton").disabled = false;
		}
	}
}

async function downloadPlaylist(songLinks, songTitles, songIds, playlistName, playlistID) {
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
		if (window.isSaveAsPlaylistActive) {
			const playlistThumbnailElement = document.getElementById("thumbnailImage0");
			if (playlistThumbnailElement && playlistThumbnailElement.style && playlistThumbnailElement.style.backgroundImage) {
				const thumbnailPath = path.join(thumbnailFolder, `${playlistID}.jpg`);
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
				console.log(`Skipping index ${i}: missing title/link/id`);
				continue;
			}

			const outputPath = path.join(musicFolder, `${songId}.mp3`);

			try {
				await downloadAudio(songLink, outputPath, (downloaded, total) => {
					const downloadedMB = (downloaded / (1024 * 1024)).toFixed(2);
					document.getElementById("downloadModalText").innerText = `Downloading song ${i + 1} of ${totalSongs}: ${songTitle}. Progress: ${downloadedMB} MB`;
				});
			} catch (error) {
				if (error.message.includes("Age confirmation required") || error.message.includes("confirm your age")) {
					await alertModal("This song requires age confirmation. Skipping...");
					document.getElementById("downloadModalText").innerText = `Skipping song ${i + 1} due to age restriction.`;
					continue;
				} else {
					throw error;
				}
			}

			if (stabiliseVolumeToggle == 1) {
				try {
					document.getElementById("downloadModalText").innerText = `Stabilising volume for song ${i + 1} of ${totalSongs}: ${songTitle}`;
					await normalizeAudio(outputPath);
				} catch (error) {
					stabiliseVolumeToggle = 0;
					console.log(`Audio normalization failed for ${songTitle}:`, error);
				}
			} else {
				document.getElementById("downloadModalText").innerText = `Song downloaded! Volume stabilisation is disabled. Waiting 5 seconds for not overloading the Youtube API...`;
				await sleep(5000);
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
					musicsDb
						.prepare(
							`INSERT INTO songs (
							song_id, song_name, song_url,
							song_length, seconds_played, times_listened, stabilised,
							size, speed, bass, treble, midrange, volume, song_extension, thumbnail_extension, artist, genre, language
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
						)
						.run(songId, songTitle, songLink, duration, 0, 0, stabiliseVolumeToggle, fileSize, 100, null, null, null, 100, "mp3", "jpg", null, null, null);
				} catch (err) {
					console.log(`DB insert failed for ${songTitle}: ${err.message}`);
				}
			} else {
				console.log(`Data undefined at index ${i}:`, {
					songId,
					songTitle,
					songLink,
					duration,
				});
			}

			completedDownloads++;
			document.getElementById("downloadModalText").innerText = `Processed song ${i + 1} of ${totalSongs}.`;

			await sleep(1000);
		}

		settingsDb
			.prepare(
				`UPDATE statistics SET
                ${["spotify_track", "spotify_playlist"].includes(downloadingStyle) ? "songs_downloaded_spotify" : "songs_downloaded_youtube"} =
                ${["spotify_track", "spotify_playlist"].includes(downloadingStyle) ? "songs_downloaded_spotify" : "songs_downloaded_youtube"} + ${totalSongs}`
			)
			.run();

		if (window.isSaveAsPlaylistActive) {
			const thumbnailPath = path.join(thumbnailFolder, `${playlistID}.jpg`);
			const songsJson = JSON.stringify(songIds.map(id => id.trim()));

			try {
				playlistsDb
					.prepare(
						`
						INSERT INTO playlists (id, name, songs, thumbnail_extension)
						VALUES (?, ?, ?, ?)
					`
					)
					.run(playlistID, playlistName, songsJson, "jpg");
			} catch (err) {
				console.log("Failed to save playlist:", err);
			}
		}

		document.getElementById("downloadModalText").innerText = "All songs downloaded successfully!";
		document.getElementById("finalDownloadButton").disabled = false;
		if (document.getElementById("my-music-content").style.display == "block") await myMusicOnClick();
		await commitStagedPlaylistAdds();
	} catch (error) {
		document.getElementById("downloadModalText").innerText = `Error downloading playlist: ${error.message}`;
		document.getElementById("finalDownloadButton").disabled = false;
		if (document.getElementById("my-music-content").style.display == "block") await myMusicOnClick();
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

			stream.on("error", error => {
				console.log("Stream error:", error.message);
				writeStream.destroy();
				if (fs.existsSync(outputFilePath)) {
					try {
						fs.unlinkSync(outputFilePath);
					} catch (unlinkError) {
						console.log("Failed to remove partial file:", unlinkError.message);
					}
				}
				reject(error);
			});

			stream.on("response", response => {
				total = parseInt(response.headers["content-length"], 10);
				if (onProgress) onProgress(downloaded, total);
			});

			stream.on("data", chunk => {
				downloaded += chunk.length;
				if (onProgress) onProgress(downloaded, total);
			});

			writeStream.on("finish", () => resolve());

			writeStream.on("error", error => {
				console.log("Write stream error:", error.message);
				if (fs.existsSync(outputFilePath)) {
					try {
						fs.unlinkSync(outputFilePath);
					} catch (unlinkError) {
						console.log("Failed to remove partial file:", unlinkError.message);
					}
				}
				reject(error);
			});

			stream.pipe(writeStream);
		} catch (err) {
			console.log("Synchronous error in downloadAudio:", err.message);
			reject(err);
		}
	});
}

function openAddToPlaylistModalStaging(songId) {
	document.getElementById("addToPlaylistModal").style.display = "block";
	const checkboxContainer = document.getElementById("playlist-checkboxes");
	checkboxContainer.innerHTML = "";

	const allPlaylists = playlistsDb.prepare("SELECT * FROM playlists").all() || [];
	allPlaylists.forEach(playlist => {
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.id = playlist.id;
		checkbox.value = songId;
		if ((pendingPlaylistAddsWithIds.get(songId) || []).includes(playlist.name)) checkbox.checked = true;
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
		lists.forEach(listID => {
			const playlist = playlistsDb.prepare("SELECT * FROM playlists WHERE id = ?").get(listID);
			let songs = JSON.parse(playlist.songs);

			if (!songs.includes(song)) {
				songs.push(song);
				playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE name = ?").run(JSON.stringify(songs), listID);
			}
		});
	}
	pendingPlaylistAddsWithIds.clear();
}
