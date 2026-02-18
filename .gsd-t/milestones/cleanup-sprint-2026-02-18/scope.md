# Domain: cleanup

## Responsibility
Resolve all 10 LOW-severity scan #5 findings — dead code, untested exports, documentation errors, minor security gap, contract drift.

## Owned Files/Directories
- `bin/gsd-t.js` — dead code removal (TD-057), condition simplification (TD-061)
- `scripts/gsd-t-heartbeat.js` — case fallthrough (TD-056), notification scrubbing (TD-063)
- `test/cli-quality.test.js` — dead import removal (TD-058), new readSettingsJson tests (TD-059)
- `test/security.test.js` — new shortPath tests (TD-060)
- `.gsd-t/techdebt.md` — SEC-N16 correction (TD-062)
- `.gsd-t/contracts/wave-phase-sequence.md` — integrity check update (TD-064)
- `.gsd-t/contracts/file-format-contract.md` — deletion (TD-065)

## NOT Owned (do not modify)
- Command files (commands/*.md)
- Templates (templates/*.md)
- Other scripts (scripts/npm-update-check.js, scripts/gsd-t-fetch-version.js)
