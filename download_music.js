const ytdl = require("@distube/ytdl-core");
const ytpl = require("@distube/ytpl");

function isValidFileName(fileName) {
	const invalidChars = /[\\/:"*?<>|'.,]/;
	return !invalidChars.test(fileName);
}

function cleanDebugFiles() {
	const regex = /^174655\d+-player-script\.js$/;
	fs.readdirSync("./").forEach(file => {
		if (regex.test(file)) {
			fs.unlinkSync(path.join("./", file));
			console.log("Deleted debug file.");
		}
	});
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
						cleanDebugFiles();
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

		const songElements = document.querySelectorAll(".songAndThumbnail");

		for (let i = 1; i < songElements.length; i++) {
			const songElement = songElements[i];
			const link = songElement.dataset.link;
			const titleInput = songElement.querySelector(".playlistTitle");

			if (link && titleInput) {
				songLinks.push(link);
				songTitles.push(titleInput.value.trim());
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

		if (songTitles.length === 0 || songLinks.length === 0) {
			document.getElementById("downloadModalText").innerText = "No valid songs found in playlist.";
			document.getElementById("finalDownloadButton").disabled = false;
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
				if (Object.keys(playlists).length === 0 && playlists.constructor === Object) {
					playlists = [];
				}
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

			downloadPlaylist(songLinks, songTitles, playlistName);
		});
	} else {
		document.getElementById("downloadModalText").innerText = "The URL is neither a valid video nor playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

async function downloadPlaylist(songLinks, songTitles, playlistName) {
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

			document.getElementById("downloadModalText").innerText = `Downloading song ${i + 1} of ${totalSongs}: ${songTitle}`;

			try {
				await new Promise((resolve, reject) => {
					const outputPath = path.join(musicFolder, `${songTitle}.mp3`);

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

					writer.on("error", err => {
						reject(err);
					});
				});
				completedDownloads++;

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

				if (thumbnailUrl) {
					await processThumbnail(thumbnailUrl, songTitle);
				} else {
					await processThumbnail(null, songTitle);
				}

				document.getElementById("downloadModalText").innerText = `Downloaded song ${i + 1} of ${totalSongs}. Progress: ${completedDownloads}/${totalSongs}`;
			} catch (error) {
				console.error(`Error downloading song ${i + 1}:`, error);
				document.getElementById("downloadModalText").innerText = `Error downloading song ${i + 1}: ${error.message}`;
			}
		}

		document.getElementById("downloadModalText").innerText = "All songs downloaded successfully!";
		document.getElementById("finalDownloadButton").disabled = false;
	} catch (error) {
		document.getElementById("downloadModalText").innerText = `Error downloading playlist: ${error.message}`;
		document.getElementById("finalDownloadButton").disabled = false;
	}
}

async function processThumbnail(imageUrl, title) {
	try {
		console.log(`Processing thumbnail for ${title}`);
		const thumbnailPath = path.join(thumbnailFolder, `${title}_thumbnail.jpg`);

		let imgElement = document.getElementById(`thumbnailImage`);

		if (!imgElement) {
			const titleNum = parseInt(title.match(/\d+$/)?.[0] || "");
			if (!isNaN(titleNum)) {
				imgElement = document.getElementById(`thumbnailImage${titleNum}`);
			}
		}

		if (imgElement) {
			if (imgElement.tagName === "IMG" && imgElement.src) {
				console.log(`Using DOM img element for ${title}`);

				if (imgElement.src.startsWith("data:image")) {
					const base64data = imgElement.src;
					const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
					fs.writeFileSync(thumbnailPath, thumbnailBuffer);
					console.log(`Saved thumbnail from base64 for ${title}`);
					return true;
				} else {
					try {
						const response = await fetch(imgElement.src);
						if (!response.ok) throw new Error(`HTTP error ${response.status}`);

						const arrayBuffer = await response.arrayBuffer();
						const buffer = Buffer.from(arrayBuffer);
						fs.writeFileSync(thumbnailPath, buffer);
						console.log(`Saved thumbnail from img src for ${title}`);
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
						console.log(`Saved thumbnail from background-image for ${title}`);
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
				console.log(`Saved thumbnail from passed base64 for ${title}`);
				return true;
			}

			try {
				const response = await fetch(imageUrl);
				if (!response.ok) throw new Error(`HTTP error ${response.status}`);

				const arrayBuffer = await response.arrayBuffer();
				const buffer = Buffer.from(arrayBuffer);
				fs.writeFileSync(thumbnailPath, buffer);
				console.log(`Saved thumbnail from URL for ${title}`);
				return true;
			} catch (fetchError) {
				console.error(`Error fetching thumbnail for ${title}: ${fetchError}`);
			}
		}

		console.log(`Attempting YouTube fallback method for ${title}`);

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
				console.log(`YouTube fallback method succeeded for ${title}`);
				return true;
			} catch (ytError) {
				console.error(`YouTube fallback failed: ${ytError.message}`);
			}
		}

		try {
			const placeholderData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAACXBIWXMAAAsTAAALEwEAmpwYAAAJC0lEQVR4nO3d0XLbRhJAUWjz/395v5JsecnuFkWCGKB7+pwXV1I71dXpHg4Jiv75+fkHFP1v9gZgJgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAMgGgTAAoEwDKBIAyAaBMACgTAMoEgDIBoEwAKBMAygSAst+zN9Dy8/Mzewt", "base64");
			fs.writeFileSync(thumbnailPath, placeholderData);
			console.log(`Created placeholder thumbnail for ${title}`);
			return true;
		} catch (placeholderError) {
			console.error(`Failed to create placeholder: ${placeholderError.message}`);
			return false;
		}
	} catch (error) {
		console.error(`Error in processThumbnail for ${title}:`, error);
		return false;
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

			if (Object.keys(playlists).length === 0 && playlists.constructor === Object) {
				playlists = [];
			}

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
