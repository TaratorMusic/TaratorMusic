// preload.js

const { ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
	const replaceText = (selector, text) => {
		const element = document.getElementById(selector);
		if (element) element.innerText = text;
	};
	for (const type of ["chrome", "node", "electron"]) {
		replaceText(`${type}-version`, process.versions[type]);
	}
});

ipcRenderer.on("update-available", (event, releaseNotes) => {
	document.getElementById("patchNotes").innerHTML = releaseNotes;
	document.getElementById("version").classList.add("no-animation");
	document.getElementById("installBtn").disabled = false;
	if (process.platform == "win32" || process.platform == "darwin") {
		document.getElementById("installBtn").innerText = "Go to the latest release page";
	}
});

ipcRenderer.on("download-progress", (event, percent) => {
	const progressBar = document.getElementById("downloadProgress");
	progressBar.style.width = percent + "%";
	progressBar.innerText = Math.floor(percent) + "%";
});

ipcRenderer.on("save-progress", async () => {
	await saveUserProgress();
	ipcRenderer.send("save-complete");
});
