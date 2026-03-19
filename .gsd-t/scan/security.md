# Security Analysis — Scan #10 (2026-03-19)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.38.10

**Scan date**: 2026-03-19
**Previous scan**: Scan #9 at v2.34.10 (2026-03-09)
**New items**: 2 (SEC-C01, SEC-M04)
**Carried items**: 7 (SEC-H01, SEC-H02, SEC-H03, SEC-M01, SEC-M02, SEC-M03, SEC-L01, SEC-L02)
**Graph-enhanced**: Yes — used findDeadCode, findDuplicates, findComplexFunctions, getCallers queries

---

## CRITICAL Severity

### SEC-C01: graph-query.js grepQuery() — command injection via params.entity/params.file (NEW)
- **Location**: `bin/graph-query.js` lines 305-306, 321-322
- **Code**:
  ```javascript
  const cmd = `grep -rn "${name}(" --include="*.js" --include="*.ts" --include="*.py" "${projectRoot}" 2>/dev/null || true`;
  const out = execSync(cmd, { encoding: 'utf8', timeout: 5000 });
  ```
- **Details**: `params.entity` and `params.file` (user-controlled inputs) are interpolated directly into shell commands passed to `execSync`. An entity name like `"; rm -rf / #` achieves arbitrary command execution. The grep fallback provider is the lowest priority (3), so this is only reached when both CGC and native providers are unavailable — but the fallback IS exercised for `getCallers` and `getImporters` queries when no index exists.
- **Impact**: CRITICAL — shell injection when grep fallback is active. Any command that calls `query('getCallers', { entity: userInput })` or `query('getImporters', { file: userInput })` through the grep provider is exploitable.
- **Fix**: Use `execFileSync('grep', ['-rn', name + '(', '--include=*.js', '--include=*.ts', '--include=*.py', projectRoot], { encoding: 'utf8', timeout: 5000 })` with array args instead of string interpolation. Alternatively, validate entity/file names against `/^[\w.\-/]+$/` before use.
- **Status**: NEW

---

## HIGH Severity

### SEC-H01: gsd-t-update-check.js — version string passed to execSync without validation (CARRIED — TD-082)
- **Location**: `scripts/gsd-t-update-check.js` line 61
- **Code**: `execSync('npm install -g @tekyzinc/gsd-t@' + latest, ...)`
- **Details**: `latest` from npm registry is not validated before shell interpolation. MITM or compromised registry can inject commands.
- **Fix**: Validate with semver regex. Use `execFileSync('npm', ['install', '-g', '@tekyzinc/gsd-t@' + latest])`.
- **Status**: OPEN (carried from Scan #7)

### SEC-H02: gsd-t-update-check.js — second execSync call (CARRIED)
- **Location**: `scripts/gsd-t-update-check.js` line 64
- **Code**: `execSync('gsd-t update-all', ...)`
- **Fix**: `execFileSync('gsd-t', ['update-all'], { ... })`
- **Status**: OPEN (carried from Scan #8)

### SEC-H03: scan-export.js — execSync with string interpolation of htmlPath (CARRIED — TD-084)
- **Location**: `bin/scan-export.js` lines 21, 30
- **Fix**: `execFileSync('pandoc', [htmlPath, '-o', outputPath, '--from=html'], { ... })`
- **Status**: OPEN (carried from Scan #7)

---

## MEDIUM Severity

### SEC-M01: scan-renderer.js — execSync with tmpIn/tmpOut paths (CARRIED — TD-084)
- **Location**: `bin/scan-renderer.js` lines 26, 43
- **Fix**: `execFileSync('mmdc', ['-i', tmpIn, '-o', tmpOut, '-t', 'dark', '--quiet'], { ... })`
- **Status**: OPEN (carried from Scan #7)

### SEC-M02: gsd-t-tools.js — stateSet() allows markdown structure injection (CARRIED — TD-071)
- **Location**: `scripts/gsd-t-tools.js` line 43
- **Fix**: Add `value = String(value).replace(/[\r\n]/g, ' ')` before replace.
- **Status**: OPEN (carried from Scan #7)

### SEC-M03: scan-export.js — detectTool() uses execSync with arbitrary cmd string (CARRIED)
- **Location**: `bin/scan-export.js` lines 6-11
- **Fix**: Validate `cmd` against `/^[a-zA-Z0-9_-]+$/` or use execFileSync.
- **Status**: OPEN (carried from Scan #8)

### SEC-M04: graph-store.js — ensureDir() does not validate projectRoot or check symlinks (NEW)
- **Location**: `bin/graph-store.js` lines 22-26
- **Code**: `fs.mkdirSync(dir, { recursive: true })` where `dir` derives from `projectRoot` without validation
- **Details**: Unlike bin/gsd-t.js which has `isSymlink()` + `hasSymlinkInPath()` checks before file writes, graph-store.js has no symlink protection. A symlinked `.gsd-t/graph/` directory could cause graph data to be written to arbitrary locations.
- **Impact**: MEDIUM — requires prior symlink placement. Risk is consistent with main codebase pattern, which already uses symlink checks everywhere else.
- **Fix**: Add isSymlink/hasSymlinkInPath check in ensureDir() and writeFile(), or reuse the existing symlink checks from gsd-t.js.
- **Status**: NEW

---

## LOW Severity

### SEC-L01: Dashboard SSE endpoint has no authentication (CARRIED — TD-090)
- **Location**: `scripts/gsd-t-dashboard-server.js` SSE_HEADERS
- **Details**: `Access-Control-Allow-Origin: *` with no token check.
- **Status**: OPEN (carried)

### SEC-L02: tryKroki() would send codebase analysis to external kroki.io (CARRIED — TD-091)
- **Location**: `bin/scan-renderer.js` lines 53-77
- **Details**: Dead code (never called). Graph findDeadCode confirms no callers.
- **Status**: OPEN (carried)

---

## Accepted Risks

### SEC-ACCEPT-01: TOCTOU Race in Symlink Check + Write (TD-029)
Accepted in M8. See techdebt.md for rationale. Still valid.

---

## Informational Notes

### SEC-N33: Graph CGC provider uses execFileSync (good)
`bin/graph-cgc.js` correctly uses `execFileSync` with array args for all external command calls. No injection pattern.

### SEC-N34: Graph store writes to .gsd-t/graph/ (git-ignored)
Graph data files contain function names, file paths, and code structure. Written only to local project directory. Not transmitted.

### SEC-N35: CGC communicates via local stdio only
CGC MCP server is spawned locally via `spawn()`. Communication is JSON-RPC over stdin/stdout pipes. No network exposure.

---

## Dependency Audit
No npm dependencies — nothing to audit. Zero supply chain attack surface on the Node.js side.

CGC provider depends on external Python package (codegraphcontext) and Neo4j Docker container. Not npm dependencies. Neo4j container runs localhost-only.

Browser-side CDN dependencies in dashboard.html are pinned to fixed versions but not audited (SEC-N37, carried from Scan #8).

---

## Graph-Enhanced Findings Summary

The graph engine revealed:
1. **SEC-C01 (CRITICAL)**: The grep fallback provider's `execSync` injection was identified by tracing the `grepQuery` function's parameter flow through the provider chain. Without graph analysis, this was buried in graph-query.js and not flagged in previous scans (which predated the graph engine code).
2. **SEC-M04 (MEDIUM)**: Graph overlay's file write patterns lack symlink protections present elsewhere. Cross-module comparison via graph entities surfaced this inconsistency.
3. **Confirmation**: `findDeadCode` confirmed tryKroki() (SEC-L02) remains dead code with zero callers from main tree.
