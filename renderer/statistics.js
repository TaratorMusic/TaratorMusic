const { Chart, LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler } = require("chart.js");
Chart.register(LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler);

const statisticsContent = document.getElementById("statistics-content");
let sortOrder = {};

async function renderStatistics() {
	const row = musicsDb.prepare("SELECT 1 FROM timers LIMIT 1").get(); // Checks if the first row exists (If any data exists)
	if (!row) return alertModal("You haven't listened to any songs yet.");

	document.getElementById("statistics-content").style.display = "flex";
	statisticsContent.innerHTML = "";

	await createMostListenedSongBox();
	await createPieCharts();
	await daysHeatMap();
	await generalStatistics();
	await htmlTableStats();
}

async function createMostListenedSongBox() {
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

	const songId = "tarator-" + most_listened_song.song_id;
	const mostListenedSongsRow = musicsDb.prepare("SELECT song_name, thumbnail_extension FROM songs WHERE song_id = ?").get(songId);

	const statisticsMostListened = document.createElement("div");
	statisticsMostListened.id = "statisticsMostListened";
	statisticsContent.appendChild(statisticsMostListened);

	const statisticsMostListenedTitle = document.createElement("h1");
	statisticsMostListenedTitle.innerHTML = "Most Listened Song";
	statisticsMostListened.appendChild(statisticsMostListenedTitle);

	const statisticsMostListenedBox = document.createElement("div");
	statisticsMostListenedBox.id = "statisticsMostListenedBox";
	statisticsMostListened.appendChild(statisticsMostListenedBox);

	let thumbnailUrl = path.join(appThumbnailFolder, "placeholder.jpg".replace(/%20/g, " "));

	const img = document.createElement("img");
	img.id = "statisticsMostListenedSongImage";
	statisticsMostListenedBox.appendChild(img);

	const mostListenedSongText = document.createElement("div");
	mostListenedSongText.id = "mostListenedSongText";
	statisticsMostListenedBox.appendChild(mostListenedSongText);

	const { min_start, max_start, total_rows } = musicsDb.prepare("SELECT MIN(start_time) AS min_start, MAX(start_time) AS max_start, COUNT(*) AS total_rows FROM timers WHERE song_id = ?").get(most_listened_song.song_id);

	if (mostListenedSongsRow) {
		mostListenedSongText.innerHTML = `Favorite Song: ${mostListenedSongsRow.song_name}.<br>`;

		const thumbnailFileName = `${songId}.${mostListenedSongsRow.thumbnail_extension}`;
		const thumbnailPath = path.join(thumbnailFolder, thumbnailFileName.replace(/%20/g, " "));
		if (fs.existsSync(thumbnailPath)) thumbnailUrl = thumbnailPath;

		img.addEventListener("click", () => {
			playMusic(songId, null);
		});
	} else {
		mostListenedSongText.innerHTML = `Favorite Song: [Deleted Song].<br>`;
	}

	img.src = `file://${thumbnailUrl.replace(/\\/g, "/")}?t=${Date.now()}`;

	// mostListenedSongText.innerHTML += by ${mostListenedSongsRow.artist}<br>;
	// mostListenedSongText.innerHTML += Genre: ${mostListenedSongsRow.genre}, Language: ${mostListenedSongsRow.language}<br>;

	mostListenedSongText.innerHTML += `Listened for: ${most_listened_song.total_time} seconds and ${total_rows} times.<br>`;
	mostListenedSongText.innerHTML += `First listened at: ${formatUnixTime(min_start)} and last listened at ${formatUnixTime(max_start)}<br>`;
	mostListenedSongText.innerHTML += `Listen percentage: ${findListenPercentage(most_listened_song.song_id)}%`;
}

