// index.js

const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1600,
		height: 850,
		title: "TaratorMusic",
		icon: path.join(__dirname, "thumbnails/tarator16_icon.png"),
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			additionalArguments: ["Content-Security-Policy", "script-src 'self'"],
		},
	});

	mainWindow.loadFile("index.html");
}

async function checkForUpdates() {
	const response = await fetch(`https://api.github.com/repos/Victiniiiii/TaratorMusic/git/trees/if-no-NSIS?recursive=1`);
	const files = (await response.json()).tree.filter((f) => f.type === "blob");
	let updated = false;

	for (const file of files) {
		const fileUrl = `https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/if-no-NSIS/${file.path}`;
		const localFilePath = path.join(app.getAppPath(), file.path);

		const res = await fetch(fileUrl);
		if (res.ok) {
			const fileContent = (await res.text()).replace(/\r\n/g, "\n").trim();
			const fileExists = fs.existsSync(localFilePath);
			const localContent = fileExists ? fs.readFileSync(localFilePath, "utf-8").replace(/\r\n/g, "\n").trim() : "";

			if ((fileExists && localContent !== fileContent) || !fileExists) {
				const result = dialog.showMessageBoxSync({
					type: "info",
					buttons: ["Later", "Update"],
					message: `Update ${file.path}?`,
				});

				if (result === 1) {
					fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
					fs.writeFileSync(localFilePath, fileContent);
					updated = true;
				}
			}
		}
	}

	if (!updated) {
		alert("No new updates");
	}
}

ipcMain.handle("check-for-updates", checkForUpdates);

app.whenReady().then(() => {
	/* Menu.setApplicationMenu(null); */
	app.setName("TaratorMusic");
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
