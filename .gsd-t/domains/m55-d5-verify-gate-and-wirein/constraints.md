# Constraints: m55-d5-verify-gate-and-wirein

## Must Follow

- **Two-track hard-fail** — Track 1 (preflight) and Track 2 (parallel CLI) BOTH must pass for the verify-gate to return `ok: true`. Either track failing → `ok: false`, with the failed-track reason in the envelope.
- **≤500-token summary discipline** — the LLM judge receives a head-and-tail snippet of each worker's stdout/stderr, NEVER raw output. Snippet size is configurable per CLI (some are noisier than others), but the total summary budget is 500 tokens hard-capped.
- **Judge sees summary, never raw** — the LLM verdict is on the JSON summary only. Raw worker output stays on disk (`.gsd-t/verify-gate/{runId}/`) for human-only inspection.
- **`captureSpawn` invariant** — every CLI spawn in Track 2 flows through D2's `runParallel` which already enforces the wrapper. D5 never calls `child_process` directly.
- **Defensive on D3 absence** — if `.gsd-t/ratelimit-map.json` doesn't exist (e.g., dev machine that hasn't run probe), D5 logs a warning and uses `maxConcurrency=2` as a conservative default.
- **Additive command-file edits only** — Step 1 / Step 2 blocks are appended; existing prose is preserved. No reorganization of execute.md or verify.md beyond the added sections.
- **Doc ripple is mandatory and same-commit** — per the global Document Ripple Completion Gate. No "I'll update X next" — every file in the blast radius lands in the wire-in commit.
- **Subagent protocol edits are additive** — the "check the brief first" line is an addendum, not a rewrite.
- **`GLOBAL_BIN_TOOLS` propagation** — per `project_global_bin_propagation_gap.md` (memory): the three new bin entries get added to `GLOBAL_BIN_TOOLS` so `~/.claude/bin/` updates propagate via `gsd-t update-all`.
- **Schema-versioned envelope** — `schemaVersion: "1.0.0"` on the verify-gate output. Contract documents bump rules.
- **Idempotent re-runs** — running verify-gate twice with no source changes produces byte-identical track1/track2 results sections (modulo timestamps in a separate `meta` field).
- **Test-first wire-in** — the 3 wire-in assertion tests (m55-d5-wire-in-execute / m55-d5-wire-in-verify / m55-d5-subagent-prompts) land BEFORE the actual edits, then the edits make them pass. Standard TDD shape.

## Must Not

- Modify D1/D2/D3/D4 owned files (read-only consumption only)
- Inline preflight or brief logic into the verify-gate — always import from D1/D4
- Pass raw stdout/stderr to the LLM judge
- Skip Track 1 when Track 2 fails (or vice versa) — both run, both report
- Rewrite command files — only additive blocks
- Forget the doc ripple — the global gate enforces it; D5's commit fails if any blast-radius file is missed
- Hand-edit `~/.claude/bin/` — propagation goes through `gsd-t update-all`

## Must Read Before Using

The execute agent for D5 must read these files BEFORE writing code:

- **D1 contract + library** (`bin/cli-preflight.cjs`, `.gsd-t/contracts/cli-preflight-contract.md`) — the envelope D5 consumes.
- **D2 contract + library** (`bin/parallel-cli.cjs`, `.gsd-t/contracts/parallel-cli-contract.md`) — the API D5 fans out through.
- **D4 contract + library** (`bin/gsd-t-context-brief.cjs`, `.gsd-t/contracts/context-brief-contract.md`) — the brief D5 generates and threads.
- **`commands/gsd-t-execute.md`** + **`commands/gsd-t-verify.md`** — to author additive blocks that respect existing structure.
- **`templates/prompts/qa-subagent.md`** + **`red-team-subagent.md`** + **`design-verify-subagent.md`** — to find the right insertion point for the "brief-first" line.
- **`bin/gsd-t.js`** — to wire dispatch (`preflight` / `brief` / `verify-gate`).
- **`docs/architecture.md`** + **`docs/requirements.md`** + **`CLAUDE.md`** + **`commands/gsd-t-help.md`** + **`GSD-T-README.md`** + **`templates/CLAUDE-global.md`** — full doc-ripple targets.
- **`feedback_measure_dont_claim.md`** (memory) — D5 wave is also where success criteria 4 and 6 are measured. No tag without numbers.
- **`feedback_no_silent_degradation.md`** (memory) — D5 must NOT downgrade or skip checks under context pressure.
- **`project_global_bin_propagation_gap.md`** (memory) — the new bin entries MUST land in `GLOBAL_BIN_TOOLS`.

D5 is prohibited from treating any of these as black boxes — read the listed sections before depending on shape.

## Dependencies

- Depends on: D1 (envelope), D2 (substrate API), D4 (brief). D3's map consumed defensively (fallback if missing).
- Depended on by: M55 milestone integrate + verify + complete (D5 ships M55's user-facing surface)
