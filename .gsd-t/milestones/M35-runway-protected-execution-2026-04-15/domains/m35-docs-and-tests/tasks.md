# Tasks: m35-docs-and-tests

## Summary

Final Wave 5 documentation and verification pass: update README, GSD-T-README, methodology, architecture, infrastructure, requirements (REQ-069–078), PRD §3.7 (consistency pass), CHANGELOG, version bump, template consistency, memory updates, and full test suite green with goal-backward verify at zero findings.

## Contract References

- `.gsd-t/contracts/token-budget-contract.md` — v3.0.0 (read-only — referenced in docs)
- `.gsd-t/contracts/model-selection-contract.md` — v1.0.0 (read-only)
- `.gsd-t/contracts/runway-estimator-contract.md` — v1.0.0 (read-only)
- `.gsd-t/contracts/token-telemetry-contract.md` — v1.0.0 (read-only)
- `.gsd-t/contracts/headless-auto-spawn-contract.md` — v1.0.0 (read-only)

---

## Tasks

### Task 1: README + GSD-T-README rewrite

- **Files**:
  - `README.md` (modify)
  - `docs/GSD-T-README.md` (modify)
- **Contract refs**: All 5 M35 contracts (referenced by name in docs)
- **Dependencies**: BLOCKED BY all Wave 4 completions (docs must reflect the final system — wait for all 5 implementation domains to finish before writing final docs)
- **Acceptance criteria**:
  - `README.md`:
    - New section "Runway-Protected Execution" replacing any "graduated degradation" or "Token-Aware Orchestration" language
    - Brief description of: three-band model, runway estimator, headless auto-spawn, model selection, token telemetry, optimization backlog
    - All references to `downgrade`/`conserve` bands removed or noted as historical (replaced in v2.76.10)
    - Command count updated if new commands added (gsd-t-optimization-apply, gsd-t-optimization-reject)
  - `docs/GSD-T-README.md`:
    - `## Model Assignment` block convention documented with example
    - `/advisor` escalation pattern explained with fallback behavior
    - `gsd-t metrics --tokens`, `gsd-t metrics --halts`, `gsd-t metrics --tokens --context-window` CLI commands documented with example output
    - `gsd-t-optimization-apply` and `gsd-t-optimization-reject` commands documented in command reference
    - References to all 5 new contracts
  - `grep "downgrade\|conserve\|modelOverride\|skipPhases" README.md docs/GSD-T-README.md` returns zero hits

### Task 2: `methodology.md` + `architecture.md` + `infrastructure.md`

- **Files**:
  - `docs/methodology.md` (modify)
  - `docs/architecture.md` (modify)
  - `docs/infrastructure.md` (modify)
- **Contract refs**: All 5 M35 contracts (referenced in architecture)
- **Dependencies**: BLOCKED BY all Wave 4 completions (same as T1)
- **Acceptance criteria**:
  - `docs/methodology.md`:
    - New section or major revision: "From Silent Degradation to Aggressive Pause-Resume" — explains what M31 got wrong, what M35 replaces it with, and why quality is non-negotiable
    - Core principles enumerated: quality non-negotiable, explicit model selection, user never types /clear, data before optimization, clean break no compat shim
  - `docs/architecture.md`:
    - Runway estimator added to component descriptions with its input/output and when it fires
    - Headless auto-spawn added as a new infrastructure component
    - Token telemetry pipeline described: PostToolUse hook (M34) → `.context-meter-state.json` → token brackets → `token-metrics.jsonl` → optimizer + runway estimator
    - Model selector added as a new module in the bin/ component description
  - `docs/infrastructure.md`:
    - `.gsd-t/token-metrics.jsonl` schema reference (link to token-telemetry-contract.md)
    - `.gsd-t/headless-sessions/` directory described (purpose, file schema, lifecycle)
    - `gsd-t metrics` CLI surface: all three flags documented with example output
    - `/advisor` integration convention documented (from model-selection-contract.md)

### Task 3: `docs/requirements.md` — REQ-069 through REQ-078

- **Files**:
  - `docs/requirements.md` (modify — append 10 new REQs + traceability table)
