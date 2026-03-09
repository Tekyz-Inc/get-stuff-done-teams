# Security Analysis — Scan #8 (2026-03-09)

## Project: GSD-T Framework (@tekyzinc/gsd-t) — v2.34.10

**Scan date**: 2026-03-09
**Previous scan**: Scan #7 at v2.28.10 (2026-02-18)
**New items**: 2 (SEC-H02, SEC-M03)
**Carried items**: 5 (SEC-H01, SEC-H03, SEC-M01, SEC-M02, SEC-L01, SEC-L02)

---

## HIGH Severity

### SEC-H01: gsd-t-update-check.js -- version string passed to execSync without validation (CARRIED -- TD-082)
- **Location**: `scripts/gsd-t-update-check.js` line 61
- **Code**: `execSync('npm install -g @tekyzinc/gsd-t@' + latest, ...)`
- **Details**: `latest` comes from `JSON.parse(d).version` in an inline HTTP response handler. No semver validation before string concatenation. A MITM attacker or compromised npm registry could set `version` to `"1.0.0; rm -rf ~"` and achieve shell command injection. execSync is a shell call, so semicolons/pipes execute.
- **Impact**: Shell injection on every auto-update for any user with stale cache.
- **Fix**: Validate with `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` before use. Use `execFileSync('npm', ['install', '-g', '@tekyzinc/gsd-t@' + latest])`.
- **Status**: OPEN (carried from Scan #7)

### SEC-H02: gsd-t-update-check.js -- second execSync call (NEW)
- **Location**: `scripts/gsd-t-update-check.js` line 64
- **Code**: `execSync('gsd-t update-all', ...)`
- **Details**: Low immediate risk (no user input). Inconsistent with codebase standard of execFileSync with array args. If refactored with parameterization, injection risk emerges.
- **Impact**: Low immediate. High cargo-culting risk.
- **Fix**: `execFileSync('gsd-t', ['update-all'], { ... })`
- **Status**: NEW

### SEC-H03: scan-export.js -- execSync with string interpolation of htmlPath (CARRIED -- TD-084/SEC-N29)
- **Location**: `bin/scan-export.js` lines 21, 30
- **Code**: `execSync('pandoc "' + htmlPath + '" -o "' + outputPath + '" --from=html', ...)`
- **Details**: `htmlPath` derives from `opts.projectRoot` which may be caller-controlled. A path containing special shell characters can achieve injection. Double-quote wrapping provides minor protection but fails against embedded double-quotes.
- **Impact**: MEDIUM-HIGH -- if projectRoot comes from untrusted input.
- **Fix**: `execFileSync('pandoc', [htmlPath, '-o', outputPath, '--from=html'], { ... })`
- **Status**: OPEN (carried from Scan #7)

---

## MEDIUM Severity

### SEC-M01: scan-renderer.js -- execSync with tmpIn/tmpOut paths (CARRIED -- TD-084/SEC-N30)
- **Location**: `bin/scan-renderer.js` lines 26, 43
- **Details**: tmpIn/tmpOut come from `os.tmpdir() + Date.now()`. Risk is low on most platforms since os.tmpdir() returns a system path. On systems where TMPDIR is user-controlled, risk increases.
- **Fix**: `execFileSync('mmdc', ['-i', tmpIn, '-o', tmpOut, '-t', 'dark', '--quiet'], { ... })`
- **Status**: OPEN (carried from Scan #7)

### SEC-M02: gsd-t-tools.js -- stateSet() allows markdown structure injection (CARRIED -- TD-071)
- **Location**: `scripts/gsd-t-tools.js` line 43
- **Details**: `value` parameter written directly to progress.md without newline sanitization. A value of `"x\n## New Section\n..."` injects a heading into the file.
- **Impact**: Corrupted progress.md causes all GSD-T state commands to malfunction.
- **Fix**: Add `value = String(value).replace(/[\r\n]/g, ' ')` before the replace operation.
- **Status**: OPEN (carried from Scan #7)

### SEC-M03: scan-export.js -- detectTool() uses execSync with arbitrary cmd string (NEW)
- **Location**: `bin/scan-export.js` lines 6-11
- **Details**: `cmd` parameter is currently only called with hardcoded 'pandoc'. Function accepts arbitrary strings. Future callers with dynamic tool names could trigger injection via the `'where "' + cmd + '"'` pattern.
- **Impact**: Low currently. Pattern risk is HIGH.
- **Fix**: Validate `cmd` against `/^[a-zA-Z0-9_-]+$/` before use, or use execFileSync with array args.
- **Status**: NEW

---

## LOW Severity

### SEC-L01: Dashboard SSE endpoint has no authentication (CARRIED -- TD-090/SEC-N31)
- **Location**: `scripts/gsd-t-dashboard-server.js` SSE_HEADERS
- **Details**: `Access-Control-Allow-Origin: *` with no token check. Any local process can read all historical events including agent reasoning and command invocations.
- **Impact**: LOW -- localhost-only. Risk increases in shared/cloud dev environments.
- **Status**: OPEN (carried)

### SEC-L02: tryKroki() would send codebase analysis to external kroki.io (CARRIED -- TD-091/SEC-N32)
- **Location**: `bin/scan-renderer.js` lines 53-77
- **Details**: Dead code (never called in sync path). Would POST Mermaid diagram source (containing entity names, endpoint paths) to kroki.io if activated.
- **Status**: OPEN (carried)

---

## Accepted Risks

### SEC-A01: TOCTOU Race in Symlink Check + Write (TD-029)
Accepted in M8. Single-threaded Node.js + Windows symlink requiring admin privileges makes this theoretical. No change.

---

## Informational (No Action Required)

- **SEC-N16**: scrubSecrets regex global flag -- safe in current usage with String.prototype.replace()
- **SEC-N18**: Prototype pollution via EVENT_HANDLERS lookup -- fails safely with TypeError
- **SEC-N19**: Error messages expose path info -- standard CLI behavior, output to user's terminal only
- **SEC-N13/N14**: gsd-t-fetch-version.js -- caller validates response via validateVersion()

---

## Security Trend

| Category | Scan #5 | Scan #6 | Scan #7 | Scan #8 |
|----------|---------|---------|---------|---------|
| Critical | 0 | 0 | 0 | 0 |
| High (actionable) | 0 | 2 | 3 | 3 |
| Medium | 0 | 1 | 2 | 3 |
| Low | 1 accepted | 1 acc + 2 | 1 acc + 2 | 1 acc + 2 |
| execSync interpolation files | 0 | 0 | 2 | 2 |

The execSync pattern has not spread to new files since Scan #7. The two identified files remain open. Highest-impact: TD-082 (version injection in auto-update).
