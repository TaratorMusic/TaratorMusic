const { Chart, LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler } = require("chart.js");
Chart.register(LineController, LineElement, PointElement, PieController, ArcElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler);

const statisticsContent = document.getElementById("statistics-content");
let sortOrder = {};
let isRenderingStatistics = false;

let songsTable;
let timersTable;

let pieChartColors = {};
let pieChartCategories = { artist: [], genre: [], language: [] };
let pieChartDefinitions = [];
let pieChartInstances = [];

function colorFromName(name) {
	let hashValue = 0;
	for (let charIndex = 0; charIndex < name.length; charIndex++) {
		hashValue = name.charCodeAt(charIndex) + ((hashValue << 5) - hashValue);
	}
	const baseHue = Math.abs(hashValue) % 360;
	return `hsl(${baseHue},70%,50%)`;
}

async function renderStatistics() {
	if (isRenderingStatistics) return;
	isRenderingStatistics = true;
	try {
		timersTable = await callSqlite({
			db: "musics",
			query: "SELECT song_id, start_time, end_time, playlist FROM timers",
			fetch: true,
		});

		if (!timersTable.length) {
			document.getElementById("main-menu").click();
			return alertModal("You haven't listened to any songs yet.");
		}

		songsTable = Array.from(songNameCache.entries()).map(([song_id, data]) => ({
			song_id,
			...data,
		}));

		statisticsContent.innerHTML = "";
		statisticsContent.style.display = "flex";

		await loadStatsColumnPrefs();
		await loadPieChartColorPrefs();
		await createMostListenedSongBox();
		await createPieCharts();
		await daysHeatMap();
		await generalStatistics();
		await htmlTableStats();
	} finally {
		isRenderingStatistics = false;
	}
}

