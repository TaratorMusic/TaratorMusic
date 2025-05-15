function getPlaylists() {
	try {
		const playlists = playlistsDb.prepare("SELECT * FROM playlists").all();

		if (!playlists || playlists.length === 0) {
			console.warn("No playlists found in the database.");
			displayPlaylists([]);
			return;
		}

		const playlistsWithParsedSongs = playlists.map(playlist => {
			let parsedSongs = [];
			if (playlist.songs) {
				try {
					parsedSongs = JSON.parse(playlist.songs);
				} catch (e) {
					console.warn(`Error parsing songs for playlist '${playlist.name}': ${e.message}`);
				}
			}
			return { ...playlist, songs: parsedSongs };
		});

		displayPlaylists(playlistsWithParsedSongs);
	} catch (err) {
		console.error("Error fetching playlists from the database:", err);
		displayPlaylists([]);
	}
}

function displayPlaylists(playlists) {
	const playlistsContent = document.getElementById("playlists-content");
	playlistsContent.innerHTML = "";

	playlists.forEach(playlist => {
		const playlistElement = document.createElement("div");
		playlistElement.className = "playlist";
		playlistElement.setAttribute("data-playlist-name", playlist.name);
		const thumbnailPath = path.join(thumbnailFolder, playlist.name + "_playlist.jpg");

		let thumbnailSrc = "";

		if (fs.existsSync(thumbnailPath)) {
			thumbnailSrc = `file://${thumbnailPath.replace(/\\/g, "/")}?t=${Date.now()}`;
		} else {
			thumbnailSrc = `file://${path.join(appThumbnailFolder, "placeholder.jpg").replace(/\\/g, "/")}?t=${Date.now()}`;
		}

		const thumbnail = document.createElement("img");
		thumbnail.src = thumbnailSrc;
		playlistElement.appendChild(thumbnail);

		const playlistInfoandSongs = document.createElement("div");
		playlistElement.appendChild(playlistInfoandSongs);
		playlistInfoandSongs.className = "playlistInfoandSongs";

		const playlistInfo = document.createElement("div");
		playlistInfoandSongs.appendChild(playlistInfo);
		playlistInfo.className = "playlist-info";

		const playlistName = document.createElement("div");
		const playlistLength = document.createElement("div");
		playlistName.textContent = playlist.name;
		playlistLength.textContent = playlist.songs.length === 1 ? `${playlist.songs.length} song` : `${playlist.songs.length} songs`;
		playlistInfo.appendChild(playlistName);
		playlistInfo.appendChild(playlistLength);

		const playlistSongs = document.createElement("div");
		const playlistButtons = document.createElement("div");
		playlistInfoandSongs.appendChild(playlistSongs);
		playlistElement.appendChild(playlistButtons);
		playlistSongs.className = "playlist-songs";
		playlistButtons.className = "playlist-buttons";

		const playlistCustomiseButton = document.createElement("div");
		playlistButtons.appendChild(playlistCustomiseButton);
		playlistCustomiseButton.className = "playlist-buttons-button";
		playlistCustomiseButton.innerHTML = icon.custom;

		playlistCustomiseButton.addEventListener("click", () => {
			let theNameOfThePlaylist = playlist.name;
			document.getElementById("editPlaylistModal").style.display = "block";
			document.getElementById("editPlaylistNameInput").value = theNameOfThePlaylist;
			document.getElementById("editInvisibleName").value = theNameOfThePlaylist;
			document.getElementById("editPlaylistThumbnail").src = thumbnailSrc;
			document.getElementById("editInvisiblePhoto").src = thumbnailSrc;
		});

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

		playlistsContent.appendChild(playlistElement);
	});
}

function openNewPlaylistModal() {
	document.getElementById("createPlaylistModal").style.display = "block";
}

function saveNewPlaylist() {
	const name = document.getElementById("playlistNameInput").value.trim();
	if (!name) return alert("Playlist name required.");

	const thumbFile = document.getElementById("thumbnailInput").files[0];
	if (!thumbFile) return alert("Please select a thumbnail for the playlist.");

	const existing = playlistsDb.prepare("SELECT id FROM playlists WHERE name = ?").get(name);
	if (!existing) {
		const dest = path.join(thumbnailFolder, `${name}_playlist.jpg`);
		playlistsDb.prepare("INSERT INTO playlists (name, songs, thumbnail) VALUES (?, ?, ?)").run(name, JSON.stringify([]), dest);
		fs.copyFileSync(thumbFile.path, dest);
	} else {
		alert("You can't use a duplicate name for the playlist.");
		return;
	}

	closeModal();

	if (document.getElementById("playlists-content").style.display === "grid") {
		document.getElementById("playlists").click();
	}
}

