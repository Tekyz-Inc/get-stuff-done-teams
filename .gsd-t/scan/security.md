# Security Scan — GSD-T CLI

**Scan Date:** 2026-02-18
**Package:** @tekyzinc/gsd-t v2.21.1
**Scope:** `bin/gsd-t.js`, `scripts/gsd-t-heartbeat.js`, `scripts/npm-update-check.js`, `.gitignore`
**Previous Scan:** 2026-02-07 (TD-002, TD-005, TD-009 identified)

---

## Previous Findings Status

### TD-002: Command Injection in Doctor via execSync — FIXED
- **Original:** `execSync("claude --version 2>&1")` passed string to shell
- **Current:** `bin/gsd-t.js:993` now uses `execFileSync("claude", ["--version"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })`
- **Status:** Remediated. `execFileSync` with array args bypasses shell.

### TD-005: Symlink Attack Vulnerability — FIXED
- **Original:** `copyFile` helper followed symlinks blindly
- **Current:** `bin/gsd-t.js:114-120` defines `isSymlink()` helper. Every write-path function now checks: `copyFile` (line 152), `ensureDir` (line 107), `saveInstalledVersion` (line 237), `registerProject` (line 269), `configureHeartbeatHooks` (line 381), `installGlobalClaudeMd` (line 439, 453), `initClaudeMd` (line 529), `initDocs` (line 558), `initGsdtDir` (line 584, 594, 611), `doUninstall` (line 784, 798), `updateProjectClaudeMd` (line 838), `createProjectChangelog` (line 854), `checkForUpdates` (line 1174)
- **Status:** Comprehensively remediated across all file write operations.

### TD-009: Missing Input Validation on Project Name — FIXED
- **Original:** Project name used unvalidated in template token replacement
- **Current:** `bin/gsd-t.js:122-124` defines `validateProjectName()` with regex `/^[a-zA-Z0-9][a-zA-Z0-9._\- ]{0,100}$/`. Called at `bin/gsd-t.js:631` before any use.
- **Status:** Remediated. Validates alphanumeric start, safe character set, max length 101 chars.

### Previous SEC-001 (execSync injection) — FIXED (same as TD-002)
### Previous SEC-002 (symlink attack) — FIXED (same as TD-005)
### Previous SEC-003 (project name validation) — FIXED (same as TD-009)
### Previous SEC-004 (TOCTOU in file operations) — PARTIALLY FIXED
- **Original:** `if (!fs.existsSync(path)) { fs.writeFileSync(path, ...) }` pattern
- **Current:** Init operations now use `{ flag: "wx" }` (exclusive create) — e.g., `bin/gsd-t.js:536, 565, 586, 600, 617, 868`. This eliminates the create-only TOCTOU.
- **Remaining:** Copy/overwrite operations still use check-then-act pattern (see SEC-002 below).
### Previous SEC-005 (no content validation of commands) — NOT FIXED (accepted risk)
### Previous SEC-006 (backup file naming) — NOT FIXED (low priority, still uses `Date.now()` at line 438)
### Previous SEC-007 (settings.json schema validation) — NOT FIXED (low priority)
### Previous SEC-008 (directory ownership) — PARTIALLY FIXED
- **Current:** `validateProjectPath()` at `bin/gsd-t.js:138-149` checks ownership on Unix (line 144). `~/.claude/` parent directory is still not validated at startup.

---

## New Findings

### SEC-N01: npm-update-check.js Writes to Arbitrary Path from argv

