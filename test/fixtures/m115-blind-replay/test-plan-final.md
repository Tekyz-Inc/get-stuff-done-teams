# Rate Ledger — Test Plan

**Status**: DRAFT for David's review, 2026-09-02. Written BEFORE the tests, to drive them.
**Covers**: the Rate Ledger screen, the dated rate list behind it, and what each change does to
time already logged.

---

## How to read this

Each table is a **running sequence**. Row 1 happens, then row 2 happens to that result, and so on.
The "Rate list after" column shows what is stored at that point, so you can see the list grow.

**The last column is the one that matters.** Every rate change either leaves already-logged time
alone or changes what it was worth, and that column says which — because that is the money.

Throughout: **Priya**, cost rate, hours already logged in July at 8 hours a day.

---

## The rule everything rests on

> **A rate applies from its date onward, until another rate starts.**
> Ask what somebody's rate was on any day, and the answer is the newest row dated on or before
> that day.

**"From Jul 15" includes Jul 15 itself.** A whole day of work sits on that boundary.

---

# 1 · Creating rates, one after another

Start: Priya has no rate at all.


| Seq | Date set  | Rate | What happens                                                                   | Rate list after                    | Effect on time already logged                                                                               |
| --- | --------- | ---- | ------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Jul 1     | 20   | New row saved                                                                  | Jul 1 → 20                         | July work now worth 20/hr. Before this, it had **no rate** — shown as a dash and counted, never as zero     |
| 2   | Jul 15    | 25   | New row saved                                                                  | Jul 1 → 20 Jul 15 → 25             | Jul 1–14 stays at 20. **Jul 15 onward becomes 25** — a day already logged on Jul 15 changes from 160 to 200 |
| 3   | Jul 15    | 30   | **A rate already starts that day. Confirm first**, then overwrite              | Jul 1 → 20 Jul 15 → **30**         | Jul 15 onward moves 25 → 30. One row per date, always                                                       |
| 4   | Jul 13    | 28   | Falls **between** two existing rates. Ask: replace Jul 15, or insert before it | *(see 4a / 4b)*                    | Depends on the answer                                                                                       |
| 4a  | ↳ Insert  | 28   | Jul 13 slots in; Jul 15 untouched                                              | Jul 1 → 20 Jul 13 → 28 Jul 15 → 30 | Only **Jul 13–14** changes: 20 → 28. Two days re-priced                                                     |
| 4b  | ↳ Replace | 28   | Jul 15's row is deleted, Jul 13 takes its place                                | Jul 1 → 20 Jul 13 → 28             | **Jul 13 onward** becomes 28. Everything from Jul 15 that was 30 is now 28                                  |
| 5   | Oct 1     | 35   | New row, dated in the future                                                   | Jul 1 → 20 Jul 13 → 28 Oct 1 → 35  | **Nothing changes now.** The cell shows today's rate in **red with a dot** — a later one is waiting         |
| 6   | Nov 1     | 40   | A future rate (Oct 1) exists but has not started → **replaced**, not queued    | Jul 1 → 20 Jul 13 → 28 Nov 1 → 40  | Nothing. Nobody was ever charged at the Oct rate, so it is a correction, not history                        |
| 7   | Jun 1     | 15   | Earlier than every existing row                                                | Jun 1 → 15 Jul 1 → 20 …            | Any June work moves from **no rate** to 15. Confirmed first, with the hours and money named                 |


**What must be true after this sequence:** hovering Priya's cost shows **every** row above, newest
first, each marked *past* / *now* / *not yet*. Showing only the current one is the bug found on
2026-09-02.

---

# 2 · Changing an existing rate

Order does not matter here — each row starts from the same list.

**Starting list:** Jul 1 → 20, Aug 1 → 25, Oct 1 → 35 *(Oct has not started; today is Sep 2)*