- **Contract refs**: All 5 M35 contracts (each REQ traces to a contract or module)
- **Dependencies**: BLOCKED BY all Wave 4 completions (REQ acceptance criteria must match what was actually implemented)
- **Acceptance criteria**:
  - 10 new requirements appended, each with: REQ-ID, description, priority (P1 or P2), status (complete), domain + task mapping:
    - REQ-069 (P1, complete): Silent degradation bands removed — `getDegradationActions()` returns only `{band: 'normal'|'warn'|'stop'}` — `degradation-rip-out T1`
    - REQ-070 (P1, complete): Three-band model only — `WARN_THRESHOLD_PCT=70`, `STOP_THRESHOLD_PCT=85`, no model overrides or phase skips — `degradation-rip-out T1, T2`
    - REQ-071 (P1, complete): Surgical per-phase model selection via `bin/model-selector.js` — at least 8 phase mappings, declarative rules table — `model-selector-advisor T2`
    - REQ-072 (P2, complete): `/advisor` escalation with graceful fallback — convention-based if API not programmable — `model-selector-advisor T1, T3`
    - REQ-073 (P1, complete): Pre-flight runway estimator refuses runs that project to cross 85% stop threshold — `runway-estimator T1–T5`
    - REQ-074 (P1, complete): Per-spawn token telemetry to `.gsd-t/token-metrics.jsonl` with frozen 18-field schema — `token-telemetry T1–T3`
    - REQ-075 (P2, complete): `gsd-t metrics` CLI: `--tokens [--by ...]`, `--halts`, `--tokens --context-window` — `token-telemetry T4–T6`
    - REQ-076 (P2, complete): Optimization backlog — detect only, never auto-apply, user promotes or rejects — `optimization-backlog T1–T4`
    - REQ-077 (P1, complete): Headless auto-spawn on runway refusal — user never sees `/clear` prompt — `headless-auto-spawn T1–T5`
    - REQ-078 (P1, complete): Structural elimination of native compact messages — `halt_type: native-compact` count is 0 during M35 execution — `runway-estimator + headless-auto-spawn`
  - Requirements traceability table updated per gsd-t-plan.md Step 2 format
  - Every REQ-069–078 maps to at least one domain/task — no orphans

### Task 4: `docs/prd-harness-evolution.md` §3.7 final consistency pass

- **Files**:
  - `docs/prd-harness-evolution.md` (modify — final pass on §3.7 only)
- **Contract refs**: All 5 M35 contracts
- **Dependencies**: BLOCKED BY m35-degradation-rip-out Task 4 (that task wrote the initial §3.7 rewrite in Wave 2; T4 here is the Wave 5 consistency pass to verify it references all delivered contracts and aligns with the final implementation)
- **Acceptance criteria**:
  - §3.7 title is "Pre-Flight Runway + Pause-Resume (replaces Token-Aware Orchestration)"
  - §3.7 explicitly calls out M31 framing was wrong
  - §3.7 references all 5 M35 contracts by name and filepath
  - §3.7 forward-link to M35 milestone archive path (`.gsd-t/milestones/M35-*/` — placeholder, filled in by complete-milestone)
  - No `downgrade`/`conserve`/`modelOverride`/`skipPhases` anywhere in the file outside historical footnotes

### Task 5: `CHANGELOG.md` — `[2.76.10]` entry

- **Files**:
  - `CHANGELOG.md` (modify — prepend new top section)
- **Contract refs**: None (historical record)
- **Dependencies**: BLOCKED BY all Wave 4 completions (CHANGELOG lists everything delivered)
- **Acceptance criteria**:
  - New section `## [2.76.10] - {actual completion date}` prepended at top of CHANGELOG
  - Subsections:
    - **Added**: `bin/model-selector.js`, `bin/advisor-integration.js`, `bin/runway-estimator.js`, `bin/token-telemetry.js`, `bin/token-optimizer.js`, `bin/headless-auto-spawn.js`, `bin/check-headless-sessions.js`; 5 new contracts; `gsd-t-optimization-apply`, `gsd-t-optimization-reject` commands; `gsd-t metrics --tokens/--halts/--context-window` CLI; `.gsd-t/token-metrics.jsonl`, `.gsd-t/optimization-backlog.md`, `.gsd-t/headless-sessions/`; `## Model Assignment` block convention in 11 command files
    - **Changed**: `token-budget-contract.md` v2.0.0 → v3.0.0 (BREAKING — see Migration); `bin/token-budget.js` three-band model; `WARN_THRESHOLD_PCT=70`, `STOP_THRESHOLD_PCT=85`; 6 command files Token Budget Check blocks updated; PRD §3.7 rewritten; templates updated
    - **Removed**: `downgrade` band, `conserve` band, `applyModelOverride()`, `skipPhases` constants from `bin/token-budget.js`
    - **Migration**: token-budget-contract v2.0.0 → v3.0.0: collapse `downgrade`→`warn`, `conserve`→`stop`, drop `modelOverrides` field from response handling
    - **Propagation**: downstream projects inherit via `gsd-t-version-update-all`; no config changes required unless overriding model tiers in project CLAUDE.md

### Task 6: Version bump 2.75.10 → 2.76.10

