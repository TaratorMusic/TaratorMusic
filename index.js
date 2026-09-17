const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;
const appDir = isDev ? app.getAppPath() : app.getPath("userData");
const processDir = isDev ? app.getAppPath() : process.resourcesPath;

app.setName("taratormusic");
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
let pipSettingsState = { pipShowThumbnail: 1, pipShowLyrics: 0 };

function getPipHeight(showThumbnail, showLyrics) {
	if (showLyrics) return showThumbnail ? 732 : 375;
	return showThumbnail ? 244 : 100;
}

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

	splash.loadFile("renderer/splash.html", {
		query: {
			icon: path.join(processDir, "assets/tarator1024_icon.png").replace(/\\/g, "/"),
		},
	});

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

function createMiniPlayer(initialData) {
	if (miniPlayer && !miniPlayer.isDestroyed()) {
		miniPlayer.focus();
		return;
	}

	if (initialData) {
		if (initialData.pipShowThumbnail != undefined) pipSettingsState.pipShowThumbnail = initialData.pipShowThumbnail;
		if (initialData.pipShowLyrics != undefined) pipSettingsState.pipShowLyrics = initialData.pipShowLyrics;
	}

	const pipHeight = getPipHeight(pipSettingsState.pipShowThumbnail == 1, pipSettingsState.pipShowLyrics == 1);

	miniPlayer = new BrowserWindow({
		width: 320,
		height: pipHeight,
		title: "TaratorMusic PiP",
		icon: path.join(processDir, "assets/tarator16_icon.png"),
		resizable: true,
		frame: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		transparent: true,
		movable: true,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
		},
	});

	miniPlayer.loadFile("renderer/miniplayer.html");

	miniPlayer.webContents.on("did-finish-load", () => {
		try {
			if (initialData) {
				miniPlayer.webContents.send("miniplayer-update", initialData);
				miniPlayer.webContents.send("pip-settings-update", {
					pipShowThumbnail: initialData.pipShowThumbnail,
					pipShowLyrics: initialData.pipShowLyrics,
				});
			}
		} catch (err) {
			console.error("Error sending initial data to miniplayer:", err);
		}
	});

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

	ipcMain.handle("scrape-spotify", async (event, { url, isAlbum }) => {
		const win = new BrowserWindow({
			show: false,
			width: 1920,
			height: 1080,
			backgroundThrottling: false,
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		try {
			await win.webContents.session.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");

			await win.loadURL(url);

			await win.webContents.executeJavaScript(`
				new Promise((resolve, reject) => {
					const timeout = setTimeout(() => {
						const debugInfo = {
							title: document.title,
							url: location.href,
							bodyLength: document.body ? document.body.innerHTML.length : 0,
							trackLinks: document.querySelectorAll('a[href*="/track/"]').length,
							ariaRows: document.querySelectorAll("[aria-rowindex]").length,
							scripts: document.querySelectorAll("script").length,
						};
						reject(new Error("Track selector timeout | " + JSON.stringify(debugInfo)));
					}, 45000);

					const dismissConsent = () => {
						const buttons = document.querySelectorAll("button");
						for (const btn of buttons) {
							const text = btn.textContent.toLowerCase().trim();
							if (text === "accept all" || text === "accept" || text === "agree" || text === "allow all" || text.includes("accept all")) {
								btn.click();
								return true;
							}
						}
						return false;
					};

					const check = () => {
						if (document.querySelector('a[href*="/track/"]')) {
							clearTimeout(timeout);
							resolve();
							return;
						}
						dismissConsent();
						setTimeout(check, 500);
					};
					check();
				})
			`);

			const metaData = await win.webContents.executeJavaScript(`
				(() => {
					const titleRaw = document.title;
					const isAlbum = ${isAlbum};
					const name = isAlbum
						? titleRaw.replace(/\\s*[-\u2013]\\s*.*?\\|\\s*Spotify\\s*$/i, "").trim()
						: titleRaw.replace(/\\s*-\\s*playlist by .*?\\| Spotify$/, "").trim();

					let imageUrl = null;

					const testId = isAlbum ? "album-image" : "playlist-image";
					const thumbEl = document.querySelector('[data-testid="' + testId + '"] img');
					if (thumbEl && thumbEl.src) {
						imageUrl = thumbEl.src;
					}

					if (!imageUrl) {
						const img = Array.from(document.querySelectorAll("img")).find(el =>
							el.src && el.src.includes("scdn.co") && el.width > 100
						);
						if (img) imageUrl = img.src;
					}

					if (!imageUrl) {
						const bgDiv = Array.from(document.querySelectorAll("div")).find(el => {
							const s = getComputedStyle(el);
							return s.backgroundImage.includes("scdn.co/image/") && el.clientHeight > 100 && el.clientWidth > 100;
						});
						if (bgDiv) {
							const m = getComputedStyle(bgDiv).backgroundImage.match(/url\\("?([^"]+)"?\\)/);
							if (m && m[1]) imageUrl = m[1];
						}
					}

					if (!imageUrl) {
						const meta = document.querySelector('meta[property="og:image"]');
						if (meta) imageUrl = meta.getAttribute("content");
					}

					return { name, imageUrl };
				})()
			`);

			const tracks = await win.webContents.executeJavaScript(`
				(async (isAlbum) => {
					function findScrollContainer() {
						const allDivs = Array.from(document.querySelectorAll("div"));
						return allDivs.find(div => {
							const s = getComputedStyle(div);
							return (s.overflowY == "auto" || s.overflowY == "scroll")
								&& div.scrollHeight > div.clientHeight
								&& div.querySelectorAll('a[href*="/track/"]').length > 0;
						});
					}

					function extractTracks() {
						const tracks = [];
						const seen = new Set();
						const trackLinks = document.querySelectorAll('a[href*="/track/"]');

						trackLinks.forEach(link => {
							const href = link.getAttribute("href");
							const trackId = href.match(/\\/track\\/([a-zA-Z0-9]+)/);
							if (!trackId) return;
							if (seen.has(trackId[1])) return;
							seen.add(trackId[1]);

							const row = link.closest("[aria-rowindex]") || link.closest("div[data-testid]") || link.parentElement?.parentElement?.parentElement;
							if (!row) return;

							let title = null;
							let artist = null;

							const textDivs = row.querySelectorAll("div");
							for (const div of textDivs) {
								const testId = div.getAttribute("data-testid");
								if (testId === "tracklist-row__track-name" || testId === "internal-track-link") {
									title = div.textContent.trim();
									break;
								}
							}

							if (!title) {
								title = link.textContent.trim();
							}

							const artistLinks = row.querySelectorAll('a[href*="/artist/"]');
							if (artistLinks.length > 0) {
								artist = Array.from(artistLinks).map(a => a.textContent.trim()).join(", ");
							}

							if (!artist) {
								const spans = row.querySelectorAll("span");
								for (const span of spans) {
									const text = span.textContent.trim();
									if (text && text !== title && text.length > 1 && text.length < 200) {
										artist = text;
										break;
									}
								}
							}

							if (title && artist && title.length > 0 && artist.length > 0) {
								tracks.push({ title, artist });
							}
						});

						return tracks;
					}

					const container = findScrollContainer();

					if (!container) {
						await new Promise(r => setTimeout(r, 3000));
						const fallbackTracks = extractTracks();
						if (fallbackTracks.length > 0) return fallbackTracks;
						return [];
					}

					let sameCount = 0;
					let prevCount = 0;

					while (sameCount < 3) {
						container.scrollBy(0, 800);
						await new Promise(r => setTimeout(r, 800));

						const currentCount = container.querySelectorAll('a[href*="/track/"]').length;

						if (currentCount === prevCount) {
							sameCount++;
						} else {
							sameCount = 0;
							prevCount = currentCount;
						}
					}

					return extractTracks();
				})(${isAlbum})
			`);

			return { ...metaData, tracks };
		} finally {
			win.destroy();
		}
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
	ipcMain.on("open-miniplayer", (_, data) => {
		try {
			createMiniPlayer(data);
		} catch (err) {
			console.error("Error opening miniplayer:", err);
		}
	});
	ipcMain.on("miniplayer-close", () => {
		try {
			if (miniPlayer) miniPlayer.close();
			mainWindow.webContents.send("close-pip");
		} catch (err) {
			console.error("Error closing miniplayer:", err);
		}
	});
	ipcMain.on("miniplayer-minimize", () => {
		try {
			if (miniPlayer) miniPlayer.minimize();
		} catch (err) {
			console.error("Error minimizing miniplayer:", err);
		}
	});

	ipcMain.on("renderer-miniplayer-update", (_, data) => {
		try {
			if (miniPlayer && !miniPlayer.isDestroyed()) {
				miniPlayer.webContents.send("miniplayer-update", data);
			}
		} catch (err) {
			console.error("Error forwarding update to miniplayer:", err);
		}
	});

	ipcMain.on("pip-settings-update", (_, data) => {
		try {
			if (miniPlayer && !miniPlayer.isDestroyed()) {
				if (data.pipShowThumbnail != undefined) pipSettingsState.pipShowThumbnail = data.pipShowThumbnail;
				if (data.pipShowLyrics != undefined) pipSettingsState.pipShowLyrics = data.pipShowLyrics;
				miniPlayer.webContents.send("pip-settings-update", data);
			}
		} catch (err) {
			console.error("Error handling pip-settings-update:", err);
		}
	});

	ipcMain.on("miniplayer-resize", (_, data) => {
		try {
			if (miniPlayer && !miniPlayer.isDestroyed()) {
				miniPlayer.setSize(miniPlayer.getSize()[0], data.height);
			}
		} catch (err) {
			console.error("Error handling miniplayer-resize:", err);
		}
	});
});
