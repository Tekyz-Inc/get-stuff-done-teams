# Rate Ledger — Test Plan

**Status**: DRAFT for David's review, 2026-09-02. Written BEFORE the tests, to drive them.
**Covers**: v1.27 — the Rate Ledger screen, the dated rate list behind it, and how a rate reaches
the timesheet and the invoice.

---

## Why this document exists

The Rate Ledger shipped with 47 unit tests and David found a bug in the first ten minutes of
using it. That is not bad luck. **The 47 tests check one thing at a time — given this state, draw
that. Not one of them sets a rate, changes it, and then asks what the screen shows.** The bug lives
exactly in the gap between those two.

So the plan is organised around **what a person does**, not around what is easy to unit-test.
Every case below is a sequence: set something up, change it, then check what a reader sees —
on the ledger, on the timesheet, and on the invoice.

### The bug that proves the point (found 2026-09-02, fixing now)

David changed a rate that had been in effect since Aug 1 to a new one starting today. Both rows
are in the database, correctly. **The hover panel shows only the new one.**

The cause: the screen builds its "history" from the GRID response, which returns one rate per
person — the one in effect today — plus a flag saying a future one exists. There is a real history
endpoint (`GET /api/rates/:userId/history`). **The screen never calls it.**

No test caught this because no test performs the sequence *set a rate → change it → read the
history*. **Case H2 below is that test.**

---

## What a "pass" means here

- A test asserts a **value a person could read** — a figure on screen, a total on an invoice, a
  refusal message. Not that a function was called.
- A test that would pass against an empty screen with the right element ids is not a test.
- **Money is compared exactly.** "About right" is not a result.
- A missing rate must render as a **dash and a counted exception**, never as `0.00`. Any test that
  accepts zero for absent is asserting the bug.

---

# A · The timeline — one figure, many dates

The core of the feature: a rate is not a number, it is a list of dated rows, and a report asks
what applied on a given day.

| # | Set up | Do | Expect |
|---|---|---|---|
| **A1** | No rate for a person | Read their cost | A dash, and the person counted as an exception. **Never `0.00`.** |
| **A2** | One rate from Aug 1 | Read the cost as at Aug 15 | That rate |
| **A3** | One rate from Aug 1 | Read it as at Jul 31 — the day before | A dash. A rate does not apply before it starts |
| **A4** | Rates from Aug 1 and Sep 1 | Read as at Aug 31, Sep 1, Sep 2 | Aug rate, Sep rate, Sep rate. **Sep 1 itself uses the Sep rate** — "from" includes the day named |
| **A5** | Rates from Aug 1, Sep 1, Oct 1 | Read as at each boundary and between | The latest row on or before the date, every time |
| **A6** | Two rows with the SAME date | Read it | One answer, deterministically — and the screen must not offer a way to create this |
| **A7** | A rate dated far in the future | Read today | Today's rate, not the future one |

---

# B · Setting and changing a rate

| # | Set up | Do | Expect |
|---|---|---|---|
| **B1** | No rate | Set 20.00 from today | Stored; the cell shows 20.00 plainly |
| **B2** | A rate in effect since Aug 1 | Set a new one from today | **BOTH rows exist.** The cell shows the new one; the history shows both — *this is the reported bug* |
| **B3** | A rate in effect since Aug 1 | Set a new one from Oct 1 | Both rows exist. The cell shows the Aug rate **in red with a dot**; the history marks Oct "not yet" |
| **B4** | A rate queued from Oct 1, not started | Set a different one from Nov 1 | The Oct row is **REPLACED**, not queued behind. One future row remains, not two |
| **B5** | As B4 | Before it commits | The dialog says plainly that the waiting rate will be replaced |
| **B6** | A rate in effect since Aug 1, with hours logged | Set one from Jul 1 — back-dated | The dialog first states **how many recorded hours change value and by how much money**, and does not commit until confirmed |
| **B7** | Any rate | Set a negative amount | Refused, with a message naming the problem |
| **B8** | Any rate | Set a non-numeric amount | Refused |
| **B9** | Any rate | Set with no date | Refused |
| **B10** | A person's only rate | Remove it | Refused — a person is not left with no rate at all |
| **B11** | Two dated rates | Remove the older one | Allowed; the newer one stands, history shows one row |

