const { request } = require("undici");

const BASE_PLIST_URL = "https://www.youtube.com/playlist?";
const BASE_API_URL = "https://www.youtube.com/youtubei/v1/browse";
const YT_HOSTS = ["www.youtube.com", "youtube.com", "music.youtube.com"];
const CONSENT_COOKIE = "SOCS=CAI";

const PLAYLIST_REGEX = /^(FL|PL|UU|LL|RD)[a-zA-Z0-9-_]{16,41}$/;
const ALBUM_REGEX = /^OLAK5uy_[a-zA-Z0-9-_]{33}$/;
const CHANNEL_REGEX = /^UC[a-zA-Z0-9-_]{22,32}$/;

const DEFAULT_CONTEXT = {
	client: {
		utcOffsetMinutes: -300,
		gl: "US",
		hl: "en",
		clientName: "WEB",
		clientVersion: "2.20260807.00.00",
	},
	user: {},
	request: {},
};

function between(haystack, left, right) {
	let pos;
	if (left instanceof RegExp) {
		const match = haystack.match(left);
		if (!match) return "";
		pos = match.index + match[0].length;
	} else {
		pos = haystack.indexOf(left);
		if (pos === -1) return "";
		pos += left.length;
	}
	const result = haystack.slice(pos);
	const endPos = result.indexOf(right);
	if (endPos === -1) return "";
	return result.slice(0, endPos);
}

function tryParseBetween(body, left, right, addEndCurly = false) {
	try {
		let data = between(body, left, right);
		if (!data) return null;
		if (addEndCurly) data += "}";
		return JSON.parse(data);
	} catch {
		return null;
	}
}

function parseText(txt) {
	if (!txt) return "";
	if (txt.simpleText) return txt.simpleText;
	if (txt.runs) return txt.runs.map(run => run.text || "").join("");
	if (typeof txt == "string") return txt;
	return "";
}

function parseNumFromText(txt) {
	return Number(parseText(txt).replace(/\D+/g, ""));
}

async function fetchBody(url, headers) {
	return request(url, {
		headers: {
			"user-agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
			cookie: CONSENT_COOKIE,
			"accept-language": "en-US,en;q=0.9",
			...headers,
		},
		method: "GET",
	}).then(res => res.body.text());
}

async function postBrowse(apiKey, payload) {
	const url = `${BASE_API_URL}?key=${encodeURIComponent(apiKey)}&prettyPrint=false`;
	return request(url, {
		method: "POST",
		headers: {
			"user-agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
			cookie: CONSENT_COOKIE,
			"content-type": "application/json",
		},
		body: JSON.stringify(payload),
	}).then(res => res.body.json());
}

// Collect every `lockupViewModel` inside an arbitrary tree.
function collectLockups(node, out = []) {
	if (!node || typeof node !== "object") return out;
	if (Array.isArray(node)) {
		for (const item of node) collectLockups(item, out);
		return out;
	}
	if (node.lockupViewModel) {
		out.push(node.lockupViewModel);
		return out;
	}
	for (const key of Object.keys(node)) collectLockups(node[key], out);
	return out;
}

// Find the continuation token inside an arbitrary tree.
function findContinuationToken(node) {
	if (!node || typeof node !== "object") return null;
	if (Array.isArray(node)) {
		for (const item of node) {
			const token = findContinuationToken(item);
			if (token) return token;
		}
		return null;
	}
	if (node.continuationCommand && node.continuationCommand.token) {
		return node.continuationCommand.token;
	}
	for (const key of Object.keys(node)) {
		const token = findContinuationToken(node[key]);
		if (token) return token;
	}
	return null;
}

function parseLockup(lockup) {
	const id = lockup.contentId;
	const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
	if (!id || !title) return null;

	const sources = lockup.contentImage?.thumbnailViewModel?.image?.sources || [];
	let thumbnail = null;
	if (sources.length) {
		const largest = sources.reduce((max, src) => ((src.width || 0) > (max.width || 0) ? src : max), sources[0]);
		thumbnail = largest.url || null;
	}

	return {
		title,
		id,
		shortUrl: `https://www.youtube.com/watch?v=${id}`,
		url: `https://www.youtube.com/watch?v=${id}`,
		thumbnail,
		isLive: false,
		duration: null,
	};
}

