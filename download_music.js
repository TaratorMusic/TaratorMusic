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

function updateThumbnailImage(event, salata) {
	const file = event.target.files[0];
	if (file && file.type === "image/jpeg") {
		const reader = new FileReader();
		reader.onload = function (e) {
			if (salata == 1) {
				document.getElementById("customiseImage").src = e.target.result;
			} else if (salata == 2) {
				document.getElementById("editPlaylistThumbnail").src = e.target.result;
			} else if (salata == 3) {
				document.getElementById("thumbnailImage").src = e.target.result;
			} else {
				salata.style.backgroundImage = `url(${e.target.result})`;
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
	const pythonProcessTitle = spawn(path.join(taratorFolder, "video_install.exe"), ["Title", videoUrl]);
	pythonProcessTitle.stdout.on("data", (data) => {
		const decodedData = data.toString().trim();
		let videoTitle;
		try {
			videoTitle = JSON.parse(decodedData);
		} catch (error) {
			videoTitle = decodedData;
		}

		const pythonProcessThumbnail = spawn(path.join(taratorFolder, "video_install.exe"), ["Thumbnail", videoUrl]);
		pythonProcessThumbnail.stdout.on("data", (thumbnailData) => {
			const thumbnailUrl = thumbnailData.toString().trim();

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
			thumbnailImage.src = thumbnailUrl;
			thumbnailImage.alt = "";
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

		pythonProcessThumbnail.stderr.on("data", (data) => {
			console.error(`Error fetching thumbnail: ${data}`);
			downloadModalText.innerHTML = "Error fetching thumbnail.";
			document.getElementById("downloadFirstButton").disabled = false;
		});
	});

	pythonProcessTitle.stderr.on("data", (data) => {
		console.error(`Error fetching title: ${data}`);
		downloadModalText.innerHTML = "Error fetching video title.";
		document.getElementById("downloadFirstButton").disabled = false;
	});
}

function processPlaylistLink(playlistUrl, downloadSecondPhase, downloadModalBottomRow, downloadModalText) {
	const pythonProcessTitle = spawn(path.join(taratorFolder, "video_install.exe"), ["PlaylistTitle", playlistUrl]);

	pythonProcessTitle.stdout.on("data", (data) => {
		let playlistTitles;
		try {
			playlistTitles = JSON.parse(data.toString().trim());
		} catch (error) {
			console.error("Error parsing playlist titles JSON:", error);
			downloadModalText.innerHTML = "Error retrieving playlist details.";
			document.getElementById("downloadFirstButton").disabled = false;
			return;
		}

		if (playlistTitles.error) {
			console.error("Python script error:", playlistTitles.error);
			downloadModalText.innerHTML = "Error retrieving playlist details.";
			document.getElementById("downloadFirstButton").disabled = false;
			return;
		}

		if (playlistTitles.length > 10) {
			downloadModalText.innerHTML = "Checking... Might take long...";
		}

		const pythonProcessThumbnail = spawn(path.join(taratorFolder, "video_install.exe"), ["PlaylistThumbnail", playlistUrl]);

		pythonProcessThumbnail.stdout.on("data", (thumbnailData) => {
			let playlistThumbnails;
			try {
				playlistThumbnails = JSON.parse(thumbnailData.toString().trim());
			} catch (error) {
				console.error("Error parsing playlist thumbnails JSON:", error);
				downloadModalText.innerHTML = "Error retrieving playlist thumbnails.";
				document.getElementById("downloadFirstButton").disabled = false;
				return;
			}

			if (playlistThumbnails.error) {
				console.error("Python script error:", playlistThumbnails.error);
				downloadModalText.innerHTML = "Error retrieving playlist thumbnails.";
				document.getElementById("downloadFirstButton").disabled = false;
				return;
			}

			const downloadPlaceofSongs = document.createElement("div");
			downloadPlaceofSongs.id = "downloadPlaceofSongs";
			downloadSecondPhase.appendChild(downloadPlaceofSongs);

			const pythonProcessLinks = spawn(path.join(taratorFolder, "video_install.exe"), ["PlaylistNames", playlistUrl]);

			pythonProcessLinks.stdout.on("data", (linksData) => {
				let videoLinks;
				try {
					videoLinks = JSON.parse(linksData.toString().trim().replace(/'/g, '"'));
				} catch (error) {
					console.error("Error parsing video links JSON:", error);
					downloadModalText.innerHTML = "Error retrieving video links.";
					document.getElementById("downloadFirstButton").disabled = false;
					return;
				}

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
			});

			pythonProcessLinks.stderr.on("data", (data) => {
				console.error(`Error fetching video links: ${data}`);
				downloadModalText.innerHTML = "Error retrieving video links.";
				document.getElementById("downloadFirstButton").disabled = false;
			});
		});

		pythonProcessThumbnail.stderr.on("data", (data) => {
			console.error(`Error fetching playlist thumbnails: ${data}`);
			downloadModalText.innerHTML = "Error retrieving playlist thumbnails.";
			document.getElementById("downloadFirstButton").disabled = false;
		});
	});

	pythonProcessTitle.stderr.on("data", (data) => {
		console.error(`Error fetching playlist titles: ${data}`);
		downloadModalText.innerHTML = "Error retrieving playlist titles.";
		document.getElementById("downloadFirstButton").disabled = false;
	});
}

function actuallyDownloadTheSong() {
	document.getElementById("finalDownloadButton").disabled = true;
	const firstInput = document.getElementById("downloadFirstInput").value.trim();
	const linkType = differentiateYouTubeLinks(firstInput);

    console.log(musicFolder,"musicfolder");

	if (linkType === "video") {
		downloadSingleVideo();
	} else if (linkType === "playlist") {
		downloadPlaylist();
	} else {
		document.getElementById("downloadModalText").innerText = "The URL is neither a valid video nor playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
	}

	function downloadSingleVideo() {
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

		const pythonProcessFileName = spawn(path.join(taratorFolder, "video_install.exe"), ["DownloadMusic", firstInput, secondInput]);

		pythonProcessFileName.stdout.on("data", (data) => {
			const decodedData = data.toString().trim();
			console.log(decodedData);
			try {
				const parsedData = JSON.parse(decodedData);
				document.getElementById("downloadModalText").innerText = "Song downloaded successfully!";

				downloadThumbnail(img.src, secondInput);
			} catch (error) {
				console.error(`Error parsing JSON: ${error}`);
				document.getElementById("finalDownloadButton").disabled = false;
				document.getElementById("downloadModalText").innerText = "Error during download: " + decodedData;
			}
		});

		pythonProcessFileName.stderr.on("data", (data) => {
			console.error(`Error: ${data}`);
			document.getElementById("downloadModalText").innerText = `Error: ${data}`;
			document.getElementById("finalDownloadButton").disabled = false;
		});

		pythonProcessFileName.on("close", (code) => {
			console.log(`Python process exited with code ${code}`);
			if (code !== 0) {
				document.getElementById("downloadModalText").innerText = `Download process failed with code ${code}`;
				document.getElementById("finalDownloadButton").disabled = false;
			}
		});
	}

	function downloadPlaylist() {
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
		console.log(songLinks);

		if (totalSongs < 1) {
			document.getElementById("downloadModalText").innerText = "No songs found in playlist.";
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		const playlistName = document.getElementById("playlistTitle0").value.trim();
		if (!isValidFileName(playlistName)) {
			document.getElementById("downloadModalText").innerText = `Invalid characters in the playlist name. These characters cannot be used in filenames: / \\ ' . : * ? " < > | ,`;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		const songTitles = Array.from(document.querySelectorAll("input.playlistTitle"), (input) => input.value.trim()).slice(1);

		console.log(songLinks);

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

			if (playlists.some((playlist) => playlist.name === playlistName)) {
				document.getElementById("downloadModalText").innerText = "A playlist with this name already exists.";
				document.getElementById("finalDownloadButton").disabled = false;
				return;
			}

			saveeeAsPlaylist(songTitles);

			document.getElementById("downloadModalText").innerText = totalSongs > 50 ? "Downloading... This might take some time..." : "Downloading...";

			downloadSongsSequentially();
		});

		function downloadSongsSequentially() {
			let completedDownloads = 0;

			const pythonProcessGetThumbnails = spawn(path.join(taratorFolder, "video_install.exe"), ["PlaylistThumbnail", firstInput]);

			let thumbnailUrls = [];
			pythonProcessGetThumbnails.stdout.on("data", (data) => {
				const decodedData = data.toString().trim();
				try {
					thumbnailUrls = JSON.parse(decodedData);
				} catch (error) {
					console.error("Error parsing thumbnails JSON:", error);
				}
			});

			pythonProcessGetThumbnails.on("close", () => {
				downloadNextSong(0);
			});

			function downloadNextSong(index) {
				if (index >= songTitles.length) {
					document.getElementById("downloadModalText").innerText = "All songs downloaded successfully!";
					document.getElementById("finalDownloadButton").disabled = false;

					if (isSaveAsPlaylistActive) {
						fs.rename("thumbnails/placeholdergagaga_thumbnail.jpg", `thumbnails/${playlistName}_playlist.jpg`, (err) => {
							if (err) console.error("Error renaming playlist thumbnail:", err);
						});
					}
					return;
				}

				const songTitle = songTitles[index];
				const songLink = songLinks[index];

				document.getElementById("downloadModalText").innerText = `Downloading song ${index + 1} of ${songTitles.length}: ${songTitle}`;

				const pythonProcess = spawn(path.join(taratorFolder, "video_install.exe"), ["DownloadMusic", songLink, songTitle]);

				pythonProcess.stdout.on("data", (data) => {
					const output = data.toString().trim();
					console.log(`Song ${index + 1} output:`, output);
					if (output.includes("age restricted")) {
						alert(`Song ${index + 1} is age restricted, and will be skipped.`);
					}

					if (output.includes("Error")) {
						document.getElementById("downloadModalText").innerText = `Error downloading song ${index + 1}: ${output}`;
					}
				});

				pythonProcess.stderr.on("data", (data) => {
					console.error(`Song ${index + 1} error:`, data.toString().trim());
				});

				pythonProcess.on("close", (code) => {
					completedDownloads++;

					const thumbnailUrl = thumbnailUrls[index];
					if (thumbnailUrl && thumbnailUrl !== "No thumbnail found") {
						downloadThumbnail(thumbnailUrl, songTitle);
					} else {
						const imgElement = document.getElementById(`thumbnailImage${index}`);
						if (imgElement) {
							downloadThumbnail(imgElement.src, songTitle);
						}
					}

					document.getElementById("downloadModalText").innerText = `Downloaded song ${index + 1} of ${songTitles.length}. Progress: ${completedDownloads}/${songTitles.length}`;
					downloadNextSong(index + 1);
				});
			}
		}
	}

	function downloadThumbnail(imageUrl, title) {
		fetch(imageUrl)
			.then((res) => res.blob())
			.then((blob) => {
				const reader = new FileReader();
				reader.onloadend = function () {
					const base64data = reader.result;
					const tempFilePath = path.join(taratorFolder, `temp_thumbnail_${title}.txt`);

					try {
						fs.writeFileSync(tempFilePath, base64data);

						const pythonProcess = spawn(path.join(taratorFolder, "video_install.exe"), ["DownloadThumbnail", tempFilePath, title]);

						pythonProcess.on("close", (code) => {
							console.log(`Thumbnail download for "${title}" exited with code ${code}`);
							if (fs.existsSync(tempFilePath)) {
								fs.unlinkSync(tempFilePath);
							}
						});
					} catch (error) {
						console.error(`Error saving thumbnail for ${title}:`, error);
					}
				};
				reader.readAsDataURL(blob);
			})
			.catch((error) => console.error(`Error fetching thumbnail for ${title}:`, error));
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

function saveeeAsPlaylist(playlistTitlesArray) {
	if (isSaveAsPlaylistActive) {
		const trimmedArray = playlistTitlesArray.map((element) => element.trim());

		fs.readFile(playlistPath, "utf8", (err, data) => {
			if (err) {
				console.error("Error reading the JSON file:", err);
				return;
			}

			try {
				let playlists = JSON.parse(data);
				const playlistName = document.getElementById("playlistTitle0").value;

				const playlistExists = playlists.some((playlist) => playlist.name === playlistName);
				if (playlistExists) {
					console.error("A playlist with this name already exists.");
					return;
				}

                console.log(thumbnailFolder, thumbnailFolder);

				let newPlaylist = {
					name: playlistName,
					songs: trimmedArray,
					thumbnail: path.join(thumbnailFolder, `${playlistName}_playlist.jpg`),
				};

				playlists.push(newPlaylist);
				let updatedJsonData = JSON.stringify(playlists, null, 2);

				fs.writeFile(playlistPath, updatedJsonData, "utf8", (err) => {
					if (err) {
						console.error("Error writing to the JSON file:", err);
						return;
					}
					console.log("New playlist added successfully!");
				});
			} catch (parseError) {
				console.error("Error parsing the JSON data:", parseError);
			}
		});
	}
}