async function createMostListenedSongBox() {
	const most_listened_song_res = await callSqlite({
		db: "musics",
		query: `
            SELECT song_id, SUM(end_time - start_time) AS total_time
            FROM timers
            GROUP BY song_id
            ORDER BY total_time DESC
            LIMIT 1
        `,
		fetch: true,
	});

	const most_listened_song = most_listened_song_res[0];
	const songId = "tarator-" + most_listened_song.song_id;
	const mostListenedSongsRow = songNameCache.get(songId) || {};

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

	const statsRes = await callSqlite({
		db: "musics",
		query: "SELECT MIN(start_time) AS min_start, MAX(start_time) AS max_start, COUNT(*) AS total_rows FROM timers WHERE song_id = ?",
		args: [most_listened_song.song_id],
		fetch: true,
	});

	const { min_start, max_start, total_rows } = statsRes[0];
	const artist = mostListenedSongsRow.artist || "Unknown Artist";
	const genre = mostListenedSongsRow.genre || "Unknown Genre";
	const language = mostListenedSongsRow.language || "Unknown Language";

	if (mostListenedSongsRow) {
		mostListenedSongText.innerHTML = `Favorite Song: ${mostListenedSongsRow.song_name} by ${artist}.<br>`;

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

	mostListenedSongText.innerHTML += `Genre: ${genre}, Language: ${language}<br>`;

	mostListenedSongText.innerHTML += `Listened for: ${most_listened_song.total_time} seconds and ${total_rows} times.<br>`;
	mostListenedSongText.innerHTML += `First listened at: ${formatUnixTime(min_start)} and last listened at ${formatUnixTime(max_start)}<br>`;
	mostListenedSongText.innerHTML += `Listen percentage: ${findListenPercentage(most_listened_song.song_id)}%`;
}

async function createPieCharts() {
	const pieChartContainer = document.createElement("div");
	pieChartContainer.id = "pieChartPart";
	statisticsContent.appendChild(pieChartContainer);

	const pieChartHeader = document.createElement("div");
	pieChartHeader.id = "pieChartPartHeader";
	pieChartContainer.appendChild(pieChartHeader);

	const pieChartTitle = document.createElement("h1");
	pieChartTitle.id = "pieChartPartTitle";
	pieChartTitle.innerHTML = "Your Listening Breakdown";
	pieChartHeader.appendChild(pieChartTitle);

	const pieChartSettingsButton = document.createElement("button");
	pieChartSettingsButton.id = "pieChartSettingsButton";
	pieChartSettingsButton.className = "pieChartSettingsButton";
	pieChartSettingsButton.textContent = "Pie Chart Settings";
	pieChartSettingsButton.addEventListener("click", openPieChartSettingsModal);
	pieChartHeader.appendChild(pieChartSettingsButton);

	const pieChartBoxesContainer = document.createElement("div");
	pieChartBoxesContainer.id = "pieChartPartBoxes";
	pieChartContainer.appendChild(pieChartBoxesContainer);

	const canvasBoxes = [];
	for (let boxIndex = 0; boxIndex < 6; boxIndex++) {
		const canvasBox = document.createElement("div");
		canvasBox.className = "canvasBox";
		pieChartBoxesContainer.appendChild(canvasBox);
		canvasBoxes.push(canvasBox);
	}

	function addGroupedEntry(map, value, amount = 1) {
		const key = normalizeText(value);
		const entry = map[key] || (map[key] = { counts: {}, total: 0 });
		const rawLabel = String(value);
		entry.counts[rawLabel] = (entry.counts[rawLabel] || 0) + 1;
		entry.total += amount;
	}

	function finishGroupedMap(map) {
		const result = {};
		for (const entry of Object.values(map)) {
			let bestLabel = "";
			let bestCount = 0;
			for (const [label, count] of Object.entries(entry.counts)) {
				if (count > bestCount) {
					bestCount = count;
					bestLabel = label;
				}
			}
			result[bestLabel] = entry.total;
		}
		return result;
	}

	const artistCountMap = {};
	const genreCountMap = {};
	const languageCountMap = {};

	for (const song of songsTable) {
		addGroupedEntry(artistCountMap, song.artist);
		addGroupedEntry(genreCountMap, song.genre);
		addGroupedEntry(languageCountMap, song.language);
	}

	const artistTimeMap = {};
	const genreTimeMap = {};
	const languageTimeMap = {};

	const songsById = new Map(songsTable.map(song => [song.song_id, song]));

	for (const timer of timersTable) {
		const matchedSong = songsById.get("tarator-" + timer.song_id);
		if (!matchedSong || !timer.start_time || !timer.end_time) continue;
		const listenDuration = Math.max(0, timer.end_time - timer.start_time);

		addGroupedEntry(artistTimeMap, matchedSong.artist, listenDuration);
		addGroupedEntry(genreTimeMap, matchedSong.genre, listenDuration);
		addGroupedEntry(languageTimeMap, matchedSong.language, listenDuration);
	}

	const finishedArtistCount = finishGroupedMap(artistCountMap);
	const finishedGenreCount = finishGroupedMap(genreCountMap);
	const finishedLanguageCount = finishGroupedMap(languageCountMap);
	const finishedArtistTime = finishGroupedMap(artistTimeMap);
	const finishedGenreTime = finishGroupedMap(genreTimeMap);
	const finishedLanguageTime = finishGroupedMap(languageTimeMap);

	pieChartCategories = {
		artist: [...new Set([...Object.keys(finishedArtistCount), ...Object.keys(finishedArtistTime)])],
		genre: [...new Set([...Object.keys(finishedGenreCount), ...Object.keys(finishedGenreTime)])],
		language: [...new Set([...Object.keys(finishedLanguageCount), ...Object.keys(finishedLanguageTime)])],
	};

	pieChartDefinitions = [
		{ id: "artistPieChart", box: canvasBoxes[0], title: "Favorite Artists (Song Amount)", dataMap: finishedArtistCount, type: "artist" },
		{ id: "genrePieChart", box: canvasBoxes[1], title: "Favorite Genres (Song Amount)", dataMap: finishedGenreCount, type: "genre" },
		{ id: "languagePieChart", box: canvasBoxes[2], title: "Favorite Languages (Song Amount)", dataMap: finishedLanguageCount, type: "language" },
		{ id: "artistTimePieChart", box: canvasBoxes[3], title: "Favorite Artists (Seconds Listened)", dataMap: finishedArtistTime, type: "artist" },
		{ id: "genreTimePieChart", box: canvasBoxes[4], title: "Favorite Genres (Seconds Listened)", dataMap: finishedGenreTime, type: "genre" },
		{ id: "languageTimePieChart", box: canvasBoxes[5], title: "Favorite Languages (Seconds Listened)", dataMap: finishedLanguageTime, type: "language" },
	];

	buildAllPieCharts();
}

function buildChart(canvasId, dataMap, type, topLabelsCount = 5) {
	const labels = Object.keys(dataMap);
	const dataValues = Object.values(dataMap);

	const sortedItems = labels
		.map((label, index) => ({ label, value: dataValues[index] }))
		.sort((a, b) => b.value - a.value)
		.slice(0, topLabelsCount);

	const topLabels = sortedItems.map(item => item.label);

	const colors = labels.map(label => getCustomPieChartColor(type, label) || colorFromName(label));

	return new Chart(document.getElementById(canvasId).getContext("2d"), {
		type: "pie",
		data: {
			labels: labels,
			datasets: [
				{
					data: dataValues,
					backgroundColor: colors,
				},
			],
		},
		options: {
			plugins: {
				legend: {
					display: true,
					labels: {
						color: "white",
						filter: legendItem => topLabels.includes(legendItem.text),
					},
				},
				tooltip: {
					callbacks: {
						label: function (context) {
							const value = context.raw;
							const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
							const percentage = ((value / total) * 100).toFixed(2);
							return `${value} (${percentage}%)`;
						},
					},
				},
			},
		},
	});
}

function buildAllPieCharts() {
	pieChartInstances.forEach(instance => {
		try {
			instance.destroy();
		} catch {}
	});
	pieChartInstances = [];
	for (const chartDef of pieChartDefinitions) {
		chartDef.box.innerHTML = "";
		const canvasElement = document.createElement("canvas");
		canvasElement.id = chartDef.id;
		canvasElement.className = "pieChart";
		chartDef.box.appendChild(canvasElement);

		const chartDescription = document.createElement("p");
		chartDescription.innerHTML = chartDef.title;
		chartDef.box.appendChild(chartDescription);

		pieChartInstances.push(buildChart(chartDef.id, chartDef.dataMap, chartDef.type));
	}
}

async function daysHeatMap() {
	const title = document.createElement("h1");
	title.id = "daysHeatMapTitle";
	title.innerHTML = "Listening Activity by day and hour";
	statisticsContent.appendChild(title);

	const days = Array.from({ length: 7 }, () => Array(24).fill(0));
	const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

	for (const row of timersTable) {
		const duration = row.end_time - row.start_time;
		const date = new Date(row.start_time * 1000);
		const day = (date.getDay() + 6) % 7;
		const hour = date.getHours();
		days[day][hour] += duration;
		counts[day][hour] += 1;
	}

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

	const globalMax = Math.max(...days.flat()) * 1.1 || 1;

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
			data: days[i],
			borderColor: "red",
			backgroundColor: "rgba(255,0,0,0.3)",
			fill: "origin",
			tension: 0.4,
		});

		new Chart(activityChart, config);
	}
}

