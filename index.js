const { app, BrowserWindow, Menu, ipcMain, clipboard } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const { spawn: spawnSyncServer } = require("child_process");
const { createInterface: readSyncLines } = require("readline");

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
let phoneSyncProcess = null;
let phoneSyncStatus = { enabled: false };
let phoneSyncOperation = Promise.resolve();

async function stopPhoneSync() {
	const child = phoneSyncProcess;
	if (!child) return;
	await new Promise(resolve => {
		const timer = setTimeout(() => child.kill(), 2000);
		child.once("close", () => {
			clearTimeout(timer);
			resolve();
		});
		child.stdin.end();
	});
}

async function setPhoneSync(options) {
	await stopPhoneSync();
	phoneSyncStatus = { enabled: false };
	if (!options.enabled) return phoneSyncStatus;
	const page = new URL(options.page);
	const localWeb = isDev && page.protocol == "http:" && page.hostname == "127.0.0.1" && page.pathname == "/" && page.port != "0";
	if ((!localWeb && page.protocol != "https:") || page.username || page.password || page.search || page.hash) throw new Error("Enter an HTTPS phone app URL. In development, http://127.0.0.1:8080/ also supports local pairing and transfers.");
	const binary = path.resolve(options.binary);
	if (path.dirname(binary) != path.resolve(processDir, "bin") || !fs.statSync(binary).isFile() || fs.statSync(binary).size == 0) throw new Error("Phone sync binary is unavailable. Run npm run gobuild.");
	const dataFolder = fs.realpathSync(appDir);
	const args = ["--data", dataFolder, "--page", page.href];
	if (localWeb) args.push("--dev-web", path.join(processDir, "web"));
	const child = spawnSyncServer(binary, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"], cwd: dataFolder });
	phoneSyncProcess = child;
	return await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			child.kill();
			reject(new Error("Phone sync did not start within 15 seconds."));
		}, 15000);
		let errors = "";
		child.stdin.on("error", () => {});
		child.stderr.on("data", data => {
			errors = (errors + data.toString()).slice(-4000);
			phoneSyncStatus.error = errors;
		});
		readSyncLines({ input: child.stdout }).on("line", line => {
			try {
				phoneSyncStatus = JSON.parse(line);
				if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("phone-sync-status", phoneSyncStatus);
				clearTimeout(timeout);
				resolve(phoneSyncStatus);
			} catch (_) {}
		});
		child.once("error", error => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("close", () => {
			clearTimeout(timeout);
			if (phoneSyncProcess == child) {
				phoneSyncProcess = null;
				phoneSyncStatus = { enabled: false, error: errors.trim() };
			}
			reject(new Error(errors.trim() || "Phone sync stopped."));
		});
	});
}

app.on("before-quit", () => {
	if (phoneSyncProcess) phoneSyncProcess.kill();
});

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
	ipcMain.handle("phone-sync-set", (event, options) => {
		if (event.sender != mainWindow.webContents) throw new Error("Main window only");
		phoneSyncOperation = phoneSyncOperation.catch(() => {}).then(() => setPhoneSync(options));
		return phoneSyncOperation;
	});
	ipcMain.handle("phone-sync-command", (event, command) => {
		if (event.sender != mainWindow.webContents) throw new Error("Main window only");
		if (!["status", "new-code", "revoke"].includes(command)) throw new Error("Unknown phone sync command");
		if (phoneSyncProcess && !phoneSyncProcess.stdin.destroyed) phoneSyncProcess.stdin.write(command + "\n");
		return phoneSyncStatus;
	});

	ipcMain.handle("get-app-base-path", () => {
		return appDir;
	});

	ipcMain.handle("get-app-process-path", () => {
		return processDir;
	});

	ipcMain.handle("get-app-path", () => {
		return app.getAppPath();
	});

	ipcMain.handle("write-clipboard", (event, text) => {
		clipboard.writeText(String(text ?? ""));
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
						if (document.querySelector('[data-testid="infinite-scroll-list"] a[href*="/track/"]')) {
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

					function findTracklist() {
						return document.querySelector('[data-testid="infinite-scroll-list"]') || document.body;
					}

					function extractTracks() {
						const tracks = [];
						const seen = new Set();
						const trackLinks = findTracklist().querySelectorAll('a[href*="/track/"]');

						trackLinks.forEach(link => {
							const href = link.getAttribute("href");
							const trackId = href.match(/\\/track\\/([a-zA-Z0-9]+)/);
							if (!trackId) return;
							if (seen.has(trackId[1])) return;
							if (link.closest('[data-testid="recommended-tracks-context"]')) return;
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

					const container = findScrollContainer() || document.scrollingElement || document.documentElement;

					let sameCount = 0;
					let prevCount = 0;

					while (sameCount < 3) {
						container.scrollBy(0, 800);
						await new Promise(r => setTimeout(r, 800));

						const currentCount = findTracklist().querySelectorAll('a[href*="/track/"]').length;

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
	ipcMain.on("miniplayer-volume", (_, data) => {
		try {
			mainWindow.webContents.send("pip-volume", data);
		} catch (err) {
			console.error("Error forwarding volume to main window:", err);
		}
	});
	ipcMain.on("miniplayer-action", (_, action) => mainWindow.webContents.send("pip-action", action));
	ipcMain.on("miniplayer-translation", (_, data) => {
		try {
			mainWindow.webContents.send("pip-translation", data);
		} catch (err) {
			console.error("Error forwarding translation pick to main window:", err);
		}
	});
	ipcMain.on("miniplayer-lyrics-toggle", (_, data) => {
		try {
			mainWindow.webContents.send("pip-lyrics-toggle", data);
		} catch (err) {
			console.error("Error forwarding lyrics toggle to main window:", err);
		}
	});
	ipcMain.on("miniplayer-translate-current-only", (_, data) => {
		try {
			mainWindow.webContents.send("pip-translate-current-only", data);
		} catch (err) {
			console.error("Error forwarding translate current only to main window:", err);
		}
	});
	ipcMain.on("miniplayer-seek", (_, data) => {
		try {
			mainWindow.webContents.send("pip-seek", data);
		} catch (err) {
			console.error("Error forwarding seek to main window:", err);
		}
	});
	ipcMain.on("miniplayer-drag", (_, data) => {
		try {
			if (!miniPlayer || miniPlayer.isDestroyed()) return;
			const [x, y] = miniPlayer.getPosition();
			miniPlayer.setPosition(Math.round(x + (Number(data?.dx) || 0)), Math.round(y + (Number(data?.dy) || 0)));
		} catch (err) {
			console.error("Error moving miniplayer:", err);
		}
	});
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
			const height = Number(data?.height);
			if (!Number.isFinite(height)) return;
			if (miniPlayer && !miniPlayer.isDestroyed()) {
				miniPlayer.setSize(miniPlayer.getSize()[0], Math.round(height));
			}
		} catch (err) {
			console.error("Error handling miniplayer-resize:", err);
		}
	});
});
