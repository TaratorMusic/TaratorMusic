const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

if (process.env.APPIMAGE) {
	const libPath = path.join(process.resourcesPath, "lib");
	process.env.LD_LIBRARY_PATH = libPath + ":" + (process.env.LD_LIBRARY_PATH || "");
}

app.commandLine.appendSwitch("disk-cache-dir", path.join(__dirname, "cache"));
app.setPath("cache", path.join(__dirname, "cache"));

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let mainWindow;

function createWindow() {
	const splash = new BrowserWindow({
		width: 1600,
		height: 850,
		title: "TaratorMusic",
		icon: path.join(__dirname, "assets/tarator16_icon.png"),
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
	});

	splash.loadFile("renderer/splash.html");

	mainWindow = new BrowserWindow({
		width: 1600,
		height: 850,
		title: "TaratorMusic",
		icon: path.join(__dirname, "assets/tarator16_icon.png"),
		show: false,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			additionalArguments: ["Content-Security-Policy", "script-src 'self'"],
		},
	});

	mainWindow.loadFile("renderer/index.html");

	mainWindow.once("ready-to-show", () => {
		splash.destroy();
		mainWindow.show();
	});

	ipcMain.handle("get-app-version", () => app.getVersion());

	ipcMain.handle("get-app-base-path", () => {
		if (process.env.APPIMAGE) {
			return path.dirname(process.env.APPIMAGE);
		}
		return app.getAppPath();
	});
}

app.whenReady().then(() => {
	app.setName("TaratorMusic");
	if (app.isPackaged) Menu.setApplicationMenu(null);
	createWindow();

	autoUpdater.on("update-available", info => {
		mainWindow.webContents.send("update-available", info.releaseNotes);
	});

	ipcMain.on("download-update", () => {
		autoUpdater.downloadUpdate();
	});

	autoUpdater.on("update-downloaded", () => {
		autoUpdater.quitAndInstall();
	});

	autoUpdater.on("download-progress", progress => {
		mainWindow.webContents.send("download-progress", progress.percent);
	});

	autoUpdater.checkForUpdates();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
