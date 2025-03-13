// index.js

const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const { updateElectronApp } = require("update-electron-app");
const path = require("path");
const taratorFolder = __dirname;

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1600,
		height: 850,
		title: "TaratorMusic",
		icon: path.join(taratorFolder, "thumbnails/tarator16_icon.png"),
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			additionalArguments: ["Content-Security-Policy", "script-src 'self'"],
		},
	});

	mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
	Menu.setApplicationMenu(null);
	app.setName("TaratorMusic");
	createWindow();
	updateElectronApp();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
