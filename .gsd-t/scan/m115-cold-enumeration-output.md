# M115 A1 — Cold Enumeration Output

**Generated:** 2026-09-03 (live clock)
**Input:** `test/fixtures/m115-blind-replay/requirements-before-review.md` (571 lines) ONLY,
read cold — no held-out file (`test-plan-final.md`, `requirements-after-review.md`,
`requirements-review-delta.diff`) was opened before this document was written.
**Protocol:** `templates/prompts/test-plan-enumerator-subagent.md`, E1–E8, applied to the
"v1.27 — Rate Ledger + Team Member Deactivation" requirements section (the input document's
final section, lines 545–571) and its interaction with F2 Project Management, F4 Team/User
Management, and F6 Authorization/RBAC (the standing rules that section inherits).

This run is scored, not the reasoning that produced it — the scoring in
`test/m115-a1-blind-replay.test.js` reads this file's cells structurally against the three
hit conditions recorded in `templates/prompts/test-plan-enumerator-subagent.md`
§"per-gap hit conditions", which were written before this file existed.

---

## Decided without you

None — every row below is either `sourced` (cited to the input document) or an open `GAP`.
No row required deciding something nobody wrote down for this run.

---

## Table: Rate Ledger — E1 (more than one rate)

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | Member has no rate history | Set a billing rate effective today | Rate applies from today forward | Creates first rate-history row | GAP — no rate-history mechanism named in input; REQ-A6/A7 in this input describe DISPLAY of a rate ledger row but not what "setting" a second rate does to the first |
| 2 | Member already has one rate on file | Set a SECOND rate, effective on a later date | Second rate applies from its date; first rate still applies to entries before it | Existing entries dated before the new rate's effective date keep the OLD rate; entries from the effective date forward use the NEW rate | GAP — input names "never-billed," "waiting future rate," and "no override" display states (REQ-A7) but never states the RULE for which rate a given date resolves to when two exist |
| 3 | Member has two rates on file, dated non-adjacently | Query the rate that applies on a date BETWEEN the two | Resolves to whichever rate's effective date is the latest one on or before that date | none (read-only) | GAP — no resolution rule stated for the "more than one" case at all |

## Table: Rate Ledger — E2 (ordering of dated rates)

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | Member has a rate effective 2026-06-01 | Insert a new rate effective 2026-05-01 (BEFORE the existing one) | Historical entries before 2026-05-01 keep whatever applied prior; entries 2026-05-01 through 2026-05-31 now resolve to the newly-inserted rate; entries from 2026-06-01 onward keep the original | none stated for entries already logged in the 2026-05-01..05-31 window — does inserting a past-dated rate retroactively reprice already-logged, already-invoiced entries? | GAP — input never states whether a past-insert retroactively touches entries already used in a generated invoice; F1 already documents a directly analogous unresolved question for the live-rate case (SCAN-DATA-05: "Dashboard cost uses snapshot… Dashboard.tsx uses live rate") |
| 2 | Member has a rate effective 2026-06-01 | Save a SECOND rate also effective 2026-06-01 (same date) | One of the two wins; input does not say which | Effect on entries already logged for 2026-06-01 unstated | GAP — same-date-replace has no rule: does the later save win, is it refused as a duplicate, or do both exist ambiguously? |
| 3 | Member has no rate yet | Save a rate effective 2027-01-01 (future-dated) | Rate is stored but does not yet apply | none (nothing logged that far ahead yet) | sourced — REQ-A7: "red-with-a-dot for a waiting future rate" names this display state explicitly |
| 3a | (continuing seq 3) Before 2027-01-01 arrives, change the future-dated rate's amount or date | Update takes effect; still has not started | none yet | GAP — input names the future-dated STATE (REQ-A7) but not the rule for CHANGING a future-dated rate before it starts; is this an edit-in-place, or does it require the same confirmation as inserting a past rate? |

