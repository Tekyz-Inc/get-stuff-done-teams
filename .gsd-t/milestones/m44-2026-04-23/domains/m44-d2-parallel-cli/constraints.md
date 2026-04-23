# Constraints: m44-d2-parallel-cli

## Hard Rules

1. Never replace `bin/gsd-t-orchestrator.js`. M44 builds ON M40, not instead of it. The `parallel` subcommand creates a new orchestrator config and delegates worker spawning to the existing orchestrator machinery.
2. The three pre-existing invariants apply to BOTH modes identically: file-disjointness proof BEFORE spawn, 100% automatic merges, pre-spawn economics check. No mode flag bypasses these gates.
3. `--dry-run` flag MUST be supported. In dry-run mode, the command prints the proposed worker plan (task assignments, estimated CW usage, gate verdicts) without spawning any workers.
4. Zero external runtime dependencies. Same as the rest of GSD-T.
5. The `--mode` flag auto-detection fallback: if no `--mode` is supplied, detect from the caller environment. If `GSD_T_UNATTENDED=1` is set, use `unattended`; otherwise use `in-session`.
6. Wave-join-contract bump MUST happen in this domain's commit (D2-T4 or earlier). Downstream consumers (D3, etc.) must not use mode-aware gating math before the contract is locked.

## Mode Awareness

**[in-session]**:
- Before spawning N workers, compute `ctxPct + (N × estimated_summary_size) ≤ 85`. If math fails, reduce N and try again. Never refuse entirely — fall back to N=1 (sequential) as the final fallback.
- Worker summaries must be bounded (D6 provides the estimate). Hard cap: 4KB per summary envelope returned to the in-session orchestrator CW.
- NEVER throw a pause/resume prompt under any condition.

**[unattended]**:
- Per-worker CW headroom is the binding gate. A task slice that would exceed ~60% of one CW must be split into multiple `claude -p` spawns (multiple iters) instead of one fat iter.
- Speed is a side-benefit, not the primary objective. If the economics gate says sequential is safer, use sequential without complaint.
- The supervisor (Node process, no CW) is the orchestration layer; `claude -p` workers each have their own clean CW.

## Tradeoffs Acknowledged

- Pumping fewer-at-a-time (in-session fallback) is slower than max-parallel but prevents CW exhaustion that would cause a mid-session compaction, which is the failure mode we're preventing.
- The 4KB summary cap is a heuristic. It may be too tight for large domain results. If smoke tests show summary truncation, revisit in a follow-up quick task.
- Auto-detecting `--mode` from environment variables means a misconfigured environment will silently use the wrong mode. The `--dry-run` output makes this visible without harm.

## Out-of-scope clarifications

- D2 does NOT implement the merge strategy for parallel workers. The M40 orchestrator handles merge via the existing "all tasks independently mergeable" invariant (file-disjointness gate ensures this).
- D2 does NOT produce observability events itself. That is the M40 orchestrator's existing responsibility; D2 reuses it.
