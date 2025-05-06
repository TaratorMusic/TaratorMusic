const ytdl = require("@distube/ytdl-core");
const ytpl = require("@distube/ytpl");

function isValidFileName(fileName) {
	const invalidChars = /[\\/:"*?<>|'.,]/;
	return !invalidChars.test(fileName);
}

function fileExists(filePath) {
	try {
		fs.accessSync(filePath, fs.constants.F_OK);
		return true;
	} catch (err) {
		return false;
	}
}

function findDuplicates(array) {
	const counts = {};
	const duplicates = [];

	array.forEach(item => {
		counts[item] = (counts[item] || 0) + 1;
		if (counts[item] === 2) {
			duplicates.push(item);
		}
	});

	return duplicates;
}

function updateThumbnailImage(event, mode) {
	const file = event.target.files[0];
	if (file && file.type === "image/jpeg") {
		const reader = new FileReader();
		reader.onload = function (e) {
			if (typeof mode === "number") {
				const elementId = mode === 1 ? "customiseImage" : mode === 2 ? "editPlaylistThumbnail" : mode === 3 ? "thumbnailImage" : null;
				if (elementId) {
					document.getElementById(elementId).src = e.target.result;
				}
			} else if (mode instanceof HTMLElement) {
				mode.style.backgroundImage = `url(${e.target.result})`;
			}
		};
		reader.readAsDataURL(file);
	} else {
		alert("Please select a valid JPG image.");
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

function processVideoLink(videoUrl, downloadSecondPhase, downloadModalBottomRow, downloadModalText) {
	getVideoInfo(videoUrl)
		.then(info => {
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
		})
		.catch(error => {
			console.error("Error in processVideoLink:", error);
			downloadModalText.innerHTML = `Error: ${error.message}`;
			document.getElementById("downloadFirstButton").disabled = false;
		});
}

async function getVideoInfo(videoUrl) {
	try {
		const info = await ytdl.getInfo(videoUrl);
		return info;
	} catch (error) {
		throw new Error(`Failed to get video info: ${error.message}`);
	}
}

async function getPlaylistInfo(playlistUrl) {
	try {
		const playlist = await ytpl(playlistUrl);
		return playlist;
	} catch (error) {
		throw new Error(`Failed to get playlist info: ${error.message}`);
	}
}

function processPlaylistLink(playlistUrl, downloadSecondPhase, downloadModalBottomRow, downloadModalText) {
	getPlaylistInfo(playlistUrl)
		.then(playlist => {
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
		})
		.catch(error => {
			console.error("Error processing playlist:", error);
			downloadModalText.innerHTML = `Error: ${error.message}`;
			document.getElementById("downloadFirstButton").disabled = false;
		});
}

function actuallyDownloadTheSong() {
	document.getElementById("finalDownloadButton").disabled = true;
	const firstInput = document.getElementById("downloadFirstInput").value.trim();
	const linkType = differentiateYouTubeLinks(firstInput);

	if (linkType === "video") {
		downloadSingleVideo();
	} else if (linkType === "playlist") {
		downloadPlaylist();
	} else {
		document.getElementById("downloadModalText").innerText = "The URL is neither a valid video nor playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

function downloadSingleVideo() {
	const firstInput = document.getElementById("downloadFirstInput").value.trim();
	const secondInput = document.getElementById("downloadSecondInput").value.trim();
	const outputFilePath = path.join(musicFolder, `${secondInput}.mp3`);
	const img = document.getElementById("thumbnailImage");

	if (!isValidFileName(secondInput)) {
		document.getElementById("downloadModalText").innerText = 'Invalid characters in filename. These characters cannot be used in filenames: / \\ : * ? " < > | ,';
		document.getElementById("finalDownloadButton").disabled = false;
		return;
	} else if (secondInput.length > 100) {
		document.getElementById("downloadModalText").innerText = "Invalid filename. The file must be shorter than 100 characters.";
		document.getElementById("finalDownloadButton").disabled = false;
		return;
	} else if (fileExists(outputFilePath)) {
		document.getElementById("downloadModalText").innerText = `File ${secondInput}.mp3 already exists. Please choose a different filename.`;
		document.getElementById("finalDownloadButton").disabled = false;
		return;
	}

	document.getElementById("downloadModalText").innerText = "Downloading Song...";

	ytdl(firstInput, { filter: "audioonly", quality: "highestaudio" })
		.pipe(fs.createWriteStream(outputFilePath))
		.on("finish", () => {
			document.getElementById("downloadModalText").innerText = "Song downloaded successfully! Processing thumbnail...";
			processThumbnail(img.src, secondInput)
				.then(() => {
					document.getElementById("downloadModalText").innerText = "Download complete!";
					document.getElementById("finalDownloadButton").disabled = false;
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
}

function downloadPlaylist() {
	const playlistName = document.getElementById("playlistTitle0").value.trim();
	const songLinks = [];
	const thumbnails = document.querySelectorAll(".thumbnailImage");

	for (let i = 1; i < thumbnails.length; i++) {
		const style = thumbnails[i].style.backgroundImage;
		const match = style.match(/img\.youtube\.com\/vi\/([^/]+)\//);

		if (match && match[1]) {
			const videoId = match[1];
			const youtubeLink = `https://www.youtube.com/watch?v=${videoId}`;
			songLinks.push(youtubeLink);
		}
	}

	const totalSongs = songLinks.length;

	if (totalSongs < 1) {
		document.getElementById("downloadModalText").innerText = "No songs found in playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
		return;
	}

	if (!isValidFileName(playlistName)) {
		document.getElementById("downloadModalText").innerText = `Invalid characters in the playlist name. These characters cannot be used in filenames: / \\ ' . : * ? " < > | ,`;
		document.getElementById("finalDownloadButton").disabled = false;
		return;
	}

	const songTitles = Array.from(document.querySelectorAll("input.playlistTitle"), input => input.value.trim()).slice(1);

	if (songTitles.length === 0 || songLinks.length === 0) {
		document.getElementById("downloadModalText").innerText = "No valid songs found in playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
		Base64;
		return;
	}

	const invalidTitles = [];
	const duplicateTitles = findDuplicates(songTitles);

	for (let i = 0; i < songTitles.length; i++) {
		const title = songTitles[i];
		const outputPath = path.join(musicFolder, `${title}.mp3`);

		if (!isValidFileName(title)) {
			invalidTitles.push(`Song #${i + 1}: Invalid characters`);
		} else if (title.length > 100) {
			invalidTitles.push(`Song #${i + 1}: Filename too long`);
		} else if (fileExists(outputPath)) {
			invalidTitles.push(`Song #${i + 1}: File already exists`);
		}
	}

	if (invalidTitles.length > 0) {
		document.getElementById("downloadModalText").innerText = `Validation errors:${invalidTitles.join("\n")}`;
		document.getElementById("finalDownloadButton").disabled = false;
		return;
	}

	if (duplicateTitles.length > 0) {
		document.getElementById("downloadModalText").innerText = `The following file names have duplicates: ${duplicateTitles.join(", ")}. Please choose different filenames.`;
		document.getElementById("finalDownloadButton").disabled = false;
		return;
	}

	fs.readFile(playlistPath, "utf8", (err, data) => {
		if (err) {
			document.getElementById("downloadModalText").innerText = "Error reading playlist file: " + err.message;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		let playlists = [];
		try {
			playlists = JSON.parse(data);
		} catch (error) {
			console.error("Error parsing playlists:", error);
			playlists = [];
		}

		if (playlists.some(playlist => playlist.name === playlistName)) {
			document.getElementById("downloadModalText").innerText = "A playlist with this name already exists.";
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		if (window.isSaveAsPlaylistActive) {
			saveAsPlaylist(songTitles, playlistName);
		}

		document.getElementById("downloadModalText").innerText = totalSongs > 50 ? "Downloading... This might take some time..." : "Downloading...";

		downloadSongsWithThumbnails(songLinks, songTitles, playlistName);
	});
}

async function downloadSongsWithThumbnails(songLinks, songTitles, playlistName) {
	const ytpl = require("@distube/ytpl");
	const totalSongs = songLinks.length;
	let completedDownloads = 0;

	try {
		const playlistUrl = document.getElementById("downloadFirstInput").value.trim();
		const playlist = await ytpl(playlistUrl);
		const thumbnailUrls = playlist.items.map(item => item.thumbnail);

		for (let i = 0; i < songLinks.length; i++) {
			const songTitle = songTitles[i];
			const songLink = songLinks[i];

			document.getElementById("downloadModalText").innerText = `Downloading song ${i + 1} of ${totalSongs}: ${songTitle}`;

			try {
				await downloadMusic(songLink, songTitle);
				completedDownloads++;

				let thumbnailUrl = thumbnailUrls[i];
				if (!thumbnailUrl || thumbnailUrl === "No thumbnail found") {
					const imgElement = document.getElementById(`thumbnailImage${i + 1}`);
					if (imgElement) {
						const bgImage = imgElement.style.backgroundImage;
						thumbnailUrl = bgImage.replace(/^url\(['"](.+)['"]\)$/, "$1");
					}
				}

				if (thumbnailUrl) {
					await processThumbnail(thumbnailUrl, songTitle);
				}

				document.getElementById("downloadModalText").innerText = `Downloaded song ${i + 1} of ${totalSongs}. Progress: ${completedDownloads}/${totalSongs}`;
			} catch (error) {
				console.error(`Error downloading song ${i + 1}:`, error);
				document.getElementById("downloadModalText").innerText = `Error downloading song ${i + 1}: ${error.message}`;
			}
		}

		document.getElementById("downloadModalText").innerText = "All songs downloaded successfully!";
		document.getElementById("finalDownloadButton").disabled = false;

		if (window.isSaveAsPlaylistActive) {
			fs.rename("thumbnails/placeholdergagaga_thumbnail.jpg", `thumbnails/${playlistName}_playlist.jpg`, err => {
				if (err) console.error("Error renaming playlist thumbnail:", err);
			});
		}
	} catch (error) {
		document.getElementById("downloadModalText").innerText = `Error downloading playlist: ${error.message}`;
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

async function downloadMusic(videoUrl, title) {
	return new Promise((resolve, reject) => {
		try {
			const ytdl = require("@distube/ytdl-core");
			const outputPath = path.join(musicFolder, `${title}.mp3`);

			const stream = ytdl(videoUrl, {
				quality: "highestaudio",
				filter: "audioonly",
			});

			const writer = fs.createWriteStream(outputPath);

			stream.pipe(writer);

			writer.on("finish", () => {
				resolve();
				cleanDebugFiles();
			});

			writer.on("error", err => {
				reject(err);
			});
		} catch (error) {
			reject(error);
		}
	});
}

async function processThumbnail(imageUrl, title) {
	try {
		console.log(`Processing thumbnail for ${title}:`, imageUrl);

		if (!imageUrl || imageUrl === "undefined" || imageUrl === "[object Object]") {
			throw new Error("Invalid thumbnail URL");
		}

		if (imageUrl.startsWith("data:image")) {
			const base64data = imageUrl;
			const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
			const thumbnailPath = path.join(thumbnailFolder, `${title}_thumbnail.jpg`);

			fs.writeFileSync(thumbnailPath, thumbnailBuffer);
			console.log(`Saved thumbnail from base64 for ${title}`);
			return true;
		}

		try {
			const response = await fetch(imageUrl);
			if (!response.ok) {
				throw new Error(`HTTP error ${response.status}`);
			}
			cleanDebugFiles;
			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			const thumbnailPath = path.join(thumbnailFolder, `${title}_thumbnail.jpg`);

			fs.writeFileSync(thumbnailPath, buffer);
			console.log(`Saved thumbnail from URL for ${title}`);
			return true;
		} catch (fetchError) {
			console.error(`Error fetching thumbnail for ${title}:`, fetchError);
			throw fetchError;
		}
	} catch (error) {
		console.error(`Error processing thumbnail for ${title}:`, error);

		try {
			console.log(`Attempting fallback method for ${title}`);
			const thumbnailPath = path.join(thumbnailFolder, `${title}_thumbnail.jpg`);

			let videoId = null;

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

			if (videoId) {
				const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
				const info = await ytdl.getBasicInfo(youtubeUrl);
				const thumbnailUrl = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url;

				const response = await fetch(thumbnailUrl);
				if (!response.ok) throw new Error(`HTTP error ${response.status}`);

				const arrayBuffer = await response.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);

				fs.writeFileSync(thumbnailPath, buffer);
				console.log(`Fallback method succeeded for ${title}`);
				return true;
			} else {
				try {
					const response = await fetch(imageUrl, {
						headers: {
							"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
						},
					});

					if (!response.ok) throw new Error(`HTTP error ${response.status}`);

					const arrayBuffer = await response.arrayBuffer();
					const buffer = Buffer.from(arrayBuffer);

					fs.writeFileSync(thumbnailPath, buffer);
					console.log(`Direct download succeeded for ${title}`);
					return true;
				} catch (directError) {
					console.error(`Direct download failed: ${directError.message}`);
					throw new Error("Could not extract video ID and direct download failed");
				}
			}
		} catch (fallbackError) {
			console.error(`Fallback thumbnail download failed for ${title}:`, fallbackError);

			try {
				const placeholderPath = path.join(thumbnailFolder, `${title}_thumbnail.jpg`);
				const placeholderData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAAJC0lEQVR4nO3d0XLbRhJAUWjz/395v5JsecnuFkWCGKB7+pwXV1I71dXpHg4Jiv75+fkHFP1v9gZgJgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAst+zN9Dy8/Mzewt", "base64");
				fs.writeFileSync(placeholderPath, placeholderData);
				console.log(`Created placeholder thumbnail for ${title}`);
				return true;
			} catch (placeholderError) {
				console.error(`Failed to create placeholder: ${placeholderError.message}`);
				return false;
			}
		}
	}
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

function saveAsPlaylist(playlistTitlesArray, playlistName) {
	const trimmedArray = playlistTitlesArray.map(element => element.trim());

	fs.readFile(playlistPath, "utf8", (err, data) => {
		if (err) {
			console.error("Error reading the JSON file:", err);
			return;
		}

		try {
			let playlists = JSON.parse(data);

			const playlistExists = playlists.some(playlist => playlist.name === playlistName);
			if (playlistExists) {
				console.error("A playlist with this name already exists.");
				return;
			}

			let newPlaylist = {
				name: playlistName,
				songs: trimmedArray,
				thumbnail: path.join(thumbnailFolder, `${playlistName}_playlist.jpg`),
			};

			playlists.push(newPlaylist);
			let updatedJsonData = JSON.stringify(playlists, null, 2);

			fs.writeFile(playlistPath, updatedJsonData, "utf8", err => {
				if (err) {
					console.error("Error writing to the JSON file:", err);
					return;
				}
				alert("New playlist added successfully!");
			});
		} catch (parseError) {
			console.error("Error parsing the JSON data:", parseError);
		}
	});
}

function cleanDebugFiles() {
	const regex = /^174655\d+-player-script\.js$/;
	fs.readdirSync("./").forEach(file => {
		if (regex.test(file)) {
			fs.unlinkSync(path.join("./", file));
		}
	});
}
