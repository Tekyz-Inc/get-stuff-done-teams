# Tasks: security

## Summary
Harden all 6 known security concerns: scrub sensitive data from heartbeat logs, validate and secure file write paths in npm-update-check.js and ensureDir, bound HTTP response accumulation, and document wave bypassPermissions security model.

## Tasks

### Task 1: Scrub sensitive data from heartbeat bash command logs (TD-019)
- **Files**: `scripts/gsd-t-heartbeat.js` (modify `summarize()` function, lines 157-186)
- **Contract refs**: None (single domain)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `summarize("Bash", { command: "curl --token SECRET123 ..." })` scrubs the token value, outputting masked content (e.g., `--token ***`)
  - Common patterns scrubbed: `--password`, `--token`, `--secret`, `-p` (password flag), `API_KEY=`, `SECRET=`, `TOKEN=`, `PASSWORD=`, `BEARER `, Authorization headers
  - `summarize("WebFetch", { url: "https://example.com/api?token=abc&key=xyz" })` masks query parameter values
  - Non-sensitive commands pass through unchanged
  - Function stays under 30 lines (extract `scrubSecrets()` helper)

### Task 2: Validate cache file path in npm-update-check.js (TD-020)
- **Files**: `scripts/npm-update-check.js` (modify lines 11-12)
- **Contract refs**: None (single domain)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `cacheFile` path is validated to resolve within `~/.claude/` directory before any write
  - If path resolves outside `~/.claude/`, script exits silently (exit code 1)
  - Uses `path.resolve()` and `startsWith()` for robust comparison
  - Existing valid paths (e.g., `~/.claude/.gsd-t-update-cache`) continue to work

### Task 3: Add symlink check to npm-update-check.js (TD-026)
- **Files**: `scripts/npm-update-check.js` (modify before `writeFileSync` on line 22)
- **Contract refs**: None (single domain)
- **Dependencies**: Requires Task 2 (path validation first, then symlink check)
- **Acceptance criteria**:
  - Before `writeFileSync`, check if `cacheFile` is a symlink using `fs.lstatSync()`
  - If symlink, skip write silently
  - If file doesn't exist yet (lstatSync throws), proceed with write (safe)
  - Pattern matches existing symlink check in `gsd-t-heartbeat.js` line 59

### Task 4: Bound HTTP response accumulation (TD-027)
- **Files**: `scripts/npm-update-check.js` (modify lines 16-17), `bin/gsd-t.js` (modify inline fetch at line 1169)
- **Contract refs**: None (single domain)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Both HTTP response accumulation paths enforce a 1MB size limit (`1024 * 1024` bytes)
  - When limit exceeded, connection is destroyed and accumulated data discarded
  - In `npm-update-check.js`: `res.on("data")` checks `d.length` before appending
  - In `bin/gsd-t.js` inline fetch: same 1MB guard in the inline JS string
  - Normal npm registry responses (~500 bytes) continue to work

### Task 5: Validate parent path symlinks in ensureDir (TD-028)
- **Files**: `bin/gsd-t.js` (modify `ensureDir()` function, lines 102-112)
- **Contract refs**: None (single domain)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Before creating a directory, walk each path component and check for symlinks
  - If any parent component is a symlink, warn and return false
  - Extract `hasSymlinkInPath(dirPath)` helper (keeps ensureDir under 30 lines)
  - Existing behavior preserved: returns true if dir was created, false if already existed
  - Helper exported via `module.exports` for testability

### Task 6: Document wave bypassPermissions security implications (TD-035)
- **Files**: `commands/gsd-t-wave.md`, `README.md`
- **Contract refs**: None (single domain)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `gsd-t-wave.md` has a `## Security Considerations` section documenting:
    - What bypassPermissions means (agents execute without user approval)
    - Attack surface: tampered command files in `~/.claude/commands/` execute with full permissions
    - Current mitigations: npm-installed files, content comparison on update, user-owned directory
    - Recommendation: audit command files if security is a concern, use Level 1/2 autonomy for sensitive projects
  - `README.md` has a brief security note in the Wave section or a dedicated Security section
  - Documentation is factual — states risks and mitigations without FUD

## Execution Estimate
- Total tasks: 6
- Independent tasks (no blockers): 5 (Tasks 1, 2, 4, 5, 6)
- Blocked tasks (within domain): 1 (Task 3 depends on Task 2)
- Cross-domain checkpoints: 0
- Recommended mode: Solo sequential
