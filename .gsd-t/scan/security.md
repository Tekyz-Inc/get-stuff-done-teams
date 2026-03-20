# Security Analysis — Scan #11 (2026-03-20)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.39.12

**Scan date**: 2026-03-20
**Previous scan**: Scan #10 at v2.38.10 (2026-03-19)
**New items**: 1 (SEC-M05)
**Resolved items**: 7 (SEC-C01, SEC-H01, SEC-H02, SEC-H03, SEC-M01, SEC-M02, SEC-M03, SEC-M04)
**Carried items**: 2 (SEC-L01, SEC-L02)
**Graph-enhanced**: Yes — used SAFE_ENTITY_RE validation analysis, execFileSync migration verification

---

## CRITICAL Severity

_No open critical findings._

### ~~SEC-C01~~: graph-query.js grepQuery() — command injection via params.entity/params.file (RESOLVED v2.39.10)
- **Resolution**: Migrated to `execFileSync` with array args. Added `SAFE_ENTITY_RE = /^[\w.\-/\\:]+$/` guard — entity and file names are validated before use. Injection path eliminated.

---

## HIGH Severity

_No open high findings._

### ~~SEC-H01~~: gsd-t-update-check.js — version string passed to execSync without validation (RESOLVED v2.39.10)
- **Resolution**: `doAutoUpdate()` now uses `execFileSync("npm", ["install", "-g", "@tekyzinc/gsd-t@" + latest])`. Version validated against `SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` before `doAutoUpdate` is called. Both injection vectors closed.

### ~~SEC-H02~~: gsd-t-update-check.js — second execSync call (RESOLVED v2.39.10)
- **Resolution**: `execFileSync("gsd-t", ["update-all"])` — array args used throughout.

### ~~SEC-H03~~: scan-export.js — execSync with string interpolation of htmlPath (RESOLVED v2.39.10)
- **Resolution**: `execFileSync('pandoc', [htmlPath, '-o', outputPath, '--from=html'])` — array args throughout `exportToDocx()` and `exportToPdf()`.

---

## MEDIUM Severity

### SEC-M05: graph-query.js _syncCgc() — projectRoot passed to cgc without path validation (NEW)
- **Location**: `bin/graph-query.js` lines 376, 381
- **Code**:
  ```javascript
  execFileSync('cgc', ['index', projectRoot], cgcOpts);
  execFileSync('cgc', ['index', projectRoot, '--force'], cgcOpts);
  ```
- **Details**: `projectRoot` is passed as an array argument (not shell-interpolated), so there is no shell injection risk. However, `projectRoot` is not validated to ensure it is a real directory path or that it does not traverse outside expected boundaries. In normal operation, `projectRoot` is derived from `process.cwd()` walking up to find `.gsd-t/`, which limits the practical attack surface. An adversary who controls the working directory from which Claude Code is invoked (e.g., via a malicious project) could point CGC indexing at an arbitrary path. Since CGC is a read-only index operation, the impact is limited to unintended directory traversal for indexing rather than data corruption.
- **Impact**: MEDIUM (low exploitability, no shell injection, read-only CGC operation)
- **Fix**: Validate `projectRoot` is an absolute path and that `.gsd-t/` exists within it before passing to `cgc`. Example: `if (!path.isAbsolute(projectRoot) || !fs.existsSync(path.join(projectRoot, '.gsd-t'))) return;`
- **Status**: NEW

### ~~SEC-M01~~: scan-renderer.js — execSync with tmpIn/tmpOut paths (RESOLVED v2.39.10)
- **Resolution**: `execFileSync('mmdc', ['-i', tmpIn, '-o', tmpOut, '-t', 'dark', '--quiet'])` — array args used in both `tryMmdc()` and `tryD2()`.

### ~~SEC-M02~~: gsd-t-tools.js — stateSet() allows markdown structure injection (RESOLVED v2.39.10)
- **Resolution**: Line 43 now applies `String(value).replace(/[\r\n]/g, ' ')` before writing. Newline injection blocked.

### ~~SEC-M03~~: scan-export.js — detectTool() uses execSync with arbitrary cmd string (RESOLVED v2.39.10)
- **Resolution**: `detectTool()` uses `execFileSync(check, [cmd])` where `check` is either `'where'` or `'which'` (platform-determined constant) and `cmd` is the argument. No shell involved.

