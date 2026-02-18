# Security Scan — GSD-T CLI

**Scan Date:** 2026-02-18 (Scan #3)
**Package:** @tekyzinc/gsd-t v2.23.0
**Scope:** `bin/gsd-t.js`, `scripts/gsd-t-heartbeat.js`, `scripts/npm-update-check.js`, `commands/gsd-t-wave.md`, `commands/gsd-t-qa.md`, `.gitignore`
**Previous Scans:** 2026-02-07 (scan #1), 2026-02-18 (scan #2, v2.21.1)

---

## Previously Resolved Items — Regression Check

All previously fixed items remain fixed. No regressions detected.

### TD-002: Command Injection in Doctor via execSync — FIXED, NO REGRESSION
- `bin/gsd-t.js:993` still uses `execFileSync("claude", ["--version"], ...)` with array args.
- No new `execSync` calls introduced anywhere.

### TD-005: Symlink Attack Vulnerability — FIXED, NO REGRESSION
- `bin/gsd-t.js:114-120` `isSymlink()` helper intact. All 18+ write-path call sites verified present.
- No new file write operations added without symlink checks.

### TD-009: Missing Input Validation on Project Name — FIXED, NO REGRESSION
- `bin/gsd-t.js:122-124` `validateProjectName()` regex unchanged, still called at line 631.

### SEC-004 (TOCTOU create) — FIXED, NO REGRESSION
- Init operations still use `{ flag: "wx" }` at lines 536, 565, 586, 600, 617, 868.

### SEC-008 (Directory ownership) — PARTIALLY FIXED, NO CHANGE
- `validateProjectPath()` at `bin/gsd-t.js:138-149` checks Unix ownership. `~/.claude/` startup check still absent.

---

## Open Items from Scan #2 — Status Verification

### TD-019 / SEC-N07: Heartbeat Sensitive Data in Bash Commands — STILL OPEN
- **Severity:** MEDIUM
- **File:** `scripts/gsd-t-heartbeat.js:157-186`
- **Status:** No code changes to heartbeat since scan #2. The `summarize()` function still logs:
  - Bash commands: first 150 chars (line 168) — may contain passwords, tokens, secrets
  - WebFetch URLs (line 180) — may contain auth tokens in query strings
  - Notification messages (line 139) — unfiltered content
- **Remediation unchanged:** Scrub common secret patterns (`--password`, `--token`, `API_KEY=`, `SECRET=`) before logging. Mask URL query parameters in WebFetch summaries.
- **Effort:** Small-Medium

### TD-020 / SEC-N01: npm-update-check.js Arbitrary Path Write — STILL OPEN
- **Severity:** MEDIUM
- **File:** `scripts/npm-update-check.js:11-12, 22`
- **Status:** No code changes. `process.argv[2]` still used without path validation.
- **Remediation unchanged:** Validate resolved path is within `~/.claude/` before writing.
- **Effort:** Small

### TD-026 / SEC-N06: npm-update-check.js Missing Symlink Check — STILL OPEN
- **Severity:** LOW
- **File:** `scripts/npm-update-check.js:22`
- **Status:** No code changes. `writeFileSync(cacheFile, ...)` still lacks symlink check.
- **Effort:** Small

### TD-027 / SEC-N04 + SEC-N05: Unbounded HTTP Response in Update Fetch — STILL OPEN
- **Severity:** LOW
- **Files:** `bin/gsd-t.js:1169`, `scripts/npm-update-check.js:16-17`
- **Status:** No code changes. Both HTTP response handlers still accumulate without size limit.
- **Effort:** Small

### TD-028 / SEC-N03: ensureDir Does Not Validate Parent Symlinks — STILL OPEN
- **Severity:** LOW
- **File:** `bin/gsd-t.js:102-112`
- **Status:** No code changes. Parent path `~/.claude/` not validated at startup.
- **Effort:** Small

### TD-029 / SEC-N02: TOCTOU Race in Symlink Check + Write — STILL OPEN
- **Severity:** LOW
- **File:** `bin/gsd-t.js:114-120` and all callers
- **Status:** No code changes. Overwrite operations still use check-then-act pattern.
- **Effort:** Medium

### SEC-N08: Heartbeat JSONL Files Not in .gitignore — FIXED
- **Original:** `.gitignore` did not exclude heartbeat files; committed heartbeat files exposed telemetry.
- **Current:** `.gitignore:15` now contains `.gsd-t/heartbeat-*.jsonl`. No heartbeat files are tracked in git (`git ls-files '*.jsonl'` returns empty).
- **Fixed in:** Contract & Doc Alignment milestone (2026-02-18, commit `98c9a2d`).

---

## New Findings — Scan #3

### SEC-N09: Wave Orchestrator Spawns Agents with bypassPermissions

- **Severity:** MEDIUM (Design Concern)
- **File:** `commands/gsd-t-wave.md:40`
- **Description:** The wave orchestrator instructs Claude Code to spawn phase agents with `mode: "bypassPermissions"`. This means each sub-agent can:
  - Execute bash commands without user approval
  - Write/edit files without confirmation prompts
  - Perform git operations autonomously
  Each phase agent receives instructions to "Read and follow the full instructions in commands/gsd-t-{phase}.md" — the agent's behavior is controlled entirely by the command file content, which is user-installed markdown.
- **Attack Vector:** If an attacker can modify a command file in `~/.claude/commands/` (e.g., via the TOCTOU race in SEC-N02, or by compromising the npm package), all spawned wave agents would execute the modified instructions with full permissions. The agent-per-phase model (9 agents) amplifies the blast radius.
- **Current Mitigation:**
  - Command files are installed from the npm package and checked for changes during `update` (content comparison at `bin/gsd-t.js:405-411`)
  - The `~/.claude/commands/` directory is user-owned
  - `bypassPermissions` is a Claude Code feature that requires the user to have already accepted elevated permissions
  - The Destructive Action Guard in CLAUDE.md instructs agents to stop before destructive operations
- **Remediation:**
  1. Document the security implications of `bypassPermissions` in the wave command and README
  2. Consider adding a `--confirm` flag or user prompt before spawning bypass-mode agents in Level 1/2 autonomy
  3. The Destructive Action Guard provides a soft mitigation, but is a prompt-level control, not a technical enforcement
- **Effort:** Small (documentation), Medium (technical controls)

### SEC-N10: QA Agent Has Unrestricted Test Execution Scope

- **Severity:** LOW (Design Concern)
- **File:** `commands/gsd-t-qa.md:36-43, 165-167`
- **Description:** The QA agent is instructed to "Run tests continuously" during execution and to "kill any app/server processes spawned during test runs" during cleanup. The QA agent operates with full tool access (as a teammate) and can:
  - Execute arbitrary test commands via Bash
  - Start and kill processes
  - Write test files to any location the project tests directory points to
  These are expected behaviors for a test runner, but the QA agent has no explicit boundary constraints beyond "never write feature code."
- **Current Mitigation:**
  - QA agent receives context scoped to contracts and test directories
  - The "never write feature code" instruction is a soft boundary
  - Process cleanup instruction at line 167 prevents orphaned servers
- **Remediation:**
  1. Add explicit file-path boundaries to the QA agent instructions (e.g., "Only write files in the test directory and `.gsd-t/`")
  2. Add a kill-only-my-processes pattern instead of broad process kill
- **Effort:** Small

### SEC-N11: Wave Agent State Handoff via Filesystem — No Integrity Verification

- **Severity:** LOW
- **File:** `commands/gsd-t-wave.md:107-116, 189`
- **Description:** The wave orchestrator verifies phase completion by reading `.gsd-t/progress.md` between phases. There is no integrity check on this file — a tampered `progress.md` could cause the orchestrator to skip phases (e.g., setting status to VERIFIED when it should be EXECUTED), or to re-run phases unnecessarily.
- **Current Mitigation:**
  - `.gsd-t/progress.md` is in the project directory, user-owned
  - Git tracking provides some tamper detection (unstaged changes visible)
  - The orchestrator checks status values match expected states (line 112)
- **Remediation:**
  1. This is inherent to any file-based state machine. The risk is low because the attacker would need project directory access.
  2. For defense-in-depth, the orchestrator could compare git status of `progress.md` before trusting its content.
- **Effort:** Small

### SEC-N12: No New JS Code Introduced — Merge Was Markdown-Only

- **Severity:** INFORMATIONAL
- **Description:** The merge at `3346672` brought in doc/template changes from the Contract & Doc Alignment milestone. The two new feature commits (`b44161d` for QA agent, `aaec5cd` for wave rewrite) added only markdown command files — no changes to `bin/gsd-t.js`, `scripts/gsd-t-heartbeat.js`, or `scripts/npm-update-check.js`.
- **Impact:** The executable attack surface is identical to scan #2. All security properties of the JavaScript codebase are preserved.

---

## Accepted Risks (Unchanged from Scan #2)

### SEC-005: No Content Validation of Installed Command Files
- **Status:** Accepted risk. Command files are markdown; content validation would be arbitrary.

### SEC-006: Backup File Naming Uses Date.now()
- **Status:** Accepted risk. Low priority. `bin/gsd-t.js:438` still uses `Date.now()` suffix.

### SEC-007: settings.json Schema Validation Missing
- **Status:** Accepted risk. Low priority. JSON parse errors are caught but structure is not validated.

---

## Areas Verified as Secure

### Command Execution
- All `execFileSync` calls use array arguments (no shell injection): lines 993, 1170, 1208, 1211
- `cpSpawn` uses array arguments with `process.execPath` (hardcoded node binary): line 1185
- The inline fetch script (line 1169) is a hardcoded string constant, not user-influenced
- `CHANGELOG_URL` (line 43) used in `doChangelog` is a hardcoded constant with safety comment (lines 1206-1207)
- No new JS code was added in the merge — attack surface unchanged

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
- Heartbeat files excluded from git tracking (`.gitignore:15`)
- Update fetch has 8-second timeout (line 1172)
- Background update check has 5-second HTTP timeout (line 15)

### Network Security
- All HTTP requests use HTTPS (registry.npmjs.org)
- Response data is validated (semver regex) before use
- Update check results only affect display — no code execution from remote data

---

## Risk Summary

| ID | Severity | Category | Status | Since |
|----|----------|----------|--------|-------|
| TD-002 | CRITICAL | Command injection | FIXED | Scan #1 |
| TD-005 | HIGH | Symlink attack | FIXED | Scan #1 |
| TD-009 | MEDIUM | Input validation | FIXED | Scan #1 |
| SEC-004 | HIGH | TOCTOU (create) | FIXED (wx flag) | Scan #1 |
| SEC-N08 | MEDIUM | Info disclosure (.gitignore) | FIXED | Scan #2 |
| SEC-008 | LOW | Dir ownership | PARTIALLY FIXED | Scan #1 |
| TD-019 / SEC-N07 | MEDIUM | Info disclosure (heartbeat) | OPEN | Scan #2 |
| TD-020 / SEC-N01 | MEDIUM | Path validation | OPEN | Scan #2 |
| SEC-N09 | MEDIUM | Privilege escalation (wave) | NEW | Scan #3 |
| SEC-N10 | LOW | Scope boundaries (QA) | NEW | Scan #3 |
| SEC-N11 | LOW | State integrity (wave) | NEW | Scan #3 |
| TD-026 / SEC-N06 | LOW | Symlink bypass | OPEN | Scan #2 |
| TD-027 / SEC-N04+N05 | LOW | Resource exhaustion | OPEN | Scan #2 |
| TD-028 / SEC-N03 | LOW | Parent symlink | OPEN | Scan #2 |
| TD-029 / SEC-N02 | LOW | TOCTOU (overwrite) | OPEN | Scan #2 |

**Open findings: 9** (3 MEDIUM, 6 LOW)
**Fixed since last scan: 1** (SEC-N08 — heartbeat gitignore)
**Regressed: 0**

**Overall Risk: LOW** — All critical and high issues fixed. The 3 MEDIUM items are defense-in-depth improvements with limited practical exploit paths. The new wave `bypassPermissions` concern (SEC-N09) is the most notable finding but is mitigated by Claude Code's own permission model and the Destructive Action Guard. Zero npm dependencies eliminates supply chain risk.

## Priority Remediation Order

1. **SEC-N09** (Small, MEDIUM) — Document `bypassPermissions` security implications in wave command and README
2. **TD-019 / SEC-N07** (Small-Medium, MEDIUM) — Scrub secrets from bash command summaries in heartbeat
3. **TD-020 / SEC-N01** (Small, MEDIUM) — Validate cache file path in `npm-update-check.js`
4. **TD-026 / SEC-N06** (Small, LOW) — Add symlink check to `npm-update-check.js` write
5. **TD-027 / SEC-N04+N05** (Small, LOW) — Add response size limits to HTTP handlers
6. **TD-028 / SEC-N03** (Small, LOW) — Validate `~/.claude/` is not a symlink at startup
7. **SEC-N10** (Small, LOW) — Add explicit file-path boundaries to QA agent
8. **SEC-N11** (Small, LOW) — Consider git-status integrity check in wave orchestrator
9. **TD-029 / SEC-N02** (Medium, LOW) — Use atomic write pattern for overwrite operations

---

## Scan Metadata
- Scan type: Security (focused audit, scan #3)
- Trigger: Post-merge review of QA agent and wave rewrite
- Files analyzed: 3 JavaScript files (`bin/gsd-t.js`: 1301 lines, `scripts/gsd-t-heartbeat.js`: 202 lines, `scripts/npm-update-check.js`: 28 lines), 2 new command files (`commands/gsd-t-wave.md`: 219 lines, `commands/gsd-t-qa.md`: 169 lines), `.gitignore`
- Previous findings verified: 6 from scan #2 still open (no code changes to JS files since scan #2)
- Regressions: 0
- New findings: 3 (1 MEDIUM, 2 LOW) — all related to new command file content, not executable code
- Fixed since last scan: 1 (SEC-N08)
- Critical/High open findings: 0
