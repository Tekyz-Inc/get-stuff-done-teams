# Security Scan — GSD-T CLI

**Scan Date:** 2026-02-18 (Scan #4)
**Package:** @tekyzinc/gsd-t v2.24.3
**Scope:** `bin/gsd-t.js` (1297 lines), `scripts/gsd-t-heartbeat.js` (183 lines), `scripts/npm-update-check.js` (42 lines), `scripts/gsd-t-fetch-version.js` (25 lines, NEW), `test/security.test.js`, `commands/gsd-t-wave.md`, `commands/gsd-t-qa.md`
**Previous Scans:** #1 (2026-02-07), #2 (2026-02-18, v2.21.1), #3 (2026-02-18, v2.23.0)
**Trigger:** Post-Milestones 3-7 security audit

---

## M5 Security Fixes — Regression Check

All 6 security fixes from Milestone 5 are intact. No regressions detected.

### TD-019: scrubSecrets() + scrubUrl() — INTACT, NO REGRESSION
- `scripts/gsd-t-heartbeat.js:112-136` — scrubSecrets scrubs `--password`, `--token`, `--secret`, `--api-key`, `--api_key`, `--auth`, `--credential`, `--private-key`, `-p` short flag, `API_KEY=`, `SECRET=`, `TOKEN=`, `PASSWORD=`, `BEARER=`, `AUTH_TOKEN=`, `PRIVATE_KEY=`, `ACCESS_KEY=`, `SECRET_KEY=` env vars, and `bearer` header pattern.
- `scripts/gsd-t-heartbeat.js:126-136` — scrubUrl parses URL, masks all query parameter values.
- `scripts/gsd-t-heartbeat.js:148-149` — Bash commands scrubbed via scrubSecrets; WebFetch URLs scrubbed via scrubUrl in `summarize()`.
- **Test coverage:** 27 tests in `test/security.test.js` covering scrubSecrets (18 tests), scrubUrl (5 tests), and summarize integration (4 tests). All passing.

### TD-020: npm-update-check.js Path Validation — INTACT, NO REGRESSION
- `scripts/npm-update-check.js:17-21` — Resolves cache file path, validates it starts with `~/.claude/` + path.sep (or equals claudeDir). Exits if outside boundary.
- No changes to this logic since M5.

### TD-026: npm-update-check.js Symlink Check — INTACT, NO REGRESSION
- `scripts/npm-update-check.js:36` — `fs.lstatSync(cacheFile).isSymbolicLink()` check before `writeFileSync`.
- Pattern: check-then-write with catch for non-existent file.

### TD-027: 1MB HTTP Response Limit — INTACT, NO REGRESSION
- `scripts/npm-update-check.js:25` — `MAX_RESPONSE = 1024 * 1024` with `res.destroy()` on exceed.
- `scripts/gsd-t-fetch-version.js:14` — `MAX_BODY = 1048576` with `res.destroy()` on exceed.
- `bin/gsd-t.js:1121-1131` — `fetchVersionSync()` delegates to gsd-t-fetch-version.js (external process), inheriting its 1MB limit.
- Both network-facing scripts enforce consistent 1MB caps.

### TD-028: hasSymlinkInPath() Parent Validation — INTACT, NO REGRESSION
- `bin/gsd-t.js:126-137` — `hasSymlinkInPath()` walks from target up to filesystem root checking each component.
- `bin/gsd-t.js:103` — `ensureDir()` calls `hasSymlinkInPath()` before `mkdirSync`.
- `bin/gsd-t.js:111` — `ensureDir()` also checks `isSymlink()` on existing directories.
- **Test coverage:** 3 tests in `test/filesystem.test.js` for hasSymlinkInPath.

### TD-035: Security Documentation — INTACT, NO REGRESSION
- `commands/gsd-t-wave.md:205-231` — Security Considerations section documents bypassPermissions, attack surface, mitigations, and recommendations.
- `README.md:249-256` — Security section documents wave mode, heartbeat scrubbing, path validation, response limits, symlink protection.

---

## M7 Security Additions — Verification

### QA Agent File-Path Boundaries — VERIFIED
- `commands/gsd-t-qa.md:14-27` — Explicit CAN/MUST NOT modify sections.
- CAN modify: test directories, test configs, `.gsd-t/test-coverage.md`.
- MUST NOT modify: source code (`src/`, `lib/`, `bin/`, `scripts/`), contracts, docs, commands, templates, non-test config.
- This is a prompt-level control, not a technical enforcement. Agents could theoretically violate it.

### Wave Integrity Check — VERIFIED
- `commands/gsd-t-wave.md:14-22` — Integrity Check section requires verifying:
  - Status field with recognized value
  - Milestone heading or table entry
  - Domains table with at least one row
- Stops wave if fields are missing/malformed, instructs user to run status or init.
- This is a prompt-level control executed by the wave orchestrator agent.

---

## New File Review: scripts/gsd-t-fetch-version.js

**First security review of this file (added in M6).**

### File Purpose
Synchronous npm registry version check. Spawned as a child process by `fetchVersionSync()` in `bin/gsd-t.js:1122-1125`. Outputs version string to stdout.

### Security Analysis

**Positive:**
- HTTPS-only connection to `registry.npmjs.org` (hardcoded URL, line 16)
- 1MB response body limit (`MAX_BODY = 1048576`, line 14)
- 5-second HTTP timeout (line 16)
- Silent error handling — no information leakage on failure (line 25)
- Output is just `JSON.parse(data).version` — minimal data exposure
- No file writes — stdout only
- No user input consumed — no injection surface
- Called via `execFileSync` with array args in parent (line 1123) — no shell injection

**Concerns:**
- **SEC-N13: No version validation in fetch script** — The script outputs `JSON.parse(data).version` directly to stdout without validating it matches semver format. The *caller* in `bin/gsd-t.js:1127` validates with `validateVersion(result)` before using it, so the security boundary is maintained — but the defense is in the caller, not the script itself.
  - **Severity:** INFORMATIONAL
  - **Mitigation:** Caller validates. Defense-in-depth would add validation in the script too, but not required.

- **SEC-N14: No response status code check** — The script processes the response body regardless of HTTP status code. A 500/403/redirect response could contain arbitrary data that gets JSON-parsed. Since the only action is `process.stdout.write(parsed.version)`, and the caller validates with semver regex, there's no practical exploit path.
  - **Severity:** INFORMATIONAL
  - **Mitigation:** If parsed JSON doesn't have a `version` field, `process.stdout.write(undefined)` writes "undefined" which fails the caller's `validateVersion()` check.

**Verdict:** Secure. No actionable findings. The script follows the same hardened pattern as `npm-update-check.js`.

---

## M6 Refactoring Impact Assessment

### 48 Exports from bin/gsd-t.js

`bin/gsd-t.js:1195-1244` now exports 48 functions/constants for testability. The `require.main === module` guard at line 1248 ensures the main CLI logic only runs when invoked directly.

**Security implications:**
- **Increased testable surface:** All security-critical functions are now individually importable and tested (hasSymlinkInPath, isSymlink, validateProjectPath, validateProjectName, validateVersion, ensureDir, copyFile). This is a **security improvement**.
- **No new attack surface:** Exports do not execute side effects when imported. All CLI operations are behind the `require.main` guard. The test suite at 116 tests (all passing) validates the behavior of these exports.
- **Exported internal helpers:** Functions like `readUpdateCache`, `fetchVersionSync`, `refreshVersionAsync` are now accessible to importers. These are benign — `readUpdateCache` only reads a file, `fetchVersionSync` spawns a child process to fetch a version, `refreshVersionAsync` spawns a detached background process. None accept attacker-controlled input when imported by tests.

**Verdict:** The refactoring does not introduce new attack surface. The `require.main` guard is correctly placed. Exports improve security posture by enabling comprehensive testing.

### require.main Guard Coverage

- `bin/gsd-t.js:1248` — Guards all CLI subcommand dispatch.
- `scripts/gsd-t-heartbeat.js:25` — Guards stdin processing and file I/O.
- `scripts/npm-update-check.js` — No guard (entire file is side-effectful). This is acceptable because it's only invoked via `cpSpawn` from `bin/gsd-t.js:1136` and never imported.
- `scripts/gsd-t-fetch-version.js` — No guard (entire file is side-effectful). Same pattern — only invoked via `execFileSync` from `bin/gsd-t.js:1123` and never imported.

---

## TD-029 (TOCTOU) — Current Status

**Still applicable. Not mitigated by M5-M7 changes.**

The TOCTOU race between `isSymlink()` check and subsequent `writeFileSync`/`copyFileSync` remains at all overwrite write sites in `bin/gsd-t.js`. The pattern:

```javascript
if (isSymlink(dest)) { warn(...); return; }  // Check
fs.writeFileSync(dest, content);               // Use — gap here
```

This affects: `saveInstalledVersion()` (line 234-239), `registerProject()` (line 266-272), `configureHeartbeatHooks()` (line 363-364), `updateProjectClaudeMd()` (line 780-782), and several copy operations.

**Risk assessment remains LOW:**
1. Requires local filesystem access to the user's home directory
2. Race window is microseconds
3. CLI tool runs interactively, not as a long-running daemon
4. Node.js `O_WRONLY | O_CREAT | O_TRUNC` (writeFileSync default) doesn't follow symlinks on most filesystems — but this is OS-dependent, not guaranteed

**Recommendation:** Keep as LOW priority. The atomic write pattern (write to temp file, rename) would eliminate this class entirely, but the effort-to-risk ratio doesn't justify it for an interactive CLI tool.

---

## Previously Resolved Items — Continued Verification

### TD-002: Command Injection — FIXED, NO REGRESSION
- `bin/gsd-t.js:940` — `execFileSync("claude", ["--version"], ...)` with array args.
- `bin/gsd-t.js:1123` — `execFileSync(process.execPath, [fetchScriptPath], ...)` with array args.
- `bin/gsd-t.js:1136` — `cpSpawn(process.execPath, [updateScript, UPDATE_CHECK_FILE], ...)` with array args.
- `bin/gsd-t.js:1157` — `execFileSync("cmd", ["/c", "start", "", CHANGELOG_URL], ...)` with hardcoded URL constant and safety comment.
- No `execSync` or `exec` calls. No shell string interpolation.

### TD-005: Symlink Protection — FIXED, NO REGRESSION
- `isSymlink()` at `bin/gsd-t.js:118-124` unchanged.
- All write sites in `bin/gsd-t.js` verified: lines 169-172 (copyFile), 234-237 (saveInstalledVersion), 266-269 (registerProject), 363-367 (configureHeartbeatHooks), 437-438 (backup), 445 (appendGsdtToClaudeMd), 514-516 (initClaudeMd), 543-545 (initDocs), 569 (initGsdtDir gitkeep), 580 (writeTemplateFile), 760 (removeInstalledCommands), 769 (removeVersionFile), 780 (updateProjectClaudeMd), 801 (createProjectChangelog), 1127 (fetchVersionSync cache write).
- `scripts/gsd-t-heartbeat.js:65` — symlink check before appendFileSync.
- `scripts/npm-update-check.js:36` — symlink check before writeFileSync.

### TD-009: Input Validation — FIXED, NO REGRESSION
- `bin/gsd-t.js:139-141` — `validateProjectName()` regex: `^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,100}$`.
- Called at `bin/gsd-t.js:595` before any filesystem operations.
- **Test coverage:** 7 tests in `test/helpers.test.js` including path traversal rejection.

### SEC-004: TOCTOU Create — FIXED, NO REGRESSION
- Init operations use `{ flag: "wx" }` (exclusive create) at lines 521, 550, 570, 584, 815.

### SEC-008: Directory Ownership Check — PARTIALLY FIXED, NO CHANGE
- `validateProjectPath()` at `bin/gsd-t.js:155-166` checks Unix ownership via `process.getuid()`.
- `~/.claude/` itself is not ownership-checked at startup. Accepted risk.

---

## Accepted Risks (Unchanged)

### SEC-005: No Content Validation of Installed Command Files
- **Status:** Accepted. Command files are markdown — semantic validation is impractical.

### SEC-006: Backup File Naming Uses Date.now()
- **Status:** Accepted. Low priority. `bin/gsd-t.js:436` still uses `Date.now()` suffix.

### SEC-007: settings.json Schema Validation Missing
- **Status:** Accepted. JSON parse errors are caught but structure is not validated.

---

## Areas Verified as Secure

### Command Execution
- All `execFileSync` calls use array arguments: lines 940, 1123, 1157, 1160.
- `cpSpawn` uses array arguments with `process.execPath`: line 1136.
- `CHANGELOG_URL` is a hardcoded constant (line 43) with safety comment at lines 1155-1156.
- No shell string interpolation anywhere in the codebase.

### Path Traversal
- `validateProjectName()` (line 139) blocks path separators via allowlist regex.
- `validateProjectPath()` (line 155) requires absolute paths, checks existence, verifies directory ownership on Unix.
- `getRegisteredProjects()` (line 246) validates each path via `validateProjectPath()`.
- Heartbeat: session_id validated with `SAFE_SID = /^[a-zA-Z0-9_-]+$/` (line 18), resolved path verified within `.gsd-t/` (lines 57-59).

### Input Validation
- CLI subcommand dispatch via switch with explicit cases (line 1252) — unknown commands exit with error.
- Version strings validated with semver regex via `validateVersion()` (line 151).
- Project names validated via `validateProjectName()` (line 139).
- Session IDs validated via `SAFE_SID` regex in heartbeat (line 18).
- Heartbeat stdin capped at 1MB (line 17).
- HTTP responses capped at 1MB in both network scripts.

### Symlink Protection
- Comprehensive `isSymlink()` checks before all file writes in `bin/gsd-t.js` (18+ call sites).
- `hasSymlinkInPath()` walks parent directory components before creating directories.
- Heartbeat checks symlinks before write (line 65) and during cleanup (line 83).
- `ensureDir()` refuses symlinked directories (line 103-115).
- Init operations use `{ flag: "wx" }` for atomic create-or-fail.

### Secret Management
- No hardcoded credentials, API keys, or tokens.
- No `.env` files present.
- Zero npm dependencies — no supply chain attack surface.
- Heartbeat scrubs sensitive patterns before logging to disk.

### Resource Limits
- Heartbeat stdin: 1MB max (`MAX_STDIN`, line 17).
- HTTP responses: 1MB max in both scripts.
- Heartbeat file cleanup: 7-day auto-purge, runs only on SessionStart events (not every event — TD-024 fix confirmed at line 63).
- Heartbeat files excluded from git (`.gitignore`).
- Update fetch: 8-second timeout (line 1125).
- Background update check: 5-second HTTP timeout (line 24 in npm-update-check.js).

### Network Security
- All HTTP requests use HTTPS to registry.npmjs.org (hardcoded).
- Response data validated (semver regex) before use.
- Update check results only affect display — no code execution from remote data.

---

## New Findings

### SEC-N13: gsd-t-fetch-version.js No Version Validation (INFORMATIONAL)
- **Severity:** INFORMATIONAL
- **File:** `scripts/gsd-t-fetch-version.js:23`
- **Description:** Outputs `JSON.parse(data).version` to stdout without validating it's a valid semver string. Caller in `bin/gsd-t.js:1127` validates with `validateVersion()`, so the security boundary is maintained.
- **Status:** No action needed. Defense-in-depth is provided by the caller.

### SEC-N14: gsd-t-fetch-version.js No Status Code Check (INFORMATIONAL)
- **Severity:** INFORMATIONAL
- **File:** `scripts/gsd-t-fetch-version.js:16`
- **Description:** Processes response body regardless of HTTP status code. Non-200 responses produce unparseable or undefined version strings, which fail the caller's validation.
- **Status:** No action needed. Fails safely.

### SEC-N15: Notification Messages Logged Unfiltered
- **Severity:** LOW
- **File:** `scripts/gsd-t-heartbeat.js:100`
- **Description:** The `Notification` event handler logs `message` and `title` fields verbatim to the heartbeat JSONL file without scrubbing. If Claude Code sends notifications containing sensitive data (error messages with connection strings, stack traces with credentials), these would be written to disk in plaintext.
- **Current Mitigation:** Heartbeat files are in `.gitignore` and auto-purged after 7 days. The data never leaves the local machine.
- **Remediation:** Apply `scrubSecrets()` to notification messages before logging. Low effort, defense-in-depth.
- **Effort:** Small

### SEC-N16: scrubSecrets Regex Uses Global Flag with Stateful Matching
- **Severity:** LOW
- **File:** `scripts/gsd-t-heartbeat.js:112-115`
- **Description:** The secret-matching regexes use the `/gi` (global + case-insensitive) flags. In JavaScript, regex objects with the global flag maintain `lastIndex` state between calls. However, since `scrubSecrets()` calls `.replace()` on a new string each time (which resets `lastIndex` internally), and the regex literals are re-evaluated per module load (not per call), this is safe in the current usage pattern. If these regexes were extracted to module-level `const` and reused with `.test()` or `.exec()`, the global flag would cause alternating match/miss behavior.
- **Status:** Not currently exploitable. Note for future maintainers: do not use these regex objects with `.test()` or `.exec()` — only `.replace()`.
- **Effort:** N/A (informational)

---

## Test Coverage of Security Functions

### test/security.test.js — 27 tests
- `scrubSecrets`: 18 tests covering all flag patterns, env var patterns, bearer tokens, multi-secret strings, null handling, and non-sensitive passthrough.
- `scrubUrl`: 5 tests covering query param masking, no-param passthrough, null handling, and invalid URL handling.
- `summarize` integration: 4 tests verifying end-to-end scrubbing through the summarize function for Bash and WebFetch tools.

### test/filesystem.test.js — Security-relevant tests
- `isSymlink`: 3 tests (non-existent path, regular file, regular directory).
- `hasSymlinkInPath`: 3 tests (no symlinks, non-existent child with real parents, temp dir itself).
- `ensureDir`: 3 tests (create new, existing, nested).
- `validateProjectPath`: 4 tests (valid dir, relative path, non-existent, file-not-dir).
- `copyFile`: 1 test.

### test/helpers.test.js — Security-relevant tests
- `validateProjectName`: 7 tests including path traversal character rejection.
- `validateVersion`: 4 tests including non-numeric rejection.

### Coverage Gaps
- **No symlink-positive tests**: All symlink tests verify false-path behavior (no symlinks present). No tests create actual symlinks and verify they are detected/rejected. This is understandable on Windows where symlinks require elevated privileges, but means the symlink detection logic is tested only via code review, not execution.
- **No test for heartbeat path traversal protection**: The session_id validation (`SAFE_SID`), cwd validation, and resolved-path-within-gsdtDir check in the heartbeat script have no direct unit tests. They're in the `require.main` block which is not importable.
- **No test for npm-update-check.js path boundary**: The path validation at lines 17-21 is in the main script body (no exports), so it cannot be unit tested via require. Would need integration test via subprocess.
- **gsd-t-fetch-version.js has no tests**: The script has no exports and runs as a subprocess. Consider an integration test that verifies it outputs a valid version string.

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
| SEC-N09 | MEDIUM | Privilege escalation (wave) | MITIGATED (M5 docs + M7 integrity check) | Scan #3 |
| SEC-N10 | LOW | Scope boundaries (QA) | MITIGATED (M7 file-path boundaries) | Scan #3 |
| SEC-N11 | LOW | State integrity (wave) | MITIGATED (M7 integrity check) | Scan #3 |
| SEC-008 | LOW | Dir ownership | PARTIALLY FIXED | Scan #1 |
| TD-029 / SEC-N02 | LOW | TOCTOU (overwrite) | OPEN | Scan #2 |
| SEC-N15 | LOW | Notification scrubbing | NEW | Scan #4 |
| SEC-N16 | INFORMATIONAL | Regex global flag | NEW (info only) | Scan #4 |
| SEC-N13 | INFORMATIONAL | No version validation in fetch | NEW (info only) | Scan #4 |
| SEC-N14 | INFORMATIONAL | No status code check in fetch | NEW (info only) | Scan #4 |

**Open actionable findings: 3** (0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW)
- TD-029 (TOCTOU overwrite) — LOW, not promoted, accepted risk
- SEC-008 (Dir ownership) — LOW, partially fixed, accepted risk
- SEC-N15 (Notification scrubbing) — LOW, new finding

**Mitigated since scan #3: 3** (SEC-N09, SEC-N10, SEC-N11 — via M5 documentation + M7 file-path boundaries + M7 integrity check)
**Fixed since scan #3: 6** (TD-019, TD-020, TD-026, TD-027, TD-028, TD-035 — all via M5)
**Regressed: 0**
**New actionable: 1** (SEC-N15)
**New informational: 3** (SEC-N13, SEC-N14, SEC-N16)

---

## Overall Assessment

**Overall Risk: LOW** — Significantly improved since scan #3.

The codebase has undergone substantial security hardening across Milestones 5-7:
- All 6 M5 security fixes verified intact with no regressions
- M7 added prompt-level controls (QA file-path boundaries, wave integrity check)
- The new `gsd-t-fetch-version.js` follows established security patterns (HTTPS, 1MB limit, timeout)
- M6 refactoring (48 exports + require.main guard) increases testability without adding attack surface
- 116 tests all passing, with 27 specifically covering security functions
- Zero npm dependencies eliminates supply chain risk entirely

**Remaining attack surface is minimal:**
1. TOCTOU race (TD-029) — microsecond window, requires local access, interactive CLI context
2. Prompt-level controls (wave bypassPermissions, QA boundaries, integrity check) are advisory, not enforced — inherent to AI agent architecture
3. Notification messages logged unfiltered (SEC-N15) — contained to local disk, auto-purged

## Priority Remediation Order

1. **SEC-N15** (Small, LOW) — Apply scrubSecrets() to notification messages in heartbeat
2. **TD-029** (Medium, LOW) — Atomic write pattern for overwrite operations (diminishing returns for CLI tool)
3. **SEC-008** (Small, LOW) — Check ~/.claude/ ownership at startup (defense-in-depth)

---

## Scan Metadata
- Scan type: Security (focused audit, scan #4)
- Trigger: Post-Milestones 3-7 comprehensive security audit
- Files analyzed: 4 JavaScript files (`bin/gsd-t.js`: 1297 lines, `scripts/gsd-t-heartbeat.js`: 183 lines, `scripts/npm-update-check.js`: 42 lines, `scripts/gsd-t-fetch-version.js`: 25 lines), 2 command files, 4 test files (116 tests)
- All tests passing: 116/116
- Previous findings verified: All M5 fixes intact, all previous items checked
- Regressions: 0
- New actionable findings: 1 (SEC-N15, LOW)
- New informational findings: 3 (SEC-N13, SEC-N14, SEC-N16)
- Critical/High open findings: 0
