# Tasks: scan-report

**Domain**: scan-report
**Wave**: Wave 2 (requires Checkpoint 1: scan-schema AND scan-diagrams both complete)
**Output**: `bin/scan-report.js` — exports `generateReport(analysisData, schemaData, diagrams, options)` + modifications to `commands/gsd-t-scan.md` (Steps 2.5 and 3.5)
**Contract**: `.gsd-t/contracts/scan-diagrams-contract.md` (input), `scan-report-mock.html` (visual spec)

---

## Task 1 — Read reference files before writing any code (no files written)

**Pre-task: read-only — no files created or modified**

Before implementing anything, read and study:

1. `scan-report-mock.html` (project root) — extract:
   - CSS color variables and exact hex values
   - Sidebar `<nav>` structure and scrollspy JS pattern
   - Metric card grid HTML structure
   - Domain health card structure (name, file count, health bar)
   - Diagram section structure (title bar, type badge, SVG container, expand button, note)
   - Tech debt table columns and severity badge class names
   - Key findings card structure
   - Fullscreen modal HTML/JS pattern (overlay, Escape key, scroll-to-zoom)

2. `commands/gsd-t-scan.md` — extract:
   - Current step numbers and heading text (Steps 1–8, must not change)
   - End of Step 2 content (insert Step 2.5 after it)
   - End of Step 3 content (insert Step 3.5 after it)
   - Step 8 content (extend it with HTML report generation call)
   - Variables in scope at each step (analysisData, projectRoot, etc.)

This task produces no files. Required gate for Tasks 2–5.

**Dependencies**: Checkpoint 1 complete (scan-schema and scan-diagrams both done).

---

## Task 2 — Create bin/scan-report.js: CSS, HTML skeleton, and sidebar builder

**File**: `bin/scan-report.js` (create new)

Require only `fs` and `path`. All functions under 30 lines. Split to `bin/scan-report-sections.js` if file exceeds 200 lines.

**buildCss()** — return inline CSS string implementing dark theme from scan-report-mock.html:
- Color vars: `--bg: #0d1117`, `--card-bg: #161b22`, `--sidebar-bg: #0d1117`, `--accent: #58a6ff`, `--text: #c9d1d9`, `--border: #30363d`, `--text-muted: #8b949e`
- Sidebar: `position: fixed; left: 0; top: 0; width: 240px; height: 100vh; overflow-y: auto`
- Main: `margin-left: 240px; padding: 24px; max-width: 1200px`
- Metric grid: `display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px`
- Cards: `background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px`
- Health bar: `.health-bar` + `.health-fill` divs with width set via inline style
- Severity badges: `.badge-critical { color: #f85149 }`, `.badge-high { color: #d29922 }`, `.badge-medium { color: #e3b341 }`, `.badge-low { color: #58a6ff }`
- Fullscreen modal: `#modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 1000 }`

**buildScrollspyScript()** — return inline `<script>` string using `IntersectionObserver` watching all `section` elements; adds `active` class to matching sidebar link on intersect.

**buildSidebar(sections)** — `sections: [{id, label}]`; return `<nav id="sidebar">` with `<ul>` links; append `buildScrollspyScript()` after `</nav>`.

**buildHtmlSkeleton(title, css, sidebar, body)** — return complete `<!DOCTYPE html>` page with inline `<style>` and `<body>` containing sidebar + `<main>` + fullscreen modal `<div id="modal">` + inline `<script>` for modal open/close (Escape key) and scroll-to-zoom. No external CDN refs anywhere.

`module.exports = { buildCss, buildSidebar, buildHtmlSkeleton }` — interim.

**Acceptance**: `node -e "require('./bin/scan-report.js')"` exits cleanly.

---

## Task 3 — Implement report section builders (bin/scan-report.js or bin/scan-report-sections.js)

**File**: `bin/scan-report.js` or `bin/scan-report-sections.js` (extend)

All functions return HTML strings. All under 30 lines. Use safe defaults for missing data fields.

**buildMetricCards(analysisData)** — extract `filesScanned` (0), `totalLoc` (0), `debtCritical` (0), `debtHigh` (0), `debtMedium` (0), `debtLow` (0), `testCoverage` ('N/A'), `outdatedDeps` (0), `apiEndpoints` (0); return `<section id="summary"><h2>Summary</h2><div class="metric-grid">` with `.metric-card` per metric.

**buildDomainHealth(analysisData)** — extract `analysisData.domains` (default `[]`), each `{ name, files, healthScore }`; return `<section id="domains"><h2>Domains</h2>` with `.health-card` per domain including name, file count, and health bar `<div class="health-bar"><div class="health-fill" style="width:{score}%"></div></div>`.

**buildDiagramSection(diagramResult)** — takes one DiagramResult from contract; return `<section id="diagram-{type}">` with title bar `<h2>{title}</h2>` + `<span class="type-badge">{typeBadge}</span>` + expand button + `.diagram-container` with inline `{svgContent}` + `<p class="diagram-note">{note}</p>`. Expand button calls `openModal('{type}')` (modal JS defined in buildHtmlSkeleton).

**buildTechDebt(analysisData)** — extract `analysisData.techDebt` (default `[]`), each `{ severity, domain, issue, location, effort }`; return `<section id="tech-debt"><h2>Tech Debt Register</h2>` + severity count summary + `<table>` with headers and `<span class="badge badge-{severity}">` in first column.

**buildFindings(analysisData)** — extract `analysisData.findings` (default `[]`), each `{ category, title, description, recommendation }`; return `<section id="findings"><h2>Key Findings</h2>` with `.finding-card` per item.

