function getPlaylists() {
	try {
		const playlists = playlistsDb.prepare("SELECT * FROM playlists").all();

		if (!playlists || playlists.length == 0) {
			console.log("No playlists found in the database.");
			displayPlaylists([]);
			return;
		}

		const playlistsWithParsedSongs = playlists.map(playlist => {
			let parsedSongs = [];
			if (playlist.songs) {
				parsedSongs = JSON.parse(playlist.songs);
			}
			return { ...playlist, songs: parsedSongs };
		});

		displayPlaylists(playlistsWithParsedSongs);
	} catch (err) {
		console.log("Error fetching playlists from the database:", err);
		displayPlaylists([]);
	}
}

function displayPlaylists(playlists) {
	const playlistsContent = document.getElementById("playlists-content");
	playlistsContent.innerHTML = "";

	const controlsDiv = document.createElement("div");
	controlsDiv.id = "controlsDiv";

	const createPlaylistButton = document.createElement("button");
	createPlaylistButton.addEventListener("click", () => {
		document.getElementById("createPlaylistModal").style.display = "block";
	});
	createPlaylistButton.innerHTML = "Create New Playlist";
	createPlaylistButton.id = "createPlaylistButton";

	const searchInput = document.createElement("input");
	searchInput.id = "searchInput";
	searchInput.type = "text";
	searchInput.placeholder = "Search playlists...";

	controlsDiv.appendChild(searchInput);
	controlsDiv.appendChild(createPlaylistButton);
	playlistsContent.appendChild(controlsDiv);

	const playlistsArea = document.createElement("div");
    playlistsArea.id = "playlistsArea";
	playlistsArea.className = "scrollArea";
    playlistsContent.appendChild(playlistsArea)

	const playlistElements = [];

	playlists.forEach(playlist => {
		const playlistElement = document.createElement("div");
		playlistElement.className = "playlist";
		playlistElement.setAttribute("data-playlist-id", playlist.id);

		const thumbnailPath = path.join(thumbnailFolder, `${playlist.id}.${playlist.thumbnail_extension}`);
		let thumbnailSrc = "";

		if (playlist.id == "Favorites") {
			thumbnailSrc = `file://${path.join(appThumbnailFolder, "star.svg").replace(/\\/g, "/")}?t=${Date.now()}`;
		} else if (fs.existsSync(thumbnailPath)) {
			thumbnailSrc = `file://${thumbnailPath.replace(/\\/g, "/")}?t=${Date.now()}`;
		} else {
			thumbnailSrc = `file://${path.join(appThumbnailFolder, "placeholder.jpg").replace(/\\/g, "/")}?t=${Date.now()}`;
		}

		const thumbnail = document.createElement("img");
		thumbnail.src = thumbnailSrc;
		thumbnail.className = "playlistThumbnail";
		playlistElement.appendChild(thumbnail);

		const playlistInfoandSongs = document.createElement("div");
		playlistElement.appendChild(playlistInfoandSongs);
		playlistInfoandSongs.className = "playlistInfoandSongs";

		const playlistInfo = document.createElement("div");
		playlistInfoandSongs.appendChild(playlistInfo);
		playlistInfo.className = "playlist-info";

		const playlistName = document.createElement("div");
		playlistName.className = "playlistName";
		playlistName.innerHTML = `<h2>${playlist.name} -&nbsp;</h2>`;
		playlistName.innerHTML += `<h3> ${playlist.songs.length == 1 ? `${playlist.songs.length} song` : `${playlist.songs.length} songs`}</h3>`;
		playlistInfo.appendChild(playlistName);

		const playlistSongs = document.createElement("div");
		playlistInfoandSongs.appendChild(playlistSongs);
		playlistSongs.className = "playlist-songs";

		if (playlist.id != "Favorites") {
			const playlistCustomiseButton = document.createElement("div");
			playlistInfo.appendChild(playlistCustomiseButton);
			playlistCustomiseButton.className = "playlist-button";
			playlistCustomiseButton.innerHTML = `<img style="width: 70%; height: 70%;" src="${path.join(appThumbnailFolder, "customise.svg")}" alt="Customise">`;

			playlistCustomiseButton.addEventListener("click", () => {
				document.getElementById("editPlaylistModal").style.display = "block";
				document.getElementById("editPlaylistNameInput").value = playlist.name;
				document.getElementById("editInvisibleId").value = playlist.id;
				document.getElementById("editPlaylistThumbnail").src = thumbnailSrc;
				document.getElementById("editInvisiblePhoto").src = thumbnailSrc;
				document.getElementById("editInvisibleExtension").src = playlist.thumbnail_extension;
			});
		}

		for (let i = 0; i < playlist.songs.length; i++) {
			const playlistSong = document.createElement("div");
			playlistSong.innerText = getSongNameById(playlist.songs[i]);
			playlistSongs.appendChild(playlistSong);
			playlistSong.className = "playlist-song";

			playlistSong.addEventListener("click", () => {
				playPlaylist(playlist, i);
			});
		}

		thumbnail.addEventListener("click", () => {
			playPlaylist(playlist, 0);
		});

		playlistsArea.appendChild(playlistElement);
		playlistElements.push({ element: playlistElement, name: playlist.name.toLowerCase() });
	});

	searchInput.addEventListener("input", () => {
		const query = searchInput.value.toLowerCase();
		playlistElements.forEach(p => {
			p.element.style.display = p.name.includes(query) ? "flex" : "none";
		});
	});
}

