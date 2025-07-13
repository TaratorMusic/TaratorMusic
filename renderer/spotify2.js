const puppeteer = require("puppeteer");

async function getPlaylistSongsAndArtists(link) {
	console.log("Launching browser...");
	const browser = await puppeteer.launch({ headless: true });
	const page = await browser.newPage();
	await page.setViewport({ width: 1920, height: 1080 });
	await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36");

	console.log("Navigating to playlist page...");
	await page.goto(link, { waitUntil: "networkidle2" });

	console.log("Waiting for tracks to load...");
	await page.waitForSelector('a[data-testid="internal-track-link"]', { timeout: 30000 });

	const scrollContainer = await page.evaluateHandle(() => {
		function isScrollable(el) {
			const style = getComputedStyle(el);
			return (style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
		}

		const allDivs = Array.from(document.querySelectorAll("div"));
		return allDivs.find(div => isScrollable(div) && div.querySelectorAll('a[data-testid="internal-track-link"]').length > 0);
	});

	if (!scrollContainer) {
		console.error("Scroll container not found. The playlist page might have been changed. Wait until the next TaratorMusic update for the fix.");
		await browser.close();
		return;
	}

	const songs = await page.evaluate(async container => {
		function sleep(ms) {
			return new Promise(r => setTimeout(r, ms));
		}

		const seen = new Map();
		let sameCountTimes = 0;

		while (sameCountTimes < 3) {
			container.scrollBy(0, 800);
			await sleep(800);

			const anchors = container.querySelectorAll('a[data-testid="internal-track-link"]');
			let newFound = 0;

			anchors.forEach(a => {
				const title = a.querySelector("div[data-encore-id='text']")?.textContent.trim();
				const artist = a.parentElement?.querySelector("span a[href^='/artist']")?.textContent.trim();
				if (title && artist) {
					const key = title + "||" + artist;
					if (!seen.has(key)) {
						seen.set(key, { title, artist });
						newFound++;
					}
				}
			});

			if (newFound === 0) {
				sameCountTimes++;
			} else {
				sameCountTimes = 0;
			}
		}

		return Array.from(seen.values());
	}, scrollContainer);

	console.log(`Extracted ${songs.length} tracks:`);
	songs.forEach(({ title, artist }, i) => {
		console.log(`${i + 1}. "${title}" by ${artist}`);
	});

	console.log("Closing browser...");
	await browser.close();
}