| Seq | Change                         | To  | What happens                     | Effect on time already logged                                                                    |
| --- | ------------------------------ | --- | -------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Jul 1 rate                     | 22  | Amount changes, date stays       | **All July work re-priced** 20 → 22. Stated before it commits: the hours and the money           |
| 2   | Aug 1 rate                     | 27  | Amount changes                   | All August work re-priced 25 → 27, likewise stated first                                         |
| 3   | Oct 1 rate                     | 38  | Amount changes                   | **Nothing.** It has not started; nothing has been billed at it                                   |
| 4   | Jul 1 **date** → Jul 10        | —   | Right-click, date only           | Jul 1–9 loses its rate entirely — **a dash and an exception**, not zero. Jul 10 onward unchanged |
| 5   | Aug 1 **date** → Jul 20        | —   | Date moves earlier               | Jul 20–31 jumps from 20 to 25. Eleven days re-priced                                             |
| 6   | Oct 1 **date** → Sep 1         | —   | A future rate becomes a past one | **Sep 1–2 is now re-priced.** A date edit can turn "affects nothing" into "affects real money"   |
| 7   | Remove Aug 1                   | —   | Row deleted                      | August work falls back to the July rate, 20. Stated first                                        |
| 8   | Remove the only remaining rate | —   | **Refused**                      | Nobody is left with no rate at all                                                               |


---

# 3 · Client rates

A person has one default billing rate, and optionally a different rate for a particular client.

**Starting point:** Priya's default billing is 60 from Jul 1. Clients: Hilo, Isar.


| Seq | Action                                              | Rate list after                    | What Hilo is billed     | What Isar is billed | Effect on logged time                                                                    |
| --- | --------------------------------------------------- | ---------------------------------- | ----------------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| 1   | —                                                   | default: Jul 1 → 60                | 60                      | 60                  | Both clients billed 60. Both cells show a **dash** — no override of their own            |
| 2   | Set Hilo 80 from Jul 1                              | default Jul 1 → 60 Hilo Jul 1 → 80 | **80**                  | 60                  | All Hilo work re-priced 60 → 80. Isar untouched                                          |
| 3   | Set Hilo 90 from Aug 1                              | + Hilo Aug 1 → 90                  | 80, then 90 from Aug 1  | 60                  | Hilo work from Aug 1 re-priced again                                                     |
| 4   | Change the **default** to 70 from Aug 1             | + default Aug 1 → 70               | **still 90**            | **70** from Aug 1   | An override is not disturbed by the default moving. Isar follows the default             |
| 5   | Remove Hilo's override                              | Hilo rows gone                     | back to the **default** | 70                  | Hilo work re-priced to whatever the default was on each day — 60 in July, 70 from August |
| 6   | Set an override for a client Priya never worked for | + that client's row                | —                       | —                   | **Nothing.** No error, no phantom invoice line                                           |


**Hovering a client cell with no override** must name the figure actually used — the default —
not show an empty panel.

---

# 3b · Several overrides at once — the case that hides bugs

**Why this section exists.** A test with one override passes whether the code looks up the right
client or simply takes the first row it finds. Both behave identically when there is only one. The
bug appears at the second override and not before, so **one override tests almost nothing**.

**Setup:** Priya's default billing rate is **60** from Jul 1. She works for **six** clients.
**Four have their own rate, all different; two have none.**

| Client | Own rate | What they should be billed |
|---|---|---|
| Hilo Aviation | 80 | **80** |
| Isar | 45 | **45** |
| Big Data Studios | 95 | **95** |
| Coaching AI Avtar | 72 | **72** |
| S2 | — | **60** (the default) |
| Tekyz Inc. | — | **60** (the default) |

| Seq | Do | Expect |
|---|---|---|
| 1 | Read the whole row on the ledger | **Four different figures and two dashes.** Not four copies of 80, not one figure and five dashes |
| 2 | Read each client's cell one at a time | Each shows **its own** rate — 80, 45, 95, 72 — never a neighbour's |
| 3 | Hover each of the four | Each history belongs to **that** client. Hilo's panel never shows Isar's rate |
| 4 | Hover the two with no override | Each names the default, 60 |
| 5 | Log 10 hours against **each** of the six clients | — |
| 6 | Run the invoice | **800, 450, 950, 720, 600, 600.** Every line at its own rate. **A total of 4,120** |
| 7 | Change **Isar only** to 50 | Isar's line becomes 500. **The other five are untouched** — 800, 950, 720, 600, 600 |
| 8 | Remove **Hilo's** override | Hilo falls back to 60 → 600. Isar stays 500. The other four unchanged |
| 9 | Change the **default** to 65 | The two with no override become 650 each. **The three remaining overrides do not move** |
| 10 | Add an override for **S2** at 30 | S2 becomes 300. Tekyz Inc. stays on the default, 650 |

**Row 6 is the one that catches it.** Six figures, four of them different and two identical for a
different reason. Code that returns the first override it finds gives six lots of 800; code that
ignores overrides gives six lots of 600. Either is instantly visible against **4,120**.

