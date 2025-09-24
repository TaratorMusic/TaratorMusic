function startDaemon() {
	if (discordDaemon) return;

	discordDaemon = spawn(path.join(backendFolder, "dc_rich_presence"), ["daemon"]);

	discordDaemon.stdout.on("data", data => {
		const dataString = data.toString().trim();

		try {
			const response = JSON.parse(dataString);
			updateDiscordStatus(response.status);
		} catch (e) {
			console.error("Failed to parse daemon response:", dataString);
			updateDiscordStatus("error");
		}
	});

	discordDaemon.stderr.on("data", data => {
		console.error("Daemon error:", data.toString());
		updateDiscordStatus("error");
	});

	discordDaemon.on("close", code => {
		console.log("Daemon closed with code:", code);
		discordDaemon = null;
		updateDiscordStatus("disabled");
	});

	discordDaemon.on("error", error => {
		console.error("Daemon spawn error:", error);
		discordDaemon = null;
		updateDiscordStatus("error");
	});
}

function updateDiscordStatus(status) {
	const element = document.getElementById("mainmenudiscordapi");

	if (status === "online") {
		element.innerHTML = "Discord RPC Status: Online";
		element.style.color = "green";
		discordRPCstatus = true;
	} else if (status === "error") {
		element.innerHTML = "Discord RPC Status: Error";
		element.style.color = "red";
		discordRPCstatus = false;
	} else if (status === "disabled") {
		element.innerHTML = "Discord RPC Status: Disabled";
		element.style.color = "yellow";
		discordRPCstatus = false;
	}
}

function sendCommandToDaemon(command, args = []) {
	if (!discordDaemon) {
		startDaemon();
		setTimeout(() => {
			if (discordDaemon) {
				const commandLine = [command, ...args].join(" ") + "\n";
				discordDaemon.stdin.write(commandLine);
			}
		}, 200);
	} else {
		const commandLine = [command, ...args].join(" ") + "\n";
		discordDaemon.stdin.write(commandLine);
	}
}

function toggleDiscordAPI() {
	if (discordRPCstatus) {
		discordRPCstatus = false;
		sendCommandToDaemon("destroy");
	} else {
		discordRPCstatus = true;
		sendCommandToDaemon("create");
	}

	updateDatabase("dc_rpc", discordRPCstatus ? 1 : 0, settingsDb, "settings");
}

function updateDiscordPresence() {
    if (!discordRPCstatus) return;
	const isIdle = !audioPlayer;
	const songName = isIdle ? "" : document.getElementById("song-name").textContent;
	let currentSec = 0;
	let totalSec = 0;

	if (!isIdle) {
		const timeParts = document.getElementById("video-length").textContent.split("/");
		currentSec = parseTimeToSeconds(timeParts[0].trim()) || 0;
		totalSec = parseTimeToSeconds(timeParts[1].trim()) || 0;
	}

	sendCommandToDaemon("update", [songName, currentSec.toString(), totalSec.toString(), playing.toString(), isIdle.toString()]);
}

function stopDaemon() {
	if (discordDaemon) {
		sendCommandToDaemon("quit");
		discordDaemon = null;
	}
}

process.on("beforeExit", () => {
	stopDaemon();
});

process.on("SIGINT", () => {
	stopDaemon();
	process.exit();
});

process.on("SIGTERM", () => {
	stopDaemon();
	process.exit();
});