### ~~SEC-M04~~: graph-store.js — ensureDir() does not validate projectRoot or check symlinks (RESOLVED v2.39.10)
- **Resolution**: `ensureDir()` calls `isSymlink(dir)` and throws on symlink. `readFile()` calls `isSymlink(fp)` and returns null on symlink. `writeFile()` calls both `ensureDir()` (dir check) and `isSymlink(fp)` (file check) before writing. Full symlink protection applied at every write path.

---

## LOW Severity

### SEC-L01: Dashboard SSE endpoint has no authentication (CARRIED — TD-090)
- **Location**: `scripts/gsd-t-dashboard-server.js` SSE_HEADERS
- **Details**: `Access-Control-Allow-Origin: *` with no token check. Any local process or browser tab can subscribe to the event stream.
- **Status**: OPEN (carried from Scan #8)

### SEC-L02: tryKroki() would send codebase analysis to external kroki.io (CARRIED — TD-091)
- **Location**: `bin/scan-renderer.js` lines 53-77
- **Details**: Dead code — `tryKroki()` is defined but never called from `renderDiagram()`. The sync rendering path falls through mmdc → d2 → placeholder. The function would require `await` at the call site to activate, and no caller exists. `KROKI_HOST` env var support is present, suggesting self-hosted use was anticipated. Risk is zero while it remains dead code.
- **Status**: OPEN (carried — confirm dead code in Scan #12 via graph findDeadCode)

---

## Accepted Risks

### SEC-ACCEPT-01: TOCTOU Race in Symlink Check + Write (TD-029)
Accepted in M8. There is an inherent race between `isSymlink()` check and the subsequent `writeFileSync()`. An adversary with filesystem access could replace a regular file with a symlink in this window. Accepted because: (1) GSD-T operates on the developer's own machine, (2) the window is microseconds, (3) the threat model does not include local privilege escalation.

---

## Informational Notes

### SEC-N33: Graph CGC provider uses execFileSync (good) — CONFIRMED
`bin/graph-cgc.js` correctly uses `execFileSync` with array args for all external command calls. No injection pattern. Confirmed unchanged.

### SEC-N34: Graph store writes to .gsd-t/graph/ (git-ignored)
Graph data files contain function names, file paths, and code structure. Written only to local project directory. Not transmitted. Graph store now additionally guarded by symlink checks at every write path.

### SEC-N35: CGC communicates via local stdio only
CGC MCP server is spawned locally via `spawn()`. Communication is JSON-RPC over stdin/stdout pipes. No network exposure. `_syncCgc` additionally sets `PYTHONIOENCODING=utf-8` in the subprocess environment to prevent encoding failures from producing misleading error states.

### SEC-N36: SEMVER_RE validation in gsd-t-update-check.js (good)
`fetchLatestVersion()` validates registry response against `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` before returning. Cache reads are also validated (`cached.latest = null` if invalid). Defense-in-depth: even if registry response is compromised, the version string is sanitized before reaching `doAutoUpdate`.

### SEC-N37: Browser-side CDN dependencies in dashboard.html pinned to fixed versions (carried)
Not audited. Low priority — dashboard is a local dev tool, not exposed externally.

---

## Dependency Audit

No npm dependencies — `npm audit` returns `ENOLOCK` (no lockfile), confirming zero tracked dependencies. Zero supply chain attack surface on the Node.js side.

CGC provider depends on external Python package (`codegraphcontext`) and Neo4j Docker container. Not npm dependencies. Neo4j container is configured localhost-only (`bolt://localhost:7687`) with a hardcoded development password (`gsdt-graph-2026`). This password is non-sensitive by design (local-only dev container), but should not be reused in production contexts.

---

## Resolved Items Summary (Scan #11)

All 7 open items from Scan #10 were resolved in the v2.39.10 security hardening commit (commit `909b5b6`):

| Item      | Severity | Resolution |
|-----------|----------|------------|
| SEC-C01   | CRITICAL | execFileSync + SAFE_ENTITY_RE validation in grepQuery() |
| SEC-H01   | HIGH     | execFileSync + SEMVER_RE validation in doAutoUpdate()    |
| SEC-H02   | HIGH     | execFileSync array args in doAutoUpdate()                |
| SEC-H03   | HIGH     | execFileSync array args in exportToDocx()/exportToPdf()  |
| SEC-M01   | MEDIUM   | execFileSync array args in tryMmdc()/tryD2()             |
| SEC-M02   | MEDIUM   | newline sanitization in stateSet()                       |
| SEC-M03   | MEDIUM   | execFileSync array args in detectTool()                  |
| SEC-M04   | MEDIUM   | isSymlink() guards in ensureDir()/readFile()/writeFile() |