Extend `module.exports` with all new functions.

**Dependencies**: Task 2 complete.

---

## Task 4 — Implement generateReport() top-level function in bin/scan-report.js

**File**: `bin/scan-report.js` (finalize)

```
generateReport(analysisData, schemaData, diagrams, options):
  1. css = buildCss()
  2. sections = [{ id: 'summary', label: 'Summary' }, { id: 'domains', label: 'Domains' },
       { id: 'diagram-system-architecture', label: 'System Architecture' },
       { id: 'diagram-app-architecture', label: 'App Architecture' },
       { id: 'diagram-workflow', label: 'Workflow' },
       { id: 'diagram-data-flow', label: 'Data Flow' },
       { id: 'diagram-sequence', label: 'Sequence' },
       { id: 'diagram-database-schema', label: 'Database Schema' },
       { id: 'tech-debt', label: 'Tech Debt' },
       { id: 'findings', label: 'Key Findings' }]
  3. sidebar = buildSidebar(sections)
  4. body = buildMetricCards(analysisData)
           + buildDomainHealth(analysisData)
           + diagrams.map(buildDiagramSection).join('')
           + buildTechDebt(analysisData)
           + buildFindings(analysisData)
  5. projectName = analysisData.projectName || path.basename(options.projectRoot || process.cwd())
  6. html = buildHtmlSkeleton(projectName + ' — GSD-T Scan Report', css, sidebar, body)
  7. outputPath = path.join(options.outputDir || options.projectRoot || process.cwd(), 'scan-report.html')
  8. fs.writeFileSync(outputPath, html, 'utf8')
  9. return { outputPath, diagramsRendered: diagrams.filter(d => d.rendered).length, diagramsPlaceholder: diagrams.filter(d => !d.rendered).length }
```

Outer try/catch: log to stderr, return `{ outputPath: null, error: err.message }`.

`module.exports = { generateReport, buildCss, buildSidebar, buildHtmlSkeleton, buildMetricCards, buildDomainHealth, buildDiagramSection, buildTechDebt, buildFindings }`.

**Dependencies**: Tasks 2–3 complete.

---

## Task 5 — Modify commands/gsd-t-scan.md: add Steps 2.5, 3.5 and extend Step 8

**File**: `commands/gsd-t-scan.md` (modify existing — read fully before any change)

**Insert Step 2.5** after the end of Step 2 content block:

```markdown
### Step 2.5 — Schema Extraction

Run schema extraction on the project root to detect ORM/database schema files:

Using Bash tool: `node -e "const {extractSchema}=require('./bin/scan-schema.js'); const r=extractSchema('$ARGUMENTS'); process.stdout.write(JSON.stringify(r))"`

Capture output as `schemaData`. Log the detected ORM type and entity count.
If `schemaData.detected === false`, note: "No ORM/schema files detected — database diagram will use placeholder."
```

**Insert Step 3.5** after the end of Step 3 content block:

```markdown
### Step 3.5 — Diagram Generation

Generate all 6 diagrams from codebase analysis data and schema extraction results:

Using Bash tool: `node -e "const {generateDiagrams}=require('./bin/scan-diagrams.js'); const r=generateDiagrams(analysisData, schemaData, {projectRoot:'$ARGUMENTS'}); process.stdout.write(JSON.stringify(r.map(d=>({type:d.type,rendered:d.rendered,rendererUsed:d.rendererUsed}))))"`

Capture the full array as `diagrams`. Log: count of rendered diagrams vs placeholders and renderer chain used.
```

**Extend Step 8** — append to end of existing Step 8 instructions (do NOT replace):

```markdown

After writing the text report, generate the self-contained HTML report:

Using Bash tool: `node -e "const {generateReport}=require('./bin/scan-report.js'); const r=generateReport(analysisData, schemaData, diagrams, {projectRoot:'$ARGUMENTS'}); console.log('HTML report:', r.outputPath, '| Diagrams rendered:', r.diagramsRendered+'/6')"`

Report the HTML output path and diagram render count to the user.
```

**Constraint**: Do NOT remove, rename, reorder, or alter the text of existing Steps 1–8. Only insert between or append.

**Dependencies**: Task 4 complete.

---

## Task 6 — Test: verify scan-report module and scan.md changes

Verify the following:

1. **scan-report.js loads**: `node -e "require('./bin/scan-report.js')"` exits cleanly
2. **generateReport exported**: `typeof generateReport === 'function'`
3. **generateReport writes HTML**: Call with mock data → `outputPath` exists on disk
4. **HTML self-contained**: No `src="http` or `href="http` external references in generated HTML
5. **Sidebar present**: HTML contains `<nav id="sidebar">`
6. **All 6 diagram sections present**: HTML contains all 6 `id="diagram-{type}"` anchors
7. **Tech debt section present**: HTML contains `id="tech-debt"`
8. **Findings section present**: HTML contains `id="findings"`
9. **Step 2.5 in scan.md**: `commands/gsd-t-scan.md` contains `Step 2.5` and `extractSchema`
10. **Step 3.5 in scan.md**: `commands/gsd-t-scan.md` contains `Step 3.5` and `generateDiagrams`
11. **Existing steps intact**: Steps 1 through 8 all still present in `commands/gsd-t-scan.md`
12. **npm test passes**: All 125+ existing automated tests still pass

All 12 checks must pass before this domain is considered complete.

**Dependencies**: Tasks 1–5 complete. Checkpoint 1 complete.
