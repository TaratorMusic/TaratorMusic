async function getPlaylists(displaying) {
	try {
		const playlists = await callSqlite({
			db: "playlists",
			query: "SELECT * FROM playlists",
			fetch: true,
		});

		playlistsMap.clear();

		if (!playlists || playlists.length == 0) {
			if (displaying) displayPlaylists([]);
			return;
		}

		for (const playlist of playlists) {
			let parsedSongs = [];

			if (playlist.songs) {
				try {
					parsedSongs = JSON.parse(playlist.songs);
				} catch (error) {
					logChange("error", `Invalid songs JSON for playlist ${playlist.id}: ${error.message ?? String(error)}`);
				}
			}

			playlistsMap.set(playlist.id, {
				id: playlist.id,
				name: playlist.name,
				songs: parsedSongs,
				thumbnail_extension: playlist.thumbnail_extension,
			});

			playlistIdsForStartup.push(playlist.id);
		}

		if (displaying) displayPlaylists([...playlistsMap.values()]);
	} catch (error) {
		logChange("error", `Error fetching playlists from the database: ${error.message ?? String(error)}`);
		if (displaying) displayPlaylists([]);
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
	playlistsContent.appendChild(playlistsArea);

	const playlistElements = [];

	for (const playlist of playlists) {
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
		const nameH2 = document.createElement("h2");
		nameH2.textContent = playlist.name + " - ";
		playlistName.appendChild(nameH2);
		const countH3 = document.createElement("h3");
		countH3.textContent = playlist.songs.length == 1 ? `${playlist.songs.length} song` : `${playlist.songs.length} songs`;
		playlistName.appendChild(countH3);
		playlistInfo.appendChild(playlistName);

		const playlistSongs = document.createElement("div");
		playlistInfoandSongs.appendChild(playlistSongs);
		playlistSongs.className = "scrollArea playlist-songs";

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
			playlistSong.className = "playlist-song";

			playlistSong.addEventListener("click", () => {
				playPlaylist(playlist.id, i);
			});

			let name;

			if (playlist.songs[i].includes("tarator")) {
				name = getSongNameById(playlist.songs[i]);
				playlistSong.innerText = name;
			} else {
				const res = streamedSongsCache.get(playlist.songs[i]);
				playlistSong.innerText = res?.song_name;
			}

			playlistSongs.appendChild(playlistSong);
		}

		thumbnail.addEventListener("click", () => {
			playPlaylist(playlist.id, 0);
		});

		playlistsArea.appendChild(playlistElement);
		playlistElements.push({ element: playlistElement, name: playlist.name.toLowerCase() });
	}

	searchInput.addEventListener("input", () => {
		const query = searchInput.value.toLowerCase();
		playlistElements.forEach(p => {
			p.element.style.display = p.name.includes(query) ? "flex" : "none";
		});
	});
}

async function saveNewPlaylist() {
	const name = document.getElementById("playlistNameInput").value.trim();
	if (!name) return await alertModal("Playlist name required.");

	for (const [id, data] of playlistsMap.entries()) {
		if (data.name == name) {
			const proceed = await confirmModal("A playlist with the same name exists, continue?", "Continue", "Return");
			if (!proceed) return;
			break;
		}
	}

	const id = await generateId();
	const fileInput = document.getElementById("thumbnailInput").files?.[0] ?? null;

	fs.mkdirSync(thumbnailFolder, { recursive: true });

	let ext = "jpg";
	const dest = path.join(thumbnailFolder, `${id}.${ext}`);

	if (fileInput) {
		ext = path.extname(fileInput.name).slice(1).toLowerCase() || "png";
		const finalDest = path.join(thumbnailFolder, `${id}.${ext}`);
		const buffer = Buffer.from(await fileInput.arrayBuffer());
		fs.writeFileSync(finalDest, buffer);

		await callSqlite({
			db: "playlists",
			query: "INSERT INTO playlists (id, name, songs, thumbnail_extension) VALUES (?, ?, ?, ?)",
			args: [id, name, JSON.stringify([]), ext],
		});

		playlistsMap.set(id, {
			id,
			name,
			songs: [],
			thumbnail_extension: ext,
		});

		closeModal();

		if (document.getElementById("playlists-content").style.display == "grid") {
			document.getElementById("playlists").click();
		}
		return;
	}

	const placeholderPath = path.join(appThumbnailFolder, "placeholder.jpg");
	ext = path.extname(placeholderPath).slice(1).toLowerCase() || "jpg";
	const finalDest = path.join(thumbnailFolder, `${id}.${ext}`);

	await callSqlite({
		db: "playlists",
		query: "INSERT INTO playlists (id, name, songs, thumbnail_extension) VALUES (?, ?, ?, ?)",
		args: [id, name, JSON.stringify([]), ext],
	});

	playlistsMap.set(id, {
		id,
		name,
		songs: [],
		thumbnail_extension: ext,
	});

	fs.copyFileSync(placeholderPath, finalDest);

	closeModal();

	if (document.getElementById("playlists-content").style.display == "grid") {
		document.getElementById("playlists").click();
	}
}

