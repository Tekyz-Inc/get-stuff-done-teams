# Tasks: m34-docs-and-tests

## Summary

Update all user-facing docs to describe the Context Meter (not task counter), write end-to-end integration tests that exercise the full hook → state → token-budget → orchestrator chain, bump the package version to v2.75.10, and write the CHANGELOG entry. Serializes last in M34 — all other domains must report green before this starts.

## Tasks

### Task 1: Update README.md — Context Meter section
- **Files**: `README.md`
- **Contract refs**: `context-meter-contract.md`
- **Dependencies**: BLOCKED by all implementation domains (CP4)
- **Acceptance criteria**:
  - New "Context Meter" section under Features explains: what it measures, why (real counts vs. proxy), how to set the API key, how to adjust threshold, how `gsd-t doctor` validates it
  - Link to Anthropic console (free key creation)
  - "Upgrading from pre-M34?" subsection: note that task-counter is retired and `gsd-t update-all` handles migration; set `ANTHROPIC_API_KEY` after upgrade or `gsd-t doctor` will fail
  - Emoji in any added tables follow the project's "one extra space after emoji" convention
  - No broken internal links

### Task 2: Update GSD-T-README.md — command reference
- **Files**: `GSD-T-README.md`
- **Contract refs**: `context-meter-contract.md`, `token-budget-contract.md` v2.0.0
- **Dependencies**: Requires Task 1 (consistent framing)
- **Acceptance criteria**:
  - `gsd-t install` section documents the API key prompt and hook installation
  - `gsd-t doctor` section documents the new checks (API key, hook, dry-run)
  - `gsd-t status` section documents the new Context line
  - `gsd-t update-all` section documents the task-counter migration
  - Any prior mention of task-counter updated to "context-meter (M34)" with a brief historical note if relevant
  - Observability Logging table description reflects `Ctx%` replacing `Tasks-Since-Reset`

### Task 3: Update templates/CLAUDE-global.md and templates/CLAUDE-project.md
- **Files**: `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`
- **Contract refs**: `context-meter-contract.md`
- **Dependencies**: Requires Task 1
- **Acceptance criteria**:
  - In CLAUDE-global.md: the Observability Logging section currently describes the task-counter gate. Replace the "Task-Count Gate" explanation with "Context Meter Gate" — describe the PostToolUse hook, the state file, the threshold semantics, and that `bin/orchestrator.js` reads the signal via `token-budget.getSessionStatus()`
  - Historical note: keep the v2.74.12 / v2.74.13 regression story (moved to a "Historical note" subsection) — it's important context for future debugging
  - Same update applied to CLAUDE-project.md (project-level template)
  - On next `gsd-t update-all`, these templates propagate to every registered project's CLAUDE.md

### Task 4: Update docs/architecture.md, docs/infrastructure.md, docs/methodology.md, docs/requirements.md
- **Files**: `docs/architecture.md`, `docs/infrastructure.md`, `docs/methodology.md`, `docs/requirements.md`
- **Contract refs**: all M34 contracts
- **Dependencies**: Requires Task 1
- **Acceptance criteria**:
  - `docs/architecture.md` — new component diagram / description: PostToolUse hook → count_tokens API → state file → bin/token-budget.js → bin/orchestrator.js stop gate
  - `docs/infrastructure.md` — API key env var setup (shell profile, CI, `.env.local`); how to check it's set; link to Anthropic console
  - `docs/methodology.md` — context-awareness section updated: task-counter → context-meter narrative, why real measurement matters
  - `docs/requirements.md` — add REQ entries for M34 success criteria (REQ-XXX: API key required, REQ-XXX: hook latency < 200ms, etc.); mark M34 complete on verify
  - Each doc retains its existing structure — M34 updates are additive, not rewrites

### Task 5: Write tests/integration/context-meter.test.js (end-to-end hook)
- **Files**: `tests/integration/context-meter.test.js` (new; create `tests/integration/` if needed)
- **Contract refs**: `context-meter-contract.md` — full hook I/O round trip
- **Dependencies**: Requires token-budget-replacement Task 10 (CP4)
- **Acceptance criteria**:
  - Uses `os.tmpdir()` for fixture project root
  - Writes a minimal fake transcript JSONL in the fixture
  - Spins up a local stub HTTP server (built-in `http`) mimicking count_tokens
  - Writes a fixture config with known `thresholdPct`, `modelWindowSize`, `apiKeyEnvVar`
  - Runs `node scripts/gsd-t-context-meter.js` as a child process with the hook payload on stdin
  - Asserts stdout JSON, state file shape, log file contents
  - Two scenarios: below threshold (empty output), above threshold (additionalContext)
  - afterEach cleans up tempdir
  - No leaked processes (kill stub server)

