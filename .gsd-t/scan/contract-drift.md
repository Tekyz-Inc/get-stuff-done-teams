# Contract Drift Analysis — 2026-02-18 (Scan #6, Post-M10-M13)

**Scan Date:** 2026-02-18
**Package Version:** v2.28.10
**Previous scan:** Scan #5 at v2.24.4
**Contracts checked:** 8 files in .gsd-t/contracts/

---

## qa-agent-contract.md vs Reality

**Status: DRIFTED**

The QA agent contract input/output table still lists all phases including partition and plan:

```
Input: Current phase context: "partition" | "plan" | "execute" | ...
Output table: partition → "Contract test skeleton files", plan → "Acceptance test scenario files"
```

**Reality (post-M10):**
- partition: QA no longer spawned. No contract test skeletons generated during partition.
- plan: QA no longer spawned. No acceptance test scenario files generated during plan.

Contract says partition and plan produce QA output. Implementation produces no QA output for these phases.

**Drift details:**
- Contract line 12: phase context list includes "partition" and "plan"
- Contract output table (lines ~14-27): lists partition and plan rows with expected output
- Reality: these phases no longer spawn QA at all (M10 change)

**Remediation:** Remove "partition" and "plan" from the phase context list and output table. Mark them as "not applicable (QA removed in M10)".

---

## wave-phase-sequence.md vs Reality

**Status: MOSTLY CURRENT — minor gap**

The contract was updated in M8/M9 and covers the integrity check (M7), discuss skip heuristic (M7), security notes (M5).

**Gap found:** The wave-phase-sequence contract does not document:
1. The between-phase spot-check (M11) — not mentioned anywhere in the contract
2. The per-task commit requirement (M11) — not mentioned
3. CONTEXT.md flow as part of the discuss→plan handoff (M12) — not mentioned

These are significant behavioral additions to the wave that are not reflected in the contract.

---

## integration-points.md vs Reality

**Status: PLACEHOLDER — not drifted per se, but underdocumented**

Current content describes that it is "populated by gsd-t-plan during a multi-domain milestone" and lists only single-domain milestone history.

**Gap:** The M13 addition of Wave Execution Groups to integration-points.md is a new structural addition. The contract does not describe the Wave Execution Groups format that plan now writes into this file.

The integration-points.md contract (`.gsd-t/contracts/integration-points.md`) does not exist separately — the file IS the contract. The format spec for Wave Execution Groups is in gsd-t-plan.md only. There is no contract describing the Wave Execution Groups schema.

---

## pre-commit-gate.md vs Reality

**Status: CURRENT**

The pre-commit gate contract matches the checklist in CLAUDE.md. No drift.

---

## progress-file-format.md vs Reality

**Status: MOSTLY CURRENT — minor gap**

**Gap:** The progress-file-format contract does not document:
1. `deferred-items.md` as a new state artifact (M11)
2. `CONTEXT.md` as a new state artifact (M12)
3. `continue-here-{timestamp}.md` as a new state artifact (M13)

These new files are created by workflow commands but are not described in any contract.

---

## backlog-file-formats.md vs Reality

**Status: CURRENT**

No changes to backlog format in M10-M13. Matches implementation.

---

## backlog-command-interface.md vs Reality

**Status: CURRENT**

No changes to backlog commands in M10-M13.

---

## domain-structure.md vs Reality

**Status: CURRENT**

No changes to domain structure contract.

---

## Undocumented (exists in code/commands, no contract)

| Item | Description | Risk |
|------|-------------|------|
| `.gsd-t/CONTEXT.md` | Created by discuss, read by plan. No contract for format or lifecycle. | Plan agents may create inconsistent CONTEXT.md structures across milestones |
| `.gsd-t/continue-here-{timestamp}.md` | Created by pause, consumed by resume. No contract for format or naming convention. | Resume may not handle all edge cases if format varies |
| `.gsd-t/deferred-items.md` | Created by execute/quick/debug for unresolved issues. No contract for format, no cleanup rule. | Accumulates indefinitely; format is undocumented so tooling can't parse it |
| Wave Execution Groups (in integration-points.md) | Format written by plan, read by execute. Documented in gsd-t-plan.md and gsd-t-execute.md but no standalone contract. | If plan and execute diverge in their interpretation, silent failures |
| gsd-t-tools.js CLI interface | CLI tool with 6 subcommands. No contract describing input/output format. | If commands change, callers in Claude instructions break silently |

---

## Summary of Contract Drift

| Contract | Status | Priority |
|----------|--------|----------|
| qa-agent-contract.md | DRIFTED (partition/plan still listed) | HIGH — contract and reality conflict |
| wave-phase-sequence.md | PARTIAL — missing M11/M12 additions | MEDIUM — incomplete but not wrong |
| integration-points.md | UNDERDOCUMENTED — Wave Groups format not contracted | MEDIUM |
| progress-file-format.md | PARTIAL — missing deferred-items, CONTEXT.md, continue-here | MEDIUM |
| pre-commit-gate.md | CURRENT | None |
| backlog-file-formats.md | CURRENT | None |
| backlog-command-interface.md | CURRENT | None |
| domain-structure.md | CURRENT | None |