async function generalStatistics() {
	const statsTitle = document.createElement("h1");
	statsTitle.id = "generalStatisticsTitle";
	statsTitle.innerHTML = "General Statistics";
	statisticsContent.appendChild(statsTitle);

	const row = await callSqlite({
		db: "settings",
		query: "SELECT * FROM statistics",
		args: [],
		fetch: true,
	});

	const statisticsRow = row[0];

	const leastListenRowRes = await callSqlite({
		db: "musics",
		query: `
            SELECT *
            FROM timers
            ORDER BY start_time ASC
            LIMIT 1
        `,
		fetch: true,
	});

	const leastListenRow = leastListenRowRes[0];

	const countsRes = await callSqlite({
		db: "musics",
		query: `
            SELECT 
                COUNT(CASE WHEN playlist IS NULL THEN 1 END) AS null_count,
                COUNT(CASE WHEN playlist IS NOT NULL THEN 1 END) AS not_null_count
            FROM timers
        `,
		fetch: true,
	});

	const counts = countsRes[0];

	let totalvalue, totalunit, sessionvalue, sessionunit;
	let totalTimeSpent = statisticsRow.total_time_spent;

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
	theBigText.innerHTML += `Using TaratorMusic since: ${formatUnixTime(statisticsRow.app_install_date)}<br>`;
	theBigText.innerHTML += `First song listened at: ${formatUnixTime(leastListenRow.start_time) || "Never"}<br>`;
	theBigText.innerHTML += `Amount of playlists formed: ${statisticsRow.playlists_formed || 0}<br>`;
	theBigText.innerHTML += `Total amount of songs listened: ${counts.null_count + counts.not_null_count || 0}<br>`;
	theBigText.innerHTML += `Amount of songs listened inside playlists: ${counts.not_null_count || 0}<br>`;
	theBigText.innerHTML += `Amount of songs listened outside playlists: ${counts.null_count || 0}<br>`;
	theBigText.innerHTML += `Total amount of songs downloaded: ${statisticsRow.songs_downloaded_youtube + statisticsRow.songs_downloaded_spotify || 0}<br>`;
	theBigText.innerHTML += `Amount of songs downloaded from Youtube: ${statisticsRow.songs_downloaded_youtube || 0}<br>`;
	theBigText.innerHTML += `Amount of songs downloaded from Spotify: ${statisticsRow.songs_downloaded_spotify || 0}<br>`;
}

