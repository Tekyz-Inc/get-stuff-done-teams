# Domain: scan-export

## Responsibility
Implement optional DOCX and PDF export for scan output via `--export=docx` and `--export=pdf` flags.
Owns the CLI flag wiring in `bin/gsd-t.js` and the export module `bin/scan-export.js`.

## Owned Files/Directories
- `bin/scan-export.js` — export dispatcher: detects Pandoc/md-to-pdf, invokes subprocess, handles graceful skip if tool absent
- `bin/gsd-t.js` — ADD `--export` flag parsing to the scan subcommand (no other changes)

## NOT Owned (do not modify)
- `commands/gsd-t-scan.md` — owned by scan-report domain
- `bin/scan-schema.js` — owned by scan-schema domain
- `bin/scan-diagrams.js` — owned by scan-diagrams domain
- `bin/scan-renderer.js` — owned by scan-diagrams domain
- `bin/scan-report.js` — owned by scan-report domain
