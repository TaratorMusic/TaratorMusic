const https = require("node:https");

// Mirrors yt-dlp's YoutubeSearchIE (yt_dlp/extractor/youtube/_search.py): the
// same WEB client, the same "videos only" filter and the same Innertube search
// endpoint. yt-dlp additionally spawns a full extraction per result to fill in
// the formats, the exact duration and the availability, none of which the
// callers here read.
//
// The requests go through node:https instead of undici because undici's fast
// timers call .unref() on the timer they get back, and the renderer only has
// the browser setTimeout, which returns a number.
const SEARCH_ENDPOINT = "https://www.youtube.com/youtubei/v1/search";
const HOME_URL = "https://www.youtube.com/";
const VIDEOS_ONLY_PARAMS = "EgIQAfABAQ==";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const CONSENT_COOKIE = "SOCS=CAI";
const MAX_PAGES = 4;

const DEFAULT_CONTEXT = {
	client: {
		utcOffsetMinutes: -300,
		gl: "US",
		hl: "en",
		clientName: "WEB",
		clientVersion: "2.20261020.01.00",
	},
	user: {},
	request: {},
};

let apiKey = "";
let clientVersion = "";

function between(body, left, right) {
	const start = body.indexOf(left);
	if (start === -1) return "";
	const end = body.indexOf(right, start + left.length);
	if (end === -1) return "";
	return body.slice(start + left.length, end);
}

function request(url, { method = "GET", headers = {}, body = null } = {}) {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const clientRequest = https.request(
			{
				method: method,
				hostname: target.hostname,
				path: target.pathname + target.search,
				headers: headers,
			},
			response => {
				const chunks = [];
				response.on("data", chunk => chunks.push(chunk));
				response.on("end", () => resolve({ statusCode: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
			},
		);
		clientRequest.on("error", reject);
		if (body) clientRequest.write(body);
		clientRequest.end();
	});
}

async function fetchBody(url) {
	const response = await request(url, {
		headers: {
			"user-agent": USER_AGENT,
			cookie: CONSENT_COOKIE,
			"accept-language": "en-US,en;q=0.9",
		},
	});
	return response.body;
}

async function getApiKey() {
	if (apiKey) return apiKey;

	const body = await fetchBody(HOME_URL);
	apiKey = between(body, 'INNERTUBE_API_KEY":"', '"') || between(body, 'innertubeApiKey":"', '"');
	clientVersion = between(body, 'INNERTUBE_CLIENT_VERSION":"', '"') || between(body, 'innertubeClientVersion":"', '"') || DEFAULT_CONTEXT.client.clientVersion;
	if (!apiKey) throw new Error("Could not read the YouTube API key.");
	return apiKey;
}

async function postSearch(query, key, continuation) {
	const context = JSON.parse(JSON.stringify(DEFAULT_CONTEXT));
	context.client.clientVersion = clientVersion || DEFAULT_CONTEXT.client.clientVersion;

	const payload = { context: context, query: query, params: VIDEOS_ONLY_PARAMS };
	if (continuation) payload.continuation = continuation;

	const response = await request(`${SEARCH_ENDPOINT}?key=${encodeURIComponent(key)}&prettyPrint=false`, {
		method: "POST",
		headers: {
			"user-agent": USER_AGENT,
			cookie: CONSENT_COOKIE,
			"content-type": "application/json",
			"accept-language": "en-US,en;q=0.9",
		},
		body: JSON.stringify(payload),
	});

	if (response.statusCode == 400) {
		const error = new Error("YouTube rejected the search request.");
		error.statusCode = 400;
		throw error;
	}

	return JSON.parse(response.body);
}

function parseText(text) {
	if (!text) return "";
	if (text.simpleText) return text.simpleText;
	if (text.runs) return text.runs.map(run => run.text || "").join("");
	if (typeof text == "string") return text;
	return "";
}

function parseDuration(lengthText) {
	if (!lengthText) return 0;
	const parts = String(lengthText)
		.split(":")
		.map(part => Number(part));
	if (parts.some(part => !Number.isFinite(part))) return 0;
	return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

function parseCount(text) {
	if (!text) return 0;
	const match = String(text).replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
	if (!match) return 0;
	const value = Number(match[1]);
	if (!Number.isFinite(value)) return 0;
	const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] || "").toUpperCase()] || 1;
	return Math.round(value * multiplier);
}

