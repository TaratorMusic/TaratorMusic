# TaratorMusic Offline

Copy selected songs and playlists over home Wi-Fi, then play from phone storage. Use Safari on iPhone and Chrome on Android. Install the phone app before pairing and downloading: a Home Screen app can have different storage from its browser tab.

## Run it

1. Build the desktop with `npm run gobuild`, then run `npm start`. Release builds include the Go server automatically through `compiler.js` and the existing `bin/` extraResources rule. No C player change is needed.
2. Publish with the included GitHub Pages workflow. It stages `web/` and copies the shared SVG icons from `assets/` into the deployment. No npm dependency is needed. In GitHub, select Settings > Pages > Source > GitHub Actions, then run the existing Pages workflow or push web or SVG changes to `main`.
3. Open the Pages HTTPS URL on the phone. This checkout defaults to `https://ryryguy2.github.io/TaratorMusic/`. In desktop Settings > Phone sync, enter your actual Pages URL if different.
4. Enable sharing there. It is off by default and remembers your choice. Keep TaratorMusic open while syncing.
5. Connect both devices to the same private Wi-Fi. Allow the desktop firewall's private-network prompt. TCP 8443 is HTTPS; TCP 8444 supplies certificate setup only. Do not forward these ports on the router. Guest Wi-Fi with client isolation will not work.

Paths are relative for repository Pages hosting. Opening `index.html` as a file does not support service workers. Retain the app origin and repository path to retain browser storage.

SVG icons have one source in `assets/`, shared with the desktop. The local desktop server serves them at the webapp's root URLs. For another static host, deploy the staged Pages artifact or copy the SVG files from `assets/` beside `web/index.html` in your deployment directory.

Connection now guides setup in three steps. Copy the webapp address from step 1 into the desktop's Webapp address field. Copy the desktop's Desktop address into step 2. Select your device for certificate instructions, then press Check connection. A successful check confirms the browser can reach the sync server without spending a pairing attempt. Step 3 accepts a six-digit code with or without spaces and shows separate guidance for expired codes, rate limits, and device limits. Network failures list certificate, Wi-Fi, and webapp-address checks because browsers do not expose their exact cause to the page.

## Manual pairing and transfers on this PC

1. Run `npm run gobuild`, then `npm start` from the project folder.
2. In Settings > Phone sync, turn sharing off if it is already enabled. Press Use local PC testing to fill Webapp address with `http://127.0.0.1:8080/`, then enable sharing.
3. Open `http://127.0.0.1:8080/` in a browser on the same PC. The desktop serves both the webapp and its API; no Python server or Pages deployment is needed. If port 8080 is occupied, choose another port in the app URL.
4. Open Connection. Leave the desktop address prefilled with `http://`, press Check connection, then enter the code shown by the desktop and press Pair phone.
5. Transfer the test file, then Connect and compare. Select songs or playlists, review changes, and press Copy additions and updates.
6. Open My Music and play a saved song. To check offline playback, turn sharing off in the desktop app and reload the browser after the app shell is cached.

Local mode is available through `npm start` only. It binds HTTP to `127.0.0.1`, accepts only its own origin, and keeps pairing/token checks. It does not open the LAN HTTPS or certificate-setup ports and needs no certificate installation. Phones still use the HTTPS setup described below. To return to phone syncing, turn sharing off, restore the HTTPS app URL, then enable sharing again.

## HTTPS and addresses

On first enable, Go's standard crypto packages create an ECDSA CA without OpenSSL. The private key and hashed tokens stay in the writable data directory at `config/offline-sync/state.json`. In packaged builds this is userData, not the install directory. The server opens SQLite with `mode=ro` and `query_only` and never modifies music, playlists, thumbnails, or the library DB. The existing SQLite tool migrates the two settings columns.

The desktop signs a 3-month certificate for its private IPv4 addresses. At every TLS handshake it checks addresses and renews the certificate after an IP change or near expiry. The CA stays the same. After an IP change, refresh the desktop's addresses, copy the new HTTPS address to the phone, and use Connect and compare or Resume / retry. The existing token and CA still work. A DHCP reservation can keep the address steady.