let statsPage = 1;
let statsPageSize = 10;
let statsDisplayMode = "page";
let statsTotalPages = 1;
let statsVisibleColumns = new Set();
const statsDefaultVisibleColumns = ["song_id", "song_name", "song_length", "listenAmount", "listenLength", "listenPercentage"];

const statsTableColumns = {
	song_id: "ID",
	song_name: "Song Name",
	song_length: "Length",
	listenAmount: "Times Listened",
	listenLength: "Total Time",
	listenPercentage: "Listen %",
	artist: "Artist",
	genre: "Genre",
	language: "Language",
};

const statsSortColumns = {
	song_id: "s.song_id",
	song_name: "s.song_name",
	song_length: "s.song_length",
	listenAmount: "listen_amount",
	listenLength: "listen_length",
	listenPercentage: "listen_percentage",
	artist: "s.artist",
	genre: "s.genre",
	language: "s.language",
};

const statsTableSelect = `
	SELECT
		s.song_id,
		s.song_name,
		s.song_length,
		s.artist,
		s.genre,
		s.language,
		COUNT(t.song_id) AS listen_amount,
		COALESCE(SUM(t.end_time - t.start_time), 0) AS listen_length,
		CASE
			WHEN COUNT(t.song_id) = 0 OR s.song_length IS NULL OR s.song_length = 0 THEN 0
			ELSE CAST(ROUND((COALESCE(SUM(t.end_time - t.start_time), 0) * 100.0) / (COUNT(t.song_id) * s.song_length)) AS INTEGER)
		END AS listen_percentage
	FROM songs s
	LEFT JOIN timers t ON t.song_id = REPLACE(s.song_id, 'tarator-', '')
	GROUP BY s.song_id
`;

function mapStatsTableRows(rows) {
	return rows.map(row => ({
		song_id: row.song_id,
		song_name: row.song_name,
		song_length: row.song_length,
		listenAmount: row.listen_amount,
		listenLength: row.listen_length,
		listenPercentage: row.listen_percentage,
		artist: row.artist,
		genre: row.genre,
		language: row.language,
	}));
}

async function fetchStatsTableRows(sortKey, sortDir) {
	const orderBy = sortKey ? `ORDER BY ${statsSortColumns[sortKey]} ${sortDir == "asc" ? "ASC" : "DESC"}` : "ORDER BY s.song_id ASC";

	if (statsDisplayMode == "scroll") {
		const rows = await callSqlite({ db: "musics", query: `${statsTableSelect} ${orderBy}`, fetch: true });
		return mapStatsTableRows(rows);
	}

	const offset = (statsPage - 1) * statsPageSize;
	const rows = await callSqlite({
		db: "musics",
		query: `${statsTableSelect} ${orderBy} LIMIT ? OFFSET ?`,
		args: [statsPageSize, offset],
		fetch: true,
	});
	return mapStatsTableRows(rows);
}

async function loadStatsColumnPrefs() {
	try {
		const settingsRows = await callSqlite({
			db: "settings",
			query: "SELECT * FROM settings LIMIT 1",
			fetch: true,
		});
		const saved = settingsRows[0]?.statsTableColumns;
		if (saved) {
			const parsed = JSON.parse(saved);
			if (Array.isArray(parsed)) {
				const valid = parsed.filter(key => key in statsTableColumns);
				if (valid.length) {
					statsVisibleColumns = new Set(valid);
					return;
				}
			}
		}
	} catch {}
	statsVisibleColumns = new Set(statsDefaultVisibleColumns);
}

