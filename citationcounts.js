"use strict";

var CitationCounts = {
	id: null,
	version: null,
	rootURI: null,
	initialized: false,

	notifierID: null,
	columnID: null,
	menuID: null,

	// Guards against overlapping runs (auto-retrieve firing while a manual run
	// is in progress, or an impatient double-click on a menu item).
	running: false,

	// ---------------------------------------------------------------- lifecycle

	init({ id, version, rootURI }) {
		if (this.initialized) return;
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		this.initialized = true;
	},

	log(msg) {
		Zotero.debug("Citation Counts: " + msg);
	},

	// Zotero 8 dropped Bluebird, so don't reach for Zotero.Promise.delay.
	delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	},

	// Prefs live under extensions.zotero.citationcounts.*, which is the branch
	// Zotero.Prefs already reads from, so no second argument is needed.
	getPref(key) {
		return Zotero.Prefs.get("citationcounts." + key);
	},

	setPref(key, value) {
		return Zotero.Prefs.set("citationcounts." + key, value);
	},

	// ------------------------------------------------------------------ sources

	// Each source exposes retrieve(item) -> array of [label, count] pairs.
	// An empty array means "nothing found for this item", which is not an error.
	// Anything genuinely wrong (network, auth, malformed response) throws.
	SOURCES: {
		crossref: {
			label: "Crossref",
			async retrieve(item) {
				const doi = CitationCounts.getDOI(item);
				if (!doi) return [];
				// A DataCite arXiv DOI is guaranteed to 404 here. For a library
				// of preprints that is most of the requests, so skip them.
				if (CitationCounts.isArxivDOI(doi)) return [];

				const mailto = CitationCounts.getPref("crossrefMailto");
				let url = "https://api.crossref.org/works/" + CitationCounts.encodeDOI(doi);
				if (mailto) url += "?mailto=" + encodeURIComponent(mailto);

				// Crossref returns 404 for any DOI it doesn't hold — DataCite,
				// arXiv, non-member publishers. That's an ordinary miss.
				const body = await CitationCounts.getJSON(url, { allow404: true });
				const count = body?.message?.["is-referenced-by-count"];
				if (!Number.isInteger(count)) return [];
				return [["Crossref", count]];
			}
		},

		inspire: {
			label: "INSPIRE-HEP",
			async retrieve(item) {
				const results = [];
				let doi = CitationCounts.getDOI(item);
				const arxiv = CitationCounts.getArxivID(item);

				if (doi && arxiv && CitationCounts.isArxivDOI(doi)) {
					doi = null;
				}

				for (const [idtype, id, tag] of [
					["doi", doi, "Inspire/DOI"],
					["arxiv", arxiv, "Inspire/arXiv"]
				]) {
					if (!id) continue;
					const url = "https://inspirehep.net/api/" + idtype + "/"
						+ (idtype === "doi" ? CitationCounts.encodeDOI(id) : encodeURIComponent(id));
					// A 404 here just means INSPIRE doesn't index this paper.
					const body = await CitationCounts.getJSON(url, { allow404: true });
					const count = body?.metadata?.citation_count;
					if (Number.isInteger(count)) results.push([tag, count]);
				}
				return results;
			}
		},

		semanticscholar: {
			label: "Semantic Scholar",
			// Semantic Scholar rate-limits unauthenticated clients hard. Without
			// an API key we pace requests; with one the limit is much higher.
			get delay() {
				return CitationCounts.getPref("semanticScholarApiKey") ? 100 : 3000;
			},
			async retrieve(item) {
				const results = [];
				let doi = CitationCounts.getDOI(item);
				const arxiv = CitationCounts.getArxivID(item);
				const apiKey = CitationCounts.getPref("semanticScholarApiKey");
				const headers = apiKey ? { "x-api-key": apiKey } : {};

				// An arXiv DataCite DOI resolves to the same Semantic Scholar
				// record as the bare arXiv ID. Querying both doubles the request
				// count against a rate-limited API and writes two Extra lines
				// with an identical number.
				if (doi && arxiv && CitationCounts.isArxivDOI(doi)) {
					doi = null;
				}

				for (const [prefix, id, tag] of [
					["DOI:", doi, "Semantic Scholar/DOI"],
					["arXiv:", arxiv, "Semantic Scholar/arXiv"]
				]) {
					if (!id) continue;
					const url = "https://api.semanticscholar.org/graph/v1/paper/"
						+ prefix
						+ (prefix === "DOI:" ? CitationCounts.encodeDOI(id) : encodeURIComponent(id))
						+ "?fields=citationCount";
					const body = await CitationCounts.getJSON(url, { allow404: true, headers });
					// citationCount is the real total. The old /v1/paper/ endpoint
					// returned a truncated `citations` array, so counts above the
					// page size were silently wrong.
					const count = body?.citationCount;
					if (Number.isInteger(count)) results.push([tag, count]);
				}
				return results;
			}
		},

		ads: {
			label: "NASA/ADS",
			delay: 500,
			async retrieve(item) {
				const apiKey = CitationCounts.getPref("adsApiKey");
				if (!apiKey) {
					throw new CitationCounts.SourceError("citationcounts-error-no-ads-key", null, true);
				}
				const doi = CitationCounts.getDOI(item);
				const arxiv = CitationCounts.getArxivID(item);

				let query = null;
				let tag = null;
				if (doi) {
					query = 'doi:"' + doi + '"';
					tag = "NASA ADS/DOI";
				}
				else if (arxiv) {
					query = 'arxiv:"' + arxiv + '"';
					tag = "NASA ADS/arXiv";
				}
				else {
					return [];
				}

				const url = "https://api.adsabs.harvard.edu/v1/search/query?q="
					+ encodeURIComponent(query) + "&fl=citation_count&rows=1";
				const body = await CitationCounts.getJSON(url, {
					headers: { Authorization: "Bearer " + apiKey }
				});
				const count = body?.response?.docs?.[0]?.citation_count;
				if (!Number.isInteger(count)) return [];
				return [[tag, count]];
			}
		}
	},

	// A failure we can explain to the user via a localized message. `fatal`
	// means the same thing will happen to every remaining item (bad credentials,
	// rate limit), so the run should stop rather than hammer the API. Everything
	// else is per-item: record it and carry on.
	SourceError: class SourceError extends Error {
		constructor(l10nID, args, fatal = false) {
			super(l10nID);
			this.l10nID = l10nID;
			this.l10nArgs = args;
			this.fatal = fatal;
		}
	},

	// Crossref's REST docs say to url-encode DOIs, but their member docs say not
	// to encode the forward slash, and Semantic Scholar's Graph API wants a
	// literal slash too. Encode everything else, leave the slash alone.
	encodeDOI(doi) {
		return encodeURIComponent(doi).replace(/%2F/gi, "/");
	},

	// arXiv mints its DOIs through DataCite, so these are never in Crossref, and
	// they identify the same record the bare arXiv ID does.
	isArxivDOI(doi) {
		return /^10\.48550\/arxiv\./i.test(doi);
	},

	// ------------------------------------------------------------------ helpers

	// Zotero.HTTP.request goes through Zotero's own networking (proxy settings,
	// timeouts, cookie isolation) rather than the raw window fetch the Zotero 6
	// version used.
	async getJSON(url, { headers = {}, allow404 = false, timeout = 20000 } = {}) {
		let xmlhttp;
		try {
			xmlhttp = await Zotero.HTTP.request("GET", url, {
				headers: Object.assign({ Accept: "application/json" }, headers),
				responseType: "json",
				timeout,
				// Handle these ourselves instead of throwing.
				successCodes: allow404 ? [200, 404] : [200]
			});
		}
		catch (e) {
			if (e instanceof Zotero.HTTP.UnexpectedStatusException) {
				if (e.status === 401 || e.status === 403) {
					throw new CitationCounts.SourceError("citationcounts-error-auth", null, true);
				}
				if (e.status === 429) {
					throw new CitationCounts.SourceError("citationcounts-error-rate-limit", null, true);
				}
				throw new CitationCounts.SourceError("citationcounts-error-http",
					{ status: e.status });
			}
			throw new CitationCounts.SourceError("citationcounts-error-network");
		}
		if (xmlhttp.status === 404) return null;
		return xmlhttp.response;
	},

	getDOI(item) {
		let doi = "";
		try {
			doi = item.getField("DOI") || "";
		}
		catch (e) {
			// Item type has no DOI field
		}
		doi = doi.trim();
		if (doi) return doi;

		// Preprints and book chapters often carry the DOI in Extra instead.
		const extra = item.getField("extra") || "";
		// [ \t] rather than \s: \s matches newlines, so with the /m flag ^\s*
		// could consume across blank lines from every line start, giving
		// quadratic backtracking on a long Extra field.
		const m = /^[ \t]*DOI:[ \t]*(\S+)[ \t]*$/im.exec(extra);
		return m ? m[1] : null;
	},

	// Matches both the old (hep-th/9901001) and new (2301.01234) arXiv schemes,
	// in a URL, in Extra, or in the preprint archiveID field.
	// The two arXiv identifier schemes are matched separately. Combining them
	// needs a nested alternation inside the capture group, which is both harder
	// to read and what pushed the single pattern over the complexity limit.
	// The branches are mutually exclusive on their first character, so trying
	// them in sequence is equivalent to one alternation.
	ARXIV_RES: [
		// Current scheme: 2301.01234, optionally versioned.
		/arxiv(?:\.org\/[a-z]{3}\/|[:\s]\s*)(\d{4}\.\d{4,5})(?:v\d+)?(?!\d)/i,
		// Pre-2007 scheme: hep-th/9901001, math.AG/0309001.
		/arxiv(?:\.org\/[a-z]{3}\/|[:\s]\s*)([a-z][a-z.-]*\/\d{7})(?:v\d+)?(?!\d)/i
	],

	getArxivID(item) {
		const candidates = [];
		for (const field of ["url", "extra", "archiveID", "number"]) {
			try {
				const value = item.getField(field);
				if (value) candidates.push(value);
			}
			catch (e) {
				// Field not valid for this item type
			}
		}
		// Field order is the priority order, so try every pattern against a
		// candidate before moving to the next field.
		for (const candidate of candidates) {
			for (const re of this.ARXIV_RES) {
				const m = re.exec(candidate);
				if (m) return m[1];
			}
		}
		return null;
	},

	// Rewrites the citation line for `tag` in the item's Extra field, preserving
	// the wire format the Zotero 6 version wrote so existing libraries keep
	// working. Old-style lines are recognised and replaced too.
	setCitationCount(item, tag, count) {
		const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const current = new RegExp("^\\d+ citations \\(" + escaped + "\\)", "i");
		const legacy = new RegExp("^Citations \\(" + escaped + "\\):", "i");

		const lines = (item.getField("extra") || "")
			.split("\n")
			.filter(line => !current.test(line) && !legacy.test(line));

		const today = new Date();
		const date = [
			today.getFullYear(),
			String(today.getMonth() + 1).padStart(2, "0"),
			String(today.getDate()).padStart(2, "0")
		].join("-");

		lines.unshift(`${count} citations (${tag}) [${date}]`);
		item.setField("extra", lines.join("\n").trim());
	},

	// Highest count stored on the item, for the item-tree column.
	getStoredCount(item) {
		const extra = item.getField("extra") || "";
		let best = null;
		for (const line of extra.split("\n")) {
			const m = /^(\d+) citations \(/i.exec(line.trim());
			if (m) {
				const n = parseInt(m[1], 10);
				if (best === null || n > best) best = n;
			}
		}
		return best;
	},

	// ------------------------------------------------------------- registration

	registerNotifier() {
		// Registered once at startup, not once per window as in the overlay
		// version, which leaked an observer for every window opened.
		this.notifierID = Zotero.Notifier.registerObserver({
			notify: async (event, type, ids) => {
				if (event !== "add" || type !== "item") return;
				const operation = this.getPref("autoretrieve");
				if (!operation || operation === "none" || !this.SOURCES[operation]) return;
				const items = (await Zotero.Items.getAsync(ids))
					.filter(item => item.isRegularItem() && !item.isFeedItem);
				if (items.length) {
					await this.updateItems(items, operation);
				}
			}
		}, ["item"], "citationcounts");
	},

	registerMenu() {
		// Zotero 8+ replaces per-window XUL injection with MenuManager, which
		// tears itself down when the plugin is disabled.
		const submenus = Object.keys(this.SOURCES).map(key => ({
			menuType: "menuitem",
			l10nID: "citationcounts-menu-" + key,
			onCommand: () => {
				const pane = Zotero.getActiveZoteroPane();
				if (!pane) return;
				this.updateItems(pane.getSelectedItems(), key);
			}
		}));

		this.menuID = Zotero.MenuManager.registerMenu({
			menuID: "citationcounts-item-menu",
			pluginID: this.id,
			target: "main/library/item",
			menus: [{
				menuType: "submenu",
				l10nID: "citationcounts-menu-root",
				onShowing: (event, context) => {
					// Fail open. Hide only when we can positively see that the
					// selection contains nothing we could act on; if the context
					// isn't the shape we expect, show the menu anyway rather
					// than vanishing with no explanation.
					const items = context?.items;
					if (Array.isArray(items) && items.length
							&& !items.some(item => item.isRegularItem())) {
						context.setVisible(false);
					}
				},
				menus: submenus
			}]
		});
	},

	async registerColumn() {
		// Optional convenience feature; not part of the original plugin. If the
		// item-tree API shifts in a future release, lose the column, not the plugin.
		if (!Zotero.ItemTreeManager?.registerColumn) {
			this.log("ItemTreeManager unavailable; skipping the Citations column");
			return;
		}
		try {
			this.columnID = await Zotero.ItemTreeManager.registerColumn({
				dataKey: "citationcounts",
				label: "Citations",
				pluginID: this.id,
				dataProvider: (item) => {
					const count = this.getStoredCount(item);
					return count === null ? "" : String(count);
				}
			});
		}
		catch (e) {
			this.log("Could not register the Citations column: " + e);
		}
	},

	// --------------------------------------------------------------- the actual work

	async updateItems(items, operation) {
		const source = this.SOURCES[operation];
		if (!source) {
			this.log("Unknown source: " + operation);
			return;
		}

		const targets = items.filter(item => item.isRegularItem() && !item.isFeedItem);
		if (!targets.length) return;

		if (this.running) {
			this.log("Retrieval already in progress; ignoring request");
			return;
		}
		this.running = true;

		const icon = this.rootURI + "icons/citationcounts.png";
		const progress = new Zotero.ProgressWindow({ closeOnClick: false });
		progress.changeHeadline(
			await this.formatValue("citationcounts-progress-headline", { source: source.label })
		);
		const line = new progress.ItemProgress(icon);
		progress.show();

		let updated = 0;
		let skipped = 0;
		let failed = 0;
		let failure = null;

		try {
			for (let i = 0; i < targets.length; i++) {
				const item = targets[i];

				line.setProgress(Math.round((i / targets.length) * 100));
				line.setText(await this.formatValue("citationcounts-progress-item", {
					source: source.label,
					current: i + 1,
					total: targets.length
				}));

				let results;
				try {
					results = await source.retrieve(item);
				}
				catch (e) {
					// Only stop for problems that will recur on every remaining
					// item. A one-off HTTP or network error is recorded and the
					// run continues, so a single bad item can't end a batch.
					if (e.fatal) {
						failure = e;
						break;
					}
					failed++;
					this.log(`${item.getField("title") || item.id}: ${e.l10nID || e}`);
					results = [];
				}

				if (results.length) {
					for (const [tag, count] of results) {
						this.setCitationCount(item, tag, count);
					}
					await item.saveTx();
					updated++;
				}
				else {
					skipped++;
				}

				if (source.delay && i < targets.length - 1) {
					await this.delay(source.delay);
				}
			}
		}
		finally {
			progress.close();
			this.running = false;
		}

		await this.showSummary({ source, updated, skipped, failed, failure });
	},

	async showSummary({ source, updated, skipped, failed, failure }) {
		const progress = new Zotero.ProgressWindow({ closeOnClick: true });
		const line = new progress.ItemProgress(this.rootURI + "icons/citationcounts.png");

		if (failure) {
			progress.changeHeadline(await this.formatValue("citationcounts-summary-failed"));
			line.setError();
			line.setText(await this.formatValue(
				failure.l10nID || "citationcounts-error-unknown",
				Object.assign({ source: source.label }, failure.l10nArgs)
			));
			if (!failure.l10nID) this.log("Unhandled error: " + failure);
		}
		else {
			progress.changeHeadline(await this.formatValue("citationcounts-summary-finished"));
			line.setProgress(100);
			const parts = [
				await this.formatValue("citationcounts-summary-counts", {
					source: source.label,
					updated
				})
			];
			if (skipped) {
				parts.push(await this.formatValue("citationcounts-summary-skipped", { skipped }));
			}
			if (failed) {
				parts.push(await this.formatValue("citationcounts-summary-failed-items", { failed }));
				line.setError();
			}
			line.setText(parts.join(" "));
		}

		progress.show();
		progress.startCloseTimer(failure ? 8000 : 5000);
	},

	// Fluent replaces the .properties bundle the Zotero 6 version used. This
	// resolves strings outside any document, for the progress popups.
	async formatValue(l10nID, args) {
		try {
			if (!this._l10n) {
				this._l10n = new Localization(["citationcounts.ftl"]);
			}
			return await this._l10n.formatValue(l10nID, args) || l10nID;
		}
		catch (e) {
			this.log("Could not resolve string " + l10nID + ": " + e);
			return l10nID;
		}
	}
};