function saveEditedPlaylist() {
	const oldName = document.getElementById("editInvisibleName").value;
	const newName = document.getElementById("editPlaylistNameInput").value.trim();
	const newThumbnail = document.getElementById("editPlaylistThumbnail").src;

	const playlistElement = document.querySelector(`.playlist[data-playlist-name="${oldName}"]`);
	playlistElement.setAttribute("data-playlist-name", newName);
	playlistElement.querySelector(".playlist-info div:first-child").textContent = newName;

	const playlist = playlistsDb.prepare("SELECT * FROM playlists WHERE name = ?").get(oldName);

	if (!playlist) {
		console.error("Playlist not found:", oldName);
		return;
	}

	const playlistId = playlist.id;
	let thumbnailPath = playlist.thumbnail;

	const writeOrRenameThumbnailPromise = new Promise((resolve, reject) => {
		if (newThumbnail.startsWith("data:image")) {
			const base64Data = newThumbnail.replace(/^data:image\/\w+;base64,/, "");
			const buffer = Buffer.from(base64Data, "base64");
			thumbnailPath = path.join(thumbnailFolder, `${newName}_playlist.jpg`);

			fs.writeFile(thumbnailPath, buffer, err => {
				if (err) {
					reject(err);
				} else {
					resolve(`${thumbnailPath}?timestamp=${Date.now()}`);
				}
			});
		} else if (oldName !== newName) {
			const oldThumbPath = path.join(thumbnailFolder, `${oldName}_playlist.jpg`);
			const newThumbPath = path.join(thumbnailFolder, `${newName}_playlist.jpg`);

			if (fs.existsSync(oldThumbPath)) {
				fs.rename(oldThumbPath, newThumbPath, err => {
					if (err) {
						reject(err);
					} else {
						thumbnailPath = newThumbPath;
						resolve(`${newThumbPath}?timestamp=${Date.now()}`);
					}
				});
			} else {
				resolve(thumbnailPath);
			}
		} else {
			resolve(thumbnailPath);
		}
	});

	writeOrRenameThumbnailPromise
		.then(resolvedPath => {
			const imgElement = playlistElement.querySelector("img");
			imgElement.src = "";
			imgElement.src = resolvedPath;

			playlistsDb.prepare("UPDATE playlists SET name = ?, thumbnail = ? WHERE id = ?").run(newName, resolvedPath.split("?")[0], playlistId);
			closeModal();
		})
		.catch(err => {
			console.error("Error saving or renaming thumbnail:", err);
		});
}

function openAddToPlaylistModal(songName) {
	document.getElementById("addToPlaylistModal").style.display = "block";
	const playlistsContainer = document.getElementById("playlist-checkboxes");
	playlistsContainer.innerHTML = "";

	try {
		const playlists = playlistsDb.prepare("SELECT * FROM playlists").all();

		if (!playlists || playlists.length === 0) {
			console.warn("No playlists found.");
			displayPlaylists([]);
			return;
		}

		playlists.forEach(playlist => {
			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.id = playlist.name;
			checkbox.value = songName;

			let songsInPlaylist = [];
			if (playlist.songs) {
				try {
					songsInPlaylist = JSON.parse(playlist.songs);
				} catch (e) {
					console.error("Error parsing songs from playlist:", e);
				}
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
		console.error("Error fetching playlists from the database:", err);
		displayPlaylists([]);
	}
}

function addToSelectedPlaylists(songName) {
	const checkboxes = document.querySelectorAll('#playlist-checkboxes input[type="checkbox"]');
	const selectedPlaylists = Array.from(checkboxes)
		.filter(checkbox => checkbox.checked)
		.map(checkbox => checkbox.id);

	try {
		selectedPlaylists.forEach(playlistName => {
			const playlist = playlistsDb.prepare("SELECT * FROM playlists WHERE name = ?").get(playlistName);

			let songsInPlaylist = [];
			if (playlist.songs) {
				try {
					songsInPlaylist = JSON.parse(playlist.songs);
				} catch (e) {
					console.error("Error parsing songs from playlist:", e);
				}
			}

			const songExists = songsInPlaylist.includes(songName);

			if (songExists) {
				console.log(`Song '${songName}' already exists in playlist '${playlistName}'.`);
			} else {
				songsInPlaylist.push(songName);
				const updatedSongs = JSON.stringify(songsInPlaylist);
				playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE name = ?").run(updatedSongs, playlistName);
				console.log(`Song '${songName}' added to playlist '${playlistName}'.`);
			}
		});

		const allPlaylists = playlistsDb.prepare("SELECT * FROM playlists").all();
		allPlaylists.forEach(playlist => {
			if (!selectedPlaylists.includes(playlist.name)) {
				let songsInPlaylist = [];
				if (playlist.songs) {
					try {
						songsInPlaylist = JSON.parse(playlist.songs);
					} catch (e) {
						console.error("Error parsing songs from playlist:", e);
					}
				}

				const songExistsInPlaylist = songsInPlaylist.includes(songName);
				if (songExistsInPlaylist) {
					const updatedSongs = songsInPlaylist.filter(song => song !== songName);
					const newSongs = JSON.stringify(updatedSongs);
					playlistsDb.prepare("UPDATE playlists SET songs = ? WHERE name = ?").run(newSongs, playlist.name);
					console.log(`Song '${songName}' removed from playlist '${playlist.name}'.`);
				}
			}
		});
	} catch (err) {
		console.error("Error updating playlists in the database:", err);
	}

	closeModal();
}

function deletePlaylist() {
	if (!confirm("Are you sure you want to remove this playlist?")) return;

	const playlistName = document.getElementById("editInvisibleName").value;
	const thumbnailPath = path.join(thumbnailFolder, playlistName + "_playlist.jpg");

	const playlist = playlistsDb.prepare("SELECT * FROM playlists WHERE name = ?").get(playlistName);
	if (!playlist) {
		console.error("Playlist not found:", playlistName);
		return;
	}

	fs.unlink(thumbnailPath, err => {
		if (err) {
			console.error(`Failed to delete file: ${err.message}`);
			return;
		}
		console.log("File deleted successfully!");
	});

	playlistsDb.prepare("DELETE FROM playlists WHERE id = ?").run(playlist.id);

	console.log(`Deleted playlist "${playlistName}" and its song links.`);

	closeModal();
	document.getElementById("settings").click();
	document.getElementById("playlists").click();
}
