function startDaemon() {
	if (discordDaemon) return;

	discordDaemon = spawn(path.join(backendFolder, "dc_rich_presence"), ["daemon"]);

	discordDaemon.stdout.on("data", data => {
		const lines = data
			.toString()
			.split("\n")
			.filter(l => l.trim());

		for (const line of lines) {
			try {
				const response = JSON.parse(line.trim());
				updateDiscordStatus(response.status);
			} catch (e) {
				logChange("error", `Failed to parse daemon response: ${line}`);
				updateDiscordStatus("error");
			}
		}
	});

	discordDaemon.stderr.on("data", data => {
		logChange("error", `Daemon error: ${data.toString()}`);
		updateDiscordStatus("error");
	});

	discordDaemon.on("close", code => {
		logChange("log", `Daemon closed with code: ${code}`);
		discordDaemon = null;
		updateDiscordStatus("disabled");
	});

	discordDaemon.on("error", error => {
		logChange("error", `Daemon spawn error: ${error?.message ?? String(error)}`);
		discordDaemon = null;
		updateDiscordStatus("error");
	});
}

function updateDiscordStatus(status) {
	const element = document.getElementById("mainmenudiscordapi");

	if (status == "online") {
		element.innerHTML = "Discord RPC Status: Online";
		element.style.color = "green";
		discordRPCstatus = true;
	} else if (status == "error") {
		element.innerHTML = "Discord RPC Status: Error";
		element.style.color = "red";
		discordRPCstatus = false;
	} else if (status == "disabled") {
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

	callSqlite({
		db: "settings",
		query: "UPDATE settings SET dc_rpc = ?",
		args: [discordRPCstatus ? 1 : 0],
		fetch: false,
	});

	logChange("log", `New RPC status: ${discordRPCstatus}`);
}

function updateDiscordPresence() {
	if (!discordRPCstatus) return;
	const fullSongData = playingSongsID.startsWith("tarator") ? songNameCache.get(playingSongsID) : streamedSongsCache.get(playingSongsID);
	const isIdle = !audioPlayer;
	const songName = isIdle ? "" : fullSongData.song_name;
	const artistData = isIdle ? null : { artist: fullSongData?.artist || null };
	const artistName = artistData ? artistData.artist : "";
	const paused = !playing;

	let currentSec = 0;
	let totalSec = 0;
	if (!isIdle) {
		const timeParts = document.getElementById("video-length").textContent.split("/");
		currentSec = parseTimeToSeconds(timeParts[0].trim()) || 0;
		totalSec = parseTimeToSeconds(timeParts[1].trim()) || 0;
	}

	const songData = artistName ? `${songName}|||${artistName}` : songName;

	sendCommandToDaemon("update", [songData, currentSec.toString(), totalSec.toString(), paused, isIdle]);
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
