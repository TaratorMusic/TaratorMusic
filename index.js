// index.js

const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec, execSync } = require("child_process");
const fetch = require("node-fetch");

app.commandLine.appendSwitch("disk-cache-dir", path.join(__dirname, "cache"));
app.setPath("cache", path.join(__dirname, "cache"));
const appRoot = app.isPackaged ? path.join(process.resourcesPath, "app") : __dirname;

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
	ipcMain.handle("get-app-version", () => app.getVersion());
    ipcMain.handle("check-for-updates", checkForUpdates);	
}

async function checkForUpdates() {
    const response = await fetch(`https://api.github.com/repos/Victiniiiii/TaratorMusic/git/trees/main?recursive=1`);
    
    if (!response.ok) {
        console.error("Failed to fetch update tree:", response.status, await response.text());
        return;
    }

    const data = await response.json();

    if (!data.tree) {
        console.error("Unexpected GitHub API response:", data);
        return;
    }

    const files = data.tree.filter((f) => f.type === "blob");

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

app.whenReady().then(() => {
	app.isPackaged && Menu.setApplicationMenu(null);
	app.setName("TaratorMusic");
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
