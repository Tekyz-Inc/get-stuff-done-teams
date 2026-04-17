# Domain: d4-cache-warm-pacing

## Responsibility

Supervisor pacing to keep each `claude -p` worker iteration inside the Anthropic 5-minute prompt-cache TTL. Today's supervisor→worker handoff crosses 300s+ on many iters, so every relaunch pays a cold-cache penalty. D4 tunes the worker timeout default to 270s and documents the cache-window math so relaunches hit the warm cache.

## Owned Files / Directories

- `bin/gsd-t-unattended.cjs` main relay loop (~lines 861–939) — EDIT: tune worker timeout default to 270s. Add inline comment documenting the 5-minute prompt-cache TTL rationale (270s budget = 300s TTL minus ~30s handoff/restart margin).
- `.gsd-t/contracts/unattended-supervisor-contract.md` — ADDITIVE: append §16 "Cache-Warm Pacing (v1.3.0)" explaining the 270s worker timeout, the 5-minute TTL math, and graceful degradation when a single iter legitimately exceeds 270s (supervisor logs a cache-miss warning and proceeds; no functional regression).
- `test/unattended-cache-warm-pacing.test.js` (NEW) — asserts worker timeout ≤ 270s in the spawn args assembled by `_spawnWorker`; asserts the supervisor main-loop inter-iteration sleep is minimal so handoff stays under the TTL.

## NOT Owned (do not modify)

- `_spawnWorker` prompt text — owned by D3.
- §15 of `unattended-supervisor-contract.md` — owned by D3 (D4 owns §16).
- Watch printer, watch banner, any command file — owned by D2.
- Supervisor CLI surface (slash commands, flags unrelated to worker timeout).
- Event-stream code, headless spawn, context meter — out of scope.

## Out of Scope

- Rewriting the supervisor main loop's control flow (only the timeout constant + rationale comment change).
- Changing the prompt-cache TTL assumption (5 min is Anthropic's documented cache window; D4 adapts to it, doesn't negotiate with it).
- Raising the timeout above 270s. Lowering it below ~180s (would not give workers enough budget for typical iter work).
- Cross-platform sleep-prevention — M36's macOS/Linux/Windows matrix stands; D4 does not change it.
- bee-poc verification — post-release.