async function createPieCharts() {
	const pieChartPart = document.createElement("div");
	pieChartPart.id = "pieChartPart";
	statisticsContent.appendChild(pieChartPart);

	const canvasBox1 = document.createElement("div");
	canvasBox1.className = "canvasBox";
	pieChartPart.appendChild(canvasBox1);
	const canvasBox2 = document.createElement("div");
	canvasBox2.className = "canvasBox";
	pieChartPart.appendChild(canvasBox2);
	const canvasBox3 = document.createElement("div");
	canvasBox3.className = "canvasBox";
	pieChartPart.appendChild(canvasBox3);

	const canvas1 = document.createElement("canvas");
	canvas1.id = "bestGenrePieChart";
	canvas1.className = "pieChart";
	canvasBox1.appendChild(canvas1);

	const canvas1description = document.createElement("p");
	canvas1description.innerHTML = "Favorite Artists (Coming Soon)";
	canvasBox1.appendChild(canvas1description);

	new Chart(canvas1.getContext("2d"), {
		type: "pie",
		data: {
			labels: ["Coming Soon"],
			datasets: [
				{
					data: [1],
					backgroundColor: ["blue"],
				},
			],
		},
		options: {
			plugins: { legend: { display: false } },
		},
	});

	const canvas2 = document.createElement("canvas");
	canvas2.id = "bestGenrePieChart";
	canvas2.className = "pieChart";
	canvasBox2.appendChild(canvas2);

	const canvas2description = document.createElement("p");
	canvas2description.innerHTML = "Favorite Genres (Coming Soon)";
	canvasBox2.appendChild(canvas2description);

	new Chart(canvas2.getContext("2d"), {
		type: "pie",
		data: {
			labels: ["Coming Soon"],
			datasets: [
				{
					data: [1],
					backgroundColor: ["pink"],
				},
			],
		},
		options: {
			plugins: { legend: { display: false } },
		},
	});

	const canvas3 = document.createElement("canvas");
	canvas3.id = "bestLanguagePieChart";
	canvas3.className = "pieChart";
	canvasBox3.appendChild(canvas3);

	const canvas3description = document.createElement("p");
	canvas3description.innerHTML = "Favorite Languages (Coming Soon)";
	canvasBox3.appendChild(canvas3description);

	new Chart(canvas3.getContext("2d"), {
		type: "pie",
		data: {
			labels: ["Coming Soon"],
			datasets: [
				{
					data: [1],
					backgroundColor: ["green"],
				},
			],
		},
		options: {
			plugins: { legend: { display: false } },
		},
	});
}

async function daysHeatMap() {
	const rows = musicsDb.prepare("SELECT start_time, end_time FROM timers").all();

	const days = Array.from({ length: 7 }, () => Array(24).fill(0));
	const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

	for (const row of rows) {
		const duration = row.end_time - row.start_time;
		const date = new Date(row.start_time * 1000);
		const day = (date.getDay() + 6) % 7;
		const hour = date.getHours();
		days[day][hour] += duration;
		counts[day][hour] += 1;
	}

	const averages = days.map((day, d) => day.map((total, h) => (counts[d][h] ? Math.round(total / counts[d][h]) : 0)));

	const options = Intl.DateTimeFormat().resolvedOptions();
	const hourFormat = options.hour12 ? UShours : EUhours;

	const baseConfig = {
		type: "line",
		data: { labels: hourFormat, datasets: [] },
		options: {
			plugins: { legend: { display: false } },
			responsive: true,
			interaction: { mode: "index", intersect: false },
			stacked: false,
			scales: {
				x: { ticks: { color: "white" }, grid: { display: false } },
				y: { display: false, grid: { display: false } },
			},
		},
	};

	const globalMax = Math.max(...averages.flat()) * 1.1 || 1;

	for (let i = 0; i < 7; i++) {
		const activityBox = document.createElement("div");
		activityBox.className = "activityBox";
		statisticsContent.appendChild(activityBox);

		const canvasLabel = document.createElement("div");
		canvasLabel.innerHTML = daysoftheweek[i];
		canvasLabel.style.minWidth = "5vw";
		activityBox.appendChild(canvasLabel);

		const activityChart = document.createElement("canvas");
		activityChart.className = "hourChart";
		activityBox.appendChild(activityChart);

		activityChart.width = window.innerWidth * 0.7;
		activityChart.height = window.innerWidth * 0.0525;

		const config = structuredClone(baseConfig);

		config.options.scales.y = {
			min: 0,
			max: globalMax,
			display: false,
			grid: { display: false },
		};

		config.data.datasets.push({
			label: daysoftheweek[i],
			data: averages[i],
			borderColor: "red",
			backgroundColor: "rgba(255,0,0,0.3)",
			fill: "origin",
			tension: 0.4,
		});

		new Chart(activityChart, config);
	}
}

