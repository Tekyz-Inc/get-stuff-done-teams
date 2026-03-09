# Security Audit — 2026-03-09 (Scan #9, Post-M17)

**Package:** @tekyzinc/gsd-t v2.34.10
**Previous scan:** Scan #8 at v2.34.10 (2026-03-09)
**Scope:** No new code changes since Scan #8. All Scan #8 findings carried forward unchanged. Test baseline: 205/205 passing.

---

## Critical (fix immediately)
None found.

---

## High (fix soon)

### [HIGH] SEC-N28 (carried): gsd-t-update-check.js passes npm version from registry into execSync via shell interpolation
- **File**: `scripts/gsd-t-update-check.js` lines 61-64
- **Finding**: The `latest` variable comes from `JSON.parse(d).version` of the npm registry response. This string is interpolated directly into an execSync shell command: `execSync('npm install -g @tekyzinc/gsd-t@' + latest)`. If a malicious npm registry response returns a version string containing shell metacharacters (e.g. `1.0.0; rm -rf ~/`), arbitrary shell commands would execute.
- **Context**: The npm registry fetch is HTTPS to registry.npmjs.org — low practical risk in normal operation. However, the fetch has no Content-Type validation, and the JSON is parsed directly without validating the version string format before interpolation.
- **Chain**: (1) Malicious/MITM registry → (2) crafted version string → (3) shell injection in execSync
- **Remediation**: Validate `latest` against a semver regex before use (`/^\d+\.\d+\.\d+$/`). Use `execFileSync` with array args: `execFileSync('npm', ['install', '-g', '@tekyzinc/gsd-t@' + latest])`.
- **Status**: OPEN — unresolved since Scan #7
- **Effort**: small

---

## Medium (plan to fix)

### [MEDIUM] SEC-N37 (NEW — Scan #8): gsd-t-dashboard.html loads 5 CDN resources from unpkg.com — supply chain risk
- **File**: `scripts/gsd-t-dashboard.html` lines 6-10
- **Finding**: The dashboard HTML loads React 17, ReactDOM 17, dagre 0.8.5, ReactFlow 11.11.4, and ReactFlow CSS stylesheet from `https://unpkg.com`. These are pinned by version but not by subresource integrity (SRI) hash.
  - No `integrity="sha384-..."` attribute on any `<script>` or `<link>` tag
  - unpkg.com serves npm packages — if any of these packages are compromised on npm, the dashboard immediately loads malicious JS
  - All script resources run with full JS privileges in the user's browser
  - The dashboard server (`gsd-t-dashboard-server.js`) proxies these HTML files to `http://localhost:7433` — CORS is open (`*`)
- **Impact**: A compromise of any of the 4 npm packages (react@17, react-dom@17, dagre@0.8.5, reactflow@11.11.4) on unpkg would execute arbitrary JS in the dashboard browser tab with full DOM access. The SSE event stream (containing agent reasoning, command names, trace IDs) would be accessible to the malicious script.
- **Remediation**:
  1. Add `integrity="sha384-{hash}"` SRI attributes to all CDN resources
  2. OR bundle the libraries inline (consistent with scan-report.html pattern)
  3. OR add `Content-Security-Policy` header in dashboard-server.js restricting script sources
- **Effort**: medium (bundling) or small (adding SRI hashes)

### [MEDIUM] SEC-N20 (carried from Scan #6): stateSet() allows markdown structure injection via newlines
- **File**: `scripts/gsd-t-tools.js` line 43
- **Status**: Still unresolved. See Scan #6 security.md for full details.
- **Remediation**: `value = String(value).replace(/[\r\n]/g, ' ')` before the replace operation.

### [MEDIUM] SEC-N29 (carried from Scan #7): scan-export.js passes htmlPath to execSync via shell string interpolation
- **File**: `bin/scan-export.js` lines 20-22, 27-29
- **Finding**: `exportToDocx()` constructs `execSync('pandoc "' + htmlPath + '" -o "' + outputPath + '" --from=html')`. If `htmlPath` contains shell metacharacters or embedded quotes, this would break out of the shell string.
- **Status**: Still unresolved.
- **Remediation**: Use `execFileSync('pandoc', [htmlPath, '-o', outputPath, '--from=html'])` to avoid shell.
- **Effort**: small

### [MEDIUM] SEC-N30 (carried from Scan #7): scan-renderer.js passes tmpIn/tmpOut paths to execSync via string interpolation
- **File**: `bin/scan-renderer.js` lines 26, 43
- **Finding**: `execSync('mmdc -i "' + tmpIn + '" -o "' + tmpOut + '"')` and same for d2. tmpIn/tmpOut are constructed from `os.tmpdir() + timestamp`. Risk is low but inconsistent with execFileSync convention.
- **Status**: Still unresolved.
- **Remediation**: Use `execFileSync('mmdc', ['-i', tmpIn, '-o', tmpOut, '-t', 'dark', '--quiet'])`.
- **Effort**: small

### [MEDIUM] SEC-N21 (carried from Scan #6): templateScope/templateTasks path traversal
- **File**: `scripts/gsd-t-tools.js` lines 111-121
- **Status**: Still unresolved. See Scan #6 security.md for full details.

### [MEDIUM] SEC-N22 (carried from Scan #6): gsd-t-tools.js uses execSync (not execFileSync)
- **File**: `scripts/gsd-t-tools.js` lines 92, 97, 104
- **Status**: Still unresolved.

