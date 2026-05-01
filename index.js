const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;
const appDir = isDev ? app.getAppPath() : app.getPath("userData");
const processDir = isDev ? app.getAppPath() : process.resourcesPath;

app.setName("TaratorMusic");
app.commandLine.appendSwitch("disk-cache-dir", path.join(appDir, "cache"));
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-features", "Win32kLockdown");
app.setPath("cache", path.join(appDir, "cache"));

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let mainWindow;
let miniPlayer;

function createWindow() {
	const splash = new BrowserWindow({
		width: 1600,
		height: 850,
		title: "TaratorMusic",
		icon: path.join(processDir, "assets/tarator16_icon.png"),
		frame: false,
		closable: true,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
	});

	splash.loadFile("renderer/splash.html");

	ipcMain.on("renderer-domready", e => {
		if (e.sender.id != mainWindow.webContents.id) return;
		if (splash && !splash.isDestroyed()) splash.destroy();
		if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
	});

	mainWindow = new BrowserWindow({
		width: 1600,
		height: 850,
		title: "TaratorMusic",
		icon: path.join(processDir, "assets/tarator16_icon.png"),
		show: false,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			additionalArguments: ["Content-Security-Policy", "script-src 'self'"],
		},
	});

	mainWindow.on("close", e => {
		e.preventDefault();
		mainWindow.webContents.send("save-progress");
		const timeout = setTimeout(() => {
			mainWindow.destroy();
			if (process.platform != "darwin") app.quit();
		}, 2000);
		ipcMain.once("save-complete", () => {
			clearTimeout(timeout);
			mainWindow.destroy();
			if (process.platform != "darwin") app.quit();
		});
	});

	mainWindow.loadFile("renderer/index.html");
	mainWindow.show();
}

function createMiniPlayer() {
	if (miniPlayer && !miniPlayer.isDestroyed()) {
		miniPlayer.focus();
		return;
	}

	miniPlayer = new BrowserWindow({
		width: 320,
		height: 244,
		title: "TaratorMusic PiP",
		icon: path.join(processDir, "assets/tarator16_icon.png"),
		resizable: true,
		frame: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		transparent: false,
		movable: true,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
		},
	});

	miniPlayer.loadFile("renderer/miniplayer.html");

	miniPlayer.on("closed", () => {
		miniPlayer = null;
	});
}

app.whenReady().then(() => {
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

	ipcMain.handle("get-app-version", () => app.getVersion());

	ipcMain.handle("get-app-base-path", () => {
		return appDir;
	});

	ipcMain.handle("get-app-process-path", () => {
		return processDir;
	});

	ipcMain.handle("raise-window", () => {
		mainWindow.focus();
		mainWindow.moveTop();
	});

	ipcMain.handle("close-app", () => {
		mainWindow.close();
	});

	ipcMain.on("restart-app", () => {
		app.relaunch();
		app.exit(0);
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

	ipcMain.on("miniplayer-previous", () => mainWindow.webContents.send("player-previous"));
	ipcMain.on("miniplayer-playpause", () => mainWindow.webContents.send("player-playpause"));
	ipcMain.on("miniplayer-next", () => mainWindow.webContents.send("player-next"));
	ipcMain.on("open-miniplayer", () => createMiniPlayer());
	ipcMain.on("miniplayer-close", () => {
		if (miniPlayer) miniPlayer.close();
		mainWindow.webContents.send("close-pip");
	});
	ipcMain.on("miniplayer-minimize", () => {
		if (miniPlayer) miniPlayer.minimize();
	});

	ipcMain.on("renderer-miniplayer-update", (_, data) => {
		if (miniPlayer && !miniPlayer.isDestroyed()) {
			miniPlayer.webContents.send("miniplayer-update", data);
		}
	});
});
