"use strict";

// Zotero 7+ binds fields directly to preference keys via the `preference`
// attribute, so there is nothing to wire up by hand. The Zotero 6 pane read
// values back through <preference> element IDs, which no longer works — use
// Zotero.Prefs.get() if you need a value in script.

var CitationCountsPrefs = {
	init() {
		// Make the API key rows searchable by provider name in the new
		// preferences search, since the labels themselves are generic.
		const doc = document;
		const keywords = {
			"citationcounts-prefs-ads-key": "NASA ADS, astrophysics data system, api key, token",
			"citationcounts-prefs-s2-key": "Semantic Scholar, api key, token, rate limit",
			"citationcounts-prefs-crossref-mailto": "Crossref, polite pool, email"
		};
		for (const [id, strings] of Object.entries(keywords)) {
			doc.getElementById(id)?.setAttribute("data-search-strings-raw", strings);
		}
	}
};
