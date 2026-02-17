# Contract: Pre-Commit Gate

## Owner
GSD-T framework (enforced by all commands that commit code)

## Consumers
gsd-t-execute, gsd-t-quick, gsd-t-integrate, gsd-t-wave, gsd-t-debug, gsd-t-complete-milestone, checkin, and any manual code changes

## Purpose
Mandatory checklist that runs before EVERY commit. Ensures documentation stays synchronized with code changes.

## Gate Checklist

The following checks are evaluated in order. If ANY check is YES and the corresponding doc is NOT updated, update it BEFORE committing.

### 1. Branch Check
```
Am I on the correct branch?
  CHECK → Run `git branch --show-current`
  Compare against "Expected branch" in project CLAUDE.md
  WRONG BRANCH → STOP. Do NOT commit. Switch first.
  No guard set → Proceed (warn user to set one)
```

### 2. Contract Checks
| Condition | Action |
|-----------|--------|
| Created/changed API endpoint or response shape | Update `.gsd-t/contracts/api-contract.md` |
| Created/changed API endpoint or response shape | Update Swagger/OpenAPI spec |
| Created/changed API endpoint or response shape | Verify Swagger URL in CLAUDE.md and README.md |
| Changed database schema | Update `.gsd-t/contracts/schema-contract.md` AND `docs/schema.md` |
| Added/changed UI component interface | Update `.gsd-t/contracts/component-contract.md` |

### 3. Scope and Documentation Checks
| Condition | Action |
|-----------|--------|
| Added new files or directories | Update owning domain's `scope.md` |
| Implemented or changed a requirement | Update `docs/requirements.md` (mark complete or revise) |
| Added/changed/removed a component or data flow | Update `docs/architecture.md` |

### 4. Progress and Decision Tracking
| Condition | Action |
|-----------|--------|
| Modified any document, script, or code file | Add timestamped entry to `.gsd-t/progress.md` Decision Log |
| Made an architectural or design decision | Include decision rationale in the progress.md entry |

**Decision Log Entry Format**:
```
- YYYY-MM-DD HH:MM: {what was done} — {brief context or result}
```

### 5. Debt and Convention Tracking
| Condition | Action |
|-----------|--------|
| Discovered or fixed tech debt | Update `.gsd-t/techdebt.md` |
| Established a pattern future work should follow | Update `CLAUDE.md` or domain `constraints.md` |

### 6. Test Checks
| Condition | Action |
|-----------|--------|
| Added/changed tests | Verify test names and paths referenced in requirements |
| Changed UI, routes, or user flows | Update affected E2E test specs |
| Any code changes | Run affected tests and verify they pass |

## Project-Specific Extensions

Projects may add additional pre-commit checks in their `CLAUDE.md` under a `Pre-Commit Gate (Project-Specific)` section. These extend (not replace) the base checklist above.

### GSD-T Framework Example
```
BEFORE EVERY COMMIT:
  ├── Did I change a command file's interface or behavior?
  │     YES → Update GSD-T-README.md, README.md, CLAUDE-global template, gsd-t-help
  ├── Did I add or remove a command?
  │     YES → Update all 4 reference files + package.json version + command counting
  ├── Did I change the CLI installer?
  │     YES → Test: install, update, status, doctor, init, uninstall
  ├── Did I change a template?
  │     YES → Verify gsd-t-init still produces correct output
  ├── Did I change the wave flow?
  │     YES → Update gsd-t-wave.md, GSD-T-README.md, README.md
```

## Enforcement
- This gate is **mandatory** — no commit may bypass it
- Commands that commit (execute, quick, integrate, etc.) reference this gate explicitly in their step sequences
- The gate runs on EVERY commit, not just phase-ending commits