async function generalStatistics() {
	const row = settingsDb.prepare("SELECT * FROM statistics").all()[0];
	const leastListenRow = musicsDb
		.prepare(
			`
                SELECT *
                FROM timers
                ORDER BY start_time ASC
                LIMIT 1
            `
		)
		.get();

	let totalvalue, totalunit, sessionvalue, sessionunit;
	let totalTimeSpent = row.total_time_spent;

	if (totalTimeSpent >= 3600) {
		totalvalue = (totalTimeSpent / 3600).toFixed(0);
		totalunit = totalvalue == 1 ? "hour" : "hours";
	} else {
		totalvalue = (totalTimeSpent / 60).toFixed(0);
		totalunit = totalvalue == 1 ? "minute" : "minutes";
	}

	if (sessionTimeSpent >= 3600) {
		sessionvalue = (sessionTimeSpent / 3600).toFixed(0);
		sessionunit = sessionvalue == 1 ? "hour" : "hours";
	} else {
		sessionvalue = (sessionTimeSpent / 60).toFixed(0);
		sessionunit = sessionvalue == 1 ? "minute" : "minutes";
	}

	const theBigText = document.createElement("div");
	theBigText.className = "theBigText";
	statisticsContent.appendChild(theBigText);

	theBigText.innerHTML += `Total Time Spent in TaratorMusic: ${totalvalue} ${totalunit}<br>`;
	theBigText.innerHTML += `Session Time Spent: ${sessionvalue} ${sessionunit}<br>`;
	theBigText.innerHTML += `Using TaratorMusic since: ${formatUnixTime(row.app_install_date)}<br>`;
	theBigText.innerHTML += `First song listened at: ${formatUnixTime(leastListenRow.start_time) || "Never"}<br>`;
	theBigText.innerHTML += `Total amount of songs listened: ${row.songs_listened_out_playlists + row.songs_listened_in_playlists || 0}<br>`;
	theBigText.innerHTML += `Amount of songs listened inside playlists: ${row.songs_listened_in_playlists || 0}<br>`;
	theBigText.innerHTML += `Amount of songs listened outside playlists: ${row.songs_listened_out_playlists || 0}<br>`;
	theBigText.innerHTML += `Total amount of songs downloaded: ${row.songs_downloaded_youtube + row.songs_downloaded_spotify || 0}<br>`;
	theBigText.innerHTML += `Amount of songs downloaded from Youtube: ${row.songs_downloaded_youtube || 0}<br>`;
	theBigText.innerHTML += `Amount of songs downloaded from Spotify: ${row.songs_downloaded_spotify || 0}<br>`;
}

async function htmlTableStats(sortedData = null) {
	const rows = sortedData || musicsDb.prepare("SELECT song_id, song_name, song_length FROM songs").all();
	const timers = musicsDb.prepare("SELECT song_id, start_time, end_time FROM timers").all();

	for (let row of rows) {
		const songId = row.song_id;
		const clippedId = songId.replace("tarator-", "");

		const songTimers = timers.filter(t => t.song_id == clippedId);
		const listenAmount = songTimers.length;
		const listenLength = songTimers.reduce((sum, t) => sum + (t.end_time - t.start_time), 0);
		const listenPercentage = findListenPercentage(clippedId) + "%";

		row.listenAmount = listenAmount;
		row.listenLength = listenLength;
		row.listenPercentage = listenPercentage;
	}

	const oldContainer = document.getElementById("htmlTable");
	if (oldContainer) oldContainer.remove();

	const container = document.createElement("div");
	container.id = "htmlTable";

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const headerRow = document.createElement("tr");

	Object.keys(rows[0]).forEach(key => {
		const th = document.createElement("th");
		th.style.cursor = "pointer";
		th.style.userSelect = "none";
		th.style.position = "relative";

		const textSpan = document.createElement("span");
		textSpan.textContent = key;

		const arrowSpan = document.createElement("span");
		arrowSpan.style.position = "absolute";
		arrowSpan.style.right = "5px";
		arrowSpan.style.fontSize = "0.8em";

		if (sortOrder[key]) {
			arrowSpan.textContent = sortOrder[key] === "asc" ? "▲" : "▼";
		}

		th.appendChild(textSpan);
		th.appendChild(arrowSpan);

		th.onclick = () => {
			Object.keys(sortOrder).forEach(k => {
				if (k !== key) delete sortOrder[k];
			});

			const order = sortOrder[key] === "asc" ? "desc" : "asc";
			sortOrder[key] = order;

			const sorted = [...rows].sort((a, b) => {
				let aVal = a[key];
				let bVal = b[key];

				if (!isNaN(aVal) && !isNaN(bVal)) {
					aVal = parseFloat(aVal);
					bVal = parseFloat(bVal);
				}

				if (aVal < bVal) return order === "asc" ? -1 : 1;
				if (aVal > bVal) return order === "asc" ? 1 : -1;
				return 0;
			});

			htmlTableStats(sorted);
		};

		headerRow.appendChild(th);
	});

	thead.appendChild(headerRow);
	table.appendChild(thead);

	const tbody = document.createElement("tbody");
	rows.forEach(row => {
		const tr = document.createElement("tr");
		Object.values(row).forEach(value => {
			const td = document.createElement("td");
			td.textContent = value;
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	});

	table.appendChild(tbody);
	container.appendChild(table);
	statisticsContent.appendChild(container);
}

function findListenPercentage(songId) {
	try {
		const row = musicsDb.prepare("SELECT song_length FROM songs WHERE song_id = ?").get(`tarator-${songId}`);
		const stats = musicsDb.prepare("SELECT COUNT(*) AS row_count, SUM(end_time - start_time) AS total_duration FROM timers WHERE song_id = ?").get(songId) || {};
		const totalLength = (stats.row_count || 0) * row.song_length;
		const totalListened = stats.total_duration || 0;
		if (totalLength == 0) return 0;
		return ((totalListened / totalLength) * 100).toFixed(0);
	} catch {
		return 0;
	}
}
