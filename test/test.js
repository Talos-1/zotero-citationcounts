// Exercise the pure logic with a stub Zotero, no network.
global.Zotero = { debug(){}, Prefs:{ get:()=>"", set(){} } };
global.setTimeout = setTimeout;
global.Localization = class { async formatValue(){ return null; } };

const src = require('fs').readFileSync(__dirname + '/../citationcounts.js','utf8');
const CitationCounts = eval(src + "; CitationCounts");
const CC = CitationCounts;

function item(fields) {
  return {
    getField(f){ if (!(f in fields)) throw new Error('invalid field '+f); return fields[f]; },
    setField(f,v){ fields[f]=v; },
    _fields: fields,
  };
}

let fails = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok ? '' : `\n       got ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`));
};

// --- arXiv ID extraction
eq('arxiv new-style URL',   CC.getArxivID(item({url:'https://arxiv.org/abs/2301.01234'})), '2301.01234');
eq('arxiv versioned',       CC.getArxivID(item({url:'https://arxiv.org/abs/2301.01234v3'})), '2301.01234');
eq('arxiv pdf URL',         CC.getArxivID(item({url:'http://arxiv.org/pdf/1706.03762'})), '1706.03762');
eq('arxiv old-style',       CC.getArxivID(item({url:'https://arxiv.org/abs/hep-th/9901001'})), 'hep-th/9901001');
eq('arxiv 4-digit suffix',  CC.getArxivID(item({url:'https://arxiv.org/abs/0704.0001'})), '0704.0001');
eq('arxiv 5-digit suffix',  CC.getArxivID(item({url:'https://arxiv.org/abs/2301.01234'})), '2301.01234');
eq('rejects 6-digit junk',  CC.getArxivID(item({url:'https://arxiv.org/abs/2301.012345'})), null);
eq('arxiv in Extra',        CC.getArxivID(item({url:'', extra:'arXiv: 2401.09999'})), '2401.09999');
eq('arxiv in archiveID',    CC.getArxivID(item({url:'', extra:'', archiveID:'arXiv:1912.00001'})), '1912.00001');
eq('arxiv math.AG',         CC.getArxivID(item({url:'https://arxiv.org/abs/math.AG/0309001'})), 'math.AG/0309001');
eq('arxiv cond-mat sub',    CC.getArxivID(item({url:'https://arxiv.org/abs/cond-mat.stat-mech/0301001'})), 'cond-mat.stat-mech/0301001');
eq('arxiv legacy versioned',CC.getArxivID(item({url:'https://arxiv.org/abs/hep-th/9901001v2'})), 'hep-th/9901001');
eq('no arxiv',              CC.getArxivID(item({url:'https://example.com/paper', extra:''})), null);
eq('arxiv w/ missing field',CC.getArxivID(item({url:'https://arxiv.org/abs/2301.01234'})), '2301.01234');

// --- DOI extraction
eq('DOI field',      CC.getDOI(item({DOI:' 10.1000/abc ', extra:''})), '10.1000/abc');
eq('DOI from Extra', CC.getDOI(item({DOI:'', extra:'Publisher: X\nDOI: 10.5555/xyz'})), '10.5555/xyz');
(() => {
  const big = ('\n'.repeat(20000)) + 'Publisher: ACME';
  const t0 = Date.now();
  const r = CC.getDOI(item({DOI:'', extra: big}));
  const ms = Date.now() - t0;
  eq('20k blank lines -> null', r, null);
  console.log((ms < 250 ? 'ok    ' : 'SLOW  ') + `20k blank lines in ${ms}ms`);
})();
eq('no DOI',         CC.getDOI(item({DOI:'', extra:'nothing here'})), null);

// --- Extra field round-trip
const it = item({extra:''});
CC.setCitationCount(it, 'Crossref', 42);
const today = new Date().toISOString().slice(0,10);
eq('writes new line', it._fields.extra, `42 citations (Crossref) [${today}]`);

CC.setCitationCount(it, 'Crossref', 43);
eq('replaces, no dupe', it._fields.extra, `43 citations (Crossref) [${today}]`);

CC.setCitationCount(it, 'Inspire/DOI', 7);
eq('second source kept', it._fields.extra.split('\n').length, 2);

const legacy = item({extra:'Citations (Crossref): 5 [2021-01-01]\nPublisher: ACME'});
CC.setCitationCount(legacy, 'Crossref', 99);
eq('replaces legacy format', legacy._fields.extra, `99 citations (Crossref) [${today}]\nPublisher: ACME`);

const slashed = item({extra:'12 citations (Semantic Scholar/DOI) [2020-01-01]'});
CC.setCitationCount(slashed, 'Semantic Scholar/DOI', 13);
eq('regex-escapes tag', slashed._fields.extra, `13 citations (Semantic Scholar/DOI) [${today}]`);

// --- column data
eq('reads highest count', CC.getStoredCount(item({extra:'3 citations (Crossref) [x]\n88 citations (Inspire/DOI) [x]'})), 88);
eq('no count -> null',    CC.getStoredCount(item({extra:'Publisher: ACME'})), null);



// --- arXiv DataCite DOI recognition
console.log();
eq('arxiv DOI recognised',   CC.isArxivDOI('10.48550/arXiv.2301.01234'), true);
eq('arxiv DOI lowercase',    CC.isArxivDOI('10.48550/arxiv.2301.01234'), true);
eq('normal DOI not arxiv',   CC.isArxivDOI('10.1038/nature14539'), false);
eq('acl DOI not arxiv',      CC.isArxivDOI('10.18653/v1/2020.acl-main.703'), false);

// A typical Zotero arXiv preprint: DataCite DOI plus an archiveID.
const preprint = item({
  DOI:'10.48550/arXiv.2301.01234',
  extra:'', url:'https://arxiv.org/abs/2301.01234', archiveID:'arXiv:2301.01234'
});
eq('preprint DOI found',   CC.getDOI(preprint), '10.48550/arXiv.2301.01234');
eq('preprint arXiv found', CC.getArxivID(preprint), '2301.01234');
eq('slash kept in URL',    CC.encodeDOI('10.1038/nature14539'), '10.1038/nature14539');
eq('other chars encoded',  CC.encodeDOI('10.1234/foo;bar#baz'), '10.1234/foo%3Bbar%23baz');
console.log(fails ? `${fails} failure(s)` : 'all passed');

process.exit(fails ? 1 : 0);
