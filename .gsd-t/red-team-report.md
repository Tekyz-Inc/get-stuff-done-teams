# M55 Red Team Adversarial QA — Report

> Date: 2026-05-09 17:39 PDT
> Milestone: M55 — CLI-Preflight + Parallel Substrate + Rate-Limit Map + Context Briefs + Verify Gate
> Charter: `.gsd-t/charters/m55-charter.md`
> Branch: `main`
> Baseline: `npm test` → 2487/2487 pass, 360 suites, 0 fail

## Verdict

**GRUDGING PASS** — 6 of 6 broken patches caught (target: ≥5). Zero real bugs found across the 5 M55 domains. Falsifiable success criterion #7 of M55 charter is **satisfied**.

## Summary

| Metric | Value |
|---|---|
| Patches written | 6 |
| Patches caught by tests | 6 (100%) |
| Real bugs found | 0 |
| Severity breakdown (real) | n/a |
| Domains attacked | D1, D2, D4, D5 (D3 covered indirectly via verify-gate fall-back path) |
| Contracts verified STABLE | 5/5 (cli-preflight, parallel-cli, ratelimit-map, context-brief, verify-gate) |
| Final regression check | `npm test` → 2487/2487 pass after all patches reverted |

## Patch Catch Log

Each patch: edit applied, run targeted test file, verify a relevant assertion fails, `git checkout` to revert. No patch was committed.

---

### PATCH-1 — preflight-skip-on-error (D1)

**Domain**: D1 (cli-preflight library — `bin/cli-preflight.cjs`)

**What I broke**: In `_runOneCheck` (line 139–152), replaced the catch block so a per-check throw is swallowed and synthesized as `ok: true` with `msg: 'check skipped (threw)'`. This is the silent-skip-on-error class — exactly the regression class the M55 charter Pattern A pain point cites ("verify steps report PASS when their precondition checks were never actually run").

**Test caught**:
```
test/m55-d1-cli-preflight.test.js:157
✖ _runOneCheck: throws caught and recorded as ok:false synthetic entry
  AssertionError: Expected values to be strictly equal:
  true !== false
  at TestContext.<anonymous> (test/m55-d1-cli-preflight.test.js:168:10)
```

**Verdict**: caught.

---

### PATCH-2 — parallel-substrate-bypasses-capture (D2)

**Domain**: D2 (parallel-CLI substrate — `bin/parallel-cli.cjs`)

**What I broke**: In `_runOneWorker` (line 184–201), replaced the `captureSpawn`-wrapped invocation with a direct `_makeSpawnFn(...)()` call that bypasses `bin/gsd-t-token-capture.cjs`. This is the M41/M55 Token Capture invariant violation — the precise regression class M55 D2 was built to prevent ("ad-hoc Promise.all([Task,Task,...]) patterns scattered across command files bypass `bin/gsd-t-token-capture.cjs` so token attribution goes blind on fan-out").

**Test caught**:
```
test/m55-d2-parallel-cli.test.js:222
✖ runParallel: every worker writes a token-log row (captureSpawn invariant)
  AssertionError: token-log.md should be created
  expected: true, actual: false
  at TestContext.<anonymous> (test/m55-d2-parallel-cli.test.js:237:12)
```

**Verdict**: caught.

---

### PATCH-3 — verify-gate-falsy-true (D5)

**Domain**: D5 (verify-gate — `bin/gsd-t-verify-gate.cjs`)

