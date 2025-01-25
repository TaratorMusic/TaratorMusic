// index.js

const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const { autoUpdater } = require('electron-updater');
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
	Menu.setApplicationMenu(null); // ( removes the bar at the top )
	app.setName("TaratorMusic");
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});

	autoUpdater.on("update-available", () => {
		mainWindow.webContents.send("update_available");
	});

	autoUpdater.on("update-not-available", () => {
		mainWindow.webContents.send("update_not_available");
	});

	autoUpdater.on("download-progress", (progressObj) => {
		mainWindow.webContents.send("download_progress", progressObj);
	});

	autoUpdater.on("update-downloaded", () => {
		mainWindow.webContents.send("update_downloaded");
	});

	autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on("check_for_updates", () => {
	autoUpdater.checkForUpdates();
});

ipcMain.on("quit_and_install", () => {
	autoUpdater.quitAndInstall();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
