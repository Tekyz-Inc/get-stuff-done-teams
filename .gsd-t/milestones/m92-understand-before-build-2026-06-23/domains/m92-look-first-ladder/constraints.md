# Constraints: m92-look-first-ladder (M92 D1)

- Zero external runtime deps; pure; never throws (garbage input → a safe default envelope, not an exception).
- EXTEND `resolveResponseMode`, do not rewrite it — preserve R-ARCH-4 (spike-fail→STOP) and R-ARCH-5 (infeasible→adversary-only) byte-for-byte in behavior.
- Backward-compat envelope: `stopDirective`, `mode`, `adversaryMandatory`, `provenByAdversaryOnly` MUST remain present with unchanged semantics for existing modes (execute/quick/verify read them; a drop fails-OPEN their gates).
- Do NOT build backlog #42's spike-feasibility decider — that is a separate EXPERIMENTAL milestone. This domain only adds the cheap look/smallest/defer rungs and demotes spike from default.
- Do NOT edit any `*.workflow.js` (integrate-seam) or the doctrine contract (integrate). File-disjoint from D2 (verify.workflow + shrink-metric) and D3 (command prompts + quick.workflow).
- The ladder is a deterministic state function — ZERO LLM judgment in the resolver.