async function saveNewPlaylist() {
	const name = document.getElementById("playlistNameInput").value.trim();

	if (!name) await alertModal("Playlist name required.");

	const id = generateId();

	const fileInput = document.getElementById("thumbnailInput").files[0];
	let srcPath, ext;

	if (fileInput) {
		srcPath = fileInput.path;
		ext = path.extname(fileInput.name).slice(1);
	} else {
		srcPath = path.join(appThumbnailFolder, "placeholder.jpg");
		ext = path.extname(srcPath).slice(1);
	}

	const dest = path.join(thumbnailFolder, `${id}.${ext}`);
	const existing = playlistsDb.prepare("SELECT id FROM playlists WHERE name = ?").get(name);

	if (existing) {
		if (!(await confirmModal("A playlist with the same name exists, continue?", "Continue", "Return"))) return;
	}

	playlistsDb.prepare("INSERT INTO playlists (id, name, songs, thumbnail_extension) VALUES (?, ?, ?, ?)").run(id, name, JSON.stringify([]), ext);
	fs.copyFileSync(srcPath, dest);

	closeModal();

	if (document.getElementById("playlists-content").style.display == "grid") {
		document.getElementById("playlists").click();
	}
}

async function saveEditedPlaylist() {
	const newName = document.getElementById("editPlaylistNameInput").value.trim();
	const playlistID = document.getElementById("editInvisibleId").value;
	const playlistThumbnailExtension = document.getElementById("editInvisibleExtension").value;
	const newThumbnail = document.getElementById("editPlaylistThumbnail").src;
	const playlistElement = document.querySelector(`.playlist[data-playlist-id="${playlistID}"]`);
	playlistElement.querySelector(".playlist-info div:first-child").textContent = newName;

	let newThumbnailExtension = null;
	if (newThumbnail.startsWith("data:image")) {
		const mimeMatch = newThumbnail.match(/^data:image\/(\w+);base64,/);
		if (mimeMatch) {
			newThumbnailExtension = mimeMatch[1];
			if (newThumbnailExtension === "jpeg") {
				newThumbnailExtension = "jpg";
			}
		}
	}

	let thumbnailPath = path.join(thumbnailFolder, `${playlist.id}.${playlistThumbnailExtension}`);
	const writeOrRenameThumbnailPromise = new Promise((resolve, reject) => {
		if (newThumbnail.startsWith("data:image")) {
			const base64Data = newThumbnail.replace(/^data:image\/\w+;base64,/, "");
			const buffer = Buffer.from(base64Data, "base64");
			fs.writeFile(thumbnailPath, buffer, err => {
				if (err) {
					reject(err);
				} else {
					resolve(`${thumbnailPath}?timestamp=${Date.now()}`);
				}
			});
		} else {
			resolve(thumbnailPath);
		}
	});
	writeOrRenameThumbnailPromise
		.then(resolvedPath => {
			const imgElement = playlistElement.querySelector("img");
			imgElement.src = "";
			imgElement.src = resolvedPath;
			playlistsDb.prepare("UPDATE playlists SET name = ?, thumbnail_extension = ? WHERE id = ?").run(newName, newThumbnailExtension, playlistID);
			closeModal();
		})
		.catch(err => {
			console.log("Error saving or renaming thumbnail:", err);
		});
}