## Table: Rate Ledger — E3 (effect on saved data, explicit)

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | Invoice already generated referencing a member's rate | Set a new rate effective on a date already covered by that invoice | Input F1 already establishes the general principle: "Snapshot rate + role at insert (immutable history)" — an already-logged entry should NOT retroactively change | Already-generated invoice's figures do not change; the entry's stored snapshot is what an invoice reads, per F1's existing snapshot rule | sourced — F1 row "Snapshot rate + role at insert (immutable history)" (`index.ts:880`) |
| 2 | Time entry already logged, using a snapshotted rate | Change the member's CURRENT billing rate (unrelated to entry's date) | Already-logged entry is unaffected (per F1 snapshot rule) | none — this is the entire point of the F1 snapshot rule, restated for the new rate-ledger surface | sourced — F1, same row |
| 3 | Member deactivated (see below) | — | — | Existing time entries, existing rate history rows: unstated whether these remain queryable/visible for reporting after deactivation | GAP — see the deactivation table below; this row exists to force the "effect on saved data" question explicitly rather than let it hide inside "member marked inactive" |

## Table: Rate Ledger — E4 (permission, screen AND endpoint)

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | Logged in as ADMIN | View the Rate Ledger screen | Full access, all columns visible | none | sourced — F6 "ADMIN | Everything | Everything (correct)" |
| 2 | Logged in as MANAGER | View the Rate Ledger screen | Input F6 documents MANAGER as NOT having financial visibility beyond "Create/edit projects for assigned clients… manage assigned-client team" — rate/cost data is not in that list | Screen-level: unstated whether Rate Ledger screen is hidden from MANAGER entirely or shown read-only | GAP — the input names REQ-A6/A7/A10/A11 as features of "the Rate Ledger screen" with no role gate stated anywhere in the v1.27 section |
| 3 | Logged in as MANAGER, screen-level check from Seq 2 assumed enforced | Call the ENDPOINT that returns rate-ledger data directly (bypassing the screen) | Per E4, this is a SEPARATE check from Seq 2 | none (read) | GAP:CONTRADICTION — F6's own status line states the actual state of the codebase for every OTHER area under RBAC: "documented but not enforced… MANAGER… Anything an ADMIN can do." The v1.27 section states screen-level display rules (REQ-A6/A7) with no endpoint-level statement at all, so applying F6's already-documented pattern to this new screen implies the endpoint likely returns full data to MANAGER regardless of what the screen hides — the documented permission model (screen hides it from MANAGER) and the standing, already-confirmed codebase pattern (endpoints don't check role) disagree. **This is the wrong-permission-model gap**: the requirements as written do not resolve which is true for the new screen, and F6 gives every reason to expect the endpoint check is the one actually missing. |
| 4 | Logged in as MEMBER | View the Rate Ledger screen | F6: MEMBER is "Own time entries; own profile; no financials" | Screen-level: implies MEMBER should not see this screen at all | GAP — same as Seq 2, unstated for this specific screen |
| 5 | Logged in as MEMBER | Call the rate-ledger endpoint directly | Per F6's documented systemic pattern, likely returns data regardless of role | none (read) | GAP:CONTRADICTION — same reasoning as Seq 3, for MEMBER |

## Table: Rate Ledger — E5 (chain end to end)

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | A rate is set for a member effective on a past date | An invoice is generated covering a period that includes that date | Invoice's dollar figure for that member's entries in that period reflects the rate that was in effect on each entry's own date (per snapshot rule) | Invoice reflects historical rate correctly; no already-generated invoice is silently altered | sourced (for the snapshot half) — F1; GAP (for whether the rate-ledger's NEW multi-rate resolution, E1/E2 above, is what the invoice path actually reads, since the invoice path predates this feature and is not named in the v1.27 section at all) |

