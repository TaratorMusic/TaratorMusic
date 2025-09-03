const {Chart, PieController, ArcElement, Tooltip, Legend} = require("chart.js");
Chart.register(PieController, ArcElement, Tooltip, Legend);

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

    const canvas1 = document.createElement("canvas");
    canvas1.id = "bestGenrePieChart";
    canvas1.className = "pieChart";
    canvasBox1.appendChild(canvas1);

    const canvas1description = document.createElement("div");
    canvas1description.innerHTML = "Favorite Genres (Coming Soon)";
    canvasBox1.appendChild(canvas1description);

    new Chart(canvas1.getContext("2d"), {
        type: "pie",
        data: {
            labels: ["Apples", "Bananas", "Cherries"],
            datasets: [
                {
                    data: [5, 15, 30],
                    backgroundColor: ["red", "yellow", "pink"],
                },
            ],
        },
    });

    const canvas2 = document.createElement("canvas");
    canvas2.id = "bestLanguagePieChart";
    canvas2.className = "pieChart";
    canvasBox2.appendChild(canvas2);

    const canvas2description = document.createElement("div");
    canvas2description.innerHTML = "Favorite Languages (Coming Soon)";
    canvasBox2.appendChild(canvas2description);

    new Chart(canvas2.getContext("2d"), {
        type: "pie",
        data: {
            labels: ["Apples", "Bananas", "Cherries"],
            datasets: [
                {
                    data: [25, 15, 30],
                    backgroundColor: ["green", "black", "purple"],
                },
            ],
        },
    });
}

function daysHeatMap() {}
