"use strict";

const PHONE_CACHE = "tarator-phone-v15";
const PHONE_SHELL = ["./", "./index.html", "./style.css", "./storage.js", "./transfer.js", "./player.js", "./app.js", "./manifest.webmanifest", "./favicon.png", "./icon-192.png", "./icon-512.png", "./play.svg", "./pause.svg", "./previous.svg", "./next.svg", "./queue.svg", "./settings.svg", "./refresh.svg"];

self.addEventListener("install", event => {
	event.waitUntil(caches.open(PHONE_CACHE).then(cache => cache.addAll(PHONE_SHELL)));
});

self.addEventListener("activate", event => {
	event.waitUntil((async () => {
		for (const key of await caches.keys()) if (key.startsWith("tarator-phone-") && key != PHONE_CACHE) await caches.delete(key);
		await self.clients.claim();
	})());
});

self.addEventListener("fetch", event => {
	const url = new URL(event.request.url);
	if (event.request.method != "GET" || url.origin != self.location.origin || !url.href.startsWith(self.registration.scope)) return;
	// Only the app shell belongs in CacheStorage. Audio and authenticated LAN requests stay out.
	event.respondWith((async () => {
		const cache = await caches.open(PHONE_CACHE);
		const saved = await cache.match(event.request, { ignoreSearch: true });
		if (saved) return saved;
		try { return await fetch(event.request); } catch (error) {
			if (event.request.mode == "navigate") return await cache.match("./index.html");
			throw error;
		}
	})());
});
