# M115 A1 blind-replay fixture — the answer key

Held-out copy of the TimeTracking v1.27 rate-ledger session (2026-09-01/02), taken from
`~/Worktrees/TimeTracking/work` on 2026-09-02 so the A1 acceptance criterion stays falsifiable
if that worktree is cleaned up.

| File | What it is | Source |
|---|---|---|
| `requirements-before-review.md` | The INPUT — requirements as they stood before the test-plan review (571 lines) | `git show 8836ba0^:docs/requirements.md` |
| `test-plan-first-draft.md` | The first enumeration (210 lines), before David's review | `git show 8836ba0:docs/rate-ledger-test-plan.md` |
| `test-plan-final.md` | The plan after review (350 lines, 94 cases) | `docs/rate-ledger-test-plan.md` @ HEAD |
| `requirements-after-review.md` | Requirements after the review folded in (601 lines) | `docs/requirements.md` @ HEAD |
| `requirements-review-delta.diff` | The ANSWER KEY — the 30 lines the review added | `git diff 8836ba0^ HEAD -- docs/requirements.md` |

A1 passes when cold enumeration from `requirements-before-review.md` (plus the project's
architecture/contracts as they stood) surfaces all three known gaps: month close + reopen,
the wrong permission model, and "the owner cannot be deactivated". Do not edit these files.