**What I broke**: In `runVerifyGate` (line 164), changed the deterministic `ok` computation from
`(skipTrack1 ? true : !!track1.ok) && (skipTrack2 ? true : !!track2.ok)` to use `||` instead of `&&`. A Track 1 (preflight) failure is now masked when Track 2 (parallel CLI) succeeds — the canonical falsy-true verdict bug. The contract docstring (Hard rule #3) explicitly forbids this exact mutation.

**Test caught**:
```
test/m55-d5-verify-gate.test.js:111
✖ runVerifyGate: track1 ok + track2 fail → ok false
  AssertionError: Expected values to be strictly equal:
  true !== false
  at TestContext.<anonymous> (test/m55-d5-verify-gate.test.js:121:12)
```
(plus collateral failure on `track1 fail → ok false regardless of track2`.)

**Verdict**: caught.

---

### PATCH-4 — branch-guard-typo (D1)

**Domain**: D1 (cli-preflight check — `bin/cli-preflight-checks/branch-guard.cjs`)

**What I broke**: In `_extractExpectedBranch` (line 37), introduced a typo in the regex: `/expected\s+branch/` → `/expceted\s+branch/`. The regex now never matches valid CLAUDE.md "Expected branch:" lines, so branch-guard silently degrades to "no expected-branch rule set" everywhere — a wrong-branch commit slips through preflight.

**Test caught**:
```
test/m55-d1-cli-preflight-checks/branch-guard.test.js:28
✖ _extractExpectedBranch: matches plain "Expected branch: main"
  AssertionError: Expected values to be strictly equal:
  null !== 'main'

test/m55-d1-cli-preflight-checks/branch-guard.test.js:77
✖ branch-guard fail: on wrong branch
  AssertionError: Expected values to be strictly equal:
  true !== false
```
(plus collateral failure on `_extractExpectedBranch: matches markdown-emphasis` and `branch-guard happy: on expected branch`.)

**Verdict**: caught.

---

### PATCH-5 — contract-staleness-ignored (D1)

**Domain**: D1 (cli-preflight check — `bin/cli-preflight-checks/contracts-stable.cjs`)

**What I broke**: Replaced `_isPastPartitioned` body with `return false;` unconditionally. DRAFT/PROPOSED contracts past PARTITIONED are no longer flagged, so the check always reports "not past PARTITIONED — DRAFT/PROPOSED acceptable" — the silent-skip variant for contract drift.

**Test caught**:
```
test/m55-d1-cli-preflight-checks/contracts-stable.test.js:90
✖ contracts-stable fail: post-PARTITIONED with DRAFT → ok:false
  AssertionError: Expected values to be strictly equal:
  true !== false
  at TestContext.<anonymous> (test/m55-d1-cli-preflight-checks/contracts-stable.test.js:97:12)
```
(plus collateral failure on `_isPastPartitioned: detects ACTIVE state`, `_isPastPartitioned: detects EXECUTING / VERIFIED / COMPLETED`, and the post-PARTITIONED happy path.)

**Verdict**: caught.

---

### PATCH-6 — brief-staleness-ignored (D4)

**Domain**: D4 (context-brief generator — `bin/gsd-t-context-brief.cjs`)

**What I broke**: In `recordSource` (line 86), commented out the `sourceMtimes[relPath] = ...` assignment. The brief is generated successfully but the freshness fingerprint is empty — workers using a stale brief never know it's stale. Direct attack on D4's mtime-hash-stamp freshness rule.

**Test caught**:
```
test/m55-d4-context-brief.test.js:280
✖ freshness: sourceMtimes records every read source
  AssertionError: Expected "actual" to be falsy:
  expected: true, actual: false
  at TestContext.<anonymous> (test/m55-d4-context-brief.test.js:291:12)

test/m55-d4-context-brief.test.js:300
✖ freshness: mutating a source file changes its sourceMtimes value
  AssertionError: Expected "actual" to be strictly unequal to: undefined
  (actual was undefined)
```

**Verdict**: caught.

---

## Attack Categories Tried

Per `templates/prompts/red-team-subagent.md` § "Attack Categories (exhaust ALL)":

| # | Category | Result |
|---|---|---|
| 1 | Contract Violations | All 5 M55 contracts (cli-preflight, parallel-cli, ratelimit-map, context-brief, verify-gate) marked STABLE. Library code matches contract envelope shape per per-domain tests. No discrepancies found. |
| 2 | Boundary Inputs | Validators in `_validateOpts` (parallel-cli), `SAFE_NAME_RE` (context-brief), `VALID_ID_RE` (parallel-cli-tee), and `_isValidCheckModule` (cli-preflight) reject empty/null/illegal-char inputs. Confirmed via existing test cases. No injection vectors found in the read-only paths. |
| 3 | State Transitions | runVerifyGate is purely deterministic; no shared mutable state across runs. parallel-cli `inFlight` map / `failFastTriggered` flag are scoped per `runParallel` call, no cross-talk. No race-condition bug found. |
| 4 | Error Paths | Per-check throws are caught (PATCH-1 confirms by breaking that very path). `runPreflight` throw → wrapped into track1 with ok:false (verify-gate). Missing `ratelimit-map.json` → graceful fallback to maxConcurrency=2 with note. No crash paths found in the M55 surface. |
| 5 | Missing Flows | Charter REQ-M55-D1..D5 — all 5 domains have library + test coverage + contract. D3's empirical map is referenced by D5 fall-back logic; missing-map case explicitly tested (`_resolveMaxConcurrency: missing map → fallback 2 + warning note`). No requirement gap found. |
| 6 | Regression | Full `npm test` baseline 2487/2487 pass (pre-attack) and 2487/2487 pass (post-revert). Six broken patches each made specific tests fail; reverting restored green. No latent regression. |
| 7 | E2E Functional Gaps | The 6 patches above ARE the functional-test exercise: each broken patch confirms a real assertion (state changed / data flowed / contract upheld), not a layout assertion. No shallow-spec rewrites needed. |
| 8 | Design Fidelity | N/A — no `.gsd-t/contracts/design-contract.md` for M55 (it's a CLI/library milestone, no UI surface). |

## Coverage Gaps

None observed. M55's 5 domains map 1:1 to:
- `test/m55-d1-cli-preflight.test.js` + `test/m55-d1-cli-preflight-checks/` (6 sub-files)
- `test/m55-d2-parallel-cli.test.js`
- `test/m55-d3-ratelimit-probe.test.js`
- `test/m55-d4-context-brief.test.js` + `test/m55-d4-context-brief-kinds/` (6 sub-files)
- `test/m55-d5-verify-gate.test.js`, `test/m55-d5-verify-gate-judge.test.js`, `test/m55-d5-wire-in-execute.test.js`, `test/m55-d5-wire-in-verify.test.js`, `test/m55-d5-subagent-prompts.test.js`

Total M55 test files: 19. The catch-rate above demonstrates these tests assert on real behavior, not on element existence.

## Shallow Tests Rewritten

0 — the 6 patches landed broken behavior the existing tests caught directly. No specs needed tightening.

## Contracts Verified

| Contract | Status | Schema Version |
|---|---|---|
| `cli-preflight-contract.md` | STABLE | 1.0.0 |
| `parallel-cli-contract.md` | STABLE | 1.0.0 |
| `ratelimit-map-contract.md` | STABLE | 1.0.0 (promoted from PROPOSED 0.1.0 by D3) |
| `context-brief-contract.md` | STABLE | 1.0.0 |
| `verify-gate-contract.md` | STABLE | 1.0.0 |

5/5 STABLE.

## Notes

- All patches were applied via `Edit` and reverted via `git checkout <file>`. Final `git diff bin/ test/` is empty.
- Final `npm test` after all reverts: 2487/2487 pass — zero regression introduced by the red-team exercise.
- Per the protocol, this is GRUDGING PASS on exhaustive search: every attack class was attempted, no real bug surfaced, the test suite caught every adversarial patch.

## VERDICT

**GRUDGING PASS** — 0 real bugs found. 6/6 adversarial patches caught by the test suite. M55 charter falsifiable success criterion #7 (≥5 broken patches caught) is satisfied with 1 patch of headroom.
