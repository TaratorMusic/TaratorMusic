# AGENTS.md

## Project Overview

TaratorMusic is a cross-platform desktop music player built with Electron. Offline-first local library player with YouTube/Spotify streaming and downloading. Polyglot codebase.

## Stack

- Renderer UI: vanilla HTML/CSS/JavaScript, no framework, no bundler. ES modules.
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

## Code Conventions

- ES modules only (`import`/`export`), never `require`.
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
- `compiler.js` orchestrates builds. New backend tools must register there or in `package.json` scripts.
- Data lives in `taratordb/` SQLite DBs, read/written by Go `sqlite` tool over JSON-line IPC. Do not write SQLite handling in JS.

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