---

# C · Client overrides — the second dimension

| # | Set up | Do | Expect |
|---|---|---|---|
| **C1** | Default billing 60, no override for Hilo | Read Hilo's cell | **A dash** — never the inherited 60 |
| **C2** | As C1 | Hover Hilo's cell | It names the figure actually used: the default, 60 |
| **C3** | Default 60; Hilo override 80 | Read Hilo, and read another client | 80 for Hilo; a dash for the other |
| **C4** | Default 60 from Aug 1; Hilo 80 from Sep 1 | Read Hilo as at Aug 15, then Sep 15 | **60** (no override yet), then **80** |
| **C5** | Hilo override 80 from Aug 1; default changes to 70 from Sep 1 | Read Hilo as at Sep 15 | **80.** An override is not disturbed by the default moving |
| **C6** | Hilo override exists | Clear it | The cell returns to a dash; the client is billed the default again |
| **C7** | Overrides for three clients, one person | Read the row | Three figures and dashes elsewhere — readable down the column |
| **C8** | Override for a client the person never worked for | Read the invoice | The override is simply unused. No error, no phantom line |

---

# D · Never-billed and deactivated — the two flags

| # | Set up | Do | Expect |
|---|---|---|---|
| **D1** | A never-billed person | Read their row | Every field except Cost greyed and disabled |
| **D2** | A never-billed person with billing rates already recorded | Untick, then re-tick | The recorded rates are **unchanged** — ticking hides, it never erases |
| **D3** | A deactivated person | Read the ledger with Show Inactive off | Not listed |
| **D4** | As D3 | Turn Show Inactive on | Listed, on a light blue row |
| **D5** | Somebody both never-billed AND deactivated | Show Inactive on | Blue wins — the row reads as out of service, not as never-billed |
| **D6** | A deactivated person with hours logged | Open the invoice | **They still appear.** Deactivation hides a person from pickers, never from a bill |
| **D7** | A mixed list | Read the default order | Billable people A–Z first, then never-billed A–Z. (`is_billable` ascending: false…no — **billable first, never-billed last**) |
| **D8** | A deactivated person | Open the time-entry person picker | Not offered |
| **D9** | A deactivated person already assigned to a project | Open that project, change something else, save | **Their assignment survives.** Assert on the saved payload, not the screen |

---

# E · The history panel — where the bug was

| # | Set up | Do | Expect |
|---|---|---|---|
| **H1** | One rate | Hover the figure | One line, marked "now" |
| **H2** | A rate from Aug 1, then a new one from today | Hover | **TWO lines.** Today's marked "now", Aug's shown as past — *the reported bug* |
| **H3** | Rates from Aug 1, Sep 1 and Oct 1 (future) | Hover | Three lines, newest first, marked past / now / not yet |
| **H4** | A client cell with no override | Hover | Not an empty panel — it names the default actually being used |
| **H5** | Five or more dated rates | Hover | All of them, ordered, readable |
| **H6** | Any figure | Reach it by keyboard alone | The panel opens on focus, not only on hover |

---

# F · Through to the timesheet

| # | Set up | Do | Expect |
|---|---|---|---|
| **F1** | Rates exist | Save a time entry | The entry stores **hours and a date only** — no rate is copied onto it |
| **F2** | An entry logged Aug 15; the rate later changes from Sep 1 | Read the entry's worth | Still the August rate. The later rate does not reach backwards |
| **F3** | An entry logged Aug 15; the August rate is then **corrected** | Read the entry's worth | The corrected figure. This is the live-timeline behaviour, and it is deliberate |
| **F4** | A member (not admin) reads their own entries | Inspect the response | **No rate figure of any kind.** This is the rule that outlived `hourly_rate_snapshot` |
| **F5** | An admin reads the same entries | Inspect the response | Rates present |
| **F6** | Saving with the ledger populated | Time the save | No rate lookup happens during a save (RULE-P-1). The save path must not get slower |

