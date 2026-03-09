# Milestone M17: Scan Visual Output

**Version:** 2.34.10
**Completed:** 2026-03-09
**Tag:** v2.34.10
**Status:** COMPLETE

## Goal

Transform `gsd-t-scan` from a text-only analysis tool into a rich visual report generator. Every scan produces a self-contained HTML report with 6 live architectural diagrams, a tech debt register, and domain health scores — plus optional DOCX/PDF export for Google Docs.

## Domains Completed

| Domain        | Tasks | Key Deliverable |
|---------------|-------|-----------------|
| scan-schema   | 5/5   | `bin/scan-schema.js` + `bin/scan-schema-parsers.js` — 7 ORM parsers, `extractSchema()` |
| scan-diagrams | 5/5   | `bin/scan-diagrams.js` + `bin/scan-diagrams-generators.js` + `bin/scan-renderer.js` — 6 diagram generators + rendering chain |
| scan-report   | 6/6   | `bin/scan-report.js` + `bin/scan-report-sections.js` — self-contained HTML report |
| scan-export   | 4/4   | `bin/scan-export.js` — DOCX/PDF export via pandoc with graceful skip |

## Files Created

- `bin/scan-schema.js` (77 lines)
- `bin/scan-schema-parsers.js` (199 lines)
- `bin/scan-diagrams.js` (77 lines)
- `bin/scan-diagrams-generators.js` (102 lines)
- `bin/scan-renderer.js` (92 lines)
- `bin/scan-report.js` (116 lines)
- `bin/scan-report-sections.js` (74 lines)
- `bin/scan-export.js` (49 lines)

## Files Modified

- `commands/gsd-t-scan.md` — added Steps 2.5 (schema extraction) and 3.5 (diagram generation), extended Step 8
- `bin/gsd-t.js` — added `--export` flag to scan subcommand
- `test/scan.test.js` — 26 smoke tests covering all 5 exported functions + integration pipeline

## Contracts

- `.gsd-t/contracts/scan-schema-contract.md` — `extractSchema()` output shape
- `.gsd-t/contracts/scan-diagrams-contract.md` — `generateDiagrams()` output shape (DiagramResult[6])
- `.gsd-t/contracts/integration-points.md` — M17 wave checkpoints

## Test Results

- Tests before M17: 178/178
- Tests after M17: 205/205 (+27 new tests)

## Requirements Delivered

REQ-024 through REQ-030, TECH-009 through TECH-013, NFR-006 through NFR-009

## Key Decisions

1. All modules use Node.js built-ins only — zero new npm dependencies
2. Rendering chain: mmdc (Mermaid CLI) → d2 → placeholder SVG (graceful degradation)
3. DOCX/PDF export uses pandoc with graceful skip when not installed
4. HTML report is fully self-contained (no CDN references, inline CSS/JS)
5. Split files (parsers, generators, sections) keep each module under 200 lines
