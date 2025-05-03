const clientId = "1258898699816275969";
const DiscordRPC = require("discord-rpc");

let RPC = null;
let discordApi = localStorage.getItem("discordApi") === "true";
document.getElementById("toggleSwitchDiscord").checked = discordApi;

function createRPC() {
	RPC = new DiscordRPC.Client({ transport: "ipc" });
	DiscordRPC.register(clientId);

	RPC.on("ready", async () => {
		updateDiscordPresence();
	});

	RPC.login({ clientId }).catch((err) => {
		console.error("Discord RPC Login Failed:", err);
		document.getElementById("mainmenudiscordapi").innerHTML = "Discord API Status: Error";
		document.getElementById("mainmenudiscordapi").style.color = "red";
	});
}

function destroyRPC() {
	if (RPC) {
		try {
			RPC.clearActivity();
			RPC.destroy();
		} catch (err) {
			console.error("Error while destroying RPC:", err);
		}
		RPC = null;
	}
}

if (discordApi) {
	createRPC();
} else {
	updateDiscordPresence();
}

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

async function updateDiscordPresence() {
	if (discordApi && RPC) {
		if (!RPC.transport || RPC.transport.socket?.destroyed) {
			document.getElementById("mainmenudiscordapi").innerHTML = "Discord API Status: Down";
			document.getElementById("mainmenudiscordapi").style.color = "red";
			return;
		}

		const songName = document.getElementById("song-name").textContent;
		document.getElementById("mainmenudiscordapi").innerHTML = "Discord API Status: Online";
		document.getElementById("mainmenudiscordapi").style.color = "green";

		if (songName === "No song is being played.") {
			RPC.setActivity({
				type: "2",
				details: "Launching the app",
				largeImageKey: "tarator1024_icon",
				largeImageText: "TaratorMusic",
			});
		} else {
			const time = document.getElementById("video-length").textContent;
			RPC.setActivity({
				type: "2",
				details: songName,
				state: time,
				largeImageKey: "tarator1024_icon",
				largeImageText: "TaratorMusic",
			});
		}
	} else {
		document.getElementById("mainmenudiscordapi").innerHTML = "Discord API Status: Disabled";
		document.getElementById("mainmenudiscordapi").style.color = "yellow";
	}
}
