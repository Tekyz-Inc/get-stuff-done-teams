# Domain: security

## Responsibility
Harden all known security concerns identified in tech debt scans #2-3. Scrub sensitive data from logs, validate file paths, check symlinks, bound HTTP responses, and document security implications of wave orchestrator.

## Owned Files/Directories
- `bin/gsd-t.js` — ensureDir() parent symlink validation (TD-028), HTTP response bounding in checkForUpdates inline fetch (TD-027)
- `scripts/gsd-t-heartbeat.js` — sensitive data scrubbing in bash command/URL logging (TD-019)
- `scripts/npm-update-check.js` — cache path validation (TD-020), symlink check (TD-026), HTTP response bounding (TD-027)
- `commands/gsd-t-wave.md` — bypassPermissions security documentation (TD-035)
- `README.md` — security documentation for wave (TD-035)

## NOT Owned (do not modify)
- All other command files in commands/
- templates/
- examples/
- test/ (except adding new security-specific tests)
- .gsd-t/contracts/ (read-only reference)

## Tech Debt Items
| TD | Title | File(s) |
|----|-------|---------|
| TD-019 | Heartbeat Sensitive Data Scrubbing | scripts/gsd-t-heartbeat.js |
| TD-020 | npm-update-check.js Path Validation | scripts/npm-update-check.js |
| TD-026 | npm-update-check.js Symlink Check | scripts/npm-update-check.js |
| TD-027 | Unbounded HTTP Response | bin/gsd-t.js, scripts/npm-update-check.js |
| TD-028 | ensureDir Parent Symlink Validation | bin/gsd-t.js |
| TD-035 | Wave bypassPermissions Documentation | commands/gsd-t-wave.md, README.md |
