# Constraints: d4-cache-warm-pacing

## Must Follow

- Worker timeout default = 270s (300s prompt-cache TTL minus ~30s handoff/restart margin). Document the math inline in `bin/gsd-t-unattended.cjs` next to the constant and in `unattended-supervisor-contract.md` §16.
- Graceful degradation: if a single iter legitimately exceeds 270s (worker still running at deadline), supervisor kills/completes that iter and logs a cache-miss warning; next iter pays cold-cache cost but execution continues — no functional regression.
- Inter-iteration supervisor sleep is MINIMAL (effectively zero — just the time to persist state + assemble the next `claude -p` spawn). Every added second shrinks the effective cache window.
- Edit is surgical: the timeout constant + an inline comment in the main relay loop. No restructuring of the loop's control flow.
- `unattended-supervisor-contract.md` §16 is ADDITIVE: append after D3's §15 without rewriting §1–§15.
- Version header bumps to v1.3.0 alongside D3's edit (same contract version; two non-overlapping section additions).
- Tests exercise the REAL spawn-args assembly in `_spawnWorker` (assert timeout ≤ 270s in the actual produced args), not a mocked copy.
- Zero external dependencies; Node built-ins only.

## Must Not

- Do NOT touch `_spawnWorker` prompt text — D3's domain.
- Do NOT touch watch printer / banner / command files — D2's domain.
- Do NOT edit §15 of `unattended-supervisor-contract.md` — D3 owns that section.
- Do NOT raise the timeout above 270s (breaks the cache-warm invariant).
- Do NOT lower the timeout below ~180s without a separate user-approved revision.
- Do NOT rewrite the main relay loop control flow — only the timeout constant + rationale comment.
- Do NOT change the supervisor CLI surface or cross-platform matrix.

## Must Read Before Using

- `bin/gsd-t-unattended.cjs` main relay loop (lines ~861–939) — the exact region being edited. Read the existing timeout handling + iter boundaries before touching them.
- `.gsd-t/contracts/unattended-supervisor-contract.md` current §1–§15 — to pick the correct version bump and append target.
- `bin/gsd-t-unattended.cjs::_spawnWorker` spawn-args assembly — the test asserts against the actual produced args.
- Anthropic docs on prompt caching (5-minute TTL) — the externally-imposed constraint D4 adapts to.
- `.gsd-t/contracts/unattended-event-stream-contract.md` — confirm logging the cache-miss warning fits existing event types (reuse `phase_transition` or a plain log line; no schema change).

## Dependencies

- Depends on: nothing inside M39. D4 can land independently of D2 and D3.
- Shared edit target: `unattended-supervisor-contract.md` — D4 edits §16, D3 edits §15. Non-overlapping additive sections. Sequencing documented in `.gsd-t/contracts/integration-points.md`.
- Depended on by: nothing. D4 is a standalone pacing change.
- External touch-points: post-M39 bee-poc relaunch verifies the warm-cache pacing alongside D3's parallelism.
