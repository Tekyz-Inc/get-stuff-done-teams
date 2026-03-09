# Domain: scan-diagrams

## Responsibility
Generate 6 Mermaid diagram definitions from codebase analysis data, render each to SVG using the
configured backend chain (MCP → Mermaid CLI → D2 → Kroki → placeholder), and return an array of
rendered diagram objects consumed by the scan-report domain.

## Owned Files/Directories
- `bin/scan-diagrams.js` — diagram definition generators for all 6 types (produces .mmd strings)
- `bin/scan-renderer.js` — rendering backend chain: MCP detection → mmdc → d2 → Kroki HTTP → placeholder

## NOT Owned (do not modify)
- `commands/gsd-t-scan.md` — owned by scan-report domain (orchestration)
- `bin/gsd-t.js` — owned by scan-export domain
- `bin/scan-schema.js` — owned by scan-schema domain
- `bin/scan-report.js` — owned by scan-report domain
- `bin/scan-export.js` — owned by scan-export domain
