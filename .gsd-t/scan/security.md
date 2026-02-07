# Security Audit — 2026-02-07

## Summary
- Overall risk: MEDIUM
- Critical: 1
- High: 3
- Medium: 2
- Low: 2
- All fixable with minor code changes; no architectural redesign needed

---

## Critical (fix immediately)

### SEC-001: Command Injection via execSync
- **Location**: `bin/gsd-t.js:490`
- **Finding**: `execSync("claude --version 2>&1")` passes a string to shell
- **Risk**: If PATH is manipulated, arbitrary commands could execute. Shell metacharacters in output aren't sanitized.
- **Remediation**: Use `execFileSync("claude", ["--version"])` with `{ encoding: "utf8" }` option
- **Effort**: Small (1-line change)

---

## High (fix soon)

### SEC-002: Symlink Attack on File Copy
- **Location**: `bin/gsd-t.js:74` (`copyFile` helper used throughout)
- **Finding**: `fs.copyFileSync(src, dest)` follows symlinks. Attacker could pre-create symlink at `~/.claude/commands/gsd-t-status.md` → `/etc/important-file`, causing install to overwrite target.
- **Remediation**: Check `fs.lstatSync(dest).isSymbolicLink()` before writing; refuse to overwrite symlinks
- **Effort**: Small

### SEC-003: Missing Input Validation on Project Name
- **Location**: `bin/gsd-t.js:243-246` (`doInit`)
- **Finding**: Project name from CLI args or `path.basename(process.cwd())` is used unvalidated in template token replacement and written to files. Crafted names could inject markdown content.
- **Remediation**: Validate with regex `/^[a-zA-Z0-9._\- ]+$/`; reject or sanitize others
- **Effort**: Small

### SEC-004: TOCTOU in File Operations
- **Location**: Multiple `if (!fs.existsSync(path)) { fs.writeFileSync(path, ...) }` patterns
- **Finding**: Race window between existence check and write; another process could create a symlink in between
- **Remediation**: Use `fs.writeFileSync(path, content, { flag: 'wx' })` for create-only operations; catch EEXIST
- **Effort**: Medium

---

## Medium (plan to fix)

### SEC-005: No Content Validation of Installed Commands
- **Location**: `doInstall` copies `.md` files without content inspection
- **Finding**: A compromised package could include command files with malicious instructions (prompt injection via markdown). Users would invoke them as trusted slash commands.
- **Remediation**: Consider content checksums or a manifest file for integrity verification
- **Effort**: Medium

### SEC-006: Weak Backup File Naming
- **Location**: `bin/gsd-t.js:176` — `GLOBAL_CLAUDE_MD + ".backup-" + Date.now()`
- **Finding**: `Date.now()` has millisecond resolution; rapid successive updates could collide
- **Remediation**: Use crypto.randomUUID() or include PID in backup name
- **Effort**: Small

---

## Low (nice to have)

### SEC-007: Settings.json Parsed Without Schema Validation
- **Location**: `bin/gsd-t.js:398` — `JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8"))`
- **Finding**: Accepts any valid JSON; deeply nested or oversized files not bounded
- **Remediation**: Add basic shape validation after parse
- **Effort**: Small

### SEC-008: No Directory Ownership Validation
- **Location**: `ensureDir` function creates directories without checking parent ownership
- **Finding**: `~/.claude/` could theoretically be a symlink pointing elsewhere
- **Remediation**: Validate `~/.claude/` is a real directory owned by current user before proceeding
- **Effort**: Small

---

## Dependency Audit
No npm dependencies — **zero supply chain risk**. This is a significant security advantage.