- **Files**:
  - `package.json` (modify — version field)
  - `bin/gsd-t.js` (modify — VERSION constant if it exists, check first)
  - `.gsd-t/progress.md` (modify — version header, M35 milestone row → COMPLETE)
- **Contract refs**: None
- **Dependencies**: BLOCKED BY Tasks 1–5 (version bump is the second-to-last step — all docs must be final before tagging)
- **Acceptance criteria**:
  - `package.json` `"version"` field: `"2.76.10"`
  - `bin/gsd-t.js`: if a `VERSION` or `PACKAGE_VERSION` constant or `require('./package.json').version` pattern exists, confirm it reads the updated `package.json` (no hardcoded string to change separately)
  - `.gsd-t/progress.md`: version header updated to `2.76.10`, M35 row in milestones table has status `COMPLETE`, archive path `.gsd-t/milestones/M35-no-silent-degradation-2026-{date}/`
  - `git tag v2.76.10` deferred to the `checkin` command (not in this task)

### Task 7: Template final consistency pass + memory updates

- **Files**:
  - `templates/CLAUDE-global.md` (modify — final consistency pass)
  - `templates/CLAUDE-project.md` (modify — final consistency pass)
  - `~/.claude/projects/-Users-david-projects-GSD-T/memory/feedback_no_silent_degradation.md` (modify)
  - `~/.claude/projects/-Users-david-projects-GSD-T/memory/project_compaction_regression.md` (modify)
- **Contract refs**: None
- **Dependencies**: BLOCKED BY m35-degradation-rip-out Task 4 (initial template rewrite) and m35-model-selector-advisor Task 6 (Model Assignment convention added to templates) — T7 is the final consistency pass to ensure both sets of changes are coherent together
- **Acceptance criteria**:
  - `templates/CLAUDE-global.md` and `templates/CLAUDE-project.md`:
    - "Token-Aware Orchestration" section renamed → "Runway-Protected Execution" (from degradation-rip-out T4)
    - "Model Assignment Block Convention" section present (from model-selector-advisor T6)
    - Both templates mutually consistent (same wording for shared conventions)
    - No `downgrade`/`conserve` references anywhere in either template
  - `feedback_no_silent_degradation.md` memory update:
    - Note that M35 implemented the fix in v2.76.10
    - `downgrade`/`conserve` bands ripped out from `bin/token-budget.js`
    - Quality gates (Red Team, doc-ripple, Design Verify) are always run — no skip paths exist in live code
  - `project_compaction_regression.md` memory update:
    - M35 structurally eliminates native compact under healthy operation
    - Mechanism: `STOP_THRESHOLD_PCT=85` + runway estimator refuses runs that would cross 85% → runtime's 95% native compact is never reached
    - `halt_type: native-compact` in `token-metrics.jsonl` is now a defect signal, not expected behavior
    - If `gsd-t metrics --halts` shows any `native-compact` entries, the estimator thresholds need re-tuning

### Task 8: Full test suite green + goal-backward verify

- **Files**:
  - None modified (verification task — read-only audit of all prior work)
- **Contract refs**: All 5 M35 contracts (verified for compliance)
- **Dependencies**: BLOCKED BY all Tasks 1–7 in this domain (all docs must be final) and all prior domain tasks (all code must be implemented)
- **Acceptance criteria**:
  - Full test suite runs green: `npm test` or `node --test test/**/*.test.js` — target ~1030/1030; actual count whatever lands green — no cherry-picking failing tests
  - Goal-backward verify on all 10 new REQs (REQ-069 through REQ-078): for each REQ, confirm that the implementing code exists and the acceptance criteria from T3 are satisfied — report `PASS` or `FAIL` per REQ; zero `FAIL` allowed before complete-milestone
  - Global grep: `grep -r "downgrade\|conserve\|modelOverride\|skipPhases" . --include="*.js" --include="*.md" --exclude-dir=".gsd-t/milestones" --exclude-dir="node_modules"` produces zero hits outside historical prose (CHANGELOG pre-v2.76 entries, progress.md archive rows, methodology.md historical narrative — these are acceptable)
  - Milestone declared ready for `/user:gsd-t-complete-milestone`

---

## Execution Estimate

- Total tasks: 8
- Independent tasks (no blockers): 0 (all Wave 5 — all depend on Waves 1–4 being complete)
- Blocked tasks (waiting on other domains): 8 (all blocked by prior wave completion)
- Estimated checkpoints: 1 (Wave 5 is the final gate; T8 is the milestone readiness check)

## Wave Assignment

- **Wave 5**: Tasks 1–8 (all Wave 5; recommended order: T3→T1→T2→T4→T5→T6→T7→T8; T3 first to establish REQ mapping; T8 always last)
