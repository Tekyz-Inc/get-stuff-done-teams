# Tasks: d4-cache-warm-pacing

**Domain**: D4 cache-warm-pacing (M39 Wave 1)
**Total tasks**: 3
**Parallelism**: Wave 1 — runs in parallel with D2 and D3 (no cross-domain deps; shared-file edits in `bin/gsd-t-unattended.cjs` and `unattended-supervisor-contract.md` are disjoint regions)

---

## T1. Locate current worker-timeout constant

**Prerequisite**: none (first task)

**Files read** (no change):
- `bin/gsd-t-unattended.cjs` — main relay loop, approximately lines 861–939. Search for `WORKER_TIMEOUT_MS` (or similar name — may be `WORKER_TIMEOUT`, `DEFAULT_WORKER_TIMEOUT`, etc.).

**Change**: no code change. Trace task — record:
- The constant's exact name and current value.
- Its declaration line and any call sites in the main loop.
- Any existing inter-iteration `setTimeout`/`await sleep` calls that could delay worker re-spawn (D4 wants these < ~5s between worker exit and next spawn).

Document findings inline in the commit message for T2.

**Success criteria**: T2 has a verified target identifier and current value for the comment rationale math.

**Tests**: none.

---

## T2. Tune worker timeout to 270s + minimize inter-iteration sleep

**Prerequisite**: T1

**Files modified**:
- `bin/gsd-t-unattended.cjs` — main relay loop (~lines 861–939).

**Change**: surgical edit only.

1. Change the worker-timeout constant's value to `270 * 1000` (milliseconds).
2. Add an inline comment block adjacent to the constant explaining the cache-window math:
   ```
   // Anthropic prompt-cache TTL is 5 minutes (300,000 ms). The supervisor→worker
   // handoff budget is ~30 s (process exit + state persist + next spawn). A 270 s
   // worker timeout leaves room to complete the iter AND still relaunch against
   // a warm cache. If a single iter legitimately exceeds 270 s, the supervisor
   // kills the worker and logs a cache-miss warning; the next iter pays a
   // cold-cache cost but execution continues.
   ```
3. Verify the main loop does not `setTimeout` or `await sleep` for more than ~5 s between worker exit and the next spawn. If any longer sleeps are found (other than intentional error-backoff paths, which are out of scope), reduce them. If none exist, no further change.
4. Do NOT restructure the loop's control flow. Constant + comment + sleep-trim only.

**Success criteria**: constant value = `270000`; comment block present; no inter-iter sleep > 5 s exists in the main loop's happy path.

**Tests**: `test/unattended-cache-warm-pacing.test.js`:
- `worker_timeout_is_270s` — require the module, assert the exported/defined constant equals `270000`. If the constant isn't exported, read the source file with `fs.readFileSync` and regex-match the declaration to confirm the value.
- `main_loop_has_no_long_inter_iter_sleep` — read the main-loop source (using a small region extractor around the loop's top), regex-assert no `setTimeout\s*\(\s*[^,]*,\s*[6-9][0-9]{3}\b` or higher-magnitude numeric delay appears in the happy path (error-backoff branches excluded by preceding comment marker).
- `timeout_rationale_comment_present` — regex-assert the source contains the phrase `prompt-cache TTL` and `270` inside the comment block adjacent to the constant.

Tests exercise the REAL spawn-args assembly in `_spawnWorker` via `bin/gsd-t-unattended.cjs` — no mocked copy — to catch drift.

---

## T3. Add §16 "Cache-Warm Pacing (v1.3.0)" to `unattended-supervisor-contract.md`

**Prerequisite**: T2 (contract documents the shipped behavior)

**Files modified**:
- `.gsd-t/contracts/unattended-supervisor-contract.md`

**Change**: append a new §16 section. Do NOT rewrite §1–§15. If the version header is not already at `v1.3.0` (D3's T3 may have bumped it), bump it now; otherwise leave it and add the §16 row to the version history.

§16 body must cover:

1. **Worker timeout default** — 270s (270,000 ms).
2. **Cache-window math** — Anthropic prompt-cache TTL is 5 min (300 s); supervisor→worker handoff budget is ~30 s (process exit + state persist + next spawn); `270 s worker + 30 s handoff = 300 s total` → next iter hits the warm cache.
3. **Graceful degradation** — if an iter legitimately exceeds 270 s, the supervisor kills the worker and logs a cache-miss warning; the next iter pays a cold-cache penalty but execution continues (no functional regression, no hard failure).
4. **Inter-iteration sleep invariant** — supervisor does not sleep > 5 s between worker exit and the next spawn; every added second shrinks the effective cache window.
5. **Sibling reference** — §15 (D3, Worker Team Mode) is the other v1.3.0 addition. Both sections were added in the same contract version bump.
6. **Cross-platform** — the 270 s budget is platform-agnostic; M36's macOS/Linux/Windows sleep-prevention matrix stands unchanged.

**Success criteria**: contract file contains §16 with all 6 bullets; references §15 as its sibling; version header = `v1.3.0`; version history updated.

**Tests**: the contract markdown remains parseable. T2's unit test covers the code behavior; §16 is the human-readable specification that matches it.
