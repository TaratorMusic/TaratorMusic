const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");

if (process.env.APPIMAGE) {
	const fs = require("fs");

	const appDir = path.dirname(process.env.APPIMAGE);
	const binFolder = path.join(appDir, "bin");
	if (!fs.existsSync(binFolder)) fs.mkdirSync(binFolder, { recursive: true });

	const backendBinaries = ["check_dupe_songs", "create_app_thumbnails_folder", "dc_rich_presence", "musicbrainz_fetch", "shorten_song_ids", "startup_check"];

	backendBinaries.forEach(bin => {
		const targetPath = path.join(binFolder, bin);
		if (!fs.existsSync(targetPath)) {
			const sourceBinary = path.join(__dirname, "backend", bin);
			if (!fs.existsSync(sourceBinary)) {
				throw new Error(`Go binary not found in AppImage at ${sourceBinary}`);
			}
			fs.copyFileSync(sourceBinary, targetPath);
			fs.chmodSync(targetPath, 0o755);
		}
	});
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
		closable: true,
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

	ipcMain.handle("get-app-version", () => app.getVersion());

	ipcMain.handle("get-app-base-path", () => {
		if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
		return app.getAppPath();
	});

	ipcMain.on("renderer-domready", e => {
		if (e.sender.id !== mainWindow.webContents.id) return;
		if (splash && !splash.isDestroyed()) splash.destroy();
		if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
	});

	mainWindow.on("close", async e => {
		e.preventDefault();
		const saved = await new Promise(resolve => {
			mainWindow.webContents.send("save-progress");
			ipcMain.once("save-complete", () => resolve(true));
			setTimeout(() => resolve(false), 5000);
		});
		if (saved) {
			mainWindow.destroy();
			if (process.platform !== "darwin") app.quit();
		}
	});
}

app.whenReady().then(() => {
	app.setName("TaratorMusic");

	let menuShown = true;
	const originalMenu = Menu.getApplicationMenu();
	if (app.isPackaged) {
		Menu.setApplicationMenu(null);
		menuShown = false;
	}

	createWindow();

	autoUpdater.on("update-available", info => {
		mainWindow.webContents.send("update-available", info.releaseNotes);
	});

	ipcMain.on("download-update", () => {
		autoUpdater.downloadUpdate();
	});

	ipcMain.on("debug-mode", () => {
		if (menuShown) {
			Menu.setApplicationMenu(null);
			menuShown = false;
		} else {
			Menu.setApplicationMenu(originalMenu);
			menuShown = true;
		}
	});

	autoUpdater.on("update-downloaded", () => {
		autoUpdater.quitAndInstall();
	});

	autoUpdater.on("download-progress", progress => {
		mainWindow.webContents.send("download-progress", progress.percent);
	});

	autoUpdater.checkForUpdates();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length == 0) createWindow();
	});
});