---

## Low (nice to have)

### [LOW] SEC-N38 (NEW — Scan #8): gsd-t-dashboard.html has no Content-Security-Policy — broad XSS attack surface
- **File**: `scripts/gsd-t-dashboard.html` (inline)
- **Finding**: The dashboard HTML has no `<meta http-equiv="Content-Security-Policy">` tag and the server (`gsd-t-dashboard-server.js`) does not set a `Content-Security-Policy` response header. The page loads 5 CDN script/style resources and executes inline React application code. Without CSP, any XSS vector (e.g., unsanitized event data rendered in the feed) could execute arbitrary JS.
- **Context**: Event data rendered in the feed comes from JSONL files written by gsd-t-event-writer.js. The event-writer validates event_type but does not HTML-encode reasoning strings. If a reasoning string contains `<script>` tags, React's JSX rendering would escape them (safe). But the `ev.reasoning` is rendered via `textContent` equivalent in React — so XSS risk is low but not zero if raw HTML injection is possible.
- **Remediation**: Add CSP header in dashboard-server.js: `"Content-Security-Policy": "default-src 'self' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com"`
- **Effort**: small

### [LOW] SEC-N31 (carried from Scan #7): dashboard-server.js SSE endpoint has no authentication
- **File**: `scripts/gsd-t-dashboard-server.js` lines 90-96
- **Status**: Still unresolved. Context: binds to localhost only. Risk requires local access. Acceptable for developer tool.

### [LOW] SEC-N32 (carried from Scan #7): scan-renderer.js tryKroki() sends mermaid DSL to external kroki.io
- **File**: `bin/scan-renderer.js` lines 53-77
- **Status**: Still unresolved. Currently dormant (not called in sync path).

### [LOW] SEC-N24 (carried from Scan #6): continue-here file deleted before resume completes
- **File**: `commands/gsd-t-resume.md` Step 2
- **Status**: Still unresolved.

### [LOW] SEC-N25 (carried from Scan #6): gsd-t-health --repair reads templates from relative path assumption
- **Status**: Still unresolved.

### [LOW] SEC-N33 (carried from Scan #7): gsd-t-update-check.js second execSync call uses shell
- **File**: `scripts/gsd-t-update-check.js` line 64
- **Status**: Still unresolved. Remediation: Use `execFileSync('gsd-t', ['update-all'])`.

---

## Previously Known — Carried/Resolved Status

| Finding | Status |
|---------|--------|
| TD-029 (TOCTOU race)          | ACCEPTED RISK — unchanged |
| SEC-N16 (scrubSecrets regex)  | INFORMATIONAL — unchanged |
| SEC-N18 (prototype pollution) | INFORMATIONAL — unchanged |
| SEC-N19 (error path exposure) | INFORMATIONAL — unchanged |
| SEC-N20 (stateSet injection)  | OPEN — unresolved from Scan #6 |
| SEC-N21 (path traversal)      | OPEN — unresolved from Scan #6 |
| SEC-N22 (execSync in tools.js)| OPEN — unresolved from Scan #6 |
| SEC-N23 (findProjectRoot cwd) | OPEN — unresolved from Scan #6 |
| SEC-N24 (resume deletes early)| OPEN — unresolved from Scan #6 |
| SEC-N25 (health repair path)  | OPEN — unresolved from Scan #6 |
| SEC-N26 (statusline env var)  | INFORMATIONAL — unchanged |
| SEC-N27 (bypassPermissions)   | INFORMATIONAL — unchanged |
| SEC-N28 (update-check execSync)| OPEN — unresolved from Scan #7 |
| SEC-N29 (scan-export execSync) | OPEN — unresolved from Scan #7 |
| SEC-N30 (scan-renderer execSync)| OPEN — unresolved from Scan #7 |
| SEC-N31 (dashboard no auth)   | OPEN — acceptable risk |
| SEC-N32 (tryKroki external)   | OPEN — dormant |
| SEC-N33 (gsd-t update-all shell)| OPEN — trivial |

---

## New Findings — Scan #8

| ID | Severity | Finding |
|----|----------|---------|
| SEC-N37 | MEDIUM | gsd-t-dashboard.html CDN resources without SRI hashes — supply chain risk |
| SEC-N38 | LOW | gsd-t-dashboard.html no Content-Security-Policy |

---

## Dependency Audit
No npm dependencies. Zero supply chain attack surface on the server side.
`npm audit` not available without lockfile (no lockfile by design — zero dependencies).

**Note:** The dashboard client-side loads 4 npm packages via CDN (react@17, react-dom@17, dagre@0.8.5, reactflow@11.11.4). These are client-side only and not tracked by npm audit. Manual version review recommended if dashboard is used in sensitive environments.

---

## Security Notes — Informational

### SEC-N34 (carried): gsd-t-event-writer.js closed schema for M14
Closed schema prevents accidental data leakage through extra fields. Security-positive.

### SEC-N35 (carried): gsd-t-auto-route.js never blocks prompt
Auto-route catches all exceptions and exits 0, ensuring it never crashes the user session.

### SEC-N36 (carried): scan-report.js HTML is self-contained (no external CDN resources)
verify-gates.js confirms: no external link stylesheets, no `src="https://"`. All CSS/JS is inline.
**Contrast with gsd-t-dashboard.html which loads 5 CDN resources — inconsistent security posture.**
