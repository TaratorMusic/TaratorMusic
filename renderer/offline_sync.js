(() => {
	let busy = false;
	window.addEventListener("phone-sync-status", event => showStatus(event.detail));

	async function setSharing(enabled, page) {
		let binary;
		if (enabled) {
			await runBinaryCheck();
			binary = getAppFilePart("offline-sync", "binary");
			if (!binary || getAppFile("offline-sync")?.state != "present") throw new Error("Phone sync binary is unavailable. Run npm run gobuild.");
		}
		return await window.desktopSync.set({ enabled, page, binary });
	}

	function showStatus(status) {
		document.getElementById("offlineSyncToggle").checked = !!status.enabled;
		const lines = [status.enabled ? "Sharing on" : "Off"];
		if (status.enabled) {
			lines.push(`Phone app: ${status.page}`, `Pairing code: ${status.code || "Used. Press New pairing code."}`, `Expires: ${new Date(status.expires).toLocaleTimeString()}`, `Paired devices: ${status.paired}`);
			for (const address of status.addresses) lines.push(`\nOpen on phone first: ${address.setup}\nDesktop address in phone app: ${address.server}`);
			if (!status.addresses.length) lines.push("No private IPv4 address found. Connect to home Wi-Fi, then refresh.");
			lines.push(`\nCA SHA-256 fingerprint:\n${status.fingerprint}`);
		}
		if (status.error) lines.push(status.error);
		document.getElementById("offlineSyncInfo").textContent = lines.join("\n");
	}

	window.initializeOfflineSync = async settings => {
		document.getElementById("offlineSyncPage").value = settings.offlineSyncPage;
		if (settings.offlineSyncEnabled == 1) {
			try {
				showStatus(await setSharing(true, settings.offlineSyncPage));
			} catch (error) {
				showStatus({ enabled: false, error: error.message });
				logChange("error", error.message);
			}
		}
	};

	window.toggleOfflineSync = async () => {
		if (busy) return;
		busy = true;
		const toggle = document.getElementById("offlineSyncToggle");
		toggle.disabled = true;
		try {
			const page = document.getElementById("offlineSyncPage").value.trim();
			const status = await setSharing(toggle.checked, page);
			await callSqlite({ db: "settings", query: "UPDATE settings SET offlineSyncEnabled = ?, offlineSyncPage = ?", args: [status.enabled ? 1 : 0, page] });
			showStatus(status);
		} catch (error) {
			showStatus({ enabled: false, error: error.message });
			logChange("error", error.message);
		} finally {
			toggle.disabled = false;
			busy = false;
		}
	};

	window.refreshOfflineSync = async command => {
		try {
			if (command == "revoke" && !(await confirmModal("Disconnect every paired phone? Saved music stays on each phone.", "Forget devices", "Cancel"))) return;
			showStatus(await window.desktopSync.command(command));
		} catch (error) {
			logChange("error", error.message);
		}
	};

	setInterval(() => {
		if (!busy && document.getElementById("offlineSyncToggle").checked) window.refreshOfflineSync("status");
	}, 5000);
})();
