// index.js

const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec, execSync } = require("child_process");
const fetch = require("node-fetch");

const customCacheDir = path.join(__dirname, "cache");
app.commandLine.appendSwitch("disk-cache-dir", customCacheDir);
app.setPath("cache", path.join(__dirname, "cache"));

function getAppRoot() {
	return app.isPackaged ? path.join(process.resourcesPath, "app") : __dirname;
}

function checkDependencies() {
	const appRoot = getAppRoot();
	const packageJsonPath = path.join(appRoot, "package.json");
	const nodeModulesPath = path.join(appRoot, "node_modules");

	if (!fs.existsSync(packageJsonPath) || !fs.existsSync(nodeModulesPath)) {
		return false;
	}

	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
	const dependencies = Object.keys(packageJson.dependencies || {});

	for (const dep of dependencies) {
		if (!fs.existsSync(path.join(nodeModulesPath, dep))) {
			return false;
		}
	}
	return true;
}

function installDependencies() {
	const appRoot = getAppRoot();
	try {
		execSync("npm install", { cwd: appRoot, stdio: "inherit" });
	} catch (error) {
		console.error("npm install failed:", error);
		process.exit(1);
	}
}

if (!checkDependencies()) {
	installDependencies();
}

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
	const response = await fetch(`https://api.github.com/repos/Victiniiiii/TaratorMusic/git/trees/main?recursive=1`);
	const files = (await response.json()).tree.filter((f) => f.type === "blob");
	let updated = false;

	for (const file of files) {
		const fileUrl = `https://raw.githubusercontent.com/Victiniiiii/TaratorMusic/main/${file.path}`;
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
				updated = true;

				if (result === 1) {
					fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
					fs.writeFileSync(localFilePath, fileContent);
				}
			}
		}
	}

	dialog.showMessageBoxSync({
		type: "info",
		message: updated ? "No more updates. Restart the app for the effects." : "No new updates.",
	});
}

ipcMain.on("update-pytubefix", (event, pytubeStatus) => {
	exec("pip show pytube", (error, stdout, stderr) => {
		if (error || stderr) {
			const installScript = os.platform() === "win32" ? "pytubeinstall.bat" : "pytubeinstall.sh";

			exec(installScript, (installError, installStdout, installStderr) => {
				if (installError) {
					event.reply("update-response", `Error installing pytube: ${installError.message}`);
					return;
				}
				if (installStderr) {
					event.reply("update-response", `stderr: ${installStderr}`);
					return;
				}
				event.reply("update-response", `Pytube installed successfully:\n${installStdout}`);
			});
			return;
		}

		let command = pytubeStatus === "true" ? "pip install --upgrade pytubefix" : "pip install pytubefix";

		exec(command, (execError, stdout, stderr) => {
			if (execError) {
				event.reply("update-response", `Error: ${execError.message}`);
				return;
			}
			if (stderr) {
				event.reply("update-response", `stderr: ${stderr}`);
				return;
			}
			event.reply("update-response", `Success:\n${stdout}`);
		});
	});
});

ipcMain.on("run-npm-install", (event) => {
	const appRoot = getAppRoot();
	exec("npm install", { cwd: appRoot }, (error, stdout, stderr) => {
		if (error) {
			event.reply("update-response", `Error: ${error.message}`);
			return;
		}
		if (stderr) {
			event.reply("update-response", `stderr: ${stderr}`);
			return;
		}
		event.reply("update-response", `Success: npm install completed!\n${stdout}`);
	});
});

ipcMain.handle("check-for-updates", checkForUpdates);

app.whenReady().then(() => {
	Menu.setApplicationMenu(null);
	app.setName("TaratorMusic");
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
