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
		overlay.innerHTML = `
            <div class="confirm-modal">
                <p>${description}</p>
                <div class="confirm-modal-actions">
                    <button id="confirmModalPrimary">${button1}</button>
                    <button id="confirmModalSecondary">${button2}</button>
                </div>
            </div>`;
		document.body.appendChild(overlay);

		function cleanup(result) {
			overlay.remove();
			resolve(result);
		}

		overlay.querySelector("#confirmModalPrimary").addEventListener("click", () => cleanup(true));
		overlay.querySelector("#confirmModalSecondary").addEventListener("click", () => cleanup(false));
	});
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

function loadJSFile(filename) {
	if (filename === "download_music") {
		document.getElementById("downloadModal").style.display = "block";
	}

	const src = `${filename}.js`;

	if (Array.from(document.scripts).find(script => script.src.includes(src))) {
		return;
	}

	const script = document.createElement("script");
	script.src = src;
	document.body.appendChild(script);
}