function saveStatsColumnPrefs() {
	callSqlite({
		db: "settings",
		query: "UPDATE settings SET statsTableColumns = ?",
		args: [JSON.stringify(Array.from(statsVisibleColumns))],
		fetch: false,
	});
}

function applyStatsColumnVisibility() {
	document.querySelectorAll("#htmlTable [data-column]").forEach(el => {
		el.classList.toggle("stats-hidden", !statsVisibleColumns.has(el.dataset.column));
	});
}

async function loadPieChartColorPrefs() {
	try {
		const settingsRows = await callSqlite({
			db: "settings",
			query: "SELECT * FROM settings LIMIT 1",
			fetch: true,
		});
		const saved = settingsRows[0]?.pieChartColors;
		if (saved) {
			const parsed = JSON.parse(saved);
			if (parsed && typeof parsed == "object") {
				const result = {};
				for (const type of ["artist", "genre", "language"]) {
					const typeColors = parsed[type];
					if (!typeColors || typeof typeColors != "object") continue;
					result[type] = {};
					for (const [key, color] of Object.entries(typeColors)) {
						if (typeof color == "string" && /^#[0-9a-f]{6}$/i.test(color)) {
							result[type][normalizeText(key)] = color.toLowerCase();
						}
					}
				}
				pieChartColors = result;
				return;
			}
		}
	} catch {}
	pieChartColors = {};
}

function savePieChartColorPrefs() {
	callSqlite({
		db: "settings",
		query: "UPDATE settings SET pieChartColors = ?",
		args: [JSON.stringify(pieChartColors)],
		fetch: false,
	});
}

function getCustomPieChartColor(type, label) {
	if (!type) return null;
	const typeColors = pieChartColors[type];
	if (!typeColors) return null;
	return typeColors[normalizeText(label)] || null;
}

function displayLabelForType(type, normalizedKey) {
	const found = (pieChartCategories[type] || []).find(cat => normalizeText(cat) == normalizedKey);
	return found || normalizedKey;
}

