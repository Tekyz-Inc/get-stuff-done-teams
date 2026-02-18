# Domain: housekeeping

## Responsibility
All scan #4 tech debt fixes — contract syncing, doc updates, file cleanup, and quality gates.

## Owned Files/Directories
- `.gsd-t/progress.md` — fix Status value (TD-044)
- `.gsd-t/contracts/` — update progress-file-format, wave-phase-sequence, rename command-interface, archive integration-points (TD-047, TD-053, TD-054, TD-055)
- `.gsd-t/domains/` — delete orphaned cli-quality/ and cmd-cleanup/ (TD-046, already done during partition)
- `CHANGELOG.md` — add M4-M7 entries (TD-045)
- `CLAUDE.md` — fix version reference (TD-048)
- `bin/gsd-t.js` — extract readSettingsJson() helper (TD-050)
- `scripts/gsd-t-heartbeat.js` — scrub notification messages (TD-052)
- `package.json` — add prepublishOnly script (TD-051)
- `.gitattributes` — renormalize working copy (TD-049)

## NOT Owned (do not modify)
- `commands/` — no command file changes
- `templates/` — no template changes
- `test/` — tests may need updates if exports change, but no new test files expected
