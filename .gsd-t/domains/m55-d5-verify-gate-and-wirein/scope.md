# Domain: m55-d5-verify-gate-and-wirein

## Responsibility

Two-track verify-gate that consumes D1's state-preflight envelope (Track 1 — hard-fail) AND fans out CLI checks via D2's substrate (Track 2 — typecheck + lint + tests + dead-code + secrets + complexity), summarizes results into a ≤500-token JSON envelope an LLM judges. Then wires every M55 deliverable into the GSD-T workflow: `gsd-t-execute` Step 1 (preflight + brief), `gsd-t-verify` Step 2 (verify-gate), validation-subagent prompts (brief-first hard rule), command/CLI dispatch (`gsd-t preflight`, `gsd-t brief`, `gsd-t verify-gate`), and the full doc ripple required to make M55 the new normal.

This is the **integration domain** — D1, D2, D3, D4 ship engines; D5 lights them up.

## Owned Files/Directories

### New code
- `bin/gsd-t-verify-gate.cjs` — main library + CLI entry. Imports D1's `runPreflight` + D2's `runParallel` + D4's `generateBrief`. Public CLI: `gsd-t verify-gate --json`. Returns `{ ok, schemaVersion, track1: <preflight envelope>, track2: { workers: [...], summary: {...} }, llmJudgePromptHint: "..." }`. The 500-token-summary discipline is enforced by truncating each worker's stdout/stderr to a head-and-tail snippet.
- `bin/gsd-t-verify-gate-judge.cjs` — small companion that takes the verify-gate output JSON and produces the ≤500-token LLM prompt scaffold. Separate file so the judge prompt template is testable in isolation.
- `test/m55-d5-verify-gate.test.js` — unit tests (Track 1 hard-fail, Track 2 fan-out, summary truncation, schema-version, judge prompt size budget).
- `test/m55-d5-wire-in-execute.test.js` — assertion test that `commands/gsd-t-execute.md` Step 1 includes the preflight + brief invocation block.
- `test/m55-d5-wire-in-verify.test.js` — assertion test that `commands/gsd-t-verify.md` Step 2 includes the verify-gate invocation block.
- `test/m55-d5-subagent-prompts.test.js` — assertion test that all 3 subagent protocols include the "check the brief first" hard rule.
- `e2e/journeys/verify-gate-blocks-wrong-branch.spec.ts` — success-criterion-3 evidence (one of the 3 distinct failure-class blocks).
- `e2e/journeys/verify-gate-blocks-port-conflict.spec.ts` — success-criterion-3 evidence.
- `e2e/journeys/verify-gate-blocks-contract-draft.spec.ts` — success-criterion-3 evidence.

### Edits (additive — D5 owns these touch points)
- `bin/gsd-t.js` — three new dispatch subcommands: `gsd-t preflight`, `gsd-t brief`, `gsd-t verify-gate`. Add to `GLOBAL_BIN_TOOLS` per `project_global_bin_propagation_gap.md` (~/.claude/bin/ propagation).
- `commands/gsd-t-execute.md` — Step 1 additive block: orchestrator runs `gsd-t preflight` + `gsd-t brief --kind execute --domain X --out .gsd-t/briefs/{spawnId}.json` once before fan-out; workers receive the brief path in their prompt scaffold.
- `commands/gsd-t-verify.md` — Step 2 additive block: invoke `gsd-t verify-gate --json`; pipe summary to LLM judge.
- `templates/prompts/qa-subagent.md` — additive line: "If you're about to grep/read/run-test, check the brief first at `$BRIEF_PATH`."
- `templates/prompts/red-team-subagent.md` — same additive line.
- `templates/prompts/design-verify-subagent.md` — same additive line.

### Doc ripple
- `docs/architecture.md` — new "CLI-Preflight Pattern" section
- `docs/requirements.md` — REQ-M55-D1, REQ-M55-D2, REQ-M55-D3, REQ-M55-D4, REQ-M55-D5 entries
- `CLAUDE.md` (project) — "Mandatory Preflight Before Spawn" + "Brief-First Worker Rule" sections
- `commands/gsd-t-help.md` — three new entries (preflight, brief, verify-gate)
- `GSD-T-README.md` — workflow diagram updated, new CLI table entries
- `templates/CLAUDE-global.md` — preflight + brief + verify-gate documentation block
- `.gsd-t/contracts/cli-preflight-contract.md` (mentioned by D1) — D1 publishes; D5 confirms STABLE flip during wire-in
- `.gsd-t/contracts/parallel-cli-contract.md` (D2 ships v1.0.0; D5 confirms STABLE flip during wire-in)
- `.gsd-t/contracts/verify-gate-contract.md` v1.0.0 STABLE — verify-gate envelope schema, judge-prompt size budget, two-track hard-fail rule

### Pre-Commit Gate update
- Add to `~/.claude/CLAUDE.md` Pre-Commit Gate: "Brief regenerated if preflight inputs changed" → use `bin/gsd-t-context-brief.cjs` to detect mtime drift.

## NOT Owned (do not modify)

- `bin/cli-preflight.cjs` — D1
- `bin/parallel-cli.cjs` — D2
- `bin/gsd-t-ratelimit-probe.cjs` — D3
- `bin/gsd-t-context-brief.cjs` — D4
- `bin/gsd-t-token-capture.cjs` — read-only reference

## Deliverables

- `bin/gsd-t-verify-gate.cjs` + `bin/gsd-t-verify-gate-judge.cjs`
- `.gsd-t/contracts/verify-gate-contract.md` v1.0.0 STABLE
- 3 dispatch wire-ins in `bin/gsd-t.js` (`preflight`, `brief`, `verify-gate`)
- 2 command-file edits (execute Step 1, verify Step 2)
- 3 subagent-protocol additive edits
- 3 e2e journey specs covering success-criterion-3 (≥3 distinct failure-class blocks)
- Full doc ripple: architecture, requirements, CLAUDE (project + global template), help, GSD-T-README
- Pre-Commit Gate addition

## Integration

- D5 closes the loop: every other M55 deliverable lands behind a wire from D5.
- Success criterion 4 (≥40% token reduction) measurement happens during D5 wave (after wire-in lands but before tag).
- Success criterion 7 (Red Team grudging pass) targets ≥6 broken-patch attempts INCLUDING D5's wire-in (e.g., "preflight-skip-on-error" is a D5-pathology, "verify-gate-falsy-true" is a D5-pathology).

## Sequencing

- Wave 3 — depends on D1 (envelope), D2 (substrate), D4 (brief). D3's map is consumed at integration time but D5 ships defensively if D3's map is absent (uses conservative defaults).
- D5 is the last wave before integrate → verify (which dogfoods D5) → measurement → complete-milestone.
