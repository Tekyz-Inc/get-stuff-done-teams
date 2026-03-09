# Constraints: scan-report

## Must Follow
- Zero external npm dependencies (TECH-001) — HTML report is pure string template construction in Node.js
- Node.js >= 16 compatibility (TECH-002)
- Output `scan-report.html` must be 100% self-contained: all CSS inline, all SVGs embedded, no external CDN refs (NFR-007)
- Dark theme as shown in scan-report-mock.html (INSPECT for reference)
- Sidebar navigation with scrollspy, compact header, summary metric cards, domain health bars, 6 diagram sections, tech debt table, findings cards (REQ-027)
- Each diagram section: title bar + type badge + inline SVG + expand-to-fullscreen button with scroll-to-zoom + descriptive note
- Report must render all diagrams in browser within 5 seconds (NFR-006) — inline SVGs render instantly, no JS rendering needed
- Fullscreen modal for each diagram (Escape to close, scroll-to-zoom)
- `commands/gsd-t-scan.md` changes: ADD steps, do NOT remove or rename existing steps 1-8
- Functions under 30 lines; files under 200 lines (split to scan-report-sections.js if needed)

## Must Not
- Modify files outside owned scope (see scope.md)
- Add any `<script src="...">` or `<link href="...">` pointing to external CDNs in the output HTML
- Remove or reorder existing Steps 1-8 in `commands/gsd-t-scan.md`
- Generate CSS or JS that requires a build step

## External References
- `scan-report-mock.html` — INSPECT. This is the visual specification. Use as direct reference for structure, color palette, component layout, and interaction patterns. Do NOT import or exec it.

## Must Read Before Using
- `commands/gsd-t-scan.md` — read fully before adding steps; understand existing Step numbering and flow
- `.gsd-t/contracts/scan-diagrams-contract.md` — the diagram array shape this domain receives
- `scan-report-mock.html` — read for exact structure specification

## User Intent Locked
- "self-contained" (NFR-007): Means scan-report.js generates SVGs already embedded in the HTML at build time. No CDN, no JS diagram rendering at view time.

## Dependencies
- Depends on: scan-schema (indirectly, via schema data passed through the pipeline)
- Depends on: scan-diagrams for rendered SVG array (scan-diagrams-contract.md)
- Depended on by: scan-export (reads scan-report.html or the same analysis data for DOCX/PDF generation)