function openAddToPlaylistModal(songName) {
	document.getElementById("addToPlaylistModal").style.display = "block";
	const playlistsContainer = document.getElementById("playlist-checkboxes");
	playlistsContainer.innerHTML = "";

	try {
		const playlists = playlistsDb.prepare("SELECT * FROM playlists").all();

		if (!playlists || playlists.length == 0) {
			console.log("No playlists found.");
			displayPlaylists([]);
			return;
		}

		playlists.forEach(playlist => {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = playlist.id;
			checkbox.value = songName;

			let songsInPlaylist = [];
			if (playlist.songs) {
				songsInPlaylist = JSON.parse(playlist.songs);
			}

			const isSongInPlaylist = songsInPlaylist.includes(songName);

			if (isSongInPlaylist) {
				checkbox.checked = true;
			}

			const label = document.createElement("label");
			label.textContent = playlist.name;
			label.htmlFor = checkbox.id;

			playlistsContainer.appendChild(checkbox);
			playlistsContainer.appendChild(label);
			playlistsContainer.appendChild(document.createElement("br"));
		});

		const button = document.createElement("button");
		button.id = "addToPlaylistDone";
		button.textContent = "Done";
		button.onclick = function () {
			addToSelectedPlaylists(songName);
		};
		playlistsContainer.appendChild(button);
	} catch (err) {
		console.log("Error fetching playlists from the database:", err);
		displayPlaylists([]);
	}
}

function addToSelectedPlaylists(songName) {
	const checkboxes = document.querySelectorAll('#playlist-checkboxes input[type="checkbox"]');
	const selectedPlaylists = Array.from(checkboxes)
		.filter(checkbox => checkbox.checked)
		.map(checkbox => checkbox.id);

	try {
		selectedPlaylists.forEach(playlistId => {
			const playlist = playlistsDb.prepare("SELECT * FROM playlists WHERE id = ?").get(playlistId);

			let songsInPlaylist = [];
			if (playlist.songs) {
				songsInPlaylist = JSON.parse(playlist.songs);
			}

			const songExists = songsInPlaylist.includes(songName);

			if (songExists) {
				console.log(`Song '${songName}' already exists in playlist '${playlistId}'.`);
			} else {
				songsInPlaylist.push(songName);
				const updatedSongs = JSON.stringify(songsInPlaylist);
				playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE id = ?").run(updatedSongs, playlistId);
				console.log(`Song '${songName}' added to playlist '${playlistId}'.`);
			}
		});

		const allPlaylists = playlistsDb.prepare("SELECT * FROM playlists").all();
		allPlaylists.forEach(playlist => {
			if (!selectedPlaylists.includes(playlist.id)) {
				let songsInPlaylist = [];
				if (playlist.songs) {
					songsInPlaylist = JSON.parse(playlist.songs);
				}

				const songExistsInPlaylist = songsInPlaylist.includes(songName);
				if (songExistsInPlaylist) {
					const updatedSongs = songsInPlaylist.filter(song => song !== songName);
					const newSongs = JSON.stringify(updatedSongs);
					playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE id = ?").run(newSongs, playlist.id);
					console.log(`Song '${songName}' removed from playlist '${playlist.id}'.`);
				}
			}
		});
		closeModal();
	} catch (err) {
		console.log("Error updating playlists in the database:", err);
	}
}

async function deletePlaylist() {
	if (!(await confirmModal("Are you sure you want to remove this playlist?"))) return;

	const playlistName = document.getElementById("editInvisibleName").value;
	const playlistID = document.getElementById("editInvisibleId").value;
	const playlistThumbnailExtension = document.getElementById("editInvisibleExtension").value;
	const thumbnailPath = path.join(thumbnailFolder, playlistID + "." + playlistThumbnailExtension);

	fs.unlink(thumbnailPath, err => {
		if (err) {
			console.log(`Failed to delete file: ${err.message}`);
			return;
		}
		console.log("File deleted successfully!");
	});

	playlistsDb.prepare("DELETE FROM playlists WHERE id = ?").run(playlistID);

	console.log(`Deleted playlist "${playlistName}" and its song links.`);

	closeModal();
	document.getElementById("settings").click();
	document.getElementById("playlists").click();
}
