# Constraints: m44-d4-depgraph-validation

## Hard Rules

1. D4 is read-only. It never writes to tasks.md, scope.md, or any domain artifact. Its only write surface is appending veto events to `.gsd-t/events/YYYY-MM-DD.jsonl`.
2. D4 never throws hard errors for unmet dependencies. It returns a reduced ready set. Throwing would break the parallel path for ALL tasks when only some are unready.
3. D4 must complete synchronously (or with only local file I/O). No spawning, no network, no heavy async chains. The gate must add < 50ms to the pre-spawn path.
4. D4 does NOT detect cycles. That is D1's responsibility. D4 assumes the input graph is cycle-free (D1 guarantees this by throwing `TaskGraphCycleError` during graph build).
5. Zero external runtime dependencies.
6. The `depgraph-validation-contract.md` MUST be created as a skeleton in D4-T1 and finalized in D4-T2.

## Mode Awareness

D4 is **mode-agnostic**. The same `validateDepGraph` function is called identically regardless of [in-session] or [unattended] mode. Mode-specific behavior (what to do with the reduced set) is entirely D2's responsibility.

## Tradeoffs Acknowledged

- Vetoing unready tasks silently (no user-facing message) means a developer might wonder why a task wasn't run. Mitigation: the `dep_gate_veto` event in the event stream is inspectable via `gsd-t log` and the dashboard. No interactive prompt is ever generated.
- Cross-milestone deps are out of scope. If a task in M44 depends on a task in M43, D4 will report that dep as unresolvable (treats it as unmet). This is acceptable: all M44 tasks should depend only on M44 or earlier completed milestones.

## Out-of-scope clarifications

- D4 does not rank or prioritize tasks within the ready set. Ordering is D2's concern.
- D4 does not check whether a task's dep is "in progress" vs "done". Only DONE (`[x]`) clears a dependency.
