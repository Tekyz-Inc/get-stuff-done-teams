# Domain: scan-report

## Responsibility
Build the self-contained HTML report (`scan-report.html`) from scan analysis data, domain health
metrics, and rendered diagram SVGs. Also owns the modification to `commands/gsd-t-scan.md` that
wires all 4 domains into the existing scan pipeline.

## Owned Files/Directories
- `bin/scan-report.js` — HTML report generator (sidebar, metric cards, domain health, 6 diagram sections, tech debt table, findings cards)
- `commands/gsd-t-scan.md` — adds Step 2.5 (schema extraction call), Step 3.5 (diagram generation call), and extends Step 8 (HTML report generation) to the existing scan command

## NOT Owned (do not modify)
- `bin/scan-schema.js` — owned by scan-schema domain
- `bin/scan-diagrams.js` — owned by scan-diagrams domain
- `bin/scan-renderer.js` — owned by scan-diagrams domain
- `bin/scan-export.js` — owned by scan-export domain
- `bin/gsd-t.js` — owned by scan-export domain
