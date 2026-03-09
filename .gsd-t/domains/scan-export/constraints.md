# Constraints: scan-export

## Must Follow
- Zero external npm dependencies (TECH-001) — Pandoc and md-to-pdf are external tools invoked via subprocess, not npm-required
- Node.js >= 16 compatibility (TECH-002)
- Export flags are OPTIONAL — if `--export` is absent, scan-export is not invoked at all
- If Pandoc or md-to-pdf is absent: print a warning in report output and skip silently (TECH-012)
- All export tool licenses confirmed: Pandoc (GPL v2+), md-to-pdf (MIT) — both free OSS (TECH-013)
- `bin/gsd-t.js` change must be minimal: add `--export` flag parsing only, do not restructure existing code
- Functions under 30 lines; files under 200 lines

## Must Not
- Modify files outside owned scope (see scope.md)
- Block scan execution if export tools are absent — export is always optional (REQ-028)
- Add npm package dependencies to package.json
- Change any existing gsd-t.js CLI behavior other than adding the --export flag

## External References
- Pandoc — USE. Invoked as `pandoc scan-report.md -o scan-report.docx`
- md-to-pdf — USE. Invoked as `npx md-to-pdf scan-report.md` or global install

## Must Read Before Using
- `bin/gsd-t.js` — read fully before modifying; understand existing flag parsing pattern before adding --export
- `commands/gsd-t-scan.md` — understand how --export is documented in the scan command

## Dependencies
- Depends on: scan-report (scan-report.html and scan analysis markdown must exist before export runs)
- Depends on: external tools (Pandoc, md-to-pdf) — both optional
- Depended on by: nothing (scan-export is terminal in the pipeline)