function openPieChartSettingsModal() {
	const overlay = document.createElement("div");
	overlay.className = "confirm-modal-overlay";
	overlay.id = "pieChartSettingsModal";

	const modal = document.createElement("div");
	modal.className = "confirm-modal pie-chart-settings-modal";

	const title = document.createElement("h3");
	title.style.margin = "0 0 12px 0";
	title.textContent = "Pie Chart Settings";
	modal.appendChild(title);

	const typeSelect = document.createElement("select");
	typeSelect.style.cssText = "width:100%;height:34px;font-size:14px;border:none;text-align:center;background-color:#000;color:white;cursor:pointer;margin-bottom:10px;border-radius:5px;";
	[["artist", "Artist"], ["genre", "Genre"], ["language", "Language"]].forEach(([value, text]) => {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = text;
		typeSelect.appendChild(opt);
	});
	modal.appendChild(typeSelect);

	const searchInput = document.createElement("input");
	searchInput.placeholder = "Search categories...";
	searchInput.style.cssText = "width:100%;box-sizing:border-box;height:34px;font-size:14px;border:none;text-align:center;background-color:#000;color:white;border-radius:5px;margin-bottom:10px;outline:none;";
	modal.appendChild(searchInput);

	const resultsList = document.createElement("div");
	resultsList.className = "pieChartColorResults";
	modal.appendChild(resultsList);

	const savedTitle = document.createElement("h4");
	savedTitle.textContent = "Saved colors";
	savedTitle.style.cssText = "margin:16px 0 6px 0;font-size:14px;";
	modal.appendChild(savedTitle);

	const savedList = document.createElement("div");
	savedList.className = "pieChartColorResults";
	modal.appendChild(savedList);

	function buildColorRow(type, label) {
		const key = normalizeText(label);
		const row = document.createElement("div");
		row.className = "pieChartColorRow";

		const swatch = document.createElement("div");
		swatch.className = "pieChartColorSwatch";
		swatch.style.background = getCustomPieChartColor(type, label) || colorFromName(label);

		const text = document.createElement("span");
		text.textContent = label;
		text.style.cssText = "flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;";

		const colorInput = document.createElement("input");
		colorInput.type = "color";
		colorInput.value = getCustomPieChartColor(type, label) || "#ffffff";
		colorInput.className = "pieChartColorInput";
		colorInput.addEventListener("input", () => {
			if (!pieChartColors[type]) pieChartColors[type] = {};
			pieChartColors[type][key] = colorInput.value.toLowerCase();
			savePieChartColorPrefs();
			swatch.style.background = colorInput.value;
			buildAllPieCharts();
		});
		colorInput.addEventListener("change", () => {
			updateResults();
			updateSavedList();
		});

		const clearBtn = document.createElement("button");
		clearBtn.textContent = "✕";
		clearBtn.className = "pieChartColorClear";
		clearBtn.style.display = getCustomPieChartColor(type, label) ? "flex" : "none";
		clearBtn.addEventListener("click", () => {
			if (pieChartColors[type]) delete pieChartColors[type][key];
			if (pieChartColors[type] && !Object.keys(pieChartColors[type]).length) delete pieChartColors[type];
			savePieChartColorPrefs();
			swatch.style.background = colorFromName(label);
			clearBtn.style.display = "none";
			buildAllPieCharts();
			updateResults();
			updateSavedList();
		});

		row.appendChild(swatch);
		row.appendChild(text);
		row.appendChild(colorInput);
		row.appendChild(clearBtn);
		return row;
	}

	function emptyMessage(text) {
		const p = document.createElement("p");
		p.style.cssText = "color:#999;margin:6px 0;text-align:center;font-size:13px;";
		p.textContent = text;
		return p;
	}

	function updateResults() {
		resultsList.innerHTML = "";
		const type = typeSelect.value;
		const query = normalizeText(searchInput.value);
		let matches = (pieChartCategories[type] || []).filter(cat => normalizeText(cat).includes(query));
		matches.sort((a, b) => {
			const aHas = getCustomPieChartColor(type, a) ? 0 : 1;
			const bHas = getCustomPieChartColor(type, b) ? 0 : 1;
			return aHas - bHas;
		});
		matches = matches.slice(0, 30);
		if (!matches.length) {
			resultsList.appendChild(emptyMessage("No matching categories"));
			return;
		}
		matches.forEach(label => resultsList.appendChild(buildColorRow(type, label)));
	}

	function updateSavedList() {
		savedList.innerHTML = "";
		const type = typeSelect.value;
		const entries = pieChartColors[type] ? Object.entries(pieChartColors[type]) : [];
		entries.sort((a, b) => a[0].localeCompare(b[0]));
		if (!entries.length) {
			savedList.appendChild(emptyMessage("No custom colors saved yet"));
			return;
		}
		entries.forEach(([key]) => {
			savedList.appendChild(buildColorRow(type, displayLabelForType(type, key)));
		});
	}

	searchInput.addEventListener("input", updateResults);
	typeSelect.addEventListener("change", () => {
		searchInput.value = "";
		updateResults();
		updateSavedList();
	});

	updateResults();
	updateSavedList();

	const closeBtn = document.createElement("button");
	closeBtn.textContent = "Close";
	closeBtn.style.cssText = "margin-top:16px;width:100%;padding:10px 0;border:none;border-radius:6px;background:#424242;color:#fff;cursor:pointer;";
	closeBtn.onclick = () => overlay.remove();
	modal.appendChild(closeBtn);

	overlay.appendChild(modal);
	overlay.addEventListener("click", event => {
		if (event.target == overlay) overlay.remove();
	});
	document.body.appendChild(overlay);
}

