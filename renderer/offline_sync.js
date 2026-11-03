(() => {
	let busy = false;
	let currentStatus = { enabled: false, addresses: [] };
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
		currentStatus = status;
		document.getElementById("offlineSyncToggle").checked = !!status.enabled;
		document.getElementById("offlineSyncSharingTitle").textContent = status.local ? "Allow connections from this PC" : "Share library on home Wi-Fi";
		document.getElementById("offlineSyncPage").readOnly = !!status.enabled;
		document.getElementById("offlineSyncLocalPreset").disabled = !!status.enabled;
		document.getElementById("offlineSyncDetails").hidden = !status.enabled;
		let message = "Sharing is off. Enter your webapp address, then enable sharing above.";
		if (status.enabled) {
			message = `${status.local ? "Local PC testing is ready" : "Sharing is on"}. ${status.paired} paired device${status.paired == 1 ? "" : "s"}. Use the desktop address and pairing code below in the webapp.`;
			const codeAvailable = !!status.code && new Date(status.expires).getTime() > Date.now();
			document.getElementById("offlineSyncCode").value = codeAvailable ? status.code : "";
			document.getElementById("offlineSyncCopyCode").disabled = !codeAvailable;
			document.getElementById("offlineSyncCodeExpiry").textContent = codeAvailable ? "Valid until " + new Date(status.expires).toLocaleTimeString() + ". Each code can be used once." : "This code was used or expired. Press New pairing code.";
			document.getElementById("offlineSyncFingerprint").value = status.fingerprint || "";
			const network = document.getElementById("offlineSyncNetwork");
			const addresses = status.addresses || [];
			if (JSON.stringify([...network.options].map(option => option.value)) != JSON.stringify(addresses.map(address => address.server))) {
				const selected = network.value;
				network.replaceChildren();
				for (const address of addresses) network.add(new Option(address.server, address.server));
				if (addresses.some(address => address.server == selected)) network.value = selected;
			}
			document.getElementById("offlineSyncCopyAddress").disabled = !addresses.length;
			if (!addresses.length) message = "Sharing is on, but no home Wi-Fi address was found. Connect to your home network, then press Refresh addresses.";
			window.updateOfflineSyncAddress();
		}
		if (status.error) message = "Sharing needs attention: " + status.error;
		document.getElementById("offlineSyncInfo").textContent = message;
		document.getElementById("offlineSyncInfo").dataset.state = status.error ? "error" : status.enabled ? "ready" : "off";
	}

	window.updateOfflineSyncAddress = () => {
		const address = (currentStatus.addresses || []).find(item => item.server == document.getElementById("offlineSyncNetwork").value);
		document.getElementById("offlineSyncCertificate").hidden = !address?.setup;
		document.getElementById("offlineSyncSetup").value = address?.setup || "";
	};

	window.useLocalOfflineSync = () => {
		if (currentStatus.enabled) return;
		document.getElementById("offlineSyncPage").value = "http://127.0.0.1:8080/";
		document.getElementById("offlineSyncSharingTitle").textContent = "Allow connections from this PC";
		document.getElementById("offlineSyncInfo").textContent = "Local address selected. Enable sharing above, then open http://127.0.0.1:8080/ in your browser on this PC.";
	};

	window.copyOfflineSyncValue = async (id, button) => {
		const value = document.getElementById(id).value;
		if (!value) return;
		try {
			await window.desktopSync.copy(value);
			const label = button.textContent;
			button.textContent = "Copied";
			setTimeout(() => { button.textContent = label; }, 2000);
		} catch (error) {
			document.getElementById("offlineSyncInfo").textContent = "Could not copy. Select the address or code and copy it manually.";
			logChange("error", error.message);
		}
	};

	window.initializeOfflineSync = async settings => {
		document.getElementById("offlineSyncPage").value = settings.offlineSyncPage;
		showStatus({ enabled: false });
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
			document.getElementById("offlineSyncInfo").textContent = error.message;
			logChange("error", error.message);
		}
	};

	setInterval(() => {
		if (!busy && document.getElementById("offlineSyncToggle").checked) window.refreshOfflineSync("status");
	}, 5000);
})();