function collectVideoRenderers(node, out = []) {
	if (!node || typeof node !== "object") return out;
	if (node.videoRenderer) out.push(node.videoRenderer);
	for (const key of Object.keys(node)) collectVideoRenderers(node[key], out);
	return out;
}

function findContinuationToken(node) {
	if (!node || typeof node !== "object") return null;
	if (node.continuationCommand && node.continuationCommand.token) return node.continuationCommand.token;
	for (const key of Object.keys(node)) {
		const token = findContinuationToken(node[key]);
		if (token) return token;
	}
	return null;
}

function parseVideoRenderer(renderer) {
	const id = renderer.videoId;
	if (!id) return null;

	const thumbnails = renderer.thumbnail?.thumbnails || [];
	const best = thumbnails.reduce((max, thumb) => ((thumb.width || 0) * (thumb.height || 0) > (max.width || 0) * (max.height || 0) ? thumb : max), thumbnails[0] || {});

	const isLive = !!renderer.liveNowAccessibility || renderer.isLiveContent === true;
	const isUpcoming = !isLive && !!renderer.upcomingEventData;
	const webpageUrl = `https://www.youtube.com/watch?v=${id}`;

	return {
		id: id,
		title: parseText(renderer.title),
		duration: parseDuration(renderer.lengthText?.simpleText),
		thumbnail: best.url || null,
		view_count: parseCount(renderer.viewCountText?.simpleText),
		channel: parseText(renderer.ownerText),
		is_live: isLive,
		live_status: isLive ? "is_live" : isUpcoming ? "is_upcoming" : "not_live",
		webpage_url: webpageUrl,
		url: webpageUrl,
	};
}

async function searchPages(query, limit) {
	const results = [];
	let continuation = null;

	for (let page = 0; page < MAX_PAGES; page++) {
		const key = await getApiKey();
		const response = await postSearch(query, key, continuation);

		for (const renderer of collectVideoRenderers(response)) {
			const entry = parseVideoRenderer(renderer);
			if (!entry) continue;
			if (entry.is_live || entry.live_status == "is_live") continue;
			if (results.some(existing => existing.id == entry.id)) continue;
			results.push(entry);
			if (results.length >= limit) break;
		}

		if (results.length >= limit) break;

		const token = findContinuationToken(response);
		if (!token || token == continuation) break;
		continuation = token;
	}

	return results;
}

function normalizeYtDlpEntry(entry) {
	const thumbnails = entry.thumbnails || [];
	const best = thumbnails.reduce((max, thumb) => ((thumb.width || 0) * (thumb.height || 0) > (max.width || 0) * (max.height || 0) ? thumb : max), thumbnails[0] || {});
	const isLive = !!entry.is_live || entry.live_status == "is_live";

	return {
		id: entry.id,
		title: entry.title,
		duration: entry.duration || 0,
		thumbnail: best.url || entry.thumbnail || null,
		view_count: entry.view_count || 0,
		channel: entry.channel || entry.uploader || "",
		is_live: isLive,
		live_status: entry.live_status || "not_live",
		webpage_url: entry.webpage_url || entry.url || "",
		url: entry.url || entry.webpage_url || "",
	};
}

async function searchYouTubeWithFallback(query, limit = 20) {
	const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 20;

	try {
		return await searchPages(query, max);
	} catch (error) {
		if (error?.statusCode == 400) {
			apiKey = "";
			try {
				return await searchPages(query, max);
			} catch (retryError) {
				error = retryError;
			}
		}

		// The fallback needs getVideoInfo from download_music.js, which every
		// caller loads before searching.
		if (typeof getVideoInfo !== "function") throw error;

		if (typeof logChange == "function") logChange("warn", `YouTube search failed, using yt-dlp instead: ${error?.message ?? String(error)}`);
		const result = await getVideoInfo(`ytsearch${max}:${query}`);
		const entries = result?.entries || (result ? [result] : []);
		return entries.filter(Boolean).map(normalizeYtDlpEntry);
	}
}

module.exports = searchYouTubeWithFallback;
module.exports.searchYouTube = searchYouTubeWithFallback;