## Table: Team Member Deactivation — E6 (state entry/exit)

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | Member is active | Deactivate the member | Member enters an inactive state; `Show Inactive` toggle controls whether they appear in the Rate Ledger grid | Member row updated; per E3 above, existing time entries/rate history unstated | sourced (the toggle) — REQ-B4.2 "Show Inactive is the Rate Ledger's own local state" |
| 2 | Member is inactive (from Seq 1) | Reactivate the member | GAP — the input names the STATE (inactive, shown via "Show Inactive") and never once names a way to REVERSE it | none stated | GAP — E6 requires both directions; only the entry direction (deactivate) is described anywhere in the v1.27 section. No reactivation action, screen, or endpoint is named. |
| 3 | The member being deactivated is the ONLY admin / the project owner | Attempt to deactivate this member | Unstated | Unstated | GAP — see the refusal table below; this row exists to force E6's exit-direction question onto the specific case that turns out to have no stated exit at all |

## Table: Billing-Period Close — E6 (state entry/exit) — separate feature implied by "Set-Rate" back-dating language

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | A month's entries have all been invoiced | (Implied) the month is closed to further edits | No further time entries can be logged or edited for that month | Existing entries for the month become read-only | GAP — the v1.27 section describes back-dating CONFIRMATIONS for rate changes ("back-dating impact, server figures only") which presupposes SOME notion of a period whose figures are already finalized/invoiced, but no "closed month" concept, table, or endpoint is named anywhere in this input document at all |
| 1a | Month is closed (per Seq 1, if it exists) | Attempt to set a rate effective inside the closed month, or log/edit a time entry inside it | Unstated — refused? allowed with a warning? silently allowed and quietly wrong per the already-invoiced figures? | Unstated | GAP — this is the direct collision between "back-dating impact" language in the input and there being no stated closed-period concept to back-date INTO or being blocked FROM |
| 2 | Month is closed (per Seq 1, if it exists) | Reopen the month | Unstated | Unstated | GAP — E6's second half: if a close state exists at all, no way back in is named. **This entire table is itself the month-close-and-reopen gap**: the input's own back-dating language for rate changes implies a closed/finalized period must exist somewhere in the system for "back-dating impact, server figures only" to mean anything, yet no `tb_closed_months`-style concept, no close action, and no reopen action or its permission are named anywhere in the 571-line input. |

## Table: Deactivation refusal cases — E8

| Seq | Setup / date | Action | Expected result | Effect on saved data | Source |
|---|---|---|---|---|---|
| 1 | Member is a regular MEMBER or MANAGER, not the sole admin | Deactivate them | Succeeds (no special refusal implied) | Member marked inactive | GAP (mechanism unstated but no refusal implied — see F4 "Cannot delete the last ADMIN" for the closest existing analog, which is about DELETE not deactivate) |
| 2 | Member is the LAST remaining ADMIN | Deactivate them | F4 already states the analogous DELETE refusal: "Cannot delete the last ADMIN | ✅". Deactivation is a materially similar action (it also removes the person's ability to act), but the input NEVER states a parallel refusal for DEACTIVATE — only for DELETE. | Unstated | GAP:CONTRADICTION — F4's stated rule ("cannot delete the last ADMIN") and the v1.27 section's total silence on any deactivation refusal for the same class of person disagree by omission. Applying F4's existing principle (an entity the whole system depends on cannot be removed) to a NEW removal-shaped action (deactivate) that F4 never anticipated is exactly the E8 case: nothing in the input names a refusal for it, and the strand-the-system risk is identical to the DELETE case F4 already recognizes. |
| 3 | Member is the OWNER of a project (the project's sole responsible party, if such a role exists distinctly from "admin") | Deactivate them | Unstated | Unstated | GAP — the input's F2 table separately documents "Cannot delete Internal project" and "Cannot delete project with time entries" as existing refusal precedent for a different entity (project), but states NOTHING about what happens to a project when ITS assigned owner/manager is deactivated, nor whether an owner-role deactivation is itself refused. **This is the "owner cannot be deactivated" gap**: no refusal is stated anywhere in the input for deactivating whichever role the system treats as a project's or the whole system's irreplaceable responsible party, despite F4 already establishing the identical principle for the analogous DELETE action on an ADMIN. |
