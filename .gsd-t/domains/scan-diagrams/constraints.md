# Constraints: scan-diagrams

## Must Follow
- Zero external npm dependencies (TECH-001) — rendering is done via CLI subprocess or HTTP, not npm packages
- Node.js >= 16 compatibility (TECH-002)
- Cross-platform: use `path.join`, spawn `mmdc` / `d2` / `pandoc` via `child_process.execSync` with timeout
- Functions under 30 lines; split into scan-diagrams-generators.js + scan-renderer.js if needed
- Rendering fallback chain order: MCP (if registered) → Mermaid CLI (`mmdc`) → D2 (arch/dataflow only) → Kroki HTTP → placeholder — NEVER skip steps
- .mmd files are TEMPORARY — write to os.tmpdir(), delete after SVG render (NFR-007: no temp files left in project)
- All renderers must degrade gracefully — catch all errors, never throw (NFR-008)
- Diagram SVGs must be inline-embeddable (no external hrefs in SVG output)

## Must Not
- Modify files outside owned scope
- Install npm packages — mmdc is installed on-demand via `npm install -g @mermaid-js/mermaid-cli` only if the user approves (prompt first)
- Use TALA layout for D2 (paid, excluded per TECH-010) — only dagre, ELK, neato
- Leave temp .mmd files on disk after rendering

## External References
- `scan-report-mock.html` — INSPECT only. Read for color palette, diagram titles, and type badges. Do NOT copy code.
- MCP servers: diagram-bridge-mcp, C4Diagrammer, mcp-mermaid — USE. Check Claude Code settings JSON for registration before calling.

## Must Read Before Using
- `commands/gsd-t-scan.md` — understand the scan pipeline before writing integration
- `.gsd-t/contracts/scan-schema-contract.md` — the schema data shape this domain receives as input
- `.gsd-t/contracts/scan-diagrams-contract.md` — the diagram output shape this domain must produce

## User Intent Locked
- "MCP preferred over CLI" (REQ-030): MCP is checked first. If any registered MCP server renders successfully, CLI chain is skipped.
- "no CDN after generation" (NFR-007): Only applies to the HTML report at VIEW time. scan-renderer.js may use local mmdc which uses headless Chromium — that is rendering-time, not view-time.

## Dependencies
- Depends on: scan-schema for ER diagram input (`schemaData` from scan-schema-contract.md)
- Depends on: external tools (mmdc, d2, Kroki) — all optional with graceful fallback
- Depended on by: scan-report for inline SVG embedding