**Row 9 is the second trap.** Moving the default must not disturb an override. A test that changes
the default while only one override exists cannot tell the difference between "overrides are
protected" and "there happened to be nothing else to break".

### The same shape, one layer down

| Seq | Do | Expect |
|---|---|---|
| 11 | Give the four overrides **different start dates** — Hilo from Jul 1, Isar from Aug 1, Big Data from Sep 1, Coaching from Oct 1 | Reading as at Aug 15: Hilo 80, Isar 45, Big Data **60** (its override has not started), Coaching **60** |
| 12 | Give **two people** overrides for the **same client** at different rates | Each person is billed their own. One person's override never reaches another |
| 13 | One person, one client, **two dated overrides** | The newest on or before the date wins — the per-client list is a timeline too, not a single value |

---

# 4 · Where it lands: the timesheet and the invoice

Nothing is stored on a time entry. Its worth is worked out when a report asks.


| Seq | Set up                                                     | Do                       | Expect                                                                                                         |
| --- | ---------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1   | Rates exist                                                | Save a time entry        | The entry stores **hours and a date only**. No rate is copied onto it                                          |
| 2   | 8h logged Jul 5, rate 20 from Jul 1                        | Open the invoice         | 160.00                                                                                                         |
| 3   | Change the Jul 1 rate to 25                                | Re-open the same invoice | **200.00.** The correction reaches the past — deliberate                                                       |
| 4   | Add a rate 30 from Aug 1                                   | Re-open the July invoice | **Still 200.00.** A later rate does not reach backwards                                                        |
| 5   | 8h on Jul 31, 8h on Aug 1; rates 25 (Jul 1) and 30 (Aug 1) | Run Jul 1 – Aug 31       | **200 + 240 = 440.** Each day at its own rate, never one flat rate across the range                            |
| 6   | Somebody has no rate at all                                | Run the invoice          | Their hours appear as a **no-rate-set exception with a count** — not 0.00, not silently dropped                |
| 7   | A never-billed person with hours                           | Run the invoice          | Hours sit in the never-billable column, never in revenue                                                       |
| 8   | A **deactivated** person with hours                        | Run the invoice          | **Present and priced normally.** Deactivation hides somebody from pickers, never from a bill                   |
| 9   | The same range twice, nothing changed between              | Compare                  | Identical to the penny                                                                                         |
| 10  | Old rate columns vs the new list                           | Compare a full range     | **Identical, or the milestone stops.** Already passing on the production copy: 6 clients, every figure matched |


---

# 5 · Never-billed and deactivated


| Seq | Set up                                             | Do                                             | Expect                                                                      |
| --- | -------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Any person                                         | Tick never-billed                              | Every field except **Cost** greys out and disables                          |
| 2   | A never-billed person with billing rates recorded  | Untick, then re-tick                           | The rates are **unchanged**. Ticking hides, it never erases                 |
| 3   | A deactivated person                               | Open the ledger                                | Not listed                                                                  |
| 4   | As 3                                               | Turn on **Show Inactive**                      | Listed, on a light blue row                                                 |
| 5   | Somebody both never-billed **and** deactivated     | Show Inactive on                               | Blue wins — the row reads as out of service                                 |
| 6   | A mixed list                                       | Read the default order                         | Billable people A–Z first, then never-billed A–Z                            |
| 7   | A deactivated person                               | Open the time-entry person picker              | Not offered                                                                 |
| 8   | A deactivated person already assigned to a project | Open that project, change something else, save | **Their assignment survives.** Checked on what was saved, not on the screen |
| 9   | A deactivated person                               | Sign in with their password                    | **Refused** — the same message a wrong password gives. It must not say "deactivated", which would tell an outsider the address is a real account |
| 10  | A deactivated person                               | Sign in with Google                            | **Refused**, same message |
| 11  | Somebody **already signed in** when deactivated    | Their next action                              | **Refused, and their session ends.** Blocking the login form alone leaves them working until the session expires |
| 12  | A deactivated person                               | Use the CLI's one-time phrase                  | **Refused** |
| 13  | A deactivated person                               | Use an agent token minted before deactivation  | **Refused** — the token stops working |
| 14  | A reactivated person                               | Sign in                                        | **Allowed**, exactly as before |

**Rows 9–14 were NOT built when this plan was written** (verified 2026-09-02: nothing on any
sign-in path read the on/off flag) and were **built the same day** as REQ-B7 —
`tests/__components__/deactivatedCannotSignIn.test.ts`, at the real routes. **Row 11 is the one
that gets missed** — blocking the form is not the same as ending the session somebody is already
holding; it is proven with a real cookie session.


