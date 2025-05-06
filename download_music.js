const { spawn } = require("child_process");

const binaryName = platform === "win32" ? "pytube.exe" : "pytube";
const buildFolder = platform === "win32" ? "exe.win-amd64-3.12" : platform === "linux" ? "exe.linux-x86_64-3.12" : platform === "darwin" ? "exe.macosx-10.9-x86_64-3.12" : null;
if (!buildFolder) alert(`Unsupported platform: ${platform}`);
const exePath = path.join(isPackaged ? path.join(process.resourcesPath, "app") : __dirname, "build", buildFolder, binaryName).trim();

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
	runPythonProcess(["Title", videoUrl])
		.then(videoTitle => {
			return runPythonProcess(["Thumbnail", videoUrl]).then(thumbnailUrl => {
				if (typeof thumbnailUrl === "object") {
					thumbnailUrl = String(thumbnailUrl);
				}

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
					this.src = "data:image/png;base64,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";
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
			});
		})
		.catch(error => {
			console.error("Error in processVideoLink:", error);
			downloadModalText.innerHTML = `Error: ${error.message}`;
			document.getElementById("downloadFirstButton").disabled = false;
		});
}

function runPythonProcess(args) {
	return new Promise((resolve, reject) => {
		const process = spawn(exePath, args);
		let stdout = "";
		let stderr = "";

		process.stdout.on("data", data => {
			stdout += data.toString();
		});

		process.stderr.on("data", data => {
			stderr += data.toString();
		});

		process.on("close", code => {
			if (code !== 0) {
				reject(new Error(stderr || `Process exited with code ${code}`));
				return;
			}

			const trimmedOutput = stdout.trim();
			console.log(`Python output for ${args[0]}:`, trimmedOutput);

			try {
				resolve(JSON.parse(trimmedOutput));
			} catch (e) {
				resolve(trimmedOutput);
			}
		});

		process.on("error", error => {
			console.error(`Error spawning process for ${args[0]}:`, error);
			reject(new Error(`Failed to start process: ${error.message}`));
		});
	});
}

function processPlaylistLink(playlistUrl, downloadSecondPhase, downloadModalBottomRow, downloadModalText) {
	Promise.all([runPythonProcess(["PlaylistTitle", playlistUrl]), runPythonProcess(["PlaylistThumbnail", playlistUrl]), runPythonProcess(["PlaylistNames", playlistUrl])])
		.then(([playlistTitles, playlistThumbnails, videoLinks]) => {
			if (playlistTitles.length > 10) {
				downloadModalText.innerHTML = "Checking... Might take long...";
			}

			if (typeof videoLinks === "string") {
				videoLinks = JSON.parse(videoLinks.replace(/'/g, '"'));
			}

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
						if (window.isSaveAsPlaylistActive) {
							saveAsPlaylist.style.backgroundColor = "red";
							window.isSaveAsPlaylistActive = false;
						} else {
							saveAsPlaylist.style.backgroundColor = "green";
							window.isSaveAsPlaylistActive = true;
						}
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
					thumbnailDiv.style.backgroundImage = `url(${playlistThumbnails[i - 1]})`;
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

	runPythonProcess(["DownloadMusic", firstInput, secondInput])
		.then(() => {
			document.getElementById("downloadModalText").innerText = "Song downloaded successfully! Processing thumbnail...";
			return processThumbnail(img.src, secondInput);
		})
		.then(() => {
			document.getElementById("downloadModalText").innerText = "Download complete!";
			document.getElementById("finalDownloadButton").disabled = false;
		})
		.catch(error => {
			document.getElementById("downloadModalText").innerText = `Error: ${error.message}`;
			document.getElementById("finalDownloadButton").disabled = false;
		});
}

function downloadPlaylist() {
	const firstInput = document.getElementById("downloadFirstInput").value.trim();
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
	const totalSongs = songLinks.length;
	let completedDownloads = 0;

	try {
		const thumbnailUrls = await runPythonProcess(["PlaylistThumbnail", document.getElementById("downloadFirstInput").value.trim()]);

		for (let i = 0; i < songLinks.length; i++) {
			const songTitle = songTitles[i];
			const songLink = songLinks[i];

			document.getElementById("downloadModalText").innerText = `Downloading song ${i + 1} of ${totalSongs}: ${songTitle}`;

			try {
				await runPythonProcess(["DownloadMusic", songLink, songTitle]);
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

		const response = await fetch(imageUrl);
		if (!response.ok) {
			throw new Error(`HTTP error ${response.status}`);
		}

		const blob = await response.blob();
		const base64data = await blobToBase64(blob);

		const thumbnailBuffer = Buffer.from(base64data.split(",")[1], "base64");
		const thumbnailPath = path.join(thumbnailFolder, `${title}_thumbnail.jpg`);

		fs.writeFileSync(thumbnailPath, thumbnailBuffer);
		console.log(`Saved thumbnail from URL for ${title}`);
		return true;
	} catch (error) {
		console.error(`Error processing thumbnail for ${title}:`, error);

		try {
			console.log(`Attempting fallback method for ${title}`);
			const tempFilePath = path.join(taratorFolder, `temp_thumbnail_${title}.txt`);

			const contentToWrite = imageUrl && typeof imageUrl === "string" ? imageUrl : "https://img.youtube.com/vi/default/0.jpg";

			fs.writeFileSync(tempFilePath, contentToWrite);

			await runPythonProcess(["DownloadThumbnail", tempFilePath, title]);

			if (fs.existsSync(tempFilePath)) {
				fs.unlinkSync(tempFilePath);
			}
			console.log(`Fallback method succeeded for ${title}`);
			return true;
		} catch (fallbackError) {
			console.error(`Fallback thumbnail download failed for ${title}:`, fallbackError);
			return false;
		}
	}
}

function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
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
