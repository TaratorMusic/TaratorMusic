const { Chart, LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler } = require("chart.js");
Chart.register(LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler);

const scrollableArea = document.getElementById("statistics-content");

async function renderStatistics() {
	const row = musicsDb.prepare("SELECT 1 FROM timers LIMIT 1").get(); // Checks if the first row exists (If any data exists)

	if (!row) {
		alertModal("You haven't listened to any songs yet.");
		return;
	}

	document.getElementById("statistics-content").style.display = "flex";
	scrollableArea.innerHTML = "";

	await createMostListenedSongBox();
	await createPieCharts();
	await daysHeatMap();
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

	const mostListenedSongsRow = musicsDb.prepare("SELECT song_name FROM songs WHERE song_id = ?").get(`tarator-${most_listened_song.song_id}`);

	const mostListenedSongText = document.createElement("div");
	mostListenedSongText.id = "mostListenedSongText";
	scrollableArea.appendChild(mostListenedSongText);

	const firstAndLastListenOfTheBestSong = musicsDb
		.prepare(
			`
			SELECT *
			FROM timers
			WHERE song_id = ?
			ORDER BY start_time ASC
			LIMIT 1
		`
		)
		.get(most_listened_song.song_id);

	// TODO: Show in cool box, with song thumbnail, listen amount too. Make the box shiny for extra coolness.
	mostListenedSongText.innerHTML = `Favorite Song: ${mostListenedSongsRow != undefined ? mostListenedSongsRow.song_name : "A deleted song"}. `;
	// mostListenedSongText.innerHTML += `by ${mostListenedSongsRow.artist}`;
	mostListenedSongText.innerHTML += `Listened for: ${most_listened_song.total_time} seconds. `;
	mostListenedSongText.innerHTML += `First listened at: ${formatUnixTime(firstAndLastListenOfTheBestSong.start_time)} and last listened at ${formatUnixTime(firstAndLastListenOfTheBestSong.end_time)}`;
}

async function createPieCharts() {
	const pieChartPart = document.createElement("div");
	pieChartPart.id = "pieChartPart";
	scrollableArea.appendChild(pieChartPart);

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

	for (let i = 0; i < 7; i++) {
		const activityBox = document.createElement("div");
		activityBox.className = "activityBox";
		scrollableArea.appendChild(activityBox);

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

		const dayMax = Math.max(...averages[i]);
		const yMax = dayMax > 0 ? dayMax * 1.1 : 1;

		config.options.scales.y = {
			min: 0,
			max: yMax,
			display: false,
			grid: { display: false },
		};

		config.data.datasets.push({
			label: daysoftheweek[i],
			data: averages[i],
			borderColor: "red",
			backgroundColor: "rgba(255,0,0,0.3)",
			fill: "origin",
		});

		new Chart(activityChart, config);
	}
}
