#!/bin/sh
# Static checks for the plugin. Run from the repository root: ./bin/validate.sh
# CI calls this, so anything that fails here fails the build — and you can run
# the identical checks locally before pushing.
set -eu

fail=0
check() { printf '%-42s' "$1"; shift; if "$@" >/tmp/vout 2>&1; then echo ok; else echo FAIL; sed 's/^/    /' /tmp/vout; fail=1; fi; }

# ---- JavaScript parses -------------------------------------------------------
for f in bootstrap.js citationcounts.js preferences.js prefs.js test/test.js; do
	check "syntax: $f" node --check "$f"
done

# ---- JSON parses -------------------------------------------------------------
for f in manifest.json updates.json; do
	check "json: $f" python3 -c "import json,sys;json.load(open(sys.argv[1]))" "$f"
done

# ---- Fluent parses, and IDs line up with the code ----------------------------
check "fluent: syntax + referenced ids" python3 - <<'EOF'
import re, sys, pathlib
from fluent.syntax import parse
from fluent.syntax.ast import Junk, Message

res = parse(pathlib.Path('locale/en-US/citationcounts.ftl').read_text())
junk = [j for j in res.body if isinstance(j, Junk)]
if junk:
    sys.exit("Fluent parse errors:\n" + "\n".join(j.content.strip()[:120] for j in junk))

defined = {e.id.name for e in res.body if isinstance(e, Message)}
dupes = [n for n in defined if sum(1 for e in res.body
         if isinstance(e, Message) and e.id.name == n) > 1]
if dupes:
    sys.exit("Duplicate Fluent ids: " + ", ".join(dupes))

# Every id the code or markup asks for must exist. Menu ids are built by
# concatenating the source keys, so reconstruct those from citationcounts.js.
text = "".join(pathlib.Path(p).read_text()
               for p in ('citationcounts.js', 'preferences.xhtml'))
used = set(re.findall(r'data-l10n-id="([^"]+)"', text))
used |= set(re.findall(r'l10nID:\s*"([^"]+)"', text))
used |= set(re.findall(r'formatValue\(\s*"([^"]+)"', text))
used |= set(re.findall(r'SourceError\("([^"]+)"', text))
sources = re.search(r'SOURCES:\s*\{(.*?)\n\t\},\n', text, re.S)
if sources:
    used |= {"citationcounts-menu-" + k
             for k in re.findall(r'^\t\t(\w+):\s*\{$', sources.group(1), re.M)}

# "citationcounts-menu-" is a concatenation prefix in the source, not an id;
# the real ids are reconstructed from the SOURCES keys above.
used = {u for u in used if not u.endswith('-')}

if not {u for u in used if u.startswith('citationcounts-menu-')}:
    sys.exit("could not reconstruct menu ids from SOURCES — check the parser")

missing = used - defined
if missing:
    sys.exit("Referenced but not defined in the .ftl: " + ", ".join(sorted(missing)))
EOF

# ---- The two version numbers must agree --------------------------------------
# A mismatch here is invisible at runtime: Zotero compares updates.json's version
# against the installed manifest's, so a stale entry means updates never offer.
check "version: manifest matches updates" python3 - <<'EOF'
import json, sys
m = json.load(open('manifest.json'))['version']
u = json.load(open('updates.json'))['addons']
ids = list(u)
mid = json.load(open('manifest.json'))['applications']['zotero']['id']
if mid not in u:
    sys.exit(f"updates.json has no entry for plugin id {mid!r} (has: {ids})")
versions = [e['version'] for e in u[mid]['updates']]
if m not in versions:
    sys.exit(f"manifest version {m} is not offered in updates.json (offers: {versions})")
EOF

# ---- The archive has the shape Zotero expects --------------------------------
check "package: manifest at archive root" sh -c '
	sh bin/build.sh >/dev/null
	v=$(python3 -c "import json;print(json.load(open(\"manifest.json\"))[\"version\"])")
	unzip -l "zotero-citationcounts-$v.xpi" | grep -qE "  manifest\.json$" \
		|| { echo "manifest.json is not at the root of the .xpi"; exit 1; }
	unzip -l "zotero-citationcounts-$v.xpi" | grep -q "locale/en-US/citationcounts.ftl" \
		|| { echo ".ftl missing from the .xpi"; exit 1; }
'

exit $fail
