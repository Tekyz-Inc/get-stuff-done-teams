# Constraints: d3-parallel-exec

## Must Follow

- Parallel subagent cap = 15 (intra-wave). Sequential inter-wave. These limits are stated explicitly in both the worker prompt and `unattended-supervisor-contract.md` §15.
- Single-domain waves → sequential execution (no parallel spawn). Detection heuristic: worker reads `.gsd-t/partition.md` + `.gsd-t/domains/*/tasks.md` to determine wave membership and branches accordingly.
- Subagent spawn pattern mirrors `/gsd-t-execute` Team Mode exactly — general-purpose subagent_type, one subagent per domain, same prompt skeleton. Do not invent a new spawn pattern.
- Worker waits for ALL parallel subagents to complete before reporting back to supervisor. No partial-return fast-paths.
- Prompt edit is surgical — confined to the `_spawnWorker` prompt string (~lines 1120–1145). No restructuring of `_spawnWorker`'s control flow or env/spawn args.
- `unattended-supervisor-contract.md` edit is ADDITIVE: append §15 without rewriting existing sections §1–§14. Version header bumps to v1.3.0.
- Tests exercise the REAL prompt text produced by `_spawnWorker` (grep/match on assembled string), not a mocked copy — catches drift between contract and prompt.
- Zero external dependencies; Node built-ins only.

## Must Not

- Do NOT touch the supervisor main relay loop or worker timeout — D4's domain.
- Do NOT touch the watch printer, watch banner, or any command file — D2's domain.
- Do NOT edit §16 of `unattended-supervisor-contract.md` — D4 owns that section (D3 owns §15 only).
- Do NOT change event-schema-contract event types.
- Do NOT raise the parallel cap above 15. Do NOT lower it below 15 without user approval.
- Do NOT teach the supervisor to parallelize workers — intra-wave parallelism is a WORKER-level capability.
- Do NOT change the supervisor CLI surface (slash commands / flags).

## Must Read Before Using

- `bin/gsd-t-unattended.cjs` `_spawnWorker` function end-to-end — understand the existing prompt and env plumbing before editing.
- `commands/gsd-t-execute.md` Team Mode section — the canonical parallel subagent spawn pattern the prompt must mirror.
- `.gsd-t/contracts/unattended-supervisor-contract.md` current version — confirm the §15 append target and the next version number.
- `.gsd-t/partition.md` format — the worker reads this file to detect wave membership; understand the current schema so the detection heuristic is accurate.
- `.gsd-t/contracts/event-schema-contract.md` — confirm `subagent_spawn` / `subagent_complete` cover the parallel case without schema changes.

## Dependencies

- Depends on: nothing inside M39. D3 can land independently of D2 and D4.
- Shared edit target: `unattended-supervisor-contract.md` — D3 edits §15, D4 edits §16. Non-overlapping additive sections. Sequencing documented in `.gsd-t/contracts/integration-points.md`.
- Depended on by: nothing. D3 is a standalone capability.
- External touch-points: post-M39 bee-poc relaunch on v3.13.10 verifies the 3–5× speedup against the v3.12.13 baseline — verification is release-time, not in-milestone.
