const statisticsWindow = document.getElementById("statistics-content");

function renderStatistics() {
	const row = musicsDb.prepare("SELECT 1 FROM timers LIMIT 1").get(); // Checks if the first row exists (If any data exists)

	if (!row) {
		alertModal("You haven't listened to any songs yet.");
		document.getElementById("main-menu-content").style.display = "flex"; // TODO: It will return to your initial page instead of the main menu
		document.getElementById("statistics-content").style.display = "none";
		return;
	}

	statisticsWindow.innerHTML = "";

	createMostListenedSongBox();
}

function createMostListenedSongBox() {
	const most_listened_song = musicsDb
		.prepare(
			`
            SELECT song_id, SUM(end_time - start_time) AS total_time
            FROM timers
            GROUP BY song_id
            ORDER BY total_time DESC
            LIMIT 1
        `
		)
		.get();

	const mostListenedSongName = getSongNameById(`tarator-${most_listened_song.song_id}`) != null ? getSongNameById(`tarator-${most_listened_song.song_id}`) : "A deleted song";

	const mostListenedSongText = document.createElement("div");
	mostListenedSongText.id = "mostListenedSongText";
	statisticsWindow.appendChild(mostListenedSongText);

	mostListenedSongText.innerHTML = `Most Listened Song: ${mostListenedSongName}. Listened for: ${most_listened_song.total_time} seconds.`; // TODO: Show in cool box, with song thumbnail, listen amount too. Make the box shiny for extra coolness.
}
