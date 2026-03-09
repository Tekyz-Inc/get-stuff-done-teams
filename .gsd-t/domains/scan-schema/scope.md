# Domain: scan-schema

## Responsibility
Detect ORM and schema definition files within a scanned project, parse entity/field/relationship data, and output a structured schema data object consumed by the scan-diagrams domain for ER diagram generation.

## Owned Files/Directories
- `bin/scan-schema.js` — ORM detection logic, parser for all 7 ORM formats, structured output

## NOT Owned (do not modify)
- `commands/gsd-t-scan.md` — owned by scan-report domain (orchestration point)
- `bin/gsd-t.js` — owned by scan-export domain (CLI flag additions)
- `bin/scan-diagrams.js` — owned by scan-diagrams domain
- `bin/scan-renderer.js` — owned by scan-diagrams domain
- `bin/scan-report.js` — owned by scan-report domain
- `bin/scan-export.js` — owned by scan-export domain
