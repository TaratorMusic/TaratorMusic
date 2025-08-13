const clientId = "1258898699816275969";
const DiscordRPC = require("discord-rpc");

let RPC = null;
let discordApi = localStorage.getItem("discordApi") == "true"; // TODO: DONT USE LOCALSTORAGE, USE DB
document.getElementById("toggleSwitchDiscord").checked = discordApi; // MOVE TO DOMCONTENTLOADED

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

discordApi ? createRPC() : updateDiscordPresence();

function toggleDiscordAPI() {
	discordApi = !discordApi;
	localStorage.setItem("discordApi", discordApi.toString());

	if (discordApi) {
		createRPC();
	} else {
		destroyRPC();
		updateDiscordPresence();
	}
}

function parseTimeToSeconds(timeStr) {
	// TODO: transfer to helpers.js
	if (typeof timeStr !== "string") return null;
	const parts = timeStr.split(":").map(Number);
	if (parts.some(isNaN)) return null;

	if (parts.length == 2) {
		return parts[0] * 60 + parts[1];
	} else if (parts.length == 3) {
		return parts[0] * 3600 + parts[1] * 60 + parts[2];
	}
	return null;
}

async function updateDiscordPresence() {
	if (discordApi && RPC) {
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
