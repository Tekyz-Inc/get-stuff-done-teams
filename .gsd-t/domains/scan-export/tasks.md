# Tasks: scan-export

**Domain**: scan-export
**Wave**: Wave 3 (requires Checkpoint 2: scan-report complete)
**Output**: `bin/scan-export.js` — exports `exportReport(htmlPath, format, options)` + `--export` flag added to `bin/gsd-t.js`
**Constraints**: Zero external npm deps, graceful skip if Pandoc/md-to-pdf absent (TECH-012), minimal bin/gsd-t.js change

---

## Task 1 — Read bin/gsd-t.js before writing any code (no files written)

**Pre-task: read-only — no files created or modified**

Read `bin/gsd-t.js` in full before any modifications:

- Identify how the `scan` subcommand is detected from `process.argv`
- Identify the exact flag parsing pattern used for existing flags — match this style exactly when adding `--export`
- Identify the color constants (`GREEN`, `YELLOW`, `RED`, `RESET` etc.) used for output messages
- Identify where in the scan handler block to insert the `--export` invocation
- Note whether scan-export.js needs to be registered in a UTILITY_SCRIPTS array or similar

This task produces no files. Required gate for Task 3.

**Dependencies**: Checkpoint 2 complete (scan-report.js exists and exports `generateReport`).

---

## Task 2 — Create bin/scan-export.js: export dispatcher

**File**: `bin/scan-export.js` (create new)

Require only `child_process` and `path` (Node.js built-ins). All functions under 30 lines.

**detectTool(cmd)** — run `which {cmd}` (Unix) or `where {cmd}` (Windows: `process.platform === 'win32'`) via `execSync({ stdio: 'pipe', timeout: 5000 })`; return `true` on success, `false` on catch.

**detectMdToPdf()** — run `npx md-to-pdf --version` via `execSync({ stdio: 'pipe', timeout: 10000 })`; return `true` on success, `false` on catch.

**exportToDocx(htmlPath, options)** — derive `outputPath` by replacing `.html` with `.docx`; run `pandoc "${htmlPath}" -o "${outputPath}" --from=html` via `execSync({ timeout: 60000 })`; return `{ success: true, outputPath }` on success; `{ success: false, error: err.message }` on catch.

**exportToPdf(htmlPath, options)** — derive `outputPath` by replacing `.html` with `.pdf`; run `npx md-to-pdf "${htmlPath}" --output "${outputPath}"` via `execSync({ timeout: 120000 })`; return `{ success: true, outputPath }` on success; `{ success: false, error: err.message }` on catch.

**exportReport(htmlPath, format, options)**:
- Invalid format → `{ success: false, error: 'Unknown export format: ' + format + '. Use docx or pdf.' }`
- `'docx'` + no Pandoc → `{ success: false, skipped: true, reason: 'Pandoc not found. Install: https://pandoc.org/installing.html' }`
- `'pdf'` + no md-to-pdf → `{ success: false, skipped: true, reason: 'md-to-pdf not found. Install: npm install -g md-to-pdf' }`
- Dispatch to exportToDocx or exportToPdf
- Outer try/catch: return `{ success: false, error: err.message }` — never throw

`module.exports = { exportReport }` at bottom.

**Acceptance**: `node -e "require('./bin/scan-export.js')"` exits cleanly. `exportReport` is a function.

---

## Task 3 — Add --export flag to bin/gsd-t.js scan subcommand

**File**: `bin/gsd-t.js` (minimal modification — requires Task 1 read completed)

Using the flag parsing style identified in Task 1, add to the scan subcommand handler:

**Flag parsing** (in the scan argument processing section, match existing style):
```js
const exportFlag = args.find(a => a.startsWith('--export='));
const exportFormat = exportFlag ? exportFlag.split('=')[1] : null;
```

**After scan completion** (append before final output, after scan-report.html has been written):
```js
if (exportFormat) {
  const { exportReport } = require('./scan-export');
  const exportResult = exportReport(reportHtmlPath, exportFormat, { projectRoot });
  if (exportResult.skipped) {
    console.log(YELLOW + 'Export skipped: ' + exportResult.reason + RESET);
  } else if (!exportResult.success) {
    console.log(RED + 'Export failed: ' + exportResult.error + RESET);
  } else {
    console.log(GREEN + 'Exported: ' + exportResult.outputPath + RESET);
  }
}
```

Use the exact variable names and color constants found in Task 1 read. The `reportHtmlPath` is the path returned by `generateReport()` in the scan flow.

**Constraint**: Do not rename variables, restructure blocks, or alter any existing behavior. Change is limited to the `--export` flag only.

**Acceptance**: `node bin/gsd-t.js` does not crash. Running with `--export=docx` on a missing file prints a graceful message (not an uncaught exception).

**Dependencies**: Task 2 complete.

---

## Task 4 — Test: verify scan-export module and --export flag integration

Verify the following:

1. **scan-export.js loads**: `node -e "require('./bin/scan-export.js')"` exits cleanly
2. **exportReport exported**: `typeof exportReport === 'function'`
3. **Unknown format handled**: `exportReport('/tmp/x.html', 'xlsx', {})` returns `{ success: false, error: /Unknown/ }` without throwing
4. **Missing Pandoc graceful**: When Pandoc absent, `exportReport('/tmp/x.html', 'docx', {})` returns `{ success: false, skipped: true }` without throwing
5. **Missing md-to-pdf graceful**: When md-to-pdf absent, `exportReport('/tmp/x.html', 'pdf', {})` returns `{ success: false, skipped: true }` without throwing
6. **bin/gsd-t.js handles --export**: `node bin/gsd-t.js scan --export=docx /nonexistent 2>&1` exits without an unhandled exception
7. **npm test passes**: All 125+ existing automated tests still pass after bin/gsd-t.js change
8. **Full Checkpoint 3**: All 5 modules export their contract function:
   - `bin/scan-schema.js` exports `extractSchema`
   - `bin/scan-diagrams.js` exports `generateDiagrams`
   - `bin/scan-renderer.js` exports `renderDiagram`
   - `bin/scan-report.js` exports `generateReport`
   - `bin/scan-export.js` exports `exportReport`

All 8 checks must pass before this domain is considered complete.

**Dependencies**: Tasks 1–3 complete. Checkpoint 2 (scan-report) complete.
