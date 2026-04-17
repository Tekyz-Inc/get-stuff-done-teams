# Tasks: d3-parallel-exec

**Domain**: D3 parallel-exec (M39 Wave 1)
**Total tasks**: 4
**Parallelism**: Wave 1 — runs in parallel with D2 and D4 (no cross-domain deps; shared-file edits in `bin/gsd-t-unattended.cjs` and `unattended-supervisor-contract.md` are disjoint regions)

---

## T1. Locate and document the `_spawnWorker` prompt insertion point

**Prerequisite**: none (first task)

**Files read** (no change):
- `bin/gsd-t-unattended.cjs` — `_spawnWorker` function, approximately lines 1120–1145.

**Change**: no code change. This is a trace task — confirm the exact lines, the existing "You are an unattended worker iteration..." block, and the immediately-following "Your job..." section. Document findings inline in the commit message for T2 (file + line numbers).

**Success criteria**: T2 has a verified insertion point; no drift with partition's stated region.

**Tests**: none.

---

## T2. Update `_spawnWorker` prompt — insert Team Mode block

**Prerequisite**: T1

**Files modified**:
- `bin/gsd-t-unattended.cjs` — inside `_spawnWorker`, in the prompt-string template literal, insert the Team Mode block AFTER the existing "You are an unattended worker iteration..." block and BEFORE the "Your job..." section.

**Change**: add the following text (verbatim) into the prompt string:

```
# Team Mode (Intra-Wave Parallelism)

Before executing tasks for this iteration, read `.gsd-t/partition.md` to
identify the current wave and which domains belong to it.

If the current wave has MULTIPLE independent domains/tasks (check
`.gsd-t/domains/*/tasks.md` — 2 or more domains with incomplete tasks in the
current wave):

  SPAWN PARALLEL SUBAGENTS — up to 15 concurrent Task subagents, one per
  domain, using `general-purpose` subagent_type. Use the same subagent
  prompt pattern as `/gsd-t-execute` Team Mode (see `commands/gsd-t-execute.md`
  Step 4 Team Mode section). Each subagent:
    - Receives the domain name, its scope.md, its tasks.md (only incomplete
      tasks from the current wave), and the relevant contracts
    - Works ONLY within its domain boundary
    - Returns when all its current-wave tasks are committed
  WAIT for ALL spawned subagents to report back before advancing.

If the current wave has only 1 domain with incomplete tasks, execute
sequentially in this worker (no subagent spawn needed).

Inter-wave boundaries always remain sequential — never parallelize across
waves, because wave-N+1 may depend on wave-N contract/state updates.
```

Surgical edit only — no restructuring of `_spawnWorker`'s control flow or env/spawn args.

**Success criteria**: the prompt string assembled by `_spawnWorker` contains the Team Mode block exactly; no other change to the function.

**Tests**: `test/unattended-worker-team-mode.test.js`:
- `worker_prompt_contains_team_mode_header` — assert prompt contains `# Team Mode (Intra-Wave Parallelism)`.
- `worker_prompt_contains_cap_15` — assert prompt contains `up to 15 concurrent`.
- `worker_prompt_contains_inter_wave_sequential` — assert prompt contains `Inter-wave boundaries always remain sequential`.
- `worker_prompt_contains_single_domain_fallback` — assert prompt contains `If the current wave has only 1 domain`.
- `worker_prompt_references_execute_team_mode_pattern` — assert prompt contains `commands/gsd-t-execute.md`.
- `worker_prompt_references_partition_md` — assert prompt contains `.gsd-t/partition.md`.

Tests require the real `_spawnWorker` function (via require of `bin/gsd-t-unattended.cjs`); build the prompt string the same way the supervisor would; grep-assert on it.

---

## T3. Add §15 "Worker Team Mode (v1.3.0)" to `unattended-supervisor-contract.md`

**Prerequisite**: T2 (so the contract text matches the implemented prompt behavior)

**Files modified**:
- `.gsd-t/contracts/unattended-supervisor-contract.md`

**Change**: append a new §15 section. Do NOT rewrite §1–§14. Bump the contract version header from its current value to `v1.3.0`; add a version-history row.

§15 body must cover:

1. **Parallelism scope** — intra-wave only. Inter-wave remains sequential (wave-N+1 may depend on wave-N contract/state updates).
2. **Concurrency cap** — 15 concurrent Task subagents maximum.
3. **Detection heuristic** — worker reads `.gsd-t/partition.md` to identify the current wave and reads `.gsd-t/domains/*/tasks.md` to find domains with incomplete tasks in that wave.
4. **Sequential fallback** — single-domain waves execute sequentially in the worker itself (no subagent spawn).
5. **Spawn pattern** — mirrors `/gsd-t-execute` Team Mode exactly: `general-purpose` subagent_type, one subagent per domain, same prompt skeleton (domain name + scope.md + tasks.md slice + contracts).
6. **Wait semantics** — worker waits for ALL spawned subagents to report back before advancing. No partial-return fast-paths.
7. **Rationale** — closes the 3–5× speed gap observed in bee-poc (pid 69481: 45+ min on v3.12.13 for a milestone that finishes in 10–15 min in-session).

**Success criteria**: contract file contains §15 with all 7 bullets; version header = `v1.3.0`; version history updated.

**Tests**: covered implicitly via T2's prompt test + a markdown-parse check that the file remains valid (no broken code fences).

---

## T4. Smoke assertion — verify prompt contains Team Mode block

**Prerequisite**: T2, T3

**Files read** (no change):
- `bin/gsd-t-unattended.cjs`
- `.gsd-t/contracts/unattended-supervisor-contract.md`

**Change**: no new code. Verify that T2's test (`test/unattended-worker-team-mode.test.js`) passes by running `npm test`. Confirm the contract's §15 text aligns with the prompt's Team Mode block (phrasing consistent).

**Success criteria**: all 6 assertions in `test/unattended-worker-team-mode.test.js` pass.

**Tests**: re-run T2's test file; no new tests added.