function getPlaylistID(linkOrId) {
	if (typeof linkOrId !== "string" || !linkOrId) {
		throw new Error("The linkOrId has to be a string");
	}

	if (PLAYLIST_REGEX.test(linkOrId) || ALBUM_REGEX.test(linkOrId)) {
		return linkOrId;
	}
	if (CHANNEL_REGEX.test(linkOrId)) {
		return `UU${linkOrId.slice(2)}`;
	}

	const parsed = new URL(linkOrId, BASE_PLIST_URL);
	if (!YT_HOSTS.includes(parsed.host)) throw new Error("not a known youtube link");
	if (parsed.searchParams.has("list")) {
		const listParam = parsed.searchParams.get("list");
		if (PLAYLIST_REGEX.test(listParam) || ALBUM_REGEX.test(listParam)) {
			return listParam;
		}
		if (listParam.startsWith("RD")) throw new Error("Mixes not supported");
		throw new Error("invalid or unknown list query in url");
	}

	const segments = parsed.pathname.slice(1).split("/");
	if (segments.length < 2 || segments.some(seg => !seg)) {
		throw new Error(`Unable to find a id in "${linkOrId}"`);
	}
	const maybeType = segments[segments.length - 2];
	const maybeId = segments[segments.length - 1];
	if (maybeType == "channel" && CHANNEL_REGEX.test(maybeId)) {
		return `UU${maybeId.slice(2)}`;
	}
	throw new Error(`Unable to find a id in "${linkOrId}"`);
}

async function fetchPlaylist(linkOrId, options = {}) {
	const limit = !Number.isNaN(Number(options.limit)) && Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : Infinity;
	const plistId = await getPlaylistID(linkOrId);

	const body = await fetchBody(`${BASE_PLIST_URL}?hl=en&gl=US&list=${plistId}`);

	let json =
		tryParseBetween(body, "var ytInitialData = ", "};", true) ||
		tryParseBetween(body, 'window["ytInitialData"] = ', "};", true) ||
		tryParseBetween(body, "var ytInitialData = ", "</script>") ||
		tryParseBetween(body, 'window["ytInitialData"] = ', "</script>");

	const apiKey = between(body, 'INNERTUBE_API_KEY":"', '"') || between(body, 'innertubeApiKey":"', '"');

	const visitorData = json?.responseContext?.visitorData;

	if (!json && apiKey) {
		const browseId = between(body, '"key":"browse_id","value":"', '"') || `VL${plistId}`;
		try {
			json = await postBrowse(apiKey, { context: DEFAULT_CONTEXT, browseId });
		} catch {
			json = null;
		}
	}

	if (!json) throw new Error("Unsupported YouTube Playlist response.");

	const sidebar = json.sidebar?.playlistSidebarRenderer?.items || [];
	const primary = sidebar.find(item => Object.keys(item)[0] == "playlistSidebarPrimaryInfoRenderer")?.playlistSidebarPrimaryInfoRenderer;

	let title = primary ? parseText(primary.title) : tryParseBetween(body, "<title>", "</title>")?.replace(/\s*-\s*YouTube\s*$/, "").trim();

	const resp = {
		id: plistId,
		url: `https://www.youtube.com/playlist?list=${plistId}`,
		title: title || "",
		description: primary ? parseText(primary.description) : "",
		total_items: primary && primary.stats ? parseNumFromText(primary.stats[0]) : 0,
		items: [],
	};

	const contents =
		json.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
		json.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content;
	if (!contents) throw new Error("Empty playlist");

	let collected = collectLockups(contents).map(parseLockup).filter(Boolean);
	resp.items.push(...collected);
	if (resp.items.length) {
		resp.thumbnail = {
			url: resp.items[0].thumbnail,
		};
	}

	let token = findContinuationToken(contents);
	while (token && resp.items.length < limit) {
		const context = JSON.parse(JSON.stringify(DEFAULT_CONTEXT));
		if (visitorData) context.client.visitorData = visitorData;

		let page;
		try {
			page = await postBrowse(apiKey, { context, continuation: token });
		} catch {
			break;
		}

		let listItems = [];
		for (const action of page.onResponseReceivedActions || page.onResponseReceivedEndpoints || []) {
			const contItems = action.appendContinuationItemsAction?.continuationItems || action.continueContinuationCommand?.continuationItems;
			if (contItems) listItems.push(...contItems);
		}
		if (!listItems.length) break;

		const prevCount = resp.items.length;
		const newItems = collectLockups(listItems).map(parseLockup).filter(Boolean);
		for (const item of newItems) {
			if (!resp.items.some(existing => existing.id == item.id)) resp.items.push(item);
			if (resp.items.length >= limit) break;
		}

		if (resp.items.length == prevCount) break; // no progress
		token = findContinuationToken(listItems);
	}

	return resp;
}

module.exports = fetchPlaylist;
module.exports.getPlaylistID = getPlaylistID;
module.exports.validateID = linkOrId => {
	try {
		getPlaylistID(linkOrId);
		return true;
	} catch {
		return false;
	}
};