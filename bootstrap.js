"use strict";

var CitationCounts;

function log(msg) {
	Zotero.debug("Citation Counts: " + msg);
}

function install() {
	log("Installed");
}

async function startup({ id, version, rootURI }) {
	log("Starting " + version);

	Services.scriptloader.loadSubScript(rootURI + "citationcounts.js");
	CitationCounts.init({ id, version, rootURI });

	// Each registration is isolated: a failure in one should not silently
	// prevent the others from running, and each should say so in the log.
	await step("preference pane", () => Zotero.PreferencePanes.register({
		pluginID: id,
		src: rootURI + "preferences.xhtml",
		scripts: [rootURI + "preferences.js"],
		label: "Citation Counts"
	}));

	// onMainWindowLoad only fires for windows opened after this point, so a
	// window that is already open when the plugin is installed or enabled would
	// never get the .ftl. The menu labels are Fluent IDs, so without it they
	// render blank and MenuManager throws when it can't resolve them.
	await step("localization", () => addFTLToAllWindows());

	await step("notifier", () => CitationCounts.registerNotifier());
	await step("menu", () => CitationCounts.registerMenu());
	await step("column", () => CitationCounts.registerColumn());

	log("Startup complete");
}

async function step(name, fn) {
	try {
		await fn();
		log("Registered " + name);
	}
	catch (e) {
		log("FAILED to register " + name + ": " + e + "\n" + (e.stack || ""));
	}
}

function addFTLToAllWindows() {
	for (const win of Zotero.getMainWindows()) {
		if (!win.ZoteroPane) continue;
		addFTL(win);
	}
}

function addFTL(window) {
	window.MozXULElement.insertFTLIfNeeded("citationcounts.ftl");
}

function removeFTL(window) {
	window.document.querySelector('[href="citationcounts.ftl"]')?.remove();
}

function onMainWindowLoad({ window }) {
	// The menu labels are Fluent IDs resolved against the window's localization
	// context, so the .ftl has to be present in each main window.
	addFTL(window);
}

function onMainWindowUnload({ window }) {
	removeFTL(window);
}

function shutdown() {
	log("Shutting down");

	if (!CitationCounts) return;

	if (CitationCounts.notifierID) {
		Zotero.Notifier.unregisterObserver(CitationCounts.notifierID);
		CitationCounts.notifierID = null;
	}

	// Menus and columns registered with a pluginID are torn down automatically
	// when the plugin is disabled, but doing it explicitly keeps disable/enable
	// cycles within a single session clean.
	if (CitationCounts.menuID) {
		Zotero.MenuManager.unregisterMenu(CitationCounts.menuID);
		CitationCounts.menuID = null;
	}
	if (CitationCounts.columnID) {
		Zotero.ItemTreeManager.unregisterColumn(CitationCounts.columnID);
		CitationCounts.columnID = null;
	}

	for (const win of Zotero.getMainWindows()) {
		removeFTL(win);
	}

	CitationCounts = undefined;
}

function uninstall() {
	log("Uninstalled");
}