### Task 6: Write tests/integration/token-budget-real-source.test.js
- **Files**: `tests/integration/token-budget-real-source.test.js` (new)
- **Contract refs**: `token-budget-contract.md` v2.0.0
- **Dependencies**: Requires token-budget-replacement Task 10 (CP4)
- **Acceptance criteria**:
  - Writes a fixture `.gsd-t/.context-meter-state.json` in a tempdir with known `inputTokens` + `timestamp`
  - Calls `require('../../bin/token-budget.js').getSessionStatus({ projectRoot: tmpdir })` (or equivalent — if the API takes cwd, `process.chdir`)
  - Asserts returned `pct` matches expected
  - Asserts `threshold` band matches expected
  - Test: fresh state file → real pct
  - Test: stale state file → falls back to heuristic (assert heuristic is used, not real pct)
  - Test: missing state file → falls back cleanly

### Task 7: Write tests/integration/installer-meter.test.js
- **Files**: `tests/integration/installer-meter.test.js` (new)
- **Contract refs**: `context-meter-contract.md`, installer-integration scope
- **Dependencies**: Requires installer-integration Task 6 (unit tests of installer) so this integration test can layer on top
- **Acceptance criteria**:
  - Spins up a fixture `~/.claude/settings.json` in a tempdir (override HOME env var for child process)
  - Runs `bin/gsd-t.js init` in a fixture project directory
  - Asserts: `scripts/gsd-t-context-meter.js` copied, `bin/context-meter-config.cjs` copied, `.gsd-t/context-meter-config.json` created, settings.json contains the PostToolUse hook entry, `.gitignore` updated
  - Runs `bin/gsd-t.js doctor` with the fixture env; stubs count_tokens via a local http server; asserts exit code 0 with API key, non-zero without
  - Runs `bin/gsd-t.js update-all` simulation with a fixture-registered project: asserts task-counter files deleted, marker written, idempotent on second run
  - afterEach cleanup

### Task 8: Version bump + CHANGELOG.md entry
- **Files**: `package.json`, `CHANGELOG.md`
- **Contract refs**: CLAUDE.md versioning rules
- **Dependencies**: Requires Tasks 1–7
- **Acceptance criteria**:
  - `package.json` version bumped from `2.74.13` → `2.75.10` (minor bump — new feature milestone, patch reset to 10 per the 2-digit patch convention)
  - `CHANGELOG.md` new entry:
    ```
    ## v2.75.10 — M34: Context Meter (REPLACES Task Counter)
    ### Added
    - Context Meter PostToolUse hook: real-time context window measurement via Anthropic count_tokens API
    - `.gsd-t/context-meter-config.json` — configurable threshold, model window, check frequency, API key env var
    - `gsd-t install` prompts for ANTHROPIC_API_KEY (skippable, validated later by doctor)
    - `gsd-t doctor` hard-gates on API key + hook + dry-run count_tokens
    - `gsd-t status` displays real context %
    ### Changed
    - `bin/token-budget.js` `getSessionStatus()` now reads the context-meter state file (real counts) with heuristic fallback
    - `bin/orchestrator.js` task-budget gate replaced with `token-budget.getSessionStatus()` — exit code 10 semantics preserved
    - All command files (execute/wave/quick/integrate/debug) no longer reference task-counter
    ### Removed
    - `bin/task-counter.cjs` — the M31 proxy gate is retired; context-meter provides real measurement
    - `CLAUDE_CONTEXT_TOKENS_USED` / `CLAUDE_CONTEXT_TOKENS_MAX` env var references (never worked — Claude Code does not export them)
    ### Migration
    - Existing projects: `gsd-t update-all` copies the hook + config + loader, runs a one-time task-counter retirement migration
    - Users MUST set `ANTHROPIC_API_KEY` (free tier key is sufficient) — `gsd-t doctor` will fail otherwise
    ```
  - Matches style of the last 5 CHANGELOG entries

### Task 9: Full green verification run
- **Files**: (verification only)
- **Contract refs**: all
- **Dependencies**: Requires Tasks 1–8
- **Acceptance criteria**:
  - `npm test` — all tests green, count ≥ baseline minus any task-counter tests deliberately deleted
  - Manual sanity: run `node bin/gsd-t.js doctor` in the GSD-T repo itself with `ANTHROPIC_API_KEY` set → expect GREEN
  - Manual sanity: read `.gsd-t/.context-meter-state.json` after a few tool calls → expect populated state file
  - Document Ripple Completion Gate: confirmed all of README.md, GSD-T-README.md, both CLAUDE templates, all 4 docs/*.md files, CHANGELOG.md, package.json updated — no pending "oh I missed X"
  - Final commit message: `feat(m34): Context Meter replaces task-counter (v2.75.10)`
