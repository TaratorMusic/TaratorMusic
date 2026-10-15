const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform == "win32";

function run(cmd, env = {}) {
	execSync(cmd, {
		stdio: "inherit",
		env: { ...process.env, ...env },
	});
}

function findGoFiles(dir, results = []) {
	const list = fs.readdirSync(dir);
	for (const file of list) {
		const full = path.join(dir, file);
		const stat = fs.statSync(full);
		if (stat && stat.isDirectory()) {
			findGoFiles(full, results);
		} else if (file == "main.go") {
			results.push(full);
		}
	}
	return results;
}

function goBuild() {
	const files = findGoFiles(path.join(__dirname, "backend"));

	for (const file of files) {
		const dir = path.dirname(file);
		const name = path.basename(dir);
		const out = path.join(__dirname, "bin", isWin ? `${name}.exe` : name);
		const rel = `./${path.relative(__dirname, dir)}`;

		run(`go build -o "${out}" "${rel}"`, { CGO_ENABLED: "0" });
	}
}

function cBuild() {
	const out = path.join(__dirname, "bin", isWin ? "player.exe" : "player");
	fs.mkdirSync(path.dirname(out), { recursive: true });

	if (isWin) {
		run(`gcc -O2 ./backend/miniaudio/player.c ./backend/miniaudio/miniaudio.c -o "${out}" -lpthread`);
	} else {
		run(`gcc -O2 ./backend/miniaudio/player.c ./backend/miniaudio/miniaudio.c -o "${out}" -ldl -lpthread -lm`);
	}
}

function ytdlpFetch() {
	const bin = path.join(__dirname, "bin", isWin ? "ytdlp_fetch.exe" : "ytdlp_fetch");
	run(`"${bin}"`);
}

// yt-dlp is downloaded on request from Settings, never bundled, so a stale
// copy from an earlier fetch must not ship inside installers.
function cleanYtdlp() {
	for (const name of ["yt-dlp.exe", "yt-dlp_macos", "yt-dlp_linux"]) {
		for (const suffix of ["", ".part"]) {
			try {
				fs.unlinkSync(path.join(__dirname, "bin", name + suffix));
			} catch (_) {}
		}
	}
}

const cmd = process.argv[2];

if (cmd == "gobuild") {
	goBuild();
} else if (cmd == "cbuild") {
	cBuild();
} else if (cmd == "ytdlp_fetch") {
	ytdlpFetch();
} else if (cmd == "build") {
	goBuild();
	cBuild();
	cleanYtdlp();
} else {
	console.error("Unknown command");
	process.exit(1);
}
