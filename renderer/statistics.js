const { Chart, LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend } = require("chart.js");
Chart.register(LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

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
	createPieCharts();
	daysHeatMap();
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

	const formatTime = (
		timestamp // TODO: Get this to helpers.js
	) =>
		new Date(timestamp * 1000).toLocaleString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		});

	mostListenedSongText.innerHTML = `Favorite Song: ${mostListenedSongName}. Listened for: ${most_listened_song.total_time} seconds. `; // TODO: Show in cool box, with song thumbnail, listen amount too. Make the box shiny for extra coolness.
	mostListenedSongText.innerHTML += `First listened at: ${formatTime(firstAndLastListenOfTheBestSong.start_time)} and last listened at ${formatTime(firstAndLastListenOfTheBestSong.end_time)}`;
}

function createPieCharts() {
	const pieChartPart = document.createElement("div");
	pieChartPart.id = "pieChartPart";
	statisticsWindow.appendChild(pieChartPart);

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
	});
}

function daysHeatMap() {
	const options = Intl.DateTimeFormat().resolvedOptions();
	const hourFormat = options.hour12 ? UShours : EUhours;
	for (let i = 0; i < 7; i++) {
		const activityChart = document.createElement("canvas");
		// TODO: activityChart.className = ...
		statisticsWindow.appendChild(activityChart);

		new Chart(activityChart, {
			type: "line",
			data: {
				labels: hourFormat,
				datasets: [
					{
						label: daysoftheweek[i],
						data: [0, 0, 1, 2, 0, 3, 1, 0, 0, 2, 1, 0, 0, 0, 1, 4, 3, 0, 0, 1, 0, 0, 0, 0],
						borderColor: "red",
						fill: false,
					},
				],
			},
			options: {
				plugins: {
					legend: {
						labels: {
							color: "white",
						},
					},
				},
				responsive: true,
				interaction: { mode: "index", intersect: false },
				stacked: false,
				scales: {
					x: {
						title: { display: false, text: "Hour of Day" },
						ticks: {
							color: "white",
						},
					},
					y: {
						title: { display: false, text: "Activity" },
						beginAtZero: true,
						ticks: {
							color: "white",
						},
					},
				},
			},
		});
	}
}