function openStatsColumnsModal() {
	const overlay = document.createElement("div");
	overlay.className = "confirm-modal-overlay";
	overlay.id = "statsColumnsModal";

	const modal = document.createElement("div");
	modal.className = "confirm-modal stats-columns-modal";

	const title = document.createElement("h3");
	title.style.margin = "0 0 12px 0";
	title.textContent = "Visible Columns";
	modal.appendChild(title);

	Object.keys(statsTableColumns).forEach(key => {
		const label = document.createElement("label");
		label.style.cssText = "display:flex;align-items:center;gap:8px;justify-content:flex-start;cursor:pointer;margin:6px 0;";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = statsVisibleColumns.has(key);
		checkbox.addEventListener("change", () => {
			if (checkbox.checked) statsVisibleColumns.add(key);
			else statsVisibleColumns.delete(key);
			saveStatsColumnPrefs();
			applyStatsColumnVisibility();
		});

		const text = document.createElement("span");
		text.textContent = statsTableColumns[key];

		label.appendChild(checkbox);
		label.appendChild(text);
		modal.appendChild(label);
	});

	const closeBtn = document.createElement("button");
	closeBtn.textContent = "Close";
	closeBtn.style.cssText = "margin-top:16px;width:100%;padding:10px 0;border:none;border-radius:6px;background:#424242;color:#fff;cursor:pointer;";
	closeBtn.onclick = () => overlay.remove();
	modal.appendChild(closeBtn);

	overlay.appendChild(modal);
	overlay.addEventListener("click", event => {
		if (event.target == overlay) overlay.remove();
	});
	document.body.appendChild(overlay);
}

function buildStatsTableShell() {
	const container = document.createElement("div");
	container.id = "htmlTable";

	const controlsRow = document.createElement("div");
	controlsRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";

	const pageModeSelect = document.createElement("select");
	pageModeSelect.id = "statsPageModeSelect";
	pageModeSelect.style.cssText = "width:11vw;height:3.5vh;font-size:2.2vh;border:none;text-align:center;background-color:rgba(0,0,0,0.8);color:white;cursor:pointer;";
	["page", "scroll"].forEach(mode => {
		const opt = document.createElement("option");
		opt.value = mode;
		opt.textContent = mode == "page" ? "Page Mode" : "Scroll Mode";
		if (mode == statsDisplayMode) opt.selected = true;
		pageModeSelect.appendChild(opt);
	});
	pageModeSelect.onchange = () => {
		statsDisplayMode = pageModeSelect.value;
		statsPage = 1;
		htmlTableStats();
	};

	const leftBtn = document.createElement("button");
	leftBtn.className = "pageScrollButtons";
	leftBtn.textContent = "<";
	leftBtn.id = "statsLeftPageButton";
	leftBtn.style.cssText = "border-top-left-radius:5px;border-bottom-left-radius:5px;";
	leftBtn.onclick = () => {
		if (statsPage > 1) {
			statsPage--;
			htmlTableStats();
		}
	};

	const pagePicker = document.createElement("select");
	pagePicker.id = "statsPagePicker";
	pagePicker.style.cssText = "width:7vw;height:3.5vh;font-size:2.2vh;border:none;text-align:center;background-color:rgba(0,0,0,0.8);color:white;cursor:pointer;";
	pagePicker.onchange = () => {
		statsPage = parseInt(pagePicker.value);
		htmlTableStats();
	};

	const rightBtn = document.createElement("button");
	rightBtn.className = "pageScrollButtons";
	rightBtn.textContent = ">";
	rightBtn.id = "statsRightPageButton";
	rightBtn.style.cssText = "border-top-right-radius:5px;border-bottom-right-radius:5px;";
	rightBtn.onclick = () => {
		if (statsPage < statsTotalPages) {
			statsPage++;
			htmlTableStats();
		}
	};

	const columnsBtn = document.createElement("button");
	columnsBtn.id = "statsColumnsButton";
	columnsBtn.className = "statsColumnsButton";
	columnsBtn.textContent = "Columns";
	columnsBtn.onclick = () => openStatsColumnsModal();

	controlsRow.appendChild(pageModeSelect);
	controlsRow.appendChild(columnsBtn);
	controlsRow.appendChild(leftBtn);
	controlsRow.appendChild(pagePicker);
	controlsRow.appendChild(rightBtn);
	container.appendChild(controlsRow);

	const tableWrapper = document.createElement("div");
	tableWrapper.className = "stats-table-wrapper";

	const table = document.createElement("table");
	const thead = document.createElement("thead");
	const headerRow = document.createElement("tr");

	Object.keys(statsTableColumns).forEach(key => {
		const th = document.createElement("th");
		th.dataset.column = key;
		th.style.cursor = "pointer";
		th.style.userSelect = "none";
		th.style.position = "relative";

		const textSpan = document.createElement("span");
		textSpan.textContent = statsTableColumns[key];

		const arrowSpan = document.createElement("span");
		arrowSpan.className = "statsSortArrow";
		arrowSpan.dataset.key = key;
		arrowSpan.style.position = "absolute";
		arrowSpan.style.right = "5px";
		arrowSpan.style.fontSize = "0.8em";

		th.appendChild(textSpan);
		th.appendChild(arrowSpan);

		th.onclick = () => {
			Object.keys(sortOrder).forEach(k => {
				if (k != key) delete sortOrder[k];
			});
			const order = sortOrder[key] == "asc" ? "desc" : sortOrder[key] == "desc" ? "asc" : "desc";
			sortOrder[key] = order;
			htmlTableStats();
		};

		headerRow.appendChild(th);
	});

	thead.appendChild(headerRow);
	table.appendChild(thead);
	table.appendChild(document.createElement("tbody"));
	tableWrapper.appendChild(table);
	container.appendChild(tableWrapper);
	statisticsContent.appendChild(container);
}

