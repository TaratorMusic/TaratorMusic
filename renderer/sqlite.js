// FEATURE COMING SOON
// Add file to index.html

// const { spawn } = require("child_process");
// const path = require("path");

// const databasesFolder = path.join(__dirname, "databases");
// const go = spawn("./your-go-binary", [databasesFolder]);

// let sqlCounter = 0;

// const pending = {};

// let buffer = "";
// go.stdout.on("data", chunk => {
// 	buffer += chunk.toString();
// 	const lines = buffer.split("\n");
// 	buffer = lines.pop();
// 	for (const line of lines) {
// 		if (!line.trim()) continue;
// 		try {
// 			const res = JSON.parse(line);
// 			if (pending[res.id]) {
// 				pending[res.id](res);
// 				delete pending[res.id];
// 			}
// 		} catch (e) {
// 			console.error("failed to parse response:", e);
// 		}
// 	}
// });

// go.stderr.on("data", data => {
// 	console.error("go stderr:", data.toString());
// });

// go.on("close", code => {
// 	console.log("go process exited with code", code);
// });

// function call({ db, query, args = [], fetch = false }) {
// 	return new Promise((resolve, reject) => {
// 		const id = sqlCounter++;
// 		pending[id] = res => (res.error ? reject(new Error(res.error)) : resolve(res));
// 		go.stdin.write(JSON.stringify({ id, db, query, args, fetch }) + "\n");
// 	});
// }

// async function main() {
// 	const { rows } = await call({
// 		db: "musics",
// 		query: "SELECT * FROM songs WHERE artist = ?",
// 		args: ["Radiohead"],
// 		fetch: true,
// 	});
// 	console.log("songs:", rows);

// 	await call({
// 		db: "musics",
// 		query: "INSERT INTO songs (song_id, song_name, artist) VALUES (?, ?, ?)",
// 		args: ["abc123", "Creep", "Radiohead"],
// 		fetch: false,
// 	});
// 	console.log("inserted");
// }

// main().catch(console.error);
