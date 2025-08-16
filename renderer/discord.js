const clientId = "1258898699816275969";
const DiscordRPC = require("discord-rpc");

let RPC = null;

let discordRPCstatus = false;
try {
	let settingsRow = settingsDb.prepare("SELECT * FROM settings").get();
	discordRPCstatus = settingsRow ? settingsRow.dc_rpc == "1" : false;
} catch {
	discordRPCstatus = false;
}

document.getElementById("toggleSwitchDiscord").checked = discordRPCstatus;

function createRPC() {
	RPC = new DiscordRPC.Client({ transport: "ipc" });
	DiscordRPC.register(clientId);

	RPC.on("ready", async () => {
		updateDiscordPresence();
	});

	RPC.login({ clientId }).catch(err => {
		console.log("Discord RPC Login Failed:", err);
		document.getElementById("mainmenudiscordapi").innerHTML = "Discord RPC Status: Error";
		document.getElementById("mainmenudiscordapi").style.color = "red";
	});
}

function destroyRPC() {
	if (RPC) {
		try {
			RPC.clearActivity();
			RPC.destroy();
		} catch (err) {
			console.log("Error while destroying RPC:", err);
		}
		RPC = null;
	}
}

discordRPCstatus ? createRPC() : updateDiscordPresence();

function toggleDiscordAPI() {
	discordRPCstatus = !discordRPCstatus;
	updateDatabase("dc_rpc", discordRPCstatus, settingsDb);

	if (discordRPCstatus) {
		createRPC();
	} else {
		destroyRPC();
		updateDiscordPresence();
	}
}

async function updateDiscordPresence() {
	if (discordRPCstatus && RPC) {
		if (!RPC.transport || RPC.transport.socket?.destroyed) {
			document.getElementById("mainmenudiscordapi").innerHTML = "Discord RPC Status: Down";
			document.getElementById("mainmenudiscordapi").style.color = "red";
			return;
		}

		document.getElementById("mainmenudiscordapi").innerHTML = "Discord RPC Status: Online";
		document.getElementById("mainmenudiscordapi").style.color = "green";

		const songName = document.getElementById("song-name").textContent;

		if (songName == "No song is being played.") {
			RPC.setActivity({
				type: "2",
				details: "Browsing Music",
				state: "Idle",
				largeImageKey: "tarator1024_icon",
			});
		} else {
			const timeDisplayString = document.getElementById("video-length").textContent;

			const activityPayload = {
				type: "2",
				details: songName,
				largeImageKey: "tarator1024_icon",
			};

			if (timeDisplayString && timeDisplayString.includes("/")) {
				const timeParts = timeDisplayString.split("/");
				const currentTimeString = timeParts[0].trim();
				const totalTimeString = timeParts[1].trim();

				const currentSeconds = parseTimeToSeconds(currentTimeString);
				const totalSeconds = parseTimeToSeconds(totalTimeString);

				if (currentSeconds !== null && totalSeconds !== null && totalSeconds > 0) {
					const nowMs = Date.now();

					const validatedCurrentSeconds = Math.min(currentSeconds, totalSeconds);

					activityPayload.state = "──────────────────────────​";
					activityPayload.startTimestamp = Math.floor(nowMs / 1000 - validatedCurrentSeconds);
					activityPayload.endTimestamp = activityPayload.startTimestamp + totalSeconds;
				} else {
					activityPayload.state = timeDisplayString || "Playing music";
				}
			} else {
				activityPayload.state = timeDisplayString || "Playing music";
			}

			RPC.setActivity(activityPayload);
		}
	} else {
		document.getElementById("mainmenudiscordapi").innerHTML = "Discord RPC Status: Disabled";
		document.getElementById("mainmenudiscordapi").style.color = "yellow";
	}
}
