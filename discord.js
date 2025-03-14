const clientId = "1258898699816275969"; // not a private key, just the ID of my app
const DiscordRPC = require("discord-rpc");
const RPC = new DiscordRPC.Client({ transport: "ipc" });
DiscordRPC.register(clientId);

let discordApi = localStorage.getItem("discordApi") || false;
document.getElementById("toggleSwitchDiscord").checked = discordApi;

if (discordApi == true) {
	RPC.on("ready", async () => {
		updateDiscordPresence();
	});
	RPC.login({ clientId }).catch((err) => console.error(err));
}

function toggleDiscordAPI() {
	discordApi = !discordApi;
	localStorage.setItem("discordApi", JSON.stringify(discordApi));
	updateDiscordPresence();
}

async function updateDiscordPresence() {
	if (discordApi) {
		if (!RPC) {
			document.getElementById("mainmenudiscordapi").innerHTML = "Discord API Status: Down";
			document.getElementById("mainmenudiscordapi").style.color = "red";
			return;
		}
		const songName = document.getElementById("song-name").textContent;
		document.getElementById("mainmenudiscordapi").innerHTML = "Discord API Status: Online";
		document.getElementById("mainmenudiscordapi").style.color = "green";
		if (songName == "No song is being played.") {
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

updateDiscordPresence();