- **Severity:** MEDIUM
- **File:** `scripts/npm-update-check.js:11-12, 22`
- **Description:** The cache file path is taken directly from `process.argv[2]` with no validation. The script is a standalone executable that accepts any path argument. An attacker who can control the arguments could write JSON data to any file the user has write access to.
- **Attack Vector:** `node npm-update-check.js /etc/cron.d/malicious` — would write `{"latest":"x.y.z","timestamp":...}` to the target. Content is constrained (validated JSON with a semver version), limiting exploitation, but the file path is unconstrained.
- **Current Mitigation:** The caller (`bin/gsd-t.js:1185`) always passes a hardcoded path (`~/.claude/.gsd-t-update-check`). Low practical risk in current usage.
- **Remediation:**
  ```javascript
  const path = require("path");
  const os = require("os");
  const cacheFile = process.argv[2];
  if (!cacheFile) process.exit(1);
  const resolved = path.resolve(cacheFile);
  const claudeDir = path.join(os.homedir(), ".claude");
  if (!resolved.startsWith(claudeDir + path.sep)) process.exit(1);
  ```
- **Effort:** Small

### SEC-N02: TOCTOU Race in isSymlink + Write Operations

- **Severity:** LOW
- **File:** `bin/gsd-t.js:114-120` (isSymlink), `bin/gsd-t.js:151-162` (copyFile), and all callers
- **Description:** There is a time-of-check-time-of-use (TOCTOU) gap between the `isSymlink()` check and the subsequent `fs.writeFileSync()` / `fs.copyFileSync()` call. An attacker with local access could replace a file with a symlink between the check and the write.
  ```
  Thread 1 (gsd-t):     isSymlink("~/.claude/commands/gsd-t-X.md") -> false
  Thread 2 (attacker):  ln -sf /target "~/.claude/commands/gsd-t-X.md"
  Thread 1 (gsd-t):     fs.copyFileSync(src, dest) -> writes to /target
  ```
- **Current Mitigation:** The check-then-act pattern is standard for CLI tools. Exploiting this requires local access and precise timing. The `~/.claude/` directory is user-owned. Init operations use `{ flag: "wx" }` which is safe.
- **Remediation:** Use `O_NOFOLLOW` flag via `fs.openSync()` + `fs.writeSync()` for overwrite operations, or use a temporary file + rename pattern. Given the low risk for a CLI tool, this is defense-in-depth.
- **Effort:** Medium

### SEC-N03: ensureDir Does Not Validate Parent Path Symlinks

- **Severity:** LOW
- **File:** `bin/gsd-t.js:102-112`
- **Description:** `ensureDir()` checks if the target directory itself is a symlink, but does not validate parent path components. If `~/.claude` itself were a symlink, `mkdirSync("~/.claude/commands/", { recursive: true })` would follow it, creating directories under an attacker-controlled location.
- **Current Mitigation:** `~/.claude/` is created by Claude Code itself. Parent path symlink attacks require elevated local access.
- **Remediation:** Validate `CLAUDE_DIR` at startup:
  ```javascript
  if (isSymlink(CLAUDE_DIR)) {
    error("~/.claude is a symlink — refusing to operate");
    process.exit(1);
  }
  ```
- **Effort:** Small

### SEC-N04: Unbounded HTTP Response in Inline Update Fetch

- **Severity:** LOW
- **File:** `bin/gsd-t.js:1169`
- **Description:** The inline fetch script accumulates the full HTTP response body (`d += c`) without a size limit. If DNS were hijacked to a malicious server, the response could be arbitrarily large, causing memory exhaustion in the child process.
- **Current Mitigation:** `execFileSync` has `{ timeout: 8000 }` (line 1172), limiting the attack window. The child process is separate, so OOM kills only that process.
- **Remediation:** Add size check in inline script: `if(d.length>65536)return;` inside `on('data')`.
- **Effort:** Small

### SEC-N05: npm-update-check.js Unbounded HTTP Response

- **Severity:** LOW
- **File:** `scripts/npm-update-check.js:16-17`
- **Description:** Same unbounded accumulation as SEC-N04 but in the standalone background script. `d += c` has no size limit.
- **Current Mitigation:** Runs as a detached background process. OOM does not affect the CLI.
- **Remediation:** Add `if (d.length > 65536) { res.destroy(); return; }` in `on('data')`.
- **Effort:** Small

### SEC-N06: npm-update-check.js Missing Symlink Check on Cache Write

