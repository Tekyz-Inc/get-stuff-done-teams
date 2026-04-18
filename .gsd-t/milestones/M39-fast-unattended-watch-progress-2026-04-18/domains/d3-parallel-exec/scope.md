# Domain: d3-parallel-exec

## Responsibility

Teach the unattended worker to use Team Mode for multi-domain waves. When the current wave has multiple independent domains/tasks (per `.gsd-t/domains/*/tasks.md` + the wave assignment in `.gsd-t/partition.md`), the worker spawns parallel Task subagents — up to 15 concurrent, one per domain — using the general-purpose subagent_type, matching the existing `/gsd-t-execute` Team Mode prompt pattern. It waits for ALL subagents to complete before reporting back. Single-domain waves execute sequentially (no parallelism).

This closes the 3–5× speed gap observed in bee-poc (pid 69481: 45+ min on v3.12.13 for a milestone that finishes in 10–15 min in-session).

## Owned Files / Directories

- `bin/gsd-t-unattended.cjs::_spawnWorker` (~lines 1120–1145) — EDIT: worker prompt text. Add Team Mode instructions covering the multi-domain path, cap 15 concurrent, and the single-domain sequential fallback. Preserves the existing "If the current wave has multiple independent domains/tasks (per `.gsd-t/domains/*/tasks.md` and the wave assignment in `.gsd-t/partition.md`), spawn parallel Task subagents (up to 15 concurrent) — one per domain — using the general-purpose subagent_type and the same subagent prompt pattern as `/gsd-t-execute` Team Mode. Wait for ALL to complete before reporting back. If the current wave has only 1 domain, execute sequentially." phrasing.
- `.gsd-t/contracts/unattended-supervisor-contract.md` — ADDITIVE: append §15 "Worker Team Mode (v1.3.0)" describing intra-wave parallelism (cap 15), sequential inter-wave, detection heuristic (worker reads `partition.md` for wave membership), fallback rule (single-domain → sequential).
- `test/unattended-worker-team-mode.test.js` (NEW) — assert the worker prompt string contains the Team Mode instructions with cap=15; assert the single-domain sequential fallback path is described.

## NOT Owned (do not modify)

- Supervisor main relay loop (~lines 861–939) — owned by D4.
- Worker timeout default constant — owned by D4.
- `_spawnWorker` env-var construction / spawn args outside the prompt text — leave untouched; only the prompt string is modified.
- Watch printer output and watch banner — owned by D2.
- Any command file under `commands/*.md` — owned by D2 (workflow shims only).
- `unattended-supervisor-contract.md` §16 — D4's section.
- Event-stream code, headless-default contract, context meter — out of scope.

## Out of Scope

- Cross-wave parallelism (wave boundaries stay sequential per contract-safety invariant from M38 carry-over).
- Changing the supervisor CLI surface (`/gsd-t-unattended`, `/gsd-t-unattended-stop`, `/gsd-t-resume` verbs unchanged).
- Changing event-schema-contract types (reuse existing `subagent_spawn` / `subagent_complete` events).
- Teaching the supervisor itself to parallelize — D3 teaches the worker. The supervisor keeps running one worker per iter.
- bee-poc verification run — post-release.
