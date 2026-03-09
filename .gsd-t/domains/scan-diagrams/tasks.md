# Tasks: scan-diagrams

**Domain**: scan-diagrams
**Wave**: Wave 1 (parallel-safe with scan-schema)
**Output**: `bin/scan-diagrams.js` — exports `generateDiagrams(analysisData, schemaData, options)` and `bin/scan-renderer.js` — exports `renderDiagram(mmdContent, type, options)`
**Contract**: `.gsd-t/contracts/scan-diagrams-contract.md`

---

## Task 1 — Create bin/scan-renderer.js: rendering backend chain

**File**: `bin/scan-renderer.js` (create new)

Require only `fs`, `path`, `os`, `child_process`, `https` (Node.js built-ins). All functions under 30 lines.

**stripSvgDimensions(svgStr)** — remove `width="..."` and `height="..."` attributes from the `<svg` opening tag via regex; return cleaned string. (Contract rule 5.)

**makePlaceholder()** — return this exact string (no variation):
```
<div class="diagram-placeholder">
  <p>Diagram unavailable — rendering tools not found</p>
  <p>Install: <code>npm install -g @mermaid-js/mermaid-cli</code></p>
</div>
```

**tryMmdc(mmdContent, type)** — write temp `.mmd` to `os.tmpdir()`, run `mmdc -i {in} -o {out} -t dark --quiet` via `execSync({ timeout: 30000 })`, read SVG, delete both temp files in finally block, strip dimensions, return `{ svgContent, rendered: true, rendererUsed: 'mermaid-cli' }`. Return null on any error.

**tryD2(mmdContent, type)** — only for `'system-architecture'` and `'data-flow'` types (TECH-010). Write temp `.d2` file with a minimal D2 graph stub, run `d2 {in} {out} --layout=dagre` via `execSync({ timeout: 30000 })`, read SVG, delete temp files, strip dimensions, return `{ svgContent, rendered: true, rendererUsed: 'd2' }`. Return null on any error or non-applicable type.

**tryKroki(mmdContent)** — POST to `${process.env.KROKI_URL || 'https://kroki.io'}/mermaid/svg` using `https.request` with 15-second timeout; confirm response starts with `<svg`; strip dimensions; return `{ svgContent, rendered: true, rendererUsed: 'kroki' }`. Return null on error or timeout.

**renderDiagram(mmdContent, type, options)** — try MCP (always null — not callable from Node.js subprocess) → tryMmdc → tryD2 (if applicable) → tryKroki → placeholder. Return first non-null result. On all failures: `{ svgContent: makePlaceholder(), rendered: false, rendererUsed: 'placeholder' }`. Never throw.

`module.exports = { renderDiagram }` at bottom.

**Acceptance**: `node -e "require('./bin/scan-renderer.js')"` exits cleanly. `renderDiagram` is a function.

---

## Task 2 — Create bin/scan-diagrams.js: Mermaid definition generators for diagrams 1–3

**File**: `bin/scan-diagrams.js` (create new)

All generators are pure functions returning Mermaid strings. Each under 30 lines with outer try/catch returning fallback string on error.

**genSystemArchitecture(analysisData)**:
- If `analysisData.frameworks` or `analysisData.services` present: generate `graph TB` with App node connected to detected service nodes
- Fallback: `'graph TB\n  App[Application]\n  DB[(Database)]\n  App --> DB'`
- Title: `'System Architecture'`, typeBadge: `'graph TB'`

**genAppArchitecture(analysisData)**:
- If `analysisData.layers` present: generate `graph TB` with subgraph per layer
- Fallback: `'graph TB\n  subgraph App\n    Controller --> Service --> Repository\n  end'`
- Title: `'Application Architecture'`, typeBadge: `'graph TB'`

**genWorkflow(analysisData)**:
- If `analysisData.states` present: generate `stateDiagram-v2` with transitions between detected states
- Fallback: `'stateDiagram-v2\n  [*] --> Active\n  Active --> Inactive\n  Inactive --> [*]'`
- Title: `'Workflow'`, typeBadge: `'stateDiagram-v2'`

`module.exports = { genSystemArchitecture, genAppArchitecture, genWorkflow }` — interim.

**Acceptance**: All three functions called with `{}` return non-empty strings without throwing.

---

## Task 3 — Add generators for diagrams 4–6 to bin/scan-diagrams.js

**File**: `bin/scan-diagrams.js` (extend); extract to `bin/scan-diagrams-generators.js` if file would exceed 200 lines

