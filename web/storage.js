"use strict";

const phoneDB = (() => {
	let database;

	async function open() {
		if (database) return database;
		database = await new Promise((resolve, reject) => {
			const request = indexedDB.open("tarator-offline", 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				for (const name of ["songs", "audio", "artwork", "jobs"]) db.createObjectStore(name, { keyPath: "id" });
				db.createObjectStore("settings", { keyPath: "key" });
				const chunks = db.createObjectStore("chunks", { keyPath: "key" });
				chunks.createIndex("songId", "songId");
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
			request.onblocked = () => reject(new Error("Close other TaratorMusic tabs, then reopen."));
		});
		database.onversionchange = () => { database.close(); database = null; };
		return database;
	}

	async function read(store, key) {
		const db = await open();
		return await new Promise((resolve, reject) => {
			const request = db.transaction(store).objectStore(store).get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async function all(store) {
		const db = await open();
		return await new Promise((resolve, reject) => {
			const request = db.transaction(store).objectStore(store).getAll();
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	async function change(stores, action) {
		const db = await open();
		return await new Promise((resolve, reject) => {
			const transaction = db.transaction(stores, "readwrite");
			transaction.oncomplete = resolve;
			transaction.onabort = () => reject(transaction.error || new Error("Storage transaction cancelled."));
			transaction.onerror = () => {};
			try { action(transaction); } catch (error) { transaction.abort(); reject(error); }
		});
	}

	async function put(store, value) {
		await change([store], transaction => transaction.objectStore(store).put(value));
	}

	function deleteChunks(transaction, id) {
		const request = transaction.objectStore("chunks").index("songId").openKeyCursor(IDBKeyRange.only(id));
		request.onsuccess = () => {
			const cursor = request.result;
			if (!cursor) return;
			transaction.objectStore("chunks").delete(cursor.primaryKey);
			cursor.continue();
		};
	}

	async function resetPartial(job) {
		job.bytes = 0;
		await change(["chunks", "jobs"], transaction => {
			deleteChunks(transaction, job.id);
			transaction.objectStore("jobs").put(job);
		});
	}

	async function saveChunk(job, offset, blob) {
		await change(["chunks", "jobs"], transaction => {
			transaction.objectStore("chunks").put({ key: [job.id, offset], songId: job.id, blob });
			transaction.objectStore("jobs").put(job);
		});
	}

	async function partialBlob(job) {
		const db = await open();
		const chunks = await new Promise((resolve, reject) => {
			const request = db.transaction("chunks").objectStore("chunks").index("songId").getAll(job.id);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		chunks.sort((a, b) => a.key[1] - b.key[1]);
		let offset = 0;
		for (const chunk of chunks) {
			if (chunk.key[1] != offset) throw new Error("Partial download has a gap. Retry this song.");
			offset += chunk.blob.size;
		}
		return new Blob(chunks.map(chunk => chunk.blob), { type: job.song.mime });
	}

	async function commitSong(job, blob, artwork) {
		// One transaction swaps verified files and metadata. Abort keeps the old copy.
		await change(["songs", "audio", "artwork", "jobs", "chunks"], transaction => {
			transaction.objectStore("songs").put(job.song);
			if (blob) transaction.objectStore("audio").put({ id: job.id, blob, version: job.song.audioVersion });
			if (artwork) transaction.objectStore("artwork").put({ id: job.id, blob: artwork, version: job.song.artworkVersion });
			if (artwork === null) transaction.objectStore("artwork").delete(job.id);
			transaction.objectStore("jobs").delete(job.id);
			deleteChunks(transaction, job.id);
		});
	}

	async function removeSong(id) {
		await change(["songs", "audio", "artwork", "jobs", "chunks"], transaction => {
			for (const name of ["songs", "audio", "artwork", "jobs"]) transaction.objectStore(name).delete(id);
			deleteChunks(transaction, id);
		});
	}

	async function cancelJob(id) {
		await change(["jobs", "chunks"], transaction => {
			transaction.objectStore("jobs").delete(id);
			deleteChunks(transaction, id);
		});
	}

	return { open, read, all, change, put, resetPartial, saveChunk, partialBlob, commitSong, removeSong, cancelJob };
})();