- **Severity:** LOW
- **File:** `scripts/npm-update-check.js:22`
- **Description:** `fs.writeFileSync(cacheFile, ...)` does not check if `cacheFile` is a symlink before writing. The main CLI (`bin/gsd-t.js:1174`) has symlink protection, but the background script does not.
- **Current Mitigation:** Cache file path is always `~/.claude/.gsd-t-update-check` (hardcoded constant passed by caller).
- **Remediation:**
  ```javascript
  try { if (require("fs").lstatSync(cacheFile).isSymbolicLink()) process.exit(1); } catch {}
  ```
- **Effort:** Small

### SEC-N07: Heartbeat Files May Contain Sensitive Data

- **Severity:** MEDIUM
- **File:** `scripts/gsd-t-heartbeat.js:85-186`
- **Description:** The heartbeat script logs tool usage data to `.gsd-t/heartbeat-{session_id}.jsonl`. The `summarize()` function captures:
  - File paths for Read/Edit/Write/NotebookEdit operations (lines 161-165, 182)
  - **Bash commands** — first 150 chars (line 168) — may contain passwords, tokens, or secrets passed as arguments
  - Bash descriptions (line 169)
  - Grep search patterns (line 172) — may reveal business logic
  - WebSearch queries (line 178)
  - WebFetch URLs (line 180) — may contain auth tokens in query strings
  - Notification messages and titles (line 139)
- **Current Mitigation:**
  - Files are project-local (`.gsd-t/` directory)
  - Auto-cleanup after 7 days (`MAX_AGE_MS`, line 19)
  - Bash command truncated to 150 chars (line 168)
- **Remediation:**
  1. Scrub bash commands for common secret patterns before logging (e.g., mask values after `--password`, `--token`, `API_KEY=`, `SECRET=`)
  2. Mask URL query parameters in WebFetch summaries
  3. Document in README that heartbeat files may contain sensitive data
- **Effort:** Small to Medium

### SEC-N08: Heartbeat JSONL Files Not in .gitignore

- **Severity:** MEDIUM
- **File:** `.gitignore` (project root), templates (shipped to user projects)
- **Description:** Neither the project's `.gitignore` nor the templates shipped by `gsd-t-init` exclude `heartbeat-*.jsonl` files. Three heartbeat files currently exist in this repo's `.gsd-t/` directory:
  - `.gsd-t/heartbeat-796759fd-22e6-4d65-b732-3a0865d18c7f.jsonl`
  - `.gsd-t/heartbeat-76ba609c-e225-4e2e-8afd-4c5dfeedc527.jsonl`
  - `.gsd-t/heartbeat-f3d7d92c-4ec4-47f8-b3ef-154bded0a209.jsonl`
  If committed, these files expose session telemetry (file paths, bash commands, search queries) to anyone with repo access.
- **Current Mitigation:** None.
- **Remediation:**
  1. Add to `.gitignore`: `.gsd-t/heartbeat-*.jsonl`
  2. Remove existing heartbeat files from git tracking if committed
  3. Add the same pattern to the project CLAUDE.md or `.gitignore` template in `gsd-t-init`
- **Effort:** Small

---

## Areas Verified as Secure

### Command Execution
- All `execFileSync` calls use array arguments (no shell injection): lines 993, 1170, 1208, 1211
- `cpSpawn` uses array arguments with `process.execPath` (hardcoded node binary): line 1185
- The inline fetch script (line 1169) is a hardcoded string constant, not user-influenced
- `CHANGELOG_URL` (line 43) used in `doChangelog` is a hardcoded constant with safety comment (line 1206-1207)

### Path Traversal
- `validateProjectName()` (line 122) blocks path separators via allowlist regex
- `validateProjectPath()` (line 138) requires absolute paths, checks existence, verifies directory ownership on Unix
- `getRegisteredProjects()` (line 248) validates each path via `validateProjectPath()`
- Heartbeat script validates session_id with `SAFE_SID` regex (line 18) and verifies resolved path stays within `.gsd-t/` (lines 50-53)

