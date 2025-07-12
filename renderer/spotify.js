const fetch = require("node-fetch");
const cheerio = require("cheerio");

async function getSongName(link) {
	const response = await fetch(link, {
		headers: {
			"User-Agent": "Mozilla/5.0",
		},
	});

	if (!response.ok) return;

	const html = await response.text();
	const $ = cheerio.load(html);

	const title = $("title").text();
	const name = title.replace(" song and lyrics by", "").replace("| Spotify","").trim();
	console.log(name);
}