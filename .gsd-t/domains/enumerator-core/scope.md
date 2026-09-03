# Domain: enumerator-core

**Milestone:** M115 — Test-Plan-First Requirements Interrogation
**Wave:** 1 — RUNS ALONE. No other domain starts until this one passes.
**Acceptance carried:** A1 (the blind replay)

## Purpose

This is the falsification gate for the whole milestone. The central bet is that a cold
enumeration driven by fixed rules reproduces what David's manual review found. That bet is
unproven, so it is tested FIRST — before a command, a mold or a gate is written — against an
answer key that already exists on disk.

The domain authors the enumeration protocol from the pseudocode's eight enumeration rules,
then blind-replays it cold against the held-out fixture. It passes only when the cold run
surfaces all three known gaps. If it fails, the protocol is wrong, this domain is deletable
in one piece, and the milestone halts for premise re-examination at the cost of one wave
instead of five.

It also settles the case-space bound the pseudocode explicitly defers to partition, and
authors the cross-domain contract that freezes the interface Waves 2 and 3 build against.

## Files Owned

| File | New/Edit | What |
|---|---|---|
| `templates/prompts/test-plan-enumerator-subagent.md` | new | The eight enumeration rules as an agent-readable protocol |
| `.gsd-t/contracts/test-plan-first-contract.md` | edit | Flip DRAFT → STABLE; fill the case-space bound |
| `test/m115-a1-blind-replay.test.js` | new | The A1 proof |
| `.gsd-t/domains/enumerator-core/{scope,constraints,tasks}.md` | new | This domain's own files |

## Not Owned — read only, never write

- `test/fixtures/m115-blind-replay/**` — the answer key. READ it; never edit, re-copy or
  regenerate it. Editing the fixture is how a falsifiable criterion silently becomes
  unfalsifiable.
- `.gsd-t/pseudocode/PseudoCode-TestPlanFirst.md` — the source of truth this domain
  implements. Changing it to match the implementation inverts the relationship.
- `templates/prompts/keep-or-supersede-subagent.md` — read for the verdict-table shape only.
- Every file owned by another domain. In particular: no command, no mold, no lint, no CLI
  registration. Building any of those here would defeat the quarantine.

## Deliverables

1. **The enumeration protocol** — E1 through E8 written so an agent can execute them:
   E1 more-than-one-of-everything · E2 sequence permutations (insert-before /
   same-date-replace / future-dated-then-changed) · E3 every row states its effect on data
   already saved · E4 permission matrix per screen AND per endpoint · E5 cross-flow chains
   end to end · E6 lifecycle closure (every state's exit AND re-entry) · E7 boundary
   inclusivity stated never assumed · E8 the refusal cases.
2. **The A1 blind-replay proof** — a cold run surfacing all three answer-key gaps.
3. **The case-space bound** — settled from the fixture's observed scale, recorded as
   evidence rather than assumption.
4. **The frozen contract** — flipped to STABLE, which is the signal Wave 2 may start.

## Interfaces Published

`.gsd-t/contracts/test-plan-first-contract.md` at v1.0.0 STABLE. Downstream domains read
the row schema (§2), the self-answered field names (§3), the gate exit codes (§4) and the
gate verb names (§5). Nothing downstream may begin until that file says STABLE.

## Definition of Done

- The cold enumeration surfaces month close + reopen, the wrong permission model, and
  "the owner cannot be deactivated" — all three, from `requirements-before-review.md` alone.
- `test/m115-a1-blind-replay.test.js` passes and would FAIL if any one gap went unsurfaced.
- The case-space bound is written down with the fixture's observed scale cited.
- The contract reads `1.0.0 STABLE`.
- The fixture is byte-identical to how it started.
