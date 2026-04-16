# Business Rules — 2026-04-16 (Scan #11)

GSD-T is a methodology framework — its "business rules" are the workflow gates and
guards that the framework enforces on the projects it shepherds, plus the rules the
framework imposes on itself (zero-deps, OBSERVABILITY LOGGING, etc.).

## Authentication & Authorization
- **No auth surface.** GSD-T is a local-only CLI + slash-command package. There are no
  user accounts, no session management, no tokens issued. The dashboards (`gsd-t-dashboard`,
  `gsd-t-agent-dashboard`) bind to localhost ports (7433/7434) without auth — accepted
  for a developer-only local UI but **carried debt** (TD-090 in archive).

## Configuration & Validation Rules

### Context Meter config (`bin/context-meter-config.cjs`)
- `version` must equal `1`; unknown versions error with migration pointer.
- `thresholdPct` in `(0, 100)`; `modelWindowSize > 0`; `checkFrequency >= 1`; `timeoutMs > 0`.
- **API-key leak guard**: any field name matching `/api.?key/i` other than `apiKeyEnvVar`
  is rejected; any string >100 chars matching `/^[a-zA-Z0-9_-]{64,}$/` is rejected
  (defends against accidentally pasting a key into the JSON).
- Missing config file → returns defaults silently (does NOT error).

### Project name validation (`bin/gsd-t.js` — `validateProjectName`)
- Regex enforced when registering projects with cross-project sync.

### Backlog item shape (templates/backlog.md, `commands/gsd-t-backlog-*.md`)
- Required fields per `backlog-file-formats.md`; classification taxonomy in
  `backlog-settings.md`.

## Workflow Rules (the framework's core enforcement)

### Pre-Commit Gate (CLAUDE.md — global and project)
- 13-question checklist before every commit. Includes: branch guard, contract updates,
  schema updates, doc-ripple, test-suite run.
- **Project CLAUDE.md adds**: command-count ≡ commands/ directory; OBSERVABILITY LOGGING
  block in any new Task-spawning command; wave phase sequence sync across 3 files.

### Destructive Action Guard (CLAUDE.md)
- Hard stop list (DROP TABLE, schema migration with data loss, replacing architecture,
  etc.) — applies at all autonomy levels including Level 3.

### Universal Auto-Pause (M37, contract v1.2.0)
- When context meter `additionalContext` emits `🛑 MANDATORY STOP` (>=75% by default), the
  agent MUST stop, run `gsd-t-pause`, instruct user to `/clear` then `/user:gsd-t-resume`.
  Same enforcement weight as the Destructive Action Guard.
- Enforced in 5 loop commands: `execute`, `wave`, `integrate`, `quick`, `debug` (Step 0.2).

### Three-band Context Gate (M35, `bin/token-budget.cjs`)
- `normal` (<70%) → proceed at full quality.
- `warn` (70–85%) → log and proceed at FULL quality (no model downgrade, no skipped
  Red Team / doc-ripple / Design Verification — explicit anti-degradation rule).
- `stop` (>=85%) → halt cleanly; runway estimator decides next step.
- The older v2.x `downgrade` / `conserve` bands are deleted — explicit "no silent
  degradation" rule, recorded as a memory item.

### Model Assignment Rules (CLAUDE.md global + project)
- `haiku` — strictly mechanical (run tests + report counts, file-existence checks,
  JSON validation, branch guard).
- `sonnet` — mid-tier reasoning (routine code, refactors, tests, QA evaluation).
- `opus` — high-stakes (architecture, security, complex debug, cross-module refactor,
  Red Team adversarial QA, critical-path quality judgment).
- Per-phase selection via `bin/model-selector.js` (M35).

### QA Agent (Mandatory)
- Every code-producing phase MUST run QA. Method varies by command:
  `execute` / `integrate` → spawn Task subagent. `test-sync` / `verify` /
  `complete-milestone` → inline. `quick` / `debug` → inline. `wave` → per-phase.
- QA failure OR shallow-test detection blocks phase completion.
- **Shallow-test rule**: a Playwright assertion that only checks element existence
  (`isVisible`, `toBeAttached`, `toBeEnabled`, `toHaveCount`) without verifying state
  change / data flow / content load is flagged as `SHALLOW TEST` and counted as a
  QA failure.

### Red Team (Adversarial QA, Mandatory)
- After QA + Design Verification pass, every code-producing command spawns a Red Team
  subagent whose success is measured by **bugs found, not tests passed**.
- VERDICT: `FAIL` (blocks completion) or `GRUDGING PASS` (exhaustive search, nothing found).
- CRITICAL/HIGH bugs must be fixed (up to 2 fix cycles); persistent bugs go to
  `.gsd-t/deferred-items.md`.

### Design Verification Agent (when design contract exists)
- Dedicated subagent (separate from builder) opens browser, compares built vs design,
  produces structured element-by-element table with MATCH/DEVIATION verdicts.
- "Looks close" / "appears to match" are explicitly invalid verdicts.
- Fail-by-default: every visual element starts UNVERIFIED.