**genDataFlow(analysisData)**:
- If `analysisData.endpoints` or `analysisData.handlers` present: generate `flowchart TD` tracing input → validate → service → DB → (optional queue) → response
- Fallback: `'flowchart TD\n  Input --> Validate --> Process --> Store --> Respond'`
- Title: `'Data Flow'`, typeBadge: `'flowchart TD'`

**genSequence(analysisData)**:
- If `analysisData.endpoints` present: generate `sequenceDiagram` for first POST/primary endpoint
- Fallback: `'sequenceDiagram\n  Client->>Server: Request\n  Server->>DB: Query\n  DB-->>Server: Result\n  Server-->>Client: Response'`
- Title: `'Sequence'`, typeBadge: `'sequenceDiagram'`

**genDatabaseSchema(schemaData)**:
- If `schemaData.detected === false` or `schemaData.entities.length === 0`: return `''` (caller will use placeholder)
- Generate `erDiagram`: per entity `EntityName { fieldType fieldName }` block; per relation map type to ER notation (`one-to-many` → `||--o{`, `many-to-one` → `}o--||`, `many-to-many` → `}o--o{`, `one-to-one` → `||--||`)
- Title: `'Database Schema'`, typeBadge: `'erDiagram'`

Update `module.exports` to export all 6 generators.

**Acceptance**: `genDataFlow({})`, `genSequence({})`, `genDatabaseSchema({ detected: false, ormType: null, entities: [], parseWarnings: [] })` all return without throwing.

---

## Task 4 — Implement generateDiagrams() top-level function in bin/scan-diagrams.js

**File**: `bin/scan-diagrams.js` (finalize)

```
generateDiagrams(analysisData, schemaData, options):
  1. const { renderDiagram } = require('./scan-renderer')
  2. Define DIAGRAM_DEFS array (6 elements, contract order):
     { type, title, typeBadge, note, gen } for each of the 6 diagram types
  3. For each def:
     a. Call def.gen(analysisData or schemaData for diagram 6) → mmd string
     b. If type === 'database-schema' and (schemaData.detected === false or mmd === ''):
        push placeholder DiagramResult { ..., svgContent: PLACEHOLDER_HTML, rendered: false, rendererUsed: 'placeholder' }
     c. Otherwise: call renderDiagram(mmd, type, options) → { svgContent, rendered, rendererUsed }
        push DiagramResult { type, title, typeBadge, svgContent, note, rendered, rendererUsed }
  4. Return array of exactly 6 DiagramResult objects
  5. Outer try/catch: on catastrophic failure return 6 placeholder DiagramResults
```

Notes per type (hard-coded strings):
- system-architecture: `'C4-style context diagram showing services, databases, and external integrations'`
- app-architecture: `'Layered diagram showing framework architecture and component boundaries'`
- workflow: `'State machine derived from status enums and state transition logic'`
- data-flow: `'Data flow from user input through validation, persistence, and async processing'`
- sequence: `'Request/response sequence for the primary API endpoint'`
- database-schema: `'Entity-relationship diagram generated from ORM/schema definitions'`

`module.exports = { generateDiagrams }` (sole export).

**Acceptance**: `generateDiagrams({}, { detected: false, ormType: null, entities: [], parseWarnings: [] }, { projectRoot: '/tmp' })` returns array of exactly 6 elements, each with all DiagramResult fields, without throwing.

---

## Task 5 — Test: verify scan-diagrams and scan-renderer modules

Verify the following (node one-liners or inline assertions):

1. **scan-renderer loads**: `node -e "require('./bin/scan-renderer.js')"` exits cleanly
2. **scan-diagrams loads**: `node -e "require('./bin/scan-diagrams.js')"` exits cleanly
3. **generateDiagrams exported**: `typeof generateDiagrams === 'function'`
4. **Returns exactly 6 results**: result array length === 6
5. **All DiagramResult fields present**: Each result has `type`, `title`, `typeBadge`, `svgContent`, `note`, `rendered` (boolean), `rendererUsed`
6. **svgContent never null/empty**: All 6 `svgContent` values are non-empty strings
7. **Diagram 6 placeholder when no schema**: `schemaData.detected === false` → result[5].rendered === false, result[5].svgContent contains exact placeholder HTML from contract
8. **renderDiagram exported**: `typeof renderDiagram === 'function'`
9. **renderDiagram never throws**: `renderDiagram('graph TB\n  A --> B', 'system-architecture', {})` returns `{ rendered: boolean, svgContent: string }` without throwing
10. **Contract order preserved**: result[0].type === `'system-architecture'`, result[5].type === `'database-schema'`

All 10 checks must pass before this domain is considered complete.

**Dependencies**: Tasks 1–4 complete. scan-schema not required for tests (use mock schemaData).
