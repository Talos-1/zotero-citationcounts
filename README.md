# Zotero Citation Counts Manager

An add-on for [Zotero](https://www.zotero.org) that fetches citation counts for
journal articles and preprints from [Crossref](https://www.crossref.org),
[INSPIRE-HEP](https://inspirehep.net), [Semantic
Scholar](https://www.semanticscholar.org), and [NASA/ADS](https://ui.adsabs.harvard.edu).
[Google Scholar](https://scholar.google.com) is not supported, because automated
access violates its terms of service.

Counts are stored in the item's **Extra** field, since Zotero has no dedicated
field for them.

## Requirements

Zotero 8.0 or later, including Zotero 10. Zotero 6 and 7 are not supported —
see *Upgrading from 1.3.0* below.

## Installing

- Download `zotero-citationcounts-2.0.0.xpi` from the
  [latest release](https://github.com/eschnett/zotero-citationcounts/releases).
  Right-click the link and choose "Save link as" rather than clicking it.
- In Zotero, go to `Tools → Plugins`.
- Choose `Install Plugin From File…` from the gear menu and select the `.xpi`.

## Using it

**Manually.** Select one or more items, right-click, and pick a source under
*Manage Citation Counts*.

**Automatically.** In `Settings → Citation Counts`, choose a source to fetch a
count whenever a new item is added to your library.

**Sorting.** The plugin adds a *Citations* column to the items list, showing the
highest count stored on each item. Enable it from the column header's context
menu.

## API access

| Source | Credentials |
| --- | --- |
| Crossref | None. An optional contact email puts you in Crossref's faster "polite pool". |
| INSPIRE-HEP | None. |
| Semantic Scholar | Optional. Without a key, requests are paced to roughly one every 3 seconds to stay inside the anonymous rate limit. |
| NASA/ADS | **Required.** Get a free token at <https://ui.adsabs.harvard.edu/user/settings/token>. |

Enter these in `Settings → Citation Counts`.

## Upgrading from 1.3.0

Version 2.0.0 is a rewrite for Zotero's bootstrapped plugin architecture. The
Extra-field format is unchanged, so existing counts in your library are
recognised and updated in place — including the older
`Citations (Source): N` format written by pre-1.2 versions.

Two things changed that you may notice:

- **The "not found" tag preferences are gone.** Versions up to 1.3.0 showed
  three tag settings (invalid / multiple / no DOI) that were inherited from
  Zotero DOI Manager and never actually applied any tags. They have been removed
  rather than reimplemented. Failures are now reported in the progress popup.
- **NASA/ADS now works.** It appeared in the menus in 1.3.0 but had no
  implementation behind it. It needs an API token.

## Building

```sh
./bin/build.sh
```

Produces `zotero-citationcounts-<version>.xpi` from `manifest.json`'s version.

For development, see [Setting Up a Plugin Development
Environment](https://www.zotero.org/support/dev/client_coding/plugin_development).
Running Zotero with `-ZoteroDebugText` prints this plugin's `Zotero.debug()`
output to the terminal.

## Credits

Originally by Erik Schnetter. Based on [Zotero DOI
Manager](https://github.com/bwiernik/zotero-shortdoi), which is based in part on
[Zotero Google Scholar
Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton
Beloglazov.

## License

Mozilla Public License (MPL) Version 2.0.
