const clientId = "1258898699816275969";
const DiscordRPC = require("discord-rpc");

let RPC = null;
discordRPCstatus ? createRPC() : updateDiscordPresence();

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

function toggleDiscordAPI() {
	discordRPCstatus = !discordRPCstatus;
	updateDatabase("dc_rpc", discordRPCstatus ? 1 : 0, settingsDb, "settings");

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

		if (!audioElement) {
			RPC.setActivity({
				type: "2",
				details: "Browsing Music",
				state: "Idle",
				largeImageKey: "tarator1024_icon",
			});
		} else {
			const activityPayload = {
				type: "2",
				details: document.getElementById("song-name").textContent,
				largeImageKey: "tarator1024_icon",
			};

			const timeParts = document.getElementById("video-length").textContent.split("/");
			const currentSeconds = parseTimeToSeconds(timeParts[0].trim());
			const totalSeconds = parseTimeToSeconds(timeParts[1].trim());

			if (audioElement.paused) {
				activityPayload.state = "⏸ Paused";
			} else if (currentSeconds !== null && totalSeconds !== null && totalSeconds > 0) {
				const nowMs = Date.now();

				const validatedCurrentSeconds = Math.min(currentSeconds, totalSeconds);

				activityPayload.state = "──────────────────────────​";
				activityPayload.startTimestamp = Math.floor(nowMs / 1000 - validatedCurrentSeconds);
				activityPayload.endTimestamp = activityPayload.startTimestamp + totalSeconds;
			}

			RPC.setActivity(activityPayload);
		}
	} else {
		document.getElementById("mainmenudiscordapi").innerHTML = "Discord RPC Status: Disabled";
		document.getElementById("mainmenudiscordapi").style.color = "yellow";
	}
}
