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
	document.getElementById("downloadSecondPhase").appendChild(downloadModalBottomRow);

	const downloadModalText = document.createElement("div");
	downloadModalText.id = "downloadModalText";
	downloadModalBottomRow.appendChild(downloadModalText);
	document.getElementById("downloadModalText").innerHTML = "Checking...";

	if (document.getElementById("downloadFirstInput").value.trim() === "") {
		document.getElementById("downloadModalText").innerHTML = "The input can not be empty.";
		document.getElementById("downloadFirstButton").disabled = false;
		return;
	}

	if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "video") {
		const pythonProcessTitle = spawn("python", [path.join(taratorFolder, "pytube.py"), "Title", document.getElementById("downloadFirstInput").value]);
		pythonProcessTitle.stdout.on("data", (data) => {
			const decodedData = data.toString().trim();
			let decodedString;
			try {
				decodedString = JSON.parse(decodedData);
			} catch (error) {
				decodedString = decodedData;
			}

			const pythonProcessThumbnail2 = spawn("python", [path.join(taratorFolder, "pytube.py"), "Thumbnail", document.getElementById("downloadFirstInput").value]);
			pythonProcessThumbnail2.stdout.on("data", (data) => {
				const downloadPlaceofSongs = document.createElement("div");
				document.getElementById("downloadSecondPhase").appendChild(downloadPlaceofSongs);
				downloadPlaceofSongs.className = "flexrow";
				downloadPlaceofSongs.id = "downloadPlaceofSongs";

				const songAndThumbnail = document.createElement("div");
				songAndThumbnail.className = "songAndThumbnail";
				downloadPlaceofSongs.appendChild(songAndThumbnail);

				const exampleDownloadColumn = document.createElement("div");
				exampleDownloadColumn.className = "exampleDownloadColumn";

				const downloadSecondInput = document.createElement("input");
				downloadSecondInput.type = "text";
				downloadSecondInput.id = "downloadSecondInput";
				downloadSecondInput.value = decodedString;
				downloadSecondInput.spellcheck = false;

				const thumbnailInput = document.createElement("input");
				thumbnailInput.type = "file";
				thumbnailInput.id = "thumbnailInput";
				thumbnailInput.accept = "image/*";
				thumbnailInput.onchange = function (event) {
					updateThumbnailImage(event, 3);
				};

				const thumbnailImage = document.createElement("img");
				thumbnailImage.id = "thumbnailImage";
				thumbnailImage.className = "thumbnailImage";
				thumbnailImage.src = data.toString().trim();
				thumbnailImage.alt = "";

				songAndThumbnail.appendChild(exampleDownloadColumn);
				exampleDownloadColumn.appendChild(downloadSecondInput);
				exampleDownloadColumn.appendChild(thumbnailInput);
				songAndThumbnail.appendChild(thumbnailImage);
				document.getElementById("downloadModalText").innerHTML = "";
				document.getElementById("downloadFirstButton").disabled = false;
				document.getElementById("downloadSecondPhase").style.display = "block";
				const finalDownloadButton = document.createElement("button");
				finalDownloadButton.id = "finalDownloadButton";
				finalDownloadButton.onclick = function () {
					actuallyDownloadTheSong();
				};
				finalDownloadButton.textContent = "Download";
				downloadModalBottomRow.appendChild(finalDownloadButton);
			});
			pythonProcessThumbnail2.stderr.on("data", (data) => {
				console.error(`Error: ${data}`);
			});
			pythonProcessThumbnail2.on("close", (code) => {
				console.log(`Python process exited with code ${code}`);
			});
		});
		pythonProcessTitle.stderr.on("data", (data) => {
			console.error(`Error: ${data}`);
		});
		pythonProcessTitle.on("close", (code) => {
			console.log(`Python process exited with code ${code}`);
		});
	} else if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "playlist") {
		const pythonProcessTitle = spawn("python", [path.join(taratorFolder, "pytube.py"), "PlaylistTitle", document.getElementById("downloadFirstInput").value]);
		pythonProcessTitle.stdout.on("data", (data) => {
			decodedData = data.toString().trim();

			try {
				decodedJson = JSON.parse(decodedData);
			} catch (error) {
				console.error("Error parsing JSON:", error);
				return;
			}
			if (decodedJson.error) {
				console.error("Python script error:", decodedJson.error);
				return;
			}
			if (decodedJson.length > 10) {
				document.getElementById("downloadModalText").innerHTML = "Checking... Might take long...";
			}

			const pythonProcessThumbnail2 = spawn("python", [path.join(taratorFolder, "pytube.py"), "PlaylistThumbnail", document.getElementById("downloadFirstInput").value]);
			pythonProcessThumbnail2.stdout.on("data", (data) => {
				decodedData2 = data.toString().trim();

				try {
					decodedJson2 = JSON.parse(decodedData2);
				} catch (error) {
					console.error("Error parsing JSON:", error);
					return;
				}
				if (decodedJson2.error) {
					console.error("Python script error:", decodedJson2.error);
					return;
				}

				const downloadPlaceofSongs = document.createElement("div");
				downloadPlaceofSongs.id = "downloadPlaceofSongs";
				document.getElementById("downloadSecondPhase").appendChild(downloadPlaceofSongs);

				const python3 = spawn("python", [path.join(taratorFolder, "pytube.py"), "PlaylistNames", document.getElementById("downloadFirstInput").value]);
				python3.stdout.on("data", (data) => {
					let pypy9output = JSON.parse(data.toString().trim().replace(/'/g, '"'));

					for (i = 0; i < decodedJson.length; i++) {
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
						downloadSecondInput.value = decodedJson[i];
						downloadSecondInput.spellcheck = false;
						exampleDownloadColumn.appendChild(downloadSecondInput);

						if (i == 0) {
							const saveAsPlaylist = document.createElement("button");
							saveAsPlaylist.id = "saveAsPlaylist";
							saveAsPlaylist.innerHTML = "Save as playlist";
							songAndThumbnail.appendChild(saveAsPlaylist);
							saveAsPlaylist.style.backgroundColor = "red";

							saveAsPlaylist.onclick = function () {
								if (isSaveAsPlaylistActive) {
									saveAsPlaylist.style.backgroundColor = "red";
									isSaveAsPlaylistActive = false;
								} else {
									saveAsPlaylist.style.backgroundColor = "green";
									isSaveAsPlaylistActive = true;
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
						let obama = i;
						thumbnailInput.onchange = function (event) {
							updateThumbnailImage(event, document.getElementById("thumbnailImage" + obama));
						};
						exampleDownloadColumn.appendChild(thumbnailInput);

						const thumbnailDiv = document.createElement("div");
						thumbnailDiv.className = "thumbnailImage";
						thumbnailDiv.id = "thumbnailImage" + i;
						if (i == 0) {
							thumbnailDiv.style.backgroundImage = `url(${decodedJson2[1]})`;
						} else {
							thumbnailDiv.style.backgroundImage = `url(${decodedJson2[i]})`;
							songAndThumbnail.dataset.link = pypy9output[i - 1];
						}
						thumbnailDiv.alt = "";
						songAndThumbnail.appendChild(thumbnailDiv);
					}

					document.getElementById("downloadModalText").innerHTML = "";
					document.getElementById("downloadFirstButton").disabled = false;
					document.getElementById("downloadSecondPhase").style.display = "block";
					const finalDownloadButton = document.createElement("button");
					finalDownloadButton.id = "finalDownloadButton";
					finalDownloadButton.onclick = function () {
						actuallyDownloadTheSong();
					};
					finalDownloadButton.textContent = "Download";
					downloadModalBottomRow.appendChild(finalDownloadButton);
				});
			});
			pythonProcessThumbnail2.stderr.on("data", (data) => {
				console.error(`Error: ${data}`);
			});
			pythonProcessThumbnail2.on("close", (code) => {
				console.log(`Python process exited with code ${code}`);
			});
		});
		pythonProcessTitle.stderr.on("data", (data) => {
			console.error(`Error: ${data}`);
		});
		pythonProcessTitle.on("close", (code) => {
			console.log(`Python process exited with code ${code}`);
		});
	} else {
		document.getElementById("downloadModalText").innerHTML = "Link neither a video or playlist.";
		document.getElementById("downloadFirstButton").disabled = false;
		document.getElementById("downloadSecondPhase").style.display = "block";
	}
}

function actuallyDownloadTheSong() {
	document.getElementById("finalDownloadButton").disabled = true;
	if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "video") {
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
		} else if (fileExists(outputFilePath)) {
			document.getElementById("downloadModalText").innerText = `File ${secondInput}.mp3 already exists. Please choose a different filename.`;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		} else {
			document.getElementById("downloadModalText").innerText = "Downloading Song...";
		}
		const pythonProcessFileName = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadMusic", document.getElementById("downloadFirstInput").value, secondInput]);
		pythonProcessFileName.stdout.on("data", (data) => {
			const decodedData = data.toString().trim();
			console.log(data.toString().trim());
			let parsedData;
			try {
				parsedData = JSON.parse(decodedData);
				document.getElementById("downloadModalText").innerText = "Song downloaded successfully!";
			} catch (error) {
				console.error(`Error parsing JSON: ${error}`);
				parsedData = {
					error: "Invalid JSON",
				};
				document.getElementById("finalDownloadButton").disabled = false;
				document.getElementById("downloadModalText").innerText = parsedData.message;
			}

			fetch(img.src)
				.then((res) => res.blob())
				.then((blob) => {
					const reader = new FileReader();
					reader.onloadend = function () {
						const base64data = reader.result;
						const tempFilePath = path.join(taratorFolder, "temp_thumbnail.txt");
						fs.writeFileSync(tempFilePath, base64data);

						const pythonProcessFileThumbnail = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadThumbnail", tempFilePath, secondInput]);
						pythonProcessFileThumbnail.stdout.on("data", (data) => {
							const decodedData = data.toString().trim();
							let parsedData;
							try {
								parsedData = JSON.parse(decodedData);
							} catch (error) {
								console.error(`Error parsing JSON: ${error}`);
								parsedData = { error: "Invalid JSON" };
							}
							document.getElementById("downloadModalText").innerText = document.getElementById("downloadModalText").innerText + " Thumbnail downloaded successfully!";
						});

						pythonProcessFileThumbnail.stderr.on("data", (data) => {
							console.error(`Error: ${data}`);
						});
						pythonProcessFileThumbnail.on("close", (code) => {
							console.log(`Python process exited with code ${code}`);
							fs.unlinkSync(tempFilePath);
							document.getElementById("finalDownloadButton").disabled = false;
						});
					};
					reader.readAsDataURL(blob);
				})
				.catch((error) => console.error(`Error: ${error}`));
		});
		pythonProcessFileName.stderr.on("data", (data) => {
			console.error(`Error: ${data}`);
		});
		pythonProcessFileName.on("close", (code) => {
			console.log(`Python process exited with code ${code}`);
		});
	} else if (differentiateYouTubeLinks(document.getElementById("downloadFirstInput").value) == "playlist") {
		let howManyAreThere = document.querySelectorAll("div.songAndThumbnail").length;
		const playlistTitlesArray = Array.from(document.querySelectorAll("input.playlistTitle"), (input) => input.value);
		const dataLinks = Array.from(document.querySelectorAll(".songAndThumbnail")).map((div) => div.getAttribute("data-link"));
		playlistTitlesArray.shift();
		dataLinks.shift();

		if (!isValidFileName(document.getElementById("playlistTitle0").value)) {
			document.getElementById("downloadModalText").innerText = `Invalid characters in the playlist name. These characters cannot be used in filenames: / \\ ' . : * ? " < > | ,`;
			document.getElementById("finalDownloadButton").disabled = false;
			return;
		}

		fs.readFile(playlistPath, "utf8", (err, data) => {
			if (err) {
				document.getElementById("downloadModalText").innerText = ("Error reading the JSON file:", err);
				document.getElementById("finalDownloadButton").disabled = false;
				return;
			} else if (JSON.parse(data).some((playlist) => playlist.name === document.getElementById("playlistTitle0").value)) {
				document.getElementById("downloadModalText").innerText = "A playlist with this name already exists.";
				document.getElementById("finalDownloadButton").disabled = false;
				return;
			}

			let tavuk = 1;
			let barbeku = 1;

			while (tavuk < howManyAreThere) {
				if (barbeku == 5001) {
					break;
				}
				if (document.getElementById(`playlistTitle${barbeku}`)) {
					let outputFilePath = path.join(musicFolder, `${playlistTitlesArray[tavuk - 1]}.mp3`);
					if (document.getElementById("playlistTitle" + barbeku)) {
						const duplicates = findDuplicates(playlistTitlesArray);
						if (!isValidFileName(document.getElementById("playlistTitle" + barbeku).value)) {
							document.getElementById("downloadModalText").innerText = `Invalid characters in ${barbeku}. songs name. These characters cannot be used in filenames: / \\ ' . : * ? " < > | ,`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						} else if (document.getElementById("playlistTitle" + barbeku).value.length > 100) {
							document.getElementById("downloadModalText").innerText = `${barbeku}. songs name is too long. Maximum length allowed is 100 characters.`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						} else if (fileExists(outputFilePath)) {
							document.getElementById("downloadModalText").innerText = `File ${playlistTitlesArray[tavuk - 1]}.mp3 already exists. Please choose a different filename.`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						} else if (duplicates.length > 0) {
							document.getElementById("downloadModalText").innerText = `The following file names have duplicates: ${duplicates.join(", ")}. Please choose different filenames.`;
							document.getElementById("finalDownloadButton").disabled = false;
							return;
						}
					}
					tavuk++;
				}
				barbeku++;
			}

			saveeeAsPlaylist(playlistTitlesArray);
			document.getElementById("downloadModalText").innerText = "Downloading...";
			if (howManyAreThere > 50) {
				document.getElementById("downloadModalText").innerText = "Downloading... But it might take some time...";
			}
			testFunctionTest(howManyAreThere, dataLinks, playlistTitlesArray);

			let peynir = 1;
			let j = 1;
			if (isSaveAsPlaylistActive) {
				peynir = 0;
				j = 0;
			}
			while (peynir < howManyAreThere) {
				if (j == 5001) {
					break;
				}
				if (document.getElementById(`thumbnailImage${j}`)) {
					let img = document.getElementById(`thumbnailImage${j}`);
					let songName = "placeholdergagaga";
					playlistName = document.getElementById(`playlistTitle0`).value;
					if (j != 0) {
						songName = document.getElementById(`playlistTitle${j}`).value.trim();
					}
					peynir++;
					fetch(img.src)
						.then((res) => res.blob())
						.then((blob) => {
							let reader = new FileReader();
							reader.onloadend = function () {
								let base64data = reader.result;
								let tempFilePath = path.join(taratorFolder, `temp_thumbnail_${songName}.txt`);
								try {
									fs.writeFileSync(tempFilePath, base64data);
									let pythonProcess = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadThumbnail", tempFilePath, songName]);

									pythonProcess.stdout.on("data", (data) => {
										let decodedData = data.toString().trim();
										let parsedData;
										try {
											parsedData = JSON.parse(decodedData);
										} catch (error) {
											console.error(`Error parsing JSON: ${error}`);
											parsedData = { error: "Invalid JSON" };
											document.getElementById("finalDownloadButton").disabled = false;
										}
									});

									pythonProcess.stderr.on("data", (data) => {
										console.error(`Error: ${data}`);
									});
									pythonProcess.on("close", (code) => {
										console.log(`Python process exited with code ${code}`);
										if (fs.existsSync(tempFilePath)) {
											fs.unlinkSync(tempFilePath);
										}
										document.getElementById("downloadModalText").innerText = ("Downloaded all thumbnails successfully!" || parsedData.error || "Unknown response") + "\n";
									});
								} catch (error) {
									console.error(`Error writing file: ${error}`);
								}
							};
							reader.readAsDataURL(blob);
						})
						.catch((error) => console.error(`Error: ${error}`));
				}
				j++;
			}
		});
	} else {
		document.getElementById("downloadModalText").innerText = "The URL is neither a video or a playlist.";
		document.getElementById("finalDownloadButton").disabled = false;
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

async function testFunctionTest(howManyAreThere, dataLinks, playlistTitlesArray) {
	for (let i = 0; i < howManyAreThere - 1; i++) {
		console.log("Link: ", dataLinks[i].trim(), "Title: ", playlistTitlesArray[i].trim());

		const pythonProcessTitle = spawn("python", [path.join(taratorFolder, "pytube.py"), "DownloadMusic", dataLinks[i].trim(), playlistTitlesArray[i].trim()]);

		pythonProcessTitle.stdout.on("data", (data) => {
			console.log(data.toString().trim());
		});

		pythonProcessTitle.stderr.on("data", (data) => {
			document.getElementById("downloadModalText").innerText = `Error: ${data}`;
			console.log(data.toString().trim());
			document.getElementById("finalDownloadButton").disabled = false;
		});

		if (i < howManyAreThere - 2) {
			document.getElementById("downloadModalText").innerText = "Done downloading the " + (i + 1) + ". song.";
			await new Promise((resolve) => setTimeout(resolve, 3000));
		} else {
			document.getElementById("downloadModalText").innerText = "Done!";
			document.getElementById("finalDownloadButton").disabled = false;

			if (isSaveAsPlaylistActive) {
				fs.rename("thumbnails/placeholdergagaga_thumbnail.jpg", `thumbnails/${document.getElementById("playlistTitle0").value}_playlist.jpg`, (err) => {
					if (err) {
						console.error("Error renaming file:", err);
					} else {
						console.log("File renamed successfully");
					}
				});
			}
		}
	}
}
