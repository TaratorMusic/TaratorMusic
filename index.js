const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

if (process.env.APPIMAGE) {
	const libPath = path.join(process.resourcesPath, "lib");
	process.env.LD_LIBRARY_PATH = libPath + ":" + (process.env.LD_LIBRARY_PATH || "");
}

app.commandLine.appendSwitch("disk-cache-dir", path.join(__dirname, "cache"));
app.setPath("cache", path.join(__dirname, "cache"));

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1600,
		height: 850,
		title: "TaratorMusic",
		icon: path.join(__dirname, "app_thumbnails/tarator16_icon.png"),
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			additionalArguments: ["Content-Security-Policy", "script-src 'self'"],
		},
	});

	mainWindow.loadFile("index.html");

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
	app.isPackaged && Menu.setApplicationMenu(null);
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
