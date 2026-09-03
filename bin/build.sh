#!/bin/sh
set -eu

# Run from the repository root: ./bin/build.sh

version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
xpi="zotero-citationcounts-${version}.xpi"

rm -f "$xpi"

# Zip the *contents* of the plugin directory, not the directory itself —
# manifest.json must sit at the root of the archive.
zip -r -FS "$xpi" \
	manifest.json \
	bootstrap.js \
	citationcounts.js \
	prefs.js \
	preferences.xhtml \
	preferences.js \
	locale \
	icons \
	LICENSE \
	-x '*.DS_Store' '*/.*'

echo "Built $xpi"

# To release a new version:
# - bump "version" in manifest.json
# - add the new version to updates.json (with its update_link)
# - run this script
# - commit, push, tag, and attach the .xpi to the GitHub release
