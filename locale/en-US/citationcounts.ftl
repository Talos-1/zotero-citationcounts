# Fluent identifiers share a global namespace within a document, so every ID
# here is prefixed with the plugin name.

citationcounts-source-crossref =
    .label = Crossref
citationcounts-source-inspire =
    .label = INSPIRE-HEP
citationcounts-source-semanticscholar =
    .label = Semantic Scholar
citationcounts-source-ads =
    .label = NASA/ADS

# Item context menu
citationcounts-menu-root =
    .label = Manage Citation Counts
citationcounts-menu-crossref =
    .label = Get Crossref citation count
citationcounts-menu-inspire =
    .label = Get INSPIRE-HEP citation count
citationcounts-menu-semanticscholar =
    .label = Get Semantic Scholar citation count
citationcounts-menu-ads =
    .label = Get NASA/ADS citation count

# Preferences
citationcounts-prefs-autoretrieve-title = New items
citationcounts-prefs-autoretrieve-description =
    Fetch a citation count automatically whenever an item is added to your library.
citationcounts-prefs-autoretrieve-none =
    .label = Don't fetch counts automatically
citationcounts-prefs-keys-title = API access
citationcounts-prefs-keys-description =
    Crossref and INSPIRE-HEP need no credentials. NASA/ADS requires a free API
    token. A Semantic Scholar key is optional and raises the rate limit.
citationcounts-prefs-ads-key =
    .value = NASA/ADS token
citationcounts-prefs-s2-key =
    .value = Semantic Scholar key
citationcounts-prefs-crossref-mailto =
    .value = Crossref contact email

# Progress and results
citationcounts-progress-item =
    Fetching { $source } counts — item { $current } of { $total }
citationcounts-summary-finished = Finished
citationcounts-summary-failed = Couldn't finish
citationcounts-summary-counts =
    { $updated ->
        [one] Updated 1 item from { $source }.
       *[other] Updated { $updated } items from { $source }.
    }
citationcounts-summary-skipped =
    { $skipped ->
        [one] 1 item had no count available.
       *[other] { $skipped } items had no count available.
    }

# Errors
citationcounts-error-no-ads-key =
    Add a NASA/ADS API token in the Citation Counts preferences to use this source.
citationcounts-error-auth =
    { $source } rejected the credentials. Check your API key in the Citation Counts preferences.
citationcounts-error-rate-limit =
    { $source } is rate-limiting requests. Wait a few minutes, or add an API key to raise the limit.
citationcounts-error-http =
    { $source } returned an unexpected response (HTTP { $status }).
citationcounts-error-network =
    Couldn't reach { $source }. Check your internet connection.
citationcounts-error-unknown =
    Something went wrong talking to { $source }. See the Zotero debug output for details.
citationcounts-progress-headline = Getting { $source } citation counts