---

# 6 · Who can see rates

**One rule: only an ADMIN sees a rate, anywhere.** Everyone else sees the app without money in it.

Three access levels exist: **ADMIN**, **MANAGER**, **MEMBER**. "Project Manager" is a **job title**
(one of twelve designations, alongside Developer, QA and the rest) — **it grants no access at all.**
Somebody titled Project Manager sees rates only if their access level is ADMIN, which is a separate
setting. A test that confuses the two proves nothing.


| Seq | Screen or route                                                  | ADMIN                                                                                                     | MANAGER                                 | MEMBER                                  |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| 1   | Rate Ledger screen                                               | **Opens**                                                                                                 | Refused, and the nav entry is not shown | Refused, and the nav entry is not shown |
| 2   | Rate columns on the Team screen                                  | **Visible**                                                                                               | **Hidden**                              | **Hidden**                              |
| 3   | Every rate route (read, set, history, impact, date-edit, remove) | **Allowed**                                                                                               | Refused                                 | Refused                                 |
| 4   | Any rate figure on the timesheet                                 | **Nobody sees a rate on the timesheet — not even an ADMIN.** The timesheet is hours and work, never money |                                         |                                         |
| 5   | Invoice sheet                                                    | **Opens**                                                                                                 | Refused, and the tab is not shown       | Refused, and the tab is not shown       |
| 6   | Writing a rate through the Team screen's save                    | **Refused, naming the Rate Ledger** — the ledger is the only place a rate is set                          | Refused                                 | Refused                                 |


**Each row is tested at the route, not only on screen.** Hiding a tab is not a permission: the
test calls the route directly as each access level and checks it is refused. A screen that hides
what the route would still hand over is not protected.

**Row 4 is the one people get wrong.** It is not "members cannot see rates on the timesheet" — it
is that **the timesheet carries no rate for anybody**. The test reads the response as an ADMIN and
asserts no rate field is present at all.

# 7 · Closing a month

Rates are read live, so correcting an old rate changes what past work was worth. **The system
cannot know what QuickBooks has sent** — so an admin says, by closing the month. A closed month
freezes both the rates that apply inside it and the hours logged in it.

**Setup for every row:** August is closed. Today is Sep 2. Priya has a rate of 25 from Aug 1 and
142 hours logged in August.


| Seq | Who                | Attempt                                    | Expect                                                                                 |
| --- | ------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | Admin              | Tick "close August"                        | Confirm box first. Then closed, showing **who closed it and when**                     |
| 2   | Manager or member  | Look for the close checkbox                | Not there — the whole invoice screen is admin-only                                     |
| 3   | Admin              | Change Priya's Aug 1 rate                  | **Refused**, naming August. The dialog offers **Reopen August**                        |
| 4   | Admin              | Change a rate dated Sep 1                  | **Allowed.** September is open; the closed month does not reach forward                |
| 5   | Admin              | Move a July rate's date to Aug 10          | **Refused.** A date edit that lands inside a closed month is a rate change inside it   |
| 6   | Anyone incl. admin | Log new time dated Aug 20                  | **Refused**: "August is closed. Ask an admin to reopen it." **No reopen button here**  |
| 7   | Anyone incl. admin | Edit an existing August entry              | **Refused**, same message                                                              |
| 8   | Anyone incl. admin | Delete an August entry                     | **Refused**, same message                                                              |
| 9   | Anyone             | Log time dated Sep 1                       | **Allowed**                                                                            |
| 10  | Admin              | Reopen August from the refused rate dialog | Confirm box, no reason required. August reopens; rates and time editable again ti      |
| 11  | Admin              | Now change the Aug 1 rate                  | **Allowed**, with the usual back-dating warning naming 142 hours and the money         |
| 12  | Admin              | Close August again                         | Allowed. The audit trail shows closed → reopened → closed, with who and when each time |
| 13  | Admin              | Close a month that is already closed       | Refused, or the checkbox is already ticked — never a second closing record             |
| 14  | Admin              | Close a month that has not finished yet    | Allowed. Nothing forbids closing early, but nothing dates it automatically either      |


**Row 6 is deliberate.** The reopen is offered on the rate dialog and **not** on the time-entry
screen. Closing happened on the invoice screen; reopening belongs where it can be seen in context,
not behind a save button somebody hit by accident.

**Row 5 is the one that hides.** Changing a rate's *date* so it lands inside a closed month moves
that month's money just as surely as changing the amount. Both are refused.