Explicit private IPv4 addresses are the simplest common choice here. Modern Android supports `.local`, as does Apple, but the desktop still needs an mDNS advertiser and multicast may be blocked. This implementation adds neither discovery code nor an mDNS library and does not use IPv6 or public IPs. See [Android mDNS resolution](https://source.android.com/docs/core/ota/modular-system/dns-resolver) and [Apple local-network guidance](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

Plain LAN HTTP is not a portable target for an HTTPS Pages app. Chrome can make mixed-content exceptions after network permission; that does not solve Safari. Pairing and all library requests here use trusted HTTPS. CORS allows only the configured Pages **origin**, never `*`. Origins contain scheme and hostname, not repository paths; Pages projects on the same hostname share an origin. Bearer tokens travel in headers, not URLs or cookies.

Only the public CA and instructions are available on HTTP. HTTPS pairing requires the short code; all other APIs require a token. Codes expire after 10 minutes, are single use, and allow five attempts per minute across all devices. Tokens survive app restarts. Forget paired devices revokes them without deleting phone music. Up to 32 pairings are retained; re-pairing consumes another slot. Install only your own desktop's CA, compare its fingerprint, and remove the CA from the phone when no longer using sync.

## Pair an iPhone

1. In Safari, open the desktop's **HTTP setup address**, such as `http://192.168.1.20:8444`. Type `http://` explicitly. If Safari offers HTTPS instead, choose the HTTP setup page. This page has no music or secrets.
2. Compare its CA SHA-256 fingerprint with desktop Settings > Phone sync. Tap Download phone certificate to receive `TaratorMusic.mobileconfig`, containing only the public root certificate.
3. In Settings > General > VPN & Device Management, install the downloaded TaratorMusic profile. Enter the phone passcode if asked.
4. In Settings > General > About > Certificate Trust Settings, enable TaratorMusic Phone Sync under Enable Full Trust for Root Certificates. Installing the profile alone is insufficient. See [Apple's trust instructions](https://support.apple.com/en-us/102390).
5. Return to the Pages app in Safari. Share > Add to Home Screen, then launch from the Home Screen.
6. Enter the desktop **HTTPS address**, including `:8443`, and its six-digit pairing code. Tap Pair phone. Press New pairing code on the desktop if the code expired or was used.
7. Tap Transfer test file. Require the size and SHA-256 success message before continuing.
8. Connect and compare, select songs/playlists, review changes, and Copy additions and updates.

Apple currently exempts Safari and WKWebView traffic from its native Local Network check. Do not expect an iPhone Local Network prompt on every version. If one appears, allow it. If a relevant permission was denied, check Settings > Privacy & Security > Local Network. [Apple documents this exception](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

If the certificate is untrusted: confirm Full Trust is on, the correct root profile is installed, the phone clock is correct, and the IP matches the desktop's current address. Close/reopen Safari and the installed app after trusting the CA. If Full Trust is missing, install the root profile using Safari, not the server certificate. Remove an obsolete TaratorMusic profile and reinstall the current one if needed. A browser warning bypass is insufficient for reliable Pages fetch requests. If the desktop CA state was deleted, install the new CA and pair again.

## Pair an Android phone

1. Set a screen lock (PIN, pattern, or password). In Chrome, open the desktop's **HTTP setup address**, including `http://` and `:8444`.
2. Compare its fingerprint with the desktop and download `TaratorMusic.crt`.
3. Open Settings > Security & privacy > More security settings > Encryption & credentials > Install a certificate > **CA certificate**. Select the file and confirm with the screen lock. Names vary by manufacturer. Choose CA, not Wi-Fi or VPN/app certificate. The `.crt` contains a PEM-encoded root, without a private key. [Google's certificate instructions](https://support.google.com/pixelphone/answer/2844832) also describe screen-lock requirements.
4. Restart Chrome. Open the Pages URL, then Install app or Chrome menu > Add to Home screen / Install app. Launch the installed app.
5. Enter the HTTPS desktop address including `:8443` and the current pairing code. Tap Pair phone.
6. Allow Chrome's Local Network Access prompt. If denied, use site controls / Site settings for the Pages site to allow local network access, then retry. Allow an Android app-level network permission for Chrome if offered. No security flags are needed.
7. Transfer the test file and require the size/checksum success message before syncing.

Current Chromium loads user-added Android roots as trust anchors, so Chrome supports a CA installed in the user CA store. Native Android apps can behave differently. See [Chromium's Android trust store](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/net/cert/internal/trust_store_android.cc). Device administration can prohibit custom certificates.

If untrusted: verify the certificate appears under trusted **user CA certificates**, matches this desktop, and that the clock and desktop IP are current. Reinstall using the CA category and restart Chrome. A request for a private key means the wrong installation category was selected. If the desktop CA was reset, remove the old CA and install the new one.

Chrome Local Network Access replaces the earlier Private Network Access preflight proposal. This implementation uses ordinary CORS and HTTPS. First requests start from buttons, never a service worker. Automatic queue resume runs only when the granular `local-network` permission query reports granted. Safari and browsers without this query show Resume / retry instead. See [Chrome's launch guidance](https://developer.chrome.com/blog/local-network-access) and [current permission guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access). These browser rules were researched on November 2, 2026.

## Selection and transfers

Playlist and individual selections are remembered on the phone. Selecting a playlist includes all of its local songs. To exclude one, deselect the playlist and select individual songs. Stream-only entries have no local file to copy and are omitted.

Connect and compare retrieves a fresh catalog and reviews additions and updates only. Deselected or desktop-deleted songs stay saved and playable on the phone. To delete saved copies, open My Music > Songs > Remove saved songs, check the songs, press Remove checked from phone, and confirm. The removal list follows the current search and playlist filter and works offline. Desktop originals and unchecked songs stay untouched. Cancel transfer keeps saved files and complete 1 MB chunks. Resume / retry continues after those chunks; the last incomplete chunk downloads again. Discard unfinished downloads deletes queued work and chunks while retaining working copies.

The queue runs one song at a time while open. It verifies Range/ETag responses, then finished byte count and SHA-256. Metadata, artwork, and the replacement audio Blob commit in one IndexedDB transaction. Interrupted updates, checksum failures, and failed final writes leave old working copies. A bad checksum resets corrupt partial chunks. If desktop audio changes mid-transfer, compare again to replace the queued version. Progress counts audio bytes, including retained chunks; small artwork downloads are additional.

Songs show pending, downloading, saved, update available, or failed. `audio.canPlayType()` checks the server's MIME type without a phone format allowlist. Rejected formats show not supported on this phone and are skipped. A codec inside a recognized container can still fail; playback reports that error. There is no transcoding.

Existing `song_id` and playlist `id` survive editing/renaming, so no identity migration is needed. Audio version is size plus nanosecond modified time; metadata version hashes displayed fields and the artwork checksum. Audio checksums are calculated only when a transfer manifest is requested. An external edit preserving both size and modified time is intentionally not detected. Metadata edits make no audio request. Album is empty because the existing database does not store albums.

JPEG, PNG, GIF, and WebP artwork is resized to at most 160 pixels and served as JPEG. SVG artwork stays as a vector, limited to 128 KB. Oversized, unsupported, or excessive-dimension images use a placeholder. `golang.org/x/image/webp` is the one added Go dependency: it handles common downloaded artwork without implementing a codec and supports the existing Go 1.24 build. No npm dependencies were added.

## Offline storage and playback

The service worker caches HTML, scripts, CSS, manifest, and icons, never authenticated LAN responses. Metadata, audio Blobs, artwork, jobs, and partial chunks have separate IndexedDB stores. Listing songs does not load audio. One song is assembled/checksummed in memory at a time; unusually large files can exceed phone memory.

The app requests `navigator.storage.persist()` and shows usage/quota from `navigator.storage.estimate()`. Persistence can be refused, and browsers can evict data under storage pressure. Install the app, keep free space, avoid private browsing, and retain desktop originals. After a full-storage error, free space or explicitly remove saved songs, then retry. Music is never silently removed to make room.

First playback starts from a tap. One `<audio>` element uses stored Blob object URLs and revokes old URLs. If a browser blocks the asynchronous first play, tap Play in the bottom player after the file loads. Media Session provides title, artist, album, artwork, play/pause, next/previous, seek, and position when supported. Pause events update the on-screen control, including Bluetooth-triggered pauses.

The player includes a Shuffle toggle that remembers its setting. It shuffles within the current playlist or library, plays each song before starting another cycle, and avoids immediately repeating the current song. Previous follows playback history. Play all also uses shuffle when it is enabled.

A PWA has no CarPlay home-screen icon or library browser. Start music on the phone, then test CarPlay Now Playing. Android Auto may not show a PWA at all; no native Auto integration is promised. Phone media notifications, Bluetooth controls, and screen-locked playback need physical testing. No phone or car results are claimed here.

Sync does not depend on Background Sync or background downloads. Suspending/closing the app can stop transfers, especially on iPhone. Reopen on home Wi-Fi and resume; browser-granted network permission can permit automatic resume. Screen-locked playback must be verified on the actual phones.

## Checks run here

`go test ./backend/offline_sync` uses temporary fixtures for pairing limits/single-use codes, CA persistence, trusted HTTPS transfers, IP certificate renewal, CORS, stable IDs, independent versions, read-only SQLite, artwork, checksums, and Range downloads.

`node_modules/.bin/electron web/verify.cjs` (Windows: `node_modules\.bin\electron.cmd web\verify.cjs`) runs a hidden Chromium browser with a temporary profile. It checks selection persistence/comparison, unchecked removals, cross-window locking, completed files retained across interruption/reopening, resume at byte 1048576, metadata/artwork-only and unchanged sync without audio downloads, checksum rejection, cancellation, quota failure, transaction rollback, shell caching, and reopening after the HTTP server stops. It also checks offline Blob decoding/play start, Media Session metadata, and pause controls. It does not prove audible output or background/phone playback. No test framework was added.

Windows Go builds/tests and hidden Chromium checks passed here. The server also cross-compiled for Linux amd64 and macOS arm64. Cross-compilation does not prove runtime, firewall, or trust behavior. Physical iPhone/Android, macOS/Linux desktop runtime, Bluetooth, CarPlay, and Android Auto are **not tested** in this environment. Use one app window on older browsers without Web Locks; current browsers lock queue changes across windows.

## Manual checklist, in order

Record desktop OS, phone model, OS/browser versions, and actual results. Repeat phone checks on iPhone/Safari and Android/Chrome. Repeat desktop checks on Windows, macOS, and Linux when available.

- [ ] Fresh install: sharing is off and ports 8443/8444 are closed. Enable it; verify addresses and firewall handling on a private network.
- [ ] Install the phone-specific CA. Setup offers a profile on iPhone and CA file on Android; fingerprint matches.
- [ ] Pair from deployed HTTPS Pages, accept applicable permissions, and transfer/verify the test file. Record which prompts actually appear.
- [ ] Wrong, expired, and used codes fail. Six rapid bad attempts rate-limit. Unpaired/forgotten devices cannot fetch music. An unrelated origin cannot read responses.
- [ ] Change desktop DHCP IP, refresh addresses, and reconnect from the paired phone without reinstalling the CA. Test untrusted-certificate recovery separately.
- [ ] Pick a playlist and an individual song. Reopen the installed app; selections remain. Review additions and copy; verify saved status/progress.
- [ ] Repeat unchanged sync: zero additions/updates, zero audio transfers, and existing tracks still play.
- [ ] Edit title/artist: one metadata update, 0 MB audio, same song ID, no `/file` or `/info` request. Change artwork and repeat; only small artwork transfers.
- [ ] Rename a song and playlist: IDs remain stable, no deletion/addition pair, displayed names and saved playlist playback update.
- [ ] Replace audio for the same ID. Interrupt before completion; old saved title/audio still play. Retry validates and swaps the replacement.
- [ ] Sync multiple songs; interrupt Wi-Fi after one finishes, close/reopen, and resume. Finished songs stay; remaining work resumes after stored chunks. Test Cancel and retry too.
- [ ] Corrupt a partial/checksum or use the browser check: mark failed, keep old audio, and retry cleanly. Fill storage or abort a final write; old copies survive.
- [ ] Deselect/delete a desktop song: Connection offers additions and updates only, and the saved song still plays. In My Music, expand Remove saved songs, check a song, cancel once, then confirm removal. Unchecked songs and desktop originals stay unchanged.
- [ ] Test an unsupported MIME type and a decoder failure inside a recognized container; both report visibly.
- [ ] Wait for App shell cached. Enable airplane mode, close/reopen the installed app, and confirm library/artwork and **audible playback** of multiple songs and playlists.
- [ ] Lock the phone for several minutes during playback. Verify continued audio and next-track playback. Record actual results per phone.
- [ ] Test Bluetooth headphones and car stereo: title/artwork, play/pause, next/previous, seek where offered, and disconnect. Pause events must update the phone UI.
- [ ] iPhone: start music on the phone, connect CarPlay, and test Now Playing. Do not expect a CarPlay home icon. Record the actual result.
- [ ] Android: test notification metadata/buttons, Bluetooth car controls, and Android Auto if present. Record whether it appears and which buttons work. Absence in Auto is a PWA limitation.
- [ ] Disable sharing and quit desktop: ports close, sync fails clearly, and saved phone music still plays. Forget devices; old tokens fail after restart.

For later app-shell releases, change `PHONE_CACHE` in `sw.js`. A new worker waits for old windows to close before activating, so scripts are not replaced mid-transfer. After upgrading, reconnect once and repeat airplane-mode checks.