### E2E Enforcement
- Running only unit tests when E2E tests exist is a **test failure**, not a partial
  result.
- E2E test quality standard: **functional, not layout** — assertions must verify state
  change, data flow, content load, or widget response, not mere existence.

### Stack Rules Engine (M30)
- On each subagent spawn, `bin/rule-engine.js` detects the project's tech stack and
  injects mandatory rules from `templates/stacks/`.
- Universal templates (prefix `_`, e.g., `_security.md`, `_auth.md`) always inject.
- Stack-specific templates inject only when matching files detected (`react.md` if
  `package.json` has `react`, etc.).
- Stack-rule violations have the **same enforcement weight as contract violations** — they
  are task failures, not warnings.

### Auto-Init Guard
- Before any GSD-T workflow command, check that the 11 mandatory project files exist
  (`.gsd-t/progress.md`, `backlog.md`, `backlog-settings.md`, `contracts/`, `domains/`,
  `CLAUDE.md`, `README.md`, plus 4 docs). If any missing → run `gsd-t-init` first.
- Exempt: `gsd-t-init`, `gsd-t-init-scan-setup`, `gsd-t-help`, `version-update*`.

### Playwright Readiness Guard
- Before any testing-adjacent command, ensure `playwright.config.*` exists. Auto-install
  if missing. After tests, kill any dev-server processes spawned for the run.

### API Documentation Guard
- Every API endpoint MUST be documented in Swagger/OpenAPI. Missing spec → set up
  immediately. Swagger URL must appear in `CLAUDE.md`, `README.md`, `docs/infrastructure.md`.

### Versioning Rules
- `Major.Minor.Patch` semver, **patch always >=10** (so `1.0.0` becomes `1.0.10`).
- `Major` = breaking / v1 launch / major rework. `Minor` = feature milestone.
  `Patch` = bug fix / cleanup.
- New project starts at `0.1.00`; first complete-milestone resets patch to `0.1.10`.
- Existing repo with `package.json` version uses that as starting point.
- Version is bumped during `gsd-t-complete-milestone`; reflected in `progress.md`,
  `README.md`, package manifest, and a git tag `v{version}`.

### Auto-Update on Session Start
- A session-start hook (`scripts/gsd-t-update-check.js`) auto-updates GSD-T to latest
  npm version. Three message paths: `[GSD-T AUTO-UPDATE]`, `[GSD-T UPDATE]`, `[GSD-T]`.
  Project CLAUDE.md describes the exact phrasing required for each.

### Document Ripple Completion Gate
- NEVER report "done" until ALL downstream docs are updated. Identify full blast radius
  before starting. The user should never need to ask "did you update everything?".

## Calculation / Heuristic Rules
- **Local token estimation** (`scripts/context-meter/estimate-tokens.js`):
  `tokens ≈ chars / 3.5`. Documented as 5–10% accurate vs the API — sufficient for
  the 15-point band gaps (normal → warn at 70%, warn → stop at 85%).
- **Runway estimator** (`bin/runway-estimator.js`): pre-flight check that combines
  remaining context budget with planned phase model selection to decide whether to
  proceed in current session or auto-spawn headless.
- **Patch versioning**: `1.10.10` → next patch `1.10.11`. After major/minor bump, reset
  to `10` (NOT `00`) to preserve 2-digit patch length.

## Integration Rules
- **Headless auto-spawn** (`bin/headless-auto-spawn.{js,cjs}`): spawns `node bin/gsd-t.js
  headless` with `--debug-loop` or `--workflow=*` for unattended/CI execution.
- **Cross-project sync** (`bin/global-sync-manager.js`): registry of all GSD-T projects;
  `update-all` propagates command/template/bin updates.
- **Doctor** (`bin/gsd-t.js doctor`): pre-flight gate that hard-fails on broken hook
  registration, missing scripts, invalid config. After v3.11.11, `ANTHROPIC_API_KEY`
  is no longer in the doctor red list (local estimator removed the dependency).

## Undocumented Rules (logic with no comments or docs)
- `bin/gsd-t.js:1953` — `runTaskCounterRetirementMigration` runs unconditionally on
  install/update; the marker file `.gsd-t/.task-counter-retired-v1` is checked but the
  function is silent if the marker exists. The migration is documented in
  `docs/infrastructure.md` but the install-time silence makes it look like a no-op.
- The 76 stale `heartbeat-*.jsonl` files in `.gsd-t/` suggest no rotation/cleanup rule
  is enforced — needs a documented retention policy.
- `bin/gsd-t.js doctor` hard-gating semantics differ for `ANTHROPIC_API_KEY` post-v3.11.11
  vs. pre-v3.11.11 — undocumented in CHANGELOG (only mentioned obliquely in commit
  message: "no API key requirement").
- The "scan-history" pruning rule in `gsd-t-scan` (Step 2.9) — archive each scan, keep
  only the latest in `techdebt.md` — has no enforcement; depends on scan being run.