---

# 8 · Refusals and edges

Two different things live here, and they are tested differently.

**A system error** is a bug or an outage — the screen cannot reach the server. Nothing is designed
around it happening; what is designed is **what the person sees when it does**. One message, and
the real reason written to the log where somebody can find it.

**A refusal** is the system working correctly and saying no. Every one names what is wrong and what
to do about it.

## System errors — one message, always the same

| Seq | What broke | What the person sees | What is logged |
|---|---|---|---|
| 1 | The grid cannot load | **"Something went wrong. Refresh the screen. If it persists, contact your administrator."** and no grid | The real error, with the route and the response |
| 2 | The history cannot load | The same message, inside the panel | The same |
| 3 | Saving a rate fails for an unexpected reason | The same message; **the dialog stays open with what was typed** | The same |

**Never a blank screen, never an empty panel.** An empty grid reads as "no rates" and an empty
history reads as "one rate on record" — both are wrong answers dressed as answers. That second one
is the bug found on 2026-09-02.

**The message never carries the technical reason.** That goes to the log. The person gets one plain
sentence and something to do.

## Refusals — the system saying no, correctly

| Seq | What the person did | What they see |
|---|---|---|
| 4 | Typed a negative amount | Refused, naming the problem |
| 5 | Typed something that is not a number | Refused, naming the problem |
| 6 | Left the date empty | Refused, naming the problem |
| 7 | Typed **more than two decimal places** | Refused: **"Enter a rate with two decimal places or fewer."** Not silently rounded |
| 8 | Entered a date **more than 5 years ahead** | Refused, naming the limit. A rate dated 2124 is a typo, not a plan |
| 9 | Tried to remove somebody's only rate | Refused — nobody is left with no rate at all |
| 10 | Two admins set the same rate at the same moment | One wins; the other is **told** their change did not land. Never a silent overwrite |
| 11 | Tried to deactivate the **owner account** | Refused, naming the account. **Already built** (`index.ts:6266`) — a switched-off owner is a locked-out system, and the last-admin check does not catch it because the owner need not be the last admin |
| 12 | Tried to deactivate **themselves** | Refused. **Already built** |
| 13 | Tried to deactivate the **last remaining admin** | Refused. **Already built** |

**Row 7 has a temptation attached.** Rounding 20.005 to 20.01 looks helpful and is not: the figure
billed would differ from the figure typed, and nobody would know. Refuse, and let them type what
they mean.

---

## What a "pass" means

- A test checks **something a person could read** — a figure, a total, a refusal. Not that a
function was called.
- **Money is compared exactly.** "About right" is not a result.
- A missing rate is a **dash and a counted exception**, never `0.00`. A test that accepts zero for
absent is asserting the bug.
- A test that would pass against an empty screen with the right element ids is not a test.

## How these run

Sections 1, 2 and 3 are unit tests on the rate lookup and the endpoints — fast and exhaustive.
Section 5 and the panel cases are component tests. Section 4 runs end to end against a real
database, because it crosses three screens and the money has to be checked at the far end.

Every test tagged `@regression` at minimum. Anything that writes rows cleans up **by captured id**,
never by a time window.

---

## Rules this plan settled (David, 2026-09-02)

- **Same date twice** → confirm, then overwrite. One row per date.
- **A date between two existing rates** → ask: replace the later one, or insert before it.
- **Back-dating anything** → say how many hours change value and by how much money, first.

## Settled — the question section 4 raised

Section 4 rows 3 and 4 sit oddly together: a *later* rate never reaches backwards, but *correcting*
an old rate changes what past work was worth. Both follow from reading the rate list live.

**The answer is section 7.** Correcting an old rate is allowed while the month is open, and refused
once it is closed — because closing is how an admin says "these invoices have gone out". The system
cannot see QuickBooks, so a person draws the line.

In practice the admin takes the refusal and raises a credit in the following month. Reopening is
the exception, for a month closed by accident or a change big enough to re-issue.

**Section 7 was NOT built when this plan was written** — REQ-A16. **Built 2026-09-02**, the same
day as the tests: `tests/__components__/rateClosedMonths.test.ts` (every row, at the routes) and
`rateClosedMonthScreens.test.tsx` (the checkbox and the reopen offer). Rows 7 and 8 of §8 (two
decimals, five years), §1 seq 3 and 4 (same date, between) and the three-label history were built
the same day; each is asserted where its gap was recorded.