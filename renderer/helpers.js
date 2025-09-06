function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	seconds = Math.floor(seconds % 60);
	const minutesDisplay = minutes < 10 ? `0${minutes}` : `${minutes}`;
	const secondsDisplay = seconds < 10 ? `0${seconds}` : `${seconds}`;
	return `${minutesDisplay}:${secondsDisplay}`;
}

function threeWayModal(description, button1 = "Option 1", button2 = "Option 2", button3 = "Option 3", value1 = "option1", value2 = "option2", value3 = "option3") {
	return new Promise(resolve => {
		const overlay = document.createElement("div");
		overlay.className = "confirm-modal-overlay";

		const actions = document.createElement("div");
		actions.className = "confirm-modal-actions";

		const btn1 = document.createElement("button");
		btn1.id = "threeWayModalBtn1";
		btn1.textContent = button1;
		actions.appendChild(btn1);

		const btn2 = document.createElement("button");
		btn2.id = "threeWayModalBtn2";
		btn2.textContent = button2;
		actions.appendChild(btn2);

		const btn3 = document.createElement("button");
		btn3.id = "threeWayModalBtn3";
		btn3.textContent = button3;
		actions.appendChild(btn3);

		const modal = document.createElement("div");
		modal.className = "confirm-modal";
		modal.innerHTML = `<p>${description}</p>`;
		modal.appendChild(actions);

		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		function cleanup(result) {
			overlay.remove();
			resolve(result);
		}

		btn1.addEventListener("click", () => cleanup(value1));
		btn2.addEventListener("click", () => cleanup(value2));
		btn3.addEventListener("click", () => cleanup(value3));
	});
}

function confirmModal(description, button1 = "Confirm", button2 = "Cancel") {
	return new Promise(resolve => {
		const overlay = document.createElement("div");
		overlay.className = "confirm-modal-overlay";

		const actions = document.createElement("div");
		actions.className = "confirm-modal-actions";

		const btn1 = document.createElement("button");
		btn1.id = "confirmModalPrimary";
		btn1.textContent = button1;
		actions.appendChild(btn1);

		if (button2 !== null) {
			const btn2 = document.createElement("button");
			btn2.id = "confirmModalSecondary";
			btn2.textContent = button2;
			actions.appendChild(btn2);
		}

		const modal = document.createElement("div");
		modal.className = "confirm-modal";
		modal.innerHTML = `<p>${description}</p>`;
		modal.appendChild(actions);

		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		function cleanup(result) {
			overlay.remove();
			resolve(result);
		}

		btn1.addEventListener("click", () => cleanup(true));
		if (button2 !== null) {
			overlay.querySelector("#confirmModalSecondary").addEventListener("click", () => cleanup(false));
		}
	});
}

async function alertModal(message) {
	return confirmModal(message, "Okay", null).then(() => {});
}

function findDuplicates(array) {
	const seen = new Set();
	const duplicates = new Set();

	for (const item of array) {
		if (seen.has(item)) {
			duplicates.add(item);
		}
		seen.add(item);
	}

	return Array.from(duplicates);
}

async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadJSFile(filename) {
	return new Promise((resolve, reject) => {
		const src = `${filename}.js`;

		if (Array.from(document.scripts).find(script => script.src.includes(src))) {
			resolve();
			return;
		}

		const script = document.createElement("script");
		script.src = src;
		script.onload = resolve;
		script.onerror = reject;
		document.body.appendChild(script);
	});
}

async function loadNewPage(query, info) {
	if (query == "download") {
		await loadJSFile("download_music");
		checkNameThumbnail(false);
	} else if (query == "statistics") {
		await loadJSFile("statistics");
		if (typeof renderStatistics == "function") renderStatistics(); // "typeof" fixes a console error
	} else if (query.includes("legacy")) {
		await loadJSFile("update_legacy_codes");
		updateFunctions(info);
	} else if (query == "downloadModal") {
		document.getElementById("downloadModal").style.display = "block";
	} else if (query == "createAppThumbnailsFolder") {
		await loadJSFile("run_spawn_processes");
		if (functionName == "createAppThumbnailsFolder") createAppThumbnailsFolder();
	} else if (query == "shortenSongIdsGoPart") {
		await loadJSFile("run_spawn_processes");
		shortenSongIdsGoPart(info);
	}
}

function cleanDownloadModal() {
	document.getElementById("downloadFirstInput").value = "";

	const secondPhase = document.getElementById("downloadSecondPhase");
	if (secondPhase) {
		secondPhase.remove();
	}

	closeModal();
}

function removeExtensions(input) {
	return input.replace(/\.[^/.]+$/, "");
}

function parseTimeToSeconds(timeStr) {
	if (typeof timeStr !== "string") return null;
	const parts = timeStr.split(":").map(Number);
	if (parts.some(isNaN)) return null;

	if (parts.length == 2) {
		return parts[0] * 60 + parts[1];
	} else if (parts.length == 3) {
		return parts[0] * 3600 + parts[1] * 60 + parts[2];
	}
	return null;
}

function generateId() {
	let id;
	do {
		id = `tarator-${Math.random().toString(36).slice(2, 6)}`;
	} while (musicsDb.prepare("SELECT 1 FROM songs WHERE song_id = ?").get(id));
	return id;
}

function closeModal() {
	if (document.getElementById("searchModal").style.display != "none") return (document.getElementById("searchModal").style.display = "none");
	if (document.getElementById("addToPlaylistModal").style.display != "none") return (document.getElementById("addToPlaylistModal").style.display = "none");
	document.querySelectorAll(".modal, .confirm-modal-overlay").forEach(el => {
		el.style.display = "none";
	});
}

const EUhours = ["00:00", "01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];
const UShours = ["12:00 AM", "01:00 AM", "02:00 AM", "03:00 AM", "04:00 AM", "05:00 AM", "06:00 AM", "07:00 AM", "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM", "06:00 PM", "07:00 PM", "08:00 PM", "09:00 PM", "10:00 PM", "11:00 PM"];
const daysoftheweek = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const formatUnixTime = timestamp =>
	new Date(timestamp * 1000).toLocaleString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