---

# G · Through to the invoice — the money

**The load-bearing group.** Every figure here is compared exactly.

| # | Set up | Do | Expect |
|---|---|---|---|
| **G1** | Every person has a cost rate | Run the invoice for a range | Cost per client matches hours × the rate in effect on each entry's own date |
| **G2** | One person has **no** rate | Run the invoice | Their hours appear as a **no-rate-set exception with a count**, not as `0.00` and not silently dropped |
| **G3** | A rate changes mid-range (Aug 1 → 20, Sep 1 → 25) | Run Aug 15 – Sep 15 | Each day priced at its own rate. **Not one flat rate across the range** |
| **G4** | Default billing 60; Hilo override 80 | Run the invoice | Hilo's lines at 80, every other client at 60 |
| **G5** | A never-billed person with hours | Run the invoice | Their hours are in the never-billable column, never in revenue |
| **G6** | A deactivated person with hours | Run the invoice | Present and priced normally |
| **G7** | The same range, run twice with no change between | Compare | Identical, to the penny |
| **G8** | A past rate is corrected | Re-run a past range | Totals change, and that is correct — a correction is meant to reach the invoice |
| **G9** | **The migration gate.** Totals from the old columns vs the ledger | Compare | **Identical. If not, the milestone stops.** Already passing on the production copy: 6 clients, all match |

---

# H · Permissions

| # | Who | Do | Expect |
|---|---|---|---|
| **P1** | Member | Open the Rate Ledger | Refused; the nav entry is not shown |
| **P2** | Manager | Open the Rate Ledger | Refused |
| **P3** | Admin | Open it | Allowed |
| **P4** | Member | Call the rate endpoints directly | 403 on every one |
| **P5** | Anyone incl. admin | Write a rate through `PUT /api/users/:id` | **Refused**, naming the Rate Ledger. Not silently ignored |
| **P6** | Member | Read a time entry | No rate figure in the response (same rule as F4) |

---

# I · Refusals and edges

| # | Case | Expect |
|---|---|---|
| **X1** | The grid cannot load | The screen says so and shows nothing, rather than an empty grid that reads as "no rates" |
| **X2** | Setting a rate fails at the server | The refusal message is shown **verbatim**, and the dialog stays open with the input intact |
| **X3** | Two admins set the same rate at once | One wins; the other is told. Never a silent overwrite |
| **X4** | A rate for a person who no longer exists | Refused, not orphaned |
| **X5** | A rate dated 100 years out | Allowed but shown as not-yet; it must not break the ordering |
| **X6** | An amount with more than two decimals | Rounded predictably, and the same figure comes back on read |

---

## How these run

- **A, B, C** — unit tests on the resolver and the endpoints (vitest). Fast, exhaustive.
- **D, E, H (panel)** — component tests (vitest + testing-library) on the real components.
- **F, G** — end-to-end against a live database, because they cross three screens and the money
  must be checked at the far end.
- **P, X** — a mix: permission checks at the endpoint, refusal behaviour in the component.

**Every test tagged** `@regression` at minimum, per the project's tag gate. E2E specs that write
rows clean up **by captured id**, never by a time window.

---

## What I am NOT claiming

This plan does not cover the whole app — only the rate feature and its two downstream readers.
The wider E2E suite has 37 pre-existing local failures unrelated to this work; the bar for this
milestone is that number does not grow, not that it reaches zero.

---

## Open for David

1. **F3 vs F2** — a *later* rate does not reach backwards, but *correcting* an old rate does change
   what past work was worth. Both follow from reading the timeline live. Confirm that is what you
   want, since it is the one behaviour that surprises people.
2. **A6** — two rates on the same date. I plan to refuse it at the endpoint. Say if you would rather
   the later write simply replace the earlier one.
3. **X6** — rounding. I plan to store what is typed and display two decimals. Say if invoices need
   a different rule.