async function htmlTableStats() {
	let container = document.getElementById("htmlTable");
	if (!container) buildStatsTableShell();
	container = document.getElementById("htmlTable");

	const thead = container.querySelector("thead");
	const tbody = container.querySelector("tbody");
	const pagePicker = document.getElementById("statsPagePicker");
	const leftBtn = document.getElementById("statsLeftPageButton");
	const rightBtn = document.getElementById("statsRightPageButton");

	const countRes = await callSqlite({
		db: "musics",
		query: "SELECT COUNT(*) AS total FROM songs",
		fetch: true,
	});
	const totalPages = Math.max(Math.ceil((countRes[0]?.total || 0) / statsPageSize), 1);
	statsTotalPages = totalPages;
	if (statsPage > totalPages) statsPage = totalPages;
	if (statsPage < 1) statsPage = 1;

	const sortEntries = Object.entries(sortOrder);
	const sortKey = sortEntries[0]?.[0] || null;
	const sortDir = sortEntries[0]?.[1] || null;

	const rows = await fetchStatsTableRows(sortKey, sortDir);

	thead.querySelectorAll(".statsSortArrow").forEach(arrowSpan => {
		const key = arrowSpan.dataset.key;
		arrowSpan.textContent = sortOrder[key] == "asc" ? "▲" : sortOrder[key] == "desc" ? "▼" : "";
	});

	tbody.innerHTML = "";
	rows.forEach(row => {
		const tr = document.createElement("tr");
		Object.keys(statsTableColumns).forEach(key => {
			const td = document.createElement("td");
			td.dataset.column = key;
			td.textContent = key == "listenPercentage" ? `${row.listenPercentage}%` : (row[key] ?? "");
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	});
	applyStatsColumnVisibility();

	pagePicker.innerHTML = "";
	for (let i = 1; i <= totalPages; i++) {
		const opt = document.createElement("option");
		opt.value = i;
		opt.textContent = `Page ${i}`;
		if (i == statsPage) opt.selected = true;
		pagePicker.appendChild(opt);
	}
	pagePicker.style.display = statsDisplayMode == "scroll" || totalPages <= 1 ? "none" : "";
	leftBtn.disabled = statsPage <= 1 || statsDisplayMode == "scroll";
	rightBtn.disabled = statsPage >= totalPages || statsDisplayMode == "scroll";
}

function findListenPercentage(songId) {
	try {
		const longId = `tarator-${songId}`;
		const songsTableMap = songsTable.reduce((songMap, songRecord) => {
			songMap[songRecord.song_id] = songRecord.song_length;
			return songMap;
		}, {});

		const timersTableMap = timersTable.reduce((timerMap, timerRecord) => {
			if (!timerMap[timerRecord.song_id]) {
				timerMap[timerRecord.song_id] = { playCount: 0, totalDuration: 0 };
			}
			timerMap[timerRecord.song_id].playCount++;
			timerMap[timerRecord.song_id].totalDuration += timerRecord.end_time - timerRecord.start_time;
			return timerMap;
		}, {});

		const songLength = songsTableMap[longId];
		const timerStats = timersTableMap[songId] || { playCount: 0, totalDuration: 0 };
		const totalSongLength = timerStats.playCount * songLength;

		if (!songLength || totalSongLength == 0) return 0;
		return ((timerStats.totalDuration / totalSongLength) * 100).toFixed(0);
	} catch {
		return 0;
	}
}