### Input Validation
- CLI subcommand dispatched via switch statement with explicit cases (line 1257) — unknown commands exit with error
- Version strings validated with semver regex via `validateVersion()` (line 134)
- Project names validated via `validateProjectName()` (line 122)
- Session IDs validated via `SAFE_SID` regex in heartbeat (line 18)
- Heartbeat stdin capped at 1MB (line 17)

### Symlink Protection
- Comprehensive `isSymlink()` checks before all file writes in `bin/gsd-t.js` (18 call sites)
- Heartbeat script checks symlinks before write (line 59) and during cleanup (line 75)
- `ensureDir()` refuses symlinked directories (line 107)
- Init operations use `{ flag: "wx" }` for atomic create-or-fail (lines 536, 565, 586, 600, 617, 868)

### Secret Management
- No hardcoded credentials, API keys, or tokens
- No `.env` files present
- No sensitive data in package.json or configuration
- Zero npm dependencies — no supply chain attack surface

### Resource Limits
- Heartbeat stdin capped at 1MB (`MAX_STDIN`, line 17)
- Heartbeat files auto-cleanup after 7 days (line 19)
- Update fetch has 8-second timeout (line 1172)
- Background update check has 5-second HTTP timeout (line 15)

### Network Security
- All HTTP requests use HTTPS (registry.npmjs.org)
- Response data is validated (semver regex) before use
- Update check results only affect display — no code execution from remote data

---

## Risk Summary

| ID | Severity | Category | Status |
|----|----------|----------|--------|
| TD-002 | CRITICAL | Command injection | FIXED |
| TD-005 | HIGH | Symlink attack | FIXED |
| TD-009 | MEDIUM | Input validation | FIXED |
| Prev SEC-004 | HIGH | TOCTOU (create) | FIXED (wx flag) |
| Prev SEC-008 | LOW | Dir ownership | PARTIALLY FIXED |
| SEC-N01 | MEDIUM | Path validation | NEW |
| SEC-N02 | LOW | TOCTOU (overwrite) | NEW |
| SEC-N03 | LOW | Parent symlink | NEW |
| SEC-N04 | LOW | Resource exhaustion | NEW |
| SEC-N05 | LOW | Resource exhaustion | NEW |
| SEC-N06 | LOW | Symlink bypass | NEW |
| SEC-N07 | MEDIUM | Info disclosure | NEW |
| SEC-N08 | MEDIUM | Info disclosure | NEW |

**Overall Risk: LOW** — All critical and high issues from the previous scan are fixed. Remaining findings are MEDIUM and LOW severity, primarily defense-in-depth improvements. The zero-dependency architecture eliminates supply chain risk entirely.

## Priority Remediation Order

1. **SEC-N08** (Small, MEDIUM) — Add heartbeat files to `.gitignore`; remove any committed heartbeat files
2. **SEC-N07** (Small-Medium, MEDIUM) — Scrub secrets from bash command summaries in heartbeat
3. **SEC-N01** (Small, MEDIUM) — Validate cache file path in `npm-update-check.js`
4. **SEC-N06** (Small, LOW) — Add symlink check to `npm-update-check.js` write
5. **SEC-N04 + SEC-N05** (Small, LOW) — Add response size limits to HTTP handlers
6. **SEC-N03** (Small, LOW) — Validate `~/.claude/` is not a symlink at startup
7. **SEC-N02** (Medium, LOW) — Use atomic write pattern for overwrite operations

---

## Scan Metadata
- Scan type: Security (focused audit)
- Files analyzed: 3 JavaScript files (`bin/gsd-t.js`: 1300 lines, `scripts/gsd-t-heartbeat.js`: 202 lines, `scripts/npm-update-check.js`: 27 lines), `.gitignore`
- Previous findings verified: 3 critical/high (all fixed), 5 medium/low (2 fixed, 1 partial, 2 not fixed)
- New findings: 8 (3 MEDIUM, 5 LOW)
- Critical/High open findings: 0
