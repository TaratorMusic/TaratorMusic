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

function sleep(ms) {
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

async function openThisModal(modalName) {
	if (modalName == "download") {
		document.getElementById("downloadModal").style.display = "block";
	}
}

async function loadDownloadStuff() {
	await loadJSFile("download_music");
	checkNameThumbnail(false);
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
