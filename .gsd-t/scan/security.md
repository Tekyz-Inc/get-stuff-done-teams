# Security Scan — GSD-T CLI

**Scan Date:** 2026-02-18 (Scan #5)
**Package:** @tekyzinc/gsd-t v2.24.4
**Scope:** `bin/gsd-t.js` (1299 lines), `scripts/gsd-t-heartbeat.js` (183 lines), `scripts/npm-update-check.js` (42 lines), `scripts/gsd-t-fetch-version.js` (25 lines), `test/security.test.js` (30 tests), `test/filesystem.test.js` (37 tests), `test/helpers.test.js` (27 tests), `test/cli-quality.test.js` (22 tests)
**Previous Scans:** #1 (2026-02-07), #2 (2026-02-18, v2.21.1), #3 (2026-02-18, v2.23.0), #4 (2026-02-18, v2.24.3)
**Trigger:** Post-Milestone 8 (v2.24.4) security audit

---

## M8 Changes — Security Review

### readSettingsJson() Null-Safe Parsing — VERIFIED SECURE

**File:** `bin/gsd-t.js:1106-1110`

```javascript
function readSettingsJson() {
  if (!fs.existsSync(SETTINGS_JSON)) return null;
  try { return JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8")); }
  catch { return null; }
}
```

**Analysis:**
- Returns `null` for both missing and corrupt JSON files. This is a consolidated helper replacing 3 inline parse sites (TD-050).
- Callers handle `null` correctly:
  - `configureHeartbeatHooks()` (line 345-350): Distinguishes "file exists but unparseable" from "file missing" — warns user and returns 0.
  - `showStatusTeams()` (line 698-700): Warns user when settings can't be parsed.
  - `checkDoctorSettings()` (line 984): Reports issue count for invalid JSON.
- **No prototype pollution vector**: The parsed JSON is used for property reads (`settings.env`, `settings.hooks`) — not for deep merge or `Object.assign` from untrusted sources. The hooks event names come from the hardcoded `HEARTBEAT_HOOKS` array (line 309-312), not from user input.
- **Verdict:** Secure. The refactoring reduces code duplication without introducing new risk.

### Notification Scrubbing via scrubSecrets() — VERIFIED, PARTIAL GAP

**File:** `scripts/gsd-t-heartbeat.js:100`

```javascript
Notification: (h) => ({ evt: "notification", data: { message: scrubSecrets(h.message), title: h.title } }),
```

**Analysis:**
- M8 resolved SEC-N15 (from scan #4) by applying `scrubSecrets()` to `h.message`. This is confirmed at line 100.
- **Gap: `h.title` is still logged raw without scrubbing.** While notification titles are less likely to contain secrets than message bodies, a title like "Error: AUTH_TOKEN=sk_live_xyz" would be written to disk unmasked.
- See SEC-N17 below for this new finding.

---

## M5 Security Fixes — Regression Check (Scan #5)

All 6 M5 security fixes remain intact. No regressions detected.

### TD-019: scrubSecrets() + scrubUrl() — INTACT
- `scripts/gsd-t-heartbeat.js:112-136` — All patterns present and unchanged.
- `scripts/gsd-t-heartbeat.js:100` — Notification message now scrubbed (M8 addition).
- `scripts/gsd-t-heartbeat.js:148-149` — Bash commands and WebFetch URLs scrubbed via `summarize()`.
- **Test coverage:** 30 tests in `test/security.test.js` (18 scrubSecrets + 5 scrubUrl + 4 summarize + 3 shortPath). All passing.

### TD-020: npm-update-check.js Path Validation — INTACT
- `scripts/npm-update-check.js:17-21` — Path boundary check unchanged.

### TD-026: npm-update-check.js Symlink Check — INTACT
- `scripts/npm-update-check.js:36` — Symlink check before write unchanged.

### TD-027: 1MB HTTP Response Limit — INTACT
- `scripts/npm-update-check.js:25` and `scripts/gsd-t-fetch-version.js:14` — Both limits unchanged.

### TD-028: hasSymlinkInPath() — INTACT
- `bin/gsd-t.js:126-137` — Logic unchanged.

### TD-035: Security Documentation — INTACT
- `commands/gsd-t-wave.md` and `README.md` — Security sections present.

---

## Previously Verified Items — Continued Check

### TD-002: Command Injection — FIXED, NO REGRESSION
- `bin/gsd-t.js:937` — `execFileSync("claude", ["--version"], ...)` with array args.
- `bin/gsd-t.js:1124` — `execFileSync(process.execPath, [fetchScriptPath], ...)` with array args.
- `bin/gsd-t.js:1137` — `cpSpawn(process.execPath, [updateScript, UPDATE_CHECK_FILE], ...)` with array args.
- `bin/gsd-t.js:1158` — `execFileSync("cmd", ["/c", "start", "", CHANGELOG_URL], ...)` with hardcoded URL constant.
- No `execSync` or `exec` calls. No shell string interpolation.

### TD-005: Symlink Protection — FIXED, NO REGRESSION
All write sites verified with `isSymlink()` check:
- `bin/gsd-t.js`: lines 169-172 (copyFile), 234-237 (saveInstalledVersion), 266-269 (registerProject), 360-363 (configureHeartbeatHooks), 434 (backup), 442 (appendGsdtToClaudeMd), 511-512 (initClaudeMd), 540-541 (initDocs), 566 (initGsdtDir gitkeep), 577 (writeTemplateFile), 757 (removeInstalledCommands), 766 (removeVersionFile), 777 (updateProjectClaudeMd), 798 (createProjectChangelog), 1128 (fetchVersionSync cache write).
- `scripts/gsd-t-heartbeat.js:65` — symlink check before appendFileSync.
- `scripts/npm-update-check.js:36` — symlink check before writeFileSync.

### TD-009: Input Validation — FIXED, NO REGRESSION
- `bin/gsd-t.js:139-141` — `validateProjectName()` regex unchanged.
- **Test coverage:** 7 tests in `test/helpers.test.js`.

### SEC-004: TOCTOU Create — FIXED, NO REGRESSION
- Init operations use `{ flag: "wx" }` (exclusive create) at lines 518, 547, 567, 581, 812.

### SEC-008: Directory Ownership Check — PARTIALLY FIXED, UNCHANGED
- `validateProjectPath()` at `bin/gsd-t.js:155-166` checks Unix ownership via `process.getuid()`.
- `~/.claude/` itself is not ownership-checked at startup. Accepted risk.

---

## New Findings (Scan #5)

### SEC-N17: Notification Title Logged Without Scrubbing (LOW)

- **Severity:** LOW
- **File:** `scripts/gsd-t-heartbeat.js:100`
- **Description:** The `Notification` event handler scrubs `h.message` via `scrubSecrets()` (M8 fix for SEC-N15), but `h.title` is logged raw. If Claude Code sends a notification with a sensitive title (e.g., "Failed: API_KEY=sk_live_xyz connection"), the title would be written to the heartbeat JSONL file unmasked.
- **Current mitigation:** Heartbeat files are in `.gitignore`, auto-purged after 7 days, and never leave the local machine. Notification titles from Claude Code are typically generic (e.g., "Task Complete", "Error").
- **Fix:** Apply `scrubSecrets()` to `h.title` as well: `title: scrubSecrets(h.title)`.
- **Effort:** Trivial (one function call addition).
- **Priority:** Low — defense-in-depth improvement.

### SEC-N18: Prototype Pollution via EVENT_HANDLERS Lookup (INFORMATIONAL)

- **Severity:** INFORMATIONAL
- **File:** `scripts/gsd-t-heartbeat.js:106`
- **Description:** `EVENT_HANDLERS[hook.hook_event_name]` performs a property lookup on a plain object using attacker-influenced input (the `hook_event_name` from stdin JSON). If `hook_event_name` were `"__proto__"` or `"constructor"`, the lookup would return `Object.prototype` or `Object` constructor, neither of which is a function. The `if (!handler) return null` guard at line 107 would not catch this — `Object.prototype` is truthy. However, attempting to invoke it as `handler(hook)` would throw a TypeError (Object.prototype is not callable), which is caught by the outer `try/catch` at line 68. So the code fails safely.
- **Current mitigation:** Fails safely via TypeError in the `try/catch`. No state corruption, no code execution.
- **Defense-in-depth fix (optional):** Add `typeof handler === 'function'` check, or use `Object.hasOwn(EVENT_HANDLERS, hook.hook_event_name)`.
- **Effort:** Trivial.
- **Priority:** Informational — no exploit path, fails safely.

### SEC-N19: Error Messages May Expose Path Information (INFORMATIONAL)

- **Severity:** INFORMATIONAL
- **File:** `bin/gsd-t.js` — multiple locations
- **Description:** Several error handlers expose `e.message` in console output at lines 177, 241, 275, 759, 768, 783, and 861. On filesystem errors, `e.message` can include full file paths. For example, `Failed to copy CLAUDE.md: EACCES: permission denied, open '/home/user/.claude/CLAUDE.md'` reveals the user's home directory structure. Since this is a CLI tool running locally (output goes to the user's own terminal), this is expected behavior and not an information disclosure risk. The user already knows their own filesystem paths.
- **Mitigating factor:** All error messages go to stdout/stderr of the local terminal. No error messages are written to shared files or transmitted over the network.
- **Status:** No action needed. Standard CLI error reporting behavior.

---

## Accepted Risks (Unchanged from Scan #4)

### TD-029: TOCTOU Race in Symlink Check + Write — ACCEPTED RISK
- **Status:** Accepted (M8, with 5-point rationale in techdebt.md).
- **Location:** `bin/gsd-t.js:118-137` and all callers.
- **Assessment unchanged:** Microsecond window, requires local access, Node.js is single-threaded, interactive CLI context. No practical exploit path.

### SEC-005: No Content Validation of Installed Command Files
- **Status:** Accepted. Command files are markdown — semantic validation is impractical.

### SEC-006: Backup File Naming Uses Date.now()
- **Status:** Accepted. `bin/gsd-t.js:433` still uses `Date.now()` suffix. Low priority.

### SEC-007: settings.json Schema Validation Missing
- **Status:** Accepted. JSON parse errors are caught via `readSettingsJson()` (M8 improvement), but structure is not validated beyond what's needed for hook configuration.

### SEC-008: ~/.claude/ Directory Ownership Not Checked
- **Status:** Accepted. Partially mitigated by `validateProjectPath()` ownership check on Unix.

---

## Dependency Audit

```
npm audit: ENOLOCK — no package-lock.json present (zero dependencies, nothing to audit)
```

**Result:** Zero npm dependencies. No supply chain attack surface. No lockfile needed.

---

## Areas Verified as Secure

### Command Execution
- All `execFileSync` calls use array arguments: lines 937, 1124, 1158, 1161.
- `cpSpawn` uses array arguments with `process.execPath`: line 1137.
- `CHANGELOG_URL` is a hardcoded constant (line 43) with safety comment at lines 1155-1157.
- No shell string interpolation anywhere in the codebase.
- No `execSync` or `exec` calls.

### Path Traversal
- `validateProjectName()` (line 139) blocks path separators via allowlist regex.
- `validateProjectPath()` (line 155) requires absolute paths, checks existence, verifies directory ownership on Unix.
- `getRegisteredProjects()` (line 246) validates each path via `validateProjectPath()`.
- Heartbeat: session_id validated with `SAFE_SID = /^[a-zA-Z0-9_-]+$/` (line 18), resolved path verified within `.gsd-t/` (lines 57-59).
- npm-update-check.js: cache file path validated within `~/.claude/` (lines 17-21).

### Input Validation
- CLI subcommand dispatch via switch with explicit cases (line 1254) — unknown commands exit with error.
- Version strings validated with semver regex via `validateVersion()` (line 151).
- Project names validated via `validateProjectName()` (line 139).
- Session IDs validated via `SAFE_SID` regex in heartbeat (line 18).
- Heartbeat stdin capped at 1MB (line 17).
- HTTP responses capped at 1MB in both network scripts.
- JSON.parse errors caught in all 6 parse sites: `readSettingsJson()` (line 1108), `readUpdateCache()` (line 1115), `readProjectDeps()` (line 190), heartbeat stdin (line 40), npm-update-check (line 33), gsd-t-fetch-version (line 23).

### Symlink Protection
- Comprehensive `isSymlink()` checks before all file writes in `bin/gsd-t.js` (18+ call sites).
- `hasSymlinkInPath()` walks parent directory components before creating directories.
- Heartbeat checks symlinks before write (line 65) and during cleanup (line 83).
- `ensureDir()` refuses symlinked directories (lines 103-115).
- Init operations use `{ flag: "wx" }` for atomic create-or-fail.

### Secret Management
- No hardcoded credentials, API keys, or tokens.
- No `.env` files present.
- Zero npm dependencies — no supply chain attack surface.
- Heartbeat scrubs sensitive patterns in Bash commands and WebFetch URLs before logging to disk.
- Notification messages scrubbed via `scrubSecrets()` (M8 fix).

### Resource Limits
- Heartbeat stdin: 1MB max (`MAX_STDIN`, line 17).
- HTTP responses: 1MB max in both scripts.
- Heartbeat file cleanup: 7-day auto-purge, runs only on SessionStart events (line 63).
- Heartbeat files excluded from git (`.gitignore`).
- Update fetch: 8-second timeout (line 1126).
- Background update check: 5-second HTTP timeout (line 24 in npm-update-check.js).

### Network Security
- All HTTP requests use HTTPS to registry.npmjs.org (hardcoded).
- Response data validated (semver regex) before use.
- Update check results only affect display — no code execution from remote data.

### Regular Expression Safety
- `SECRET_FLAGS` (line 112): `/(--(password|token|secret|api[-_]?key|auth|credential|private[-_]?key)[\s=])\S+/gi` — No nested quantifiers. The alternation is bounded. `\S+` cannot cause catastrophic backtracking because `\S` has no overlap with the preceding `[\s=]`. Safe.
- `SECRET_SHORT` (line 113): `/(\s-p\s)\S+/gi` — Simple pattern with no backtracking risk.
- `SECRET_ENV` (line 114): Alternation of literal strings followed by `\S+`. Safe.
- `BEARER_HEADER` (line 115): `/bearer\s+)\S+/gi` — `\s+` followed by `\S+` — no overlap, safe.
- `SAFE_SID` (line 18): `/^[a-zA-Z0-9_-]+$/` — Character class with `+`, anchored. Linear time. Safe.
- `validateProjectName` (line 140): `/^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,100}$/` — Bounded quantifier. Safe.
- `validateVersion` (line 152): `/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/` — No nested quantifiers. Safe.
- **Verdict:** No ReDoS vulnerability in any regex pattern.

### Prototype Pollution
- `addHeartbeatHook()` (line 368-376): Uses `hooks[event]` where `event` comes from the hardcoded `HEARTBEAT_HOOKS` array. Not attacker-controllable. Safe.
- `EVENT_HANDLERS[hook.hook_event_name]` (line 106): Attacker-controlled key lookup. Fails safely — see SEC-N18 above.
- `JSON.parse()` in `readSettingsJson()`: Parsed object properties accessed via dot notation (`settings.hooks`, `settings.env`). No deep merge or property spreading from untrusted sources. Safe.
- `readProjectDeps()` (line 190): Uses `Object.keys()` on parsed JSON. Safe — `Object.keys` only returns own enumerable properties, not inherited ones.

### require.main Guard Coverage
- `bin/gsd-t.js:1250` — Guards all CLI subcommand dispatch.
- `scripts/gsd-t-heartbeat.js:25` — Guards stdin processing and file I/O.
- `scripts/npm-update-check.js` — No guard (entire file is side-effectful). Acceptable: only invoked via `cpSpawn`.
- `scripts/gsd-t-fetch-version.js` — No guard (entire file is side-effectful). Acceptable: only invoked via `execFileSync`.

---

## Test Coverage of Security Functions

### test/security.test.js — 30 tests
- `scrubSecrets`: 18 tests covering all flag patterns, env var patterns, bearer tokens, multi-secret strings, null handling, and non-sensitive passthrough.
- `scrubUrl`: 5 tests covering query param masking, no-param passthrough, null handling, and invalid URL handling.
- `summarize` integration: 4 tests verifying end-to-end scrubbing through the summarize function for Bash and WebFetch tools.
- `shortPath`: 3 tests (inferred from test output — tests for path abbreviation).

### test/filesystem.test.js — Security-relevant tests
- `isSymlink`: 3 tests (non-existent path, regular file, regular directory).
- `hasSymlinkInPath`: 3 tests (no symlinks, non-existent child with real parents, temp dir itself).
- `ensureDir`: 3 tests (create new, existing, nested).
- `validateProjectPath`: 4 tests (valid dir, relative path, non-existent, file-not-dir).
- `copyFile`: 1 test.

### test/helpers.test.js — Security-relevant tests
- `validateProjectName`: 7 tests including path traversal character rejection.
- `validateVersion`: 4 tests including non-numeric rejection.
- `readSettingsJson`: Tested indirectly via `checkDoctorSettings` (M8 refactoring).

### Coverage Gaps (Unchanged)
- **No symlink-positive tests**: All symlink tests verify the false path. No tests create actual symlinks — understandable on Windows where symlinks require elevated privileges.
- **No test for heartbeat path traversal protection**: The `SAFE_SID`, cwd validation, and resolved-path-within-gsdtDir check are in the `require.main` block.
- **No test for npm-update-check.js path boundary**: Path validation at lines 17-21 is in the main script body (no exports).
- **No test for Notification title scrubbing**: The new SEC-N17 gap (unscrubbed `h.title`) has no test coverage.

---

## Risk Summary

| ID | Severity | Category | Status | Since |
|----|----------|----------|--------|-------|
| TD-002 | CRITICAL | Command injection | FIXED | Scan #1 |
| TD-005 | HIGH | Symlink attack | FIXED | Scan #1 |
| SEC-004 | HIGH | TOCTOU (create) | FIXED (wx flag) | Scan #1 |
| TD-009 | MEDIUM | Input validation | FIXED | Scan #1 |
| SEC-N08 | MEDIUM | Info disclosure (.gitignore) | FIXED | Scan #2 |
| TD-019 / SEC-N07 | MEDIUM | Info disclosure (heartbeat) | FIXED (M5) | Scan #2 |
| TD-020 / SEC-N01 | MEDIUM | Path validation | FIXED (M5) | Scan #2 |
| TD-026 / SEC-N06 | LOW | Symlink bypass | FIXED (M5) | Scan #2 |
| TD-027 / SEC-N04+N05 | LOW | Resource exhaustion | FIXED (M5) | Scan #2 |
| TD-028 / SEC-N03 | LOW | Parent symlink | FIXED (M5) | Scan #2 |
| TD-035 | LOW | Security documentation | FIXED (M5) | Scan #3 |
| SEC-N09 | MEDIUM | Privilege escalation (wave) | MITIGATED (M5 docs + M7) | Scan #3 |
| SEC-N10 | LOW | Scope boundaries (QA) | MITIGATED (M7) | Scan #3 |
| SEC-N11 | LOW | State integrity (wave) | MITIGATED (M7) | Scan #3 |
| SEC-N15 | LOW | Notification msg scrubbing | FIXED (M8) | Scan #4 |
| SEC-008 | LOW | Dir ownership | PARTIALLY FIXED, ACCEPTED | Scan #1 |
| TD-029 / SEC-N02 | LOW | TOCTOU (overwrite) | ACCEPTED RISK | Scan #2 |
| SEC-N17 | LOW | Notification title unscrubbed | NEW | Scan #5 |
| SEC-N18 | INFORMATIONAL | Prototype lookup in EVENT_HANDLERS | NEW (info only) | Scan #5 |
| SEC-N19 | INFORMATIONAL | Error message path exposure | NEW (info only) | Scan #5 |
| SEC-N16 | INFORMATIONAL | Regex global flag note | Unchanged (info only) | Scan #4 |
| SEC-N13 | INFORMATIONAL | No version validation in fetch | Unchanged (info only) | Scan #4 |
| SEC-N14 | INFORMATIONAL | No status code check in fetch | Unchanged (info only) | Scan #4 |

**Open actionable findings: 3** (0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW)
- TD-029 (TOCTOU overwrite) — LOW, accepted risk
- SEC-008 (Dir ownership) — LOW, accepted risk
- SEC-N17 (Notification title unscrubbed) — LOW, new finding

**Fixed since scan #4: 1** (SEC-N15 — notification message scrubbing via M8)
**Regressed: 0**
**New actionable: 1** (SEC-N17)
**New informational: 2** (SEC-N18, SEC-N19)

---

## Priority Remediation Order

1. **SEC-N17** (Trivial, LOW) — Apply `scrubSecrets()` to notification `h.title` in heartbeat. One-line fix.
2. **TD-029** (Medium effort, LOW) — Atomic write pattern for overwrite operations. Diminishing returns for interactive CLI tool. Accepted risk.
3. **SEC-008** (Small effort, LOW) — Check `~/.claude/` ownership at startup. Accepted risk.

---

## Overall Assessment

**Overall Risk: LOW** — No new security concerns introduced by M8 changes.

M8 delivered two security-relevant improvements:
1. `readSettingsJson()` consolidates 3 JSON parse sites into one safe helper with null-safe returns.
2. `scrubSecrets()` now applied to notification messages (SEC-N15 from scan #4 is resolved).

The only new actionable finding (SEC-N17) is a minor oversight where `h.title` in notification events is not scrubbed alongside the already-scrubbed `h.message`. This is a trivial one-line fix for defense-in-depth.

The codebase maintains its strong security posture:
- Zero npm dependencies eliminates supply chain risk entirely
- All command execution uses `execFileSync` with array arguments (no shell injection)
- All file writes are preceded by symlink checks
- All user input is validated (project names, version strings, session IDs, paths)
- All network responses are bounded (1MB) and timeout-limited
- Heartbeat data is scrubbed, gitignored, and auto-purged
- 116 tests all passing (30 specifically covering security functions)

**No critical, high, or medium severity findings. Security posture is stable.**

---

## Scan Metadata
- Scan type: Security (focused audit, scan #5)
- Trigger: Post-Milestone 8 (v2.24.4) security audit
- Files analyzed: 4 JavaScript files (`bin/gsd-t.js`: 1299 lines, `scripts/gsd-t-heartbeat.js`: 183 lines, `scripts/npm-update-check.js`: 42 lines, `scripts/gsd-t-fetch-version.js`: 25 lines), 4 test files (116 tests)
- All tests passing: 116/116
- npm audit: No lockfile (zero dependencies — nothing to audit)
- Previous findings verified: All M5-M8 fixes intact, all previous items checked
- Regressions: 0
- New actionable findings: 1 (SEC-N17, LOW)
- New informational findings: 2 (SEC-N18, SEC-N19)
- Critical/High open findings: 0