async function saveEditedPlaylist() {
	const newName = document.getElementById("editPlaylistNameInput").value.trim();
	const playlistID = document.getElementById("editInvisibleId").value;
	const newThumbnail = document.getElementById("editPlaylistThumbnail").src;

	const playlistElement = document.querySelector('[data-playlist-id="' + CSS.escape(playlistID) + '"]');
	if (!playlistElement) {
		logChange("error", `Playlist element not found for ID: ${playlistID}`);
		return;
	}

	const playlist = playlistsMap.get(playlistID);
	const oldExt = playlist?.thumbnail_extension ?? null;

	let newThumbnailExtension = oldExt;
	let thumbnailPath = oldExt ? path.join(thumbnailFolder, `${playlistID}.${oldExt}`) : null;

	if (newThumbnail.startsWith("data:image")) {
		const mimeMatch = newThumbnail.match(/^data:image\/(\w+);base64,/);
		if (!mimeMatch) {
			logChange("error", "Invalid thumbnail data URL.");
			return;
		}

		newThumbnailExtension = mimeMatch[1].toLowerCase();
		if (newThumbnailExtension == "jpeg") newThumbnailExtension = "jpg";

		thumbnailPath = path.join(thumbnailFolder, `${playlistID}.${newThumbnailExtension}`);

		const base64Data = newThumbnail.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(base64Data, "base64");
		fs.mkdirSync(thumbnailFolder, { recursive: true });
		fs.writeFileSync(thumbnailPath, buffer);

		if (oldExt && oldExt != newThumbnailExtension) {
			const oldPath = path.join(thumbnailFolder, `${playlistID}.${oldExt}`);
			if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
		}
	}

	if (thumbnailPath) {
		const imgElement = playlistElement.querySelector("img");
		imgElement.src = "";
		imgElement.src = `${thumbnailPath}?timestamp=${Date.now()}`;
	}

	playlistElement.querySelector(".playlistName h2").textContent = newName + " - ";

	await callSqlite({
		db: "playlists",
		query: "UPDATE playlists SET name = ?, thumbnail_extension = ? WHERE id = ?",
		args: [newName, newThumbnailExtension, playlistID],
	});

	if (playlist) {
		playlist.name = newName;
		playlist.thumbnail_extension = newThumbnailExtension;
	}

	closeModal();
}

function openAddToPlaylistModal(songName) {
	document.getElementById("addToPlaylistModal").style.display = "block";
	const playlistsContainer = document.getElementById("playlist-checkboxes");
	playlistsContainer.innerHTML = "";

	try {
		const playlists = Array.from(playlistsMap.values());

		if (!playlists || playlists.length == 0) {
			displayPlaylists([]);
			return;
		}

		playlists.forEach(playlist => {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = playlist.id;
			checkbox.value = songName;

			const songsInPlaylist = playlist.songs || [];
			checkbox.checked = songsInPlaylist.includes(songName);

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
		button.onclick = () => addToSelectedPlaylists(songName);
		playlistsContainer.appendChild(button);
	} catch (error) {
		logChange("error", `Error fetching playlists: ${error.message ?? String(error)}`);
		displayPlaylists([]);
	}
}

function addToSelectedPlaylists(songName) {
	const checkboxes = document.querySelectorAll('#playlist-checkboxes input[type="checkbox"]');
	const selectedPlaylists = Array.from(checkboxes)
		.filter(cb => cb.checked)
		.map(cb => cb.id);

	selectedPlaylists.forEach(playlistId => {
		const playlist = playlistsMap.get(playlistId);
		if (!playlist) return;

		let songsInPlaylist = playlist.songs ? [...playlist.songs] : [];

		if (!songsInPlaylist.includes(songName)) {
			songsInPlaylist.push(songName);
			callSqlite({
				db: "playlists",
				query: "UPDATE playlists SET songs = ? WHERE id = ?",
				args: [JSON.stringify(songsInPlaylist), playlistId],
			});
			playlistsMap.set(playlistId, {
				...playlist,
				songs: songsInPlaylist,
			});
		}
	});

	for (const [playlistId, playlist] of playlistsMap.entries()) {
		if (!selectedPlaylists.includes(playlistId)) {
			let songsInPlaylist = playlist.songs ? [...playlist.songs] : [];
			if (songsInPlaylist.includes(songName)) {
				const updatedSongs = songsInPlaylist.filter(song => song != songName);
				callSqlite({
					db: "playlists",
					query: "UPDATE playlists SET songs = ? WHERE id = ?",
					args: [JSON.stringify(updatedSongs), playlistId],
				});
				playlistsMap.set(playlistId, {
					...playlist,
					songs: updatedSongs,
				});
			}
		}
	}

	closeModal();
	getPlaylists(getComputedStyle(document.getElementById("playlists-content")).display == "grid");
}

function deletePlaylist() {
	confirmModal("Are you sure you want to remove this playlist?").then(confirmed => {
		if (!confirmed) return;

		const playlistName = document.getElementById("editInvisibleName").value;
		const playlistID = document.getElementById("editInvisibleId").value;
		const playlistThumbnailExtension = document.getElementById("editInvisibleExtension").value;
		const thumbnailPath = path.join(thumbnailFolder, `${playlistID}.${playlistThumbnailExtension}`);

		fs.unlink(thumbnailPath, error => {
			if (error) logChange("error", `Failed to delete file: ${error.message ?? String(error)}`);
		});

		callSqlite({ db: "playlists", query: "DELETE FROM playlists WHERE id = ?", args: [playlistID] });
		playlistsMap.delete(playlistID);

		closeModal();
		document.getElementById("settings").click();
		document.getElementById("playlists").click();
	});
}
