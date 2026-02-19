# Security Audit — 2026-02-18 (Scan #6, Post-M10-M13)

**Package:** @tekyzinc/gsd-t v2.28.10
**Previous scan:** Scan #5 at v2.24.4
**Scope:** All new code from M10-M13: scripts/gsd-t-tools.js, scripts/gsd-t-statusline.js, commands/gsd-t-health.md, commands/gsd-t-pause.md, commands/gsd-t-resume.md, and changes to existing commands

---

## Critical (fix immediately)
None found.

---

## High (fix soon)

### [HIGH] SEC-N20: stateSet() allows markdown structure injection via newlines in value
- **File**: `scripts/gsd-t-tools.js` line 43
- **Finding**: `stateSet(key, value)` writes `value` directly into progress.md via `content.replace(re, '$1' + value)`. If `value` contains newline characters, the injection corrupts the markdown structure. Example: `stateSet('Status', 'READY\n## Decision Log\n- Injected')` successfully inserts a fake Decision Log section.
- **Proof**: Verified with Node.js test — newlines in value break the markdown structure.
- **Attack vector**: This is a CLI tool invoked by the developer. The risk is: (1) a malicious script or automation pipeline calling gsd-t-tools.js with crafted input, (2) Claude Code being instructed to use stateSet with unsanitized content from untrusted sources. Low realistic risk but simple to fix.
- **Remediation**: Sanitize value before writing — strip newlines, or restrict value to single-line text. Add `value = value.replace(/[\n\r]/g, ' ')` before the replace operation.
- **Effort**: small

---

## Medium (plan to fix)

### [MEDIUM] SEC-N21: templateScope/templateTasks accept domain argument without path traversal check
- **File**: `scripts/gsd-t-tools.js` lines 111-121
- **Finding**: `templateScope(domain)` constructs a path as `path.join(gsdDir, 'domains', domain, 'scope.md')`. No validation that `domain` stays within the `domains/` directory. A caller with `domain = '../../CLAUDE.md'` would construct `gsdDir/domains/../../CLAUDE.md/scope.md` — which resolves outside `domains/` but the `/scope.md` suffix prevents reading an actual file directly. With `domain = '../contracts/api-contract'` it could traverse into contracts/.
- **Context**: gsd-t-tools.js is a developer CLI; realistic attack requires a malicious caller providing crafted domain names. Claude Code or automation scripts invoking it could be misled.
- **Remediation**: Validate that the resolved path starts with `path.join(gsdDir, 'domains')`. Add `if (!p.startsWith(path.join(gsdDir, 'domains'))) return { error: 'Invalid domain name' }`.
- **Effort**: small

### [MEDIUM] SEC-N22: gsd-t-tools.js uses execSync (not execFileSync) for git commands
- **File**: `scripts/gsd-t-tools.js` lines 92, 97, 104
- **Finding**: `preCommitCheck()` uses `execSync()` with hardcoded string commands. The main bin/gsd-t.js consistently uses `execFileSync()` with array arguments to prevent shell injection. While the current calls have no user input in the command strings, the pattern is inconsistent and could be cargo-culted in future additions.
- **Remediation**: Replace execSync with execFileSync using array args: `execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' })`.
- **Effort**: small

### [MEDIUM] SEC-N23: gsd-t-tools.js findProjectRoot() returns cwd on no-match
- **File**: `scripts/gsd-t-tools.js` line 16
- **Finding**: When no `.gsd-t/` directory is found, returns `process.cwd()` instead of null. All operations then target the current directory as if it were the project root. If a user runs gsd-t-tools.js from outside any GSD-T project, validate(), stateGet(), stateSet() operate on the non-project directory silently. gsd-t-statusline.js correctly returns null.
- **Remediation**: Return null when not found; add null check before `gsdDir` assignment with a clear error output.
- **Effort**: small

---

## Low (nice to have)

### [LOW] SEC-N24: continue-here files deleted before resume completes
- **File**: `commands/gsd-t-resume.md` Step 2
- **Finding**: Resume deletes the continue-here file "after reading" but before the resumed work completes. If the resume session fails mid-way (compaction, crash, user abort), the checkpoint is lost. The user must reconstruct position from progress.md alone.
- **Remediation**: Delete continue-here file only after confirming the first resumed action has begun, not immediately after reading. Or: move to a `.gsd-t/continue-here-archive/` instead of deleting.
- **Effort**: small

### [LOW] SEC-N25: gsd-t-health --repair reads templates from relative path assumption
- **File**: `commands/gsd-t-health.md` Step 5
- **Finding**: The --repair action assumes `templates/CLAUDE-project.md`, `templates/progress.md`, etc. are accessible relative to the command file's installation. If templates are missing (partial install), the repair silently fails or produces empty files. No validation that template files exist before attempting repair.
- **Remediation**: Add existence check for template files before repair; warn user if templates are missing and suggest running `gsd-t install` first.
- **Effort**: small

---

## Previously Known — No Change

### TD-029 (accepted risk): TOCTOU race in symlink check + write
Status unchanged. Accept continues.

### SEC-N16: scrubSecrets regex global flag
Status unchanged — informational only.

### SEC-N18: Prototype pollution via EVENT_HANDLERS lookup
Status unchanged — fails safely.

### SEC-N19: Error messages may expose path information
Status unchanged — standard CLI behavior.

---

## Dependency Audit
No npm dependencies. Zero supply chain attack surface.
`npm audit` not available without lockfile (no lockfile by design — zero dependencies).

---

## New Security Notes (Informational)

### SEC-N26: gsd-t-statusline.js reads env vars CLAUDE_CONTEXT_TOKENS_USED/MAX
The script reads these env vars without validation. parseInt() with radix 10 handles malformed values gracefully (returns NaN → ctxPct calculation produces NaN → Math.min(100, NaN) = NaN → contextBar not shown). Fails safely. No action required.

### SEC-N27: wave bypassPermissions scope unchanged
M11-M13 did not change the bypassPermissions model. Phase agents still run with full permissions. The security documentation in gsd-t-wave.md continues to cover this. No new attack surface added.
