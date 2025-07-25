function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	seconds = Math.floor(seconds % 60);
	const minutesDisplay = minutes < 10 ? `0${minutes}` : `${minutes}`;
	const secondsDisplay = seconds < 10 ? `0${seconds}` : `${seconds}`;
	return `${minutesDisplay}:${secondsDisplay}`;
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
		await loadJSFile("download_music");
		document.getElementById("downloadModal").style.display = "block";
	}
}
