# AGENTS.md

## Project Overview

TaratorMusic is a cross-platform desktop music player built with Electron. Offline-first local library player with YouTube/Spotify streaming and downloading. Polyglot codebase.

## Stack

- Renderer UI: vanilla HTML/CSS/JavaScript, no framework, no bundler. CommonJS via `require`, loaded as classic `<script>` tags with `nodeIntegration: true`.
- Main process: Node.js + Electron 40.
- Backend binaries: Go 1.24 (SQLite, MusicBrainz, dedupe, yt-dlp fetch, Discord RPC).
- Audio engine: C + miniaudio (`backend/miniaudio/player.c`).
- Downloading: yt-dlp (fetched into `bin/`), FFmpeg (audio decode, loudnorm).

## Commands

```bash
npm start            # run app in dev mode
npm run build        # compile Go binaries + C player + fetch yt-dlp
npm run gobuild      # compile Go binaries only (into bin/)
npm run cbuild       # compile C miniaudio player (gcc)
npm run ytdlp_fetch  # download latest yt-dlp
npm run dist         # electron-builder installers (Win/macOS/Linux)
npm run testdist     # unpacked app dir, no installer
```

No test framework. No linter configured. Do not invent either.

## Behavior Rules (applies to all agents)

- If no programming language is specified, use JavaScript.
- After any change to C or Go source, run the build before reporting done: `npm run gobuild` for Go, `npm run cbuild` for C. A tool that exists only in source does not exist at runtime, because the renderer spawns the compiled binary out of `bin/`.
- ALWAYS ask when anything is unclear. Never make assumptions.
- Do not explain code or changes unless asked.
- No comments in code unless the method is genuinely non-obvious.
- No em dashes.
- Be concise. No filler, no meta commentary, no summaries.
- Never use `switch`/`case`. Use `if`/`else`.
- Ask questions in plaintext, numbered 1 to n if multiple.
- Never write `console.log`/`console.warn`/`console.error`. Use `logChange(level, message)` in `renderer/renderer.js`, which also persists to the `logs` DB.
- Editor flows stage their result in the UI and let the user press Save. Never write the `lyrics` table from a generator, and never persist an empty `lyrics` value: the transcription is only real once it is in the textarea.
- Comparison UI: reuse `comparisonModal()` in `renderer/helpers.js` instead of building a new modal.
- Reuse before adding. Before writing a helper, check whether one already exists, and check when the file defining it actually loads.
- Change as little as possible. Fix the bug, do not restructure working code around it.

## Paths

- `taratorFolder` is userData and is writable. `processFolder` is `resourcesPath` in a packaged build, which is the app install dir. `backendFolder` is `processFolder/bin`.
- Linetime assets live in `bin/`, next to the compiled Go tools, and `getLinetimeFolder()` returns `backendFolder`. Do not move them into a `linetime/` folder beside `bin`: the user asked for one folder holding every tool the app spawns.
- `isDev ? app.getAppPath() : ...` in `index.js` makes `taratorFolder` and `processFolder` the same directory during development, so a change to which of the two a path resolves against cannot be tested with `npm start`. Reason about the packaged path.
- A Go tool that writes a relative path resolves it against the cwd the renderer passed to `spawn`. The cwd is part of the destination, so it is not a detail.
- `bin/` is shipped via `extraResources`, so there are legitimately two copies of things like yt-dlp: the bundled one in `processFolder/bin`, and the user-updated one in `taratorFolder/bin`. The updated one wins. The user-updated copy is the only runtime download that must go to `taratorFolder`; anything else follows the Linetime rule above.
- Filenames for shipped and downloaded files live in `backend/internal/appfiles`. Do not re-declare them in Go or JS. The tools that write those files and `binary_check` all read from there.
- `backend/binary_check` reports what is actually on disk, with `present`, `missing` and `unsupported` as distinct states. `unsupported` is not `missing`: the GPU bundle is Linux only and whisper.cpp publishes no macOS CLI, so treating them as missing makes the app nag on every launch.
- Existence checks that gate real work must be live. The report is a boot snapshot and the user can delete a file at any time. Rerun it after any download or delete.
- `backend/startup_check` returns a song map whose key count the renderer compares against the song count. Never add a key to that map: a mismatch makes the app believe new songs appeared and it will try to insert a row for the stray key.

## Code Conventions

- CommonJS only: `const x = require("...")` at the top of the file. Never `import`/`export`.
- Renderer files are classic scripts sharing one global scope, so two files must not declare the same top-level name. Put shared helpers in the file that already owns them, or wrap the new file in an IIFE.
- `const`/`let`, never `var`.
- Async/await over raw promises.
- camelCase for variables/functions, PascalCase for constructors, UPPER_SNAKE for constants.
- renderer files use existing utilities:
  - `renderer/helpers.js` has ID gen, time formatting, modals.
  - `renderer/lang_map.js` handles language mapping.
- IPC: renderer talks to main via preload bridge (`renderer/preload.js`).
- Never bypass preload and the C player. All audio goes through `backend/miniaudio/player.c`, children spawned from main process.
- No new npm dependencies without asking.
- Existing HTML/JS/CSS style in `renderer/` is the reference. Follow it, do not restructure.

## Architecture Notes

- `index.js` is Electron main: windows, IPC, updater, miniplayer.
- `renderer/` is the whole UI. No framework state manager.
- `backend/` holds Go tools (built into `bin/`) and the C player.
- `compiler.js` orchestrates builds. It discovers Go tools by walking `backend/` for files named `main.go`, so a new tool needs no registration, just its own directory with a `main.go`. A directory without one is treated as a library package and is linked in through its import instead.
- `renderer/download_music.js` is loaded lazily by `loadJSFile("download_music")` from user actions, not by a `<script>` tag. Anything the player or startup needs from it must live in an eagerly loaded file such as `renderer/helpers.js`.
- Data lives in `taratordb/` SQLite DBs, read/written by Go `sqlite` tool over JSON-line IPC. Do not write SQLite handling in JS.

## Downloads

- Never delete a working file before its replacement exists. Download to `<name>.part`, verify, then rename over the original. Deleting first means one network hiccup leaves the user with no binary at all.
- Verify what you downloaded. Check against `Content-Length` and reject an empty result. These URLs redirect to a CDN, so a proxy returning `200` with an HTML page is otherwise installed as a binary and reported as a success.
- A skip check must treat a zero length file as absent, otherwise a leftover partial download is kept forever and never repaired.

## Boundaries

- Allowed: `renderer/`, `index.js`, `compiler.js`, `backend/` source, `assets/`.
- Ask first: `backend/miniaudio/`. Reason: C + miniaudio needs specific gcc flags and playback-pipeline knowledge.
- Never touch:
  - `bin/`. Reason: compiled output, rebuilt via `npm run build`.
  - `musics/`, `thumbnails/`. Reason: user data.
  - `taratordb/`. Reason: runtime databases, gitignored.
  - `dist/`, `build/`. Reason: build artifacts.
  - `node_modules/`. Reason: dependencies.
  - `*.ico`, `*.icns`, `*.png` in `assets/`. Reason: installers depend on exact sizing.
- yt-dlp binary in `bin/` is fetched, not committed. Reason: auto-updates to latest.

## Completion Report

When done, report: what changed, which files, and verification steps run. Do not write examples, summaries, or migration notes unless asked.