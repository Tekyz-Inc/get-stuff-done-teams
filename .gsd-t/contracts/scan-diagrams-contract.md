# Contract: scan-diagrams

**Owner**: scan-diagrams domain (`bin/scan-diagrams.js`, `bin/scan-renderer.js`)
**Consumers**: scan-report domain (`bin/scan-report.js`)

## Function Signature

```js
/**
 * Generate and render all 6 diagram types for a scanned project.
 * @param {object} analysisData  - Codebase analysis results from scan Steps 1-2
 * @param {SchemaData} schemaData - Output of scan-schema extractSchema() — see scan-schema-contract.md
 * @param {object} options        - Rendering options
 * @param {string} options.projectRoot - Absolute path to the project being scanned
 * @returns {DiagramResult[]}
 */
function generateDiagrams(analysisData, schemaData, options)
```

## Output Shape: DiagramResult[]

Array of exactly 6 elements (one per diagram type), in order:

```js
[
  DiagramResult,  // 1. System Architecture
  DiagramResult,  // 2. Application Architecture
  DiagramResult,  // 3. Workflow
  DiagramResult,  // 4. Data Flow
  DiagramResult,  // 5. Sequence
  DiagramResult   // 6. Database Schema (ER)
]
```

### DiagramResult Shape

```js
{
  type: DiagramType,          // see enum below
  title: string,              // human-readable title for report section heading
  typeBadge: string,          // short label for the badge (e.g. 'graph TB', 'erDiagram')
  svgContent: string,         // inline SVG markup string OR placeholder HTML (never null)
  note: string,               // descriptive note shown below diagram in report
  rendered: boolean,          // true = real SVG; false = placeholder shown
  rendererUsed: RendererName  // which backend produced the SVG
}
```

### DiagramType Enum

```js
'system-architecture'       // C4-style context / graph TB
'app-architecture'          // layered graph TB with subgraphs
'workflow'                  // stateDiagram-v2
'data-flow'                 // flowchart TD
'sequence'                  // sequenceDiagram
'database-schema'           // erDiagram (from schemaData)
```

### RendererName Enum

```js
'mermaid-cli'   // mmdc CLI (primary renderer)
'd2'            // d2 binary (only for system-architecture and data-flow types)
'kroki'         // Kroki HTTP API (async, opt-in — not used in default sync path)
'placeholder'   // all renderers failed — placeholder shown
```

## Placeholder HTML

When `rendered: false`, `svgContent` must be this exact string (no variation):

```html
<div class="diagram-placeholder">
  <p>Diagram unavailable — rendering tools not found</p>
  <p>Install: <code>npm install -g @mermaid-js/mermaid-cli</code></p>
</div>
```

## Contract Rules

1. `generateDiagrams` NEVER throws — all errors are caught per diagram, failed diagrams get placeholder
2. Always returns exactly 6 DiagramResult objects in the fixed order above
3. `svgContent` is never null or undefined — always a string (SVG or placeholder HTML)
4. If `schemaData.detected === false`, diagram #6 (database-schema) returns `rendered: false` with placeholder
5. SVG content must have `width` and `height` attributes REMOVED (scan-report.js sets `width:100%`)
6. D2 renderer is only attempted for `system-architecture` and `data-flow` types (TECH-010)
7. Renderer chain order: mermaid-cli → d2 (architecture/data-flow only) → placeholder. Kroki is async and opt-in only.

## Breaking Change Policy

Any change to this contract shape requires:
1. Update this file
2. Update scan-diagrams domain's output
3. Update scan-report domain's consumption code
4. Version bump in progress.md Decision Log
