# GSD-T: Estimate — Tekyz Client Estimate (T-Shirt Size + Team Mix + Technology Stack)

You are turning a **structured work document** into a **Tekyz client estimate** in a Google Sheet: a **T-Shirt Size** tab (sized line-items → days → dollars), a **Team Mix** tab (who does the work, month by month), and a **Technology Stack** tab. The input can be a GSD-T tech-debt scan register, a gap-analysis sheet, a new-feature or new-application requirements doc, or any comparable spec. `$ARGUMENTS` may carry `--sheet <url>`, `--input <path>`, and a scope override (`--severity high`).

**Scope is the SHEET only.** This command does NOT write a PRD or any other document — a client PRD is `/gsd-t-prd`'s job, run separately if wanted. The one client-facing artifact here is the sheet; the only optional file is `share/<Repo>-estimate-redteam-notes.md` (overridden Red Team objections).

**THE SHEET IS WRITTEN BY A TOOL, NOT BY HAND.** `gsd-t estimate-sheet` (`bin/gsd-t-estimate-sheet.cjs`, project-local `bin/` first, else the global `gsd-t`) reads the sheet, validates a JSON plan, writes all three tabs with the exact formulas and styling, and audits by reading back — halting on any violation. **You never PUT a cell or send a batchUpdate yourself.** Your output is the plan (judgment only: sizes, team FTE, tech-stack lines); the tool computes everything derived. Spec: `~/.claude/templates/estimate-sheet-spec.md` (bundled: `templates/estimate-sheet-spec.md`) — §6 shows the plan shape (`gsd-t estimate-sheet plan-schema` prints it). Procedure background: `~/.claude/playbooks/tekyz-estimation-and-prd-playbook.md` (else `templates/playbooks/`).

> **Client-billed work, not GSD-T build work.** This produces a paid client estimate — the "no cost estimates" rule (`feedback_no_human_hour_estimates`) governs GSD-T's OWN Max-funded build work, NOT client deliverables. Dollar figures here are correct and expected.

## Human-in-the-Loop (MANDATORY — this command is SUPERVISED, not auto)

This process is judgment-heavy. **You (the operator) are the final arbiter of every estimate.** The command does NOT run end-to-end autonomously.

- **Judgment phases PAUSE for review** before advancing: **Step 2 (sizing)**, **Step 2.5 (adjustments)**, **Step 4 (Team Mix roster + ramp)**, **Step 8 (Red Team)**. Present the output, wait for `continue` or corrections.
- **Mechanical phases FLOW but SHOW their result**: Step 1 (numbering), Step 6 (sheet write + audit), Step 7 (reconcile). Don't block, but display what happened so nothing is invisible.
- **Never skip Step 2.5 or Step 8 silently.** Both were skipped on shipped estimates and the operator had to ask for them afterwards. If you skip one, say so in the report and why.
- **Escape hatch:** if the user says e.g. "run through sizing and grouping, then stop," batch those phases and pause where they asked.

## Configuration (parameterized — defaults are Tekyz values)

Read from `$ARGUMENTS` or `.gsd-t/estimate-config.json` if present; otherwise use the Tekyz defaults. **Always name the active values in the report** (no silent defaults). The config is **optional and NOT auto-created** — to override, copy `templates/estimate-config.json` (or `~/.claude/templates/estimate-config.json`) to `.gsd-t/estimate-config.json` and edit. Every field is individually optional.

| Param | Default (Tekyz) | Meaning |
|-------|-----------------|---------|
| `rate` | `$50/hr` | Blended hourly rate for the LOW figure. |
| `hoursPerDay` | `8` | Hours per person-day. |
| `sizeScale` | `XS 0.25 · S 0.5 · M 1 · L 3 · XL 5 · XXL 7` | T-shirt → person-days. |
| `totalMF` | `0.7` | Overhead multiplier. **The sheet's own MF list (`E4:F9`) wins when a sheet exists** — read it, never overwrite it. Hilo sheets run `0.9` (QA .3 · PM .1 · Analysis .1 · Deployment .05 · StdUps/Mtgs .15 · Buffer .2). |
| `highFactor` | `1.25` | HIGH = LOW × this (the sheet's `G4` wins when a sheet exists). |
| `sheetTemplateId` | (blank) | Optional template to clone; normally blank — the operator supplies the target sheet. |
| `gcpProject` | `ai-estimator-415612` | GCP project hosting the permanent Sheets-writer SA. |
| `serviceAccountEmail` | `gsd-t-sheets-writer@ai-estimator-415612.iam.gserviceaccount.com` | **Permanent** SA — share each sheet with this as Editor. |
| `serviceAccountKeyPath` | `~/.claude/gsd-t-secrets/gsd-t-sheets-writer-key.json` | SA key (chmod 600, outside any repo). |
| `newTeamDefault` | `true` | Apply the new-team familiarization adjustment (Step 2.5a) by default. |

## Step 0: Inputs + Scope + Sheet

1. **Resolve the Google Sheet.** Take `--sheet <url>` from `$ARGUMENTS`; otherwise ask: *"Paste the Google Sheet URL for this estimate."* The operator ALWAYS provides an existing sheet — this command never creates one. Extract the **sheet ID** (between `/d/` and the next `/`) and confirm it back.
2. **Probe access + read the layout in one step:** `gsd-t estimate-sheet read --sheet <url>` (then `--tab "T-Shirt Size Estimate"`, `--tab "Team Mix"`). A `403` halt means the sheet is not shared — prompt the operator to share it with the SA email as **Editor** ("Notify people" unchecked), wait, re-run. (The tool never sends `X-Goog-User-Project`; with it these sheets 403 even when shared.)
3. From the read: note the MF list (`E4:F9`), high factor (`G4`), rate (`H4`), whether item rows already exist (→ `sizes` mode) or the tab is empty (→ `items` mode), and whether the Technology Stack tab is filled. The tool reads these again at write time; you read them now so the plan matches the sheet.
4. **Resolve the input document** (`--input`, else `.gsd-t/techdebt.md`). None → "No input document found. Pass `--input <path>` or run `/gsd-t-scan` / `/gsd-t-gap-analysis` first." and stop.
5. **Classify the input** so the line-item vocabulary matches: scan register → *findings* (`TD-n`) scoped by severity; gap-analysis sheet → *gaps* (`GA-n`, rows already on the T-Shirt tab with columns A–D filled — you fill E–G only); requirements / feature / app spec → *requirements* (`FR-n` or the doc's own numbering).
6. **Scope**: scan default = all CRITICAL findings; `--severity high|medium|low|all` widens. Requirements default = all. Confirm scope + item count with the user before sizing.
7. **Confirm the active config values** — rate, MF list (from the sheet), high factor, and whether this is a **new-team project** (Step 2.5a; usually YES for a fresh client).

## Step 1: Numbering hygiene (MECHANICAL — show result)

Client-facing line-items carry **sequential, rational numbering starting at 1**. Renumber ONLY when numbering is absent, non-sequential, or doesn't start at 1 (a crashed-and-rerun scan starting at TD-618 looks bad). Already clean → leave it.

- **Unnumbered** → assign sequential ids (`FR-1, FR-2, …` or `TD-1, …`).
- **Hierarchical** (`1`, `1.1`, `1.1.1`) → preserve the hierarchy; renumber only to make each level sequential within its parent. Never flatten.
- When you DO renumber, do it SAFELY: confirm the id range is contiguous; **range-bounded regex** so you never touch `DC-n` or another project's numbering; scope to CURRENT deliverables only (input doc, plain-English companion, `.gsd-t/scan/*.md`, `docs/*.md`, README, `share/*`, the sheet labels) — **leave `.gsd-t/scan/archive/`, transcripts, heartbeats untouched**; second pass for non-prefixed forms (`| 618 |`, `TD-2/623`, headers); **back up files first**.
- A client that wants the original numbering keeps it — offer, don't force.

## Step 2: Size each line-item (T-Shirt Size tab) — JUDGMENT · PAUSE FOR REVIEW

For each in-scope item build a row per spec §1.2 — `A` Module · `B` User Type · `C` Functionality (**with the item id**) · `D` Low-Level Requirement · `E` Phase · `F` Web Portal size · `G` Backend/API size. `H:L` are formulas, never values.

- **Size each column INDEPENDENTLY** (FE and BE each get their own letter; blank = 0). Scale: **XS 0.25 · S 0.5 · M 1 · L 3 · XL 5 · XXL 7** person-days.
- **Bare codes in `F:G`** — `XS` `S` `M` `L` `XL` `XXL`. Never the legend text (`"XS - Extra Small"`). The lookup happens to compute either way, which is why the long form shipped unnoticed.
- The sheet computes: `Days = F+G` → `MFactor Days = Days × Total MF` → `Total Days` → `LOW $ = Total × 8 × rate` → `HIGH $ = LOW × high factor`.
- **Cluster by fix-shape to size fast**: "add existing guard to N routes" (XS–S, repeated) vs "new backend surface" (M, +FE) vs "config / single route" (XS). Size the cluster once, apply to members.
- **Tune the MF per project** (raise Buffer/QA when confidence is low; raise the high factor above 1.25 for more unknowns) — but change the sheet's MF list only with the operator's say-so.
- **PAUSE:** present the sized rows (or clusters + representative sizes) and the running total (recomputed from raw sizes: `Σ(FE,BE days) × (1 + MF)`). Wait for `continue` or corrections.

## Step 2.5: Estimate Adjustments (familiarization + risk/unknowns) — JUDGMENT · PAUSE FOR REVIEW

Base sizes assume *familiar* devs on *well-understood* work. Adjust for the two things that make real work heavier. Document each adjustment per-item so the client sees **why**. **This step is ON by default (`newTeamDefault: true`) — it was skipped on shipped estimates and had to be asked for.**

**(a) New-team familiarization** — bump each item's SIZE in proportion to its complexity — **NOT the MF** (the Analysis MF is for a Business Analyst, not dev ramp). Trivial config / single route → no bump. Repeated-pattern guards, few routes → +0–1 tier. High-volume sweeps + new-surface builds → +1 tier. Optionally add a one-time **"Codebase Onboarding & Downstream Analysis"** Common line (L–XL), documented as optional.

**(b) R&D / unknown-approach / spike risk** — an item needing research, an unproven approach, or an unknown integration gets an uplift for the uncertainty: bump its SIZE or raise the high factor if unknowns dominate. Name the unknown explicitly ("requires spike: undocumented 3rd-party API").

**⚠️ The scale is NON-LINEAR. M→L is a 3× cliff (1 day → 3 days).** Never push an item across M→L unless it is genuinely multi-day. Cap routine-work bumps at M. Calibration: HILO 21 criticals = $8,700 familiar → $11,730 new-team (+35%, bumps capped at M).

- **PAUSE:** present every adjustment (item, reason, before→after size, total delta). Wait for `continue` or corrections.

## Step 3: Group by domain + section headings (T-Shirt tab)

Reorder items into domains. Insert a **section-heading row** before each group per spec §1.2 (merge `A:L`, bg `#1C4F8B`, white bold Arial 10). **No subtotals.**

- Insert rows with `insertDimension` (it shifts ranges); never write into rows below a summed range.
- After reordering, **re-point EVERY aggregate on the tab**: the totals row, the phase rollups `K4:N7` (their `$E$14:$E$<last>` ranges), and the summary block — then move the summary block BELOW the totals row if the template left it inside the summed range (circular `#REF!` otherwise).

## Step 4: Team Mix — JUDGMENT · PAUSE FOR REVIEW

Your judgment is ONE thing: the FTE per discipline (`teamMix.fte` in the plan — `backend` `frontend` `qa` `pm` `ba`, optionally `techlead` `devops`; per-phase override via `teamMix.phases.<phase>.fte`). Everything else on the tab is computed by the tool per spec §2: the split into people (saturate at 1.00, then spill), months, the column count, the ramp by discipline, the remainder formula — and **one grid per phase with hours** (MVP, Phase 1, …), stacked on the one tab with 2 blank rows between.

0. **The Team Mix staffs the MIDPOINT of the Low and High estimates** — per phase, `(Low Hrs + High Hrs) ÷ 2 ÷ 8` days from that phase's rollups — never the Low figure. The tool computes it; you do not choose it.
1. **Staff every weighted MF factor** — QA → `qa`, PM → `pm`, Analysis → `ba`. Deployment / standups / buffer are absorbed by the engineers and lead. Typical fractions: PM 0.20–0.25 · BA 0.10 · Tech Lead 0.25 · QA 0.40–0.50. The tool HALTS on a roster that leaves a factor unstaffed — do not argue with it; add the person.
2. **Run `gsd-t estimate-sheet plan-check --sheet <url> --plan <plan.json>`.** It prints the MF list it read, the T-Shirt total, and the roster table it WOULD write (person · Count · Mths · Days · Hrs · Mon 1..N with the remainder) — or halts with the violation.
3. **PAUSE:** present that table verbatim. Wait for `continue` or corrections (a resize or a different FTE → edit the plan, re-run plan-check, present again).

## Step 5: Technology Stack

Fill the tab per spec §3 from **internal, grep-able facts** — `docs/architecture.md`, `docs/infrastructure.md`, package manifests, lockfiles, CI config. One row per category that applies (`Frontend` · `Backend` · `Auth` · `Data Store` · `Cache / Session Store` · `Object Storage` · `Events / Webhooks` · `Tools / Integrations` · `LLM / Reasoning` · `Observability` · `Infrastructure`), one plain-English line each with versions where the manifest states them. **Never leave the tab blank and never guess a version** — an unknown is "not determined from the repo", not an invented number.

## Step 6: Write to the Google Sheet + audit (MECHANICAL · show result)

**Write the plan to `.gsd-t/estimate-plan.json`, then run:**

```bash
gsd-t estimate-sheet write --sheet <url> --plan .gsd-t/estimate-plan.json   # add --replace only if the T-Shirt tab already has rows you mean to overwrite
```

It writes the T-Shirt tab (items or sizes mode), the Team Mix, the Technology Stack, re-points every rollup, propagates the Phase dropdown, applies the styling — and then runs the spec §5 audit by reading back, printing every check with ✓/✗. **Exit 4 = a ✗ — fix the plan (or the sheet, for a template problem it names) and re-run. Exit 64 = auth/API/input halt.** Show the tool's output to the operator verbatim. Do not hand-patch cells around the tool; if the tool cannot express something the sheet needs, that is a tool change, and you say so.

**Auth** (used by the tool) = the PERMANENT reusable service account (never create a throwaway, never delete or recreate it — recreation breaks every existing share): email `gsd-t-sheets-writer@ai-estimator-415612.iam.gserviceaccount.com`, project `ai-estimator-415612`, key `~/.claude/gsd-t-secrets/gsd-t-sheets-writer-key.json` (chmod 600, outside any repo). gcloud's `spreadsheets` OAuth scope is Google-blocked, so: read the key, sign an RS256 JWT (`openssl dgst -sha256 -sign`), scope `https://www.googleapis.com/auth/spreadsheets`, exchange at `oauth2.googleapis.com/token` (grant `urn:ietf:params:oauth:grant-type:jwt-bearer`), `exp = now + 3600`, mint fresh each run. If the key file is missing, provision ONCE:

```bash
PROJECT=ai-estimator-415612
SA=gsd-t-sheets-writer@$PROJECT.iam.gserviceaccount.com
KEY=~/.claude/gsd-t-secrets/gsd-t-sheets-writer-key.json
gcloud services enable sheets.googleapis.com --project=$PROJECT
gcloud iam service-accounts describe "$SA" --project=$PROJECT >/dev/null 2>&1 || \
  gcloud iam service-accounts create gsd-t-sheets-writer \
    --display-name="GSD-T Estimate Sheets Writer (permanent, reusable)" --project=$PROJECT
# SA creation is eventually-consistent — poll describe before minting the key
[ -f "$KEY" ] || { mkdir -p ~/.claude/gsd-t-secrets && chmod 700 ~/.claude/gsd-t-secrets && \
  gcloud iam service-accounts keys create "$KEY" --iam-account="$SA" --project=$PROJECT && chmod 600 "$KEY"; }
```

**What the tool does** (spec §0, all learned the hard way — listed so you can recognise a template problem when it halts): no `X-Goog-User-Project` header; every range URL-encoded; Phase cells `copyPaste`d from the sheet's existing dropdown cell (it halts if the template has none — add one to E14); clear-then-paint from the current shape; small batches that halt on the first failure; Team Mix header on row 2 only with `Mon 1..N` + `Total Hrs` derived from the month count; sage on exactly Days / Hrs / Total Hrs; Arial 10; bands across every month column; then the read-back audit. **Any ✗ is fixed before Step 7** — a 200 on the write is not evidence the cell landed.

## Step 7: Verify — reconcile (MECHANICAL · show result)

- `gsd-t estimate-sheet audit --sheet <url>` must exit 0 (it recomputes **T-Shirt `Total Days` == Team Mix `Σ Days`** independently — raw sizes × (1+MF) vs Σ Count × Mths × 20 — and checks every §5 line). A ✗ here after a clean write means someone edited the sheet; find the break before the Red Team.
- **Overview `C2/E2/C3/E3` resolve to numbers** (they reference the T-Shirt rollups `L8/K8/N8/M8`; the estimates index imports exactly these cells).
- If the estimate is linked from the estimates index and shows `#REF!`, that is the one-time `IMPORTRANGE` "Allow access" click — report it for the operator; it is not yours to fix.

## Step 8: Estimate Red Team (adversarial) — JUDGMENT · PAUSE · YOU ARE THE ARBITER

An independent adversarial pass that challenges the estimate before it reaches the client. **Its job is to protect Tekyz from a money-losing under-estimate AND to keep the estimate competitive** (paired realism, per `feedback_red_team_realism_gate` — don't pad every item to XXL).

**What it attacks:**
- **Under-sized items** — "this 'S' implies a DB migration + backfill → really M; +2 days."
- **Missing line-items** — work a requirement implies but nothing sized (migrations, tests, auth, error states, rollout, sandbox issuance, decision cycles with the client, gate-acceptance evidence).
- **Counts that were guessed** — "510 call sites" that measure at 897; re-measure the big ones.
- **Optimistic multipliers** — Buffer/QA too low for the stated confidence; high factor too tight for the unknowns.
- **Adjustment gaps** — an R&D/unknown item sized as if routine; familiarization not applied.
- **Team Mix realism** — a role missing for a weighted MF factor, a flat ramp, a smeared roster.
- **Cross-check integrity** — do the two totals ACTUALLY reconcile, or is a hardcoded cell hiding a break.
- **Assumption / scope gaps** — unstated assumptions that would blow up mid-project (record them on the Overview as assumptions, not padding).

**Verdict:** `FAIL` (material under-estimate or missing scope) / `GRUDGING-PASS` (exhaustive search, nothing material).

### The arbitration protocol (the operator is the final judge — NOT bot ping-pong)

When the Red Team returns `FAIL`, it does **NOT** loop with the skill until it grudgingly passes. It surfaces to **the operator**:

1. **Present each objection PLAINLY:** *what* shouldn't pass, *why*, and *the estimate impact* (item, before→after size, dollar delta). One list, ranked by dollar impact.
2. **The operator decides, per objection:** **Agree** → `continue` → edit the plan and re-run Steps 4, 6, 7 (a resize changes the roster and the month count; the tool recomputes both). **Disagree** → operator gives feedback → **the Red Team argues back** until one side concedes or the operator ends it.
3. **Definitive-decision override:** anything conclusive from the operator ("No more argument. I've decided on X") is accepted immediately, regardless of round count. The Red Team **MAY document its unresolved objection** in `share/<Repo>-estimate-redteam-notes.md` — it does not re-litigate.
4. The Red Team **never self-satisfies into a pass** and **never overrides the operator.**

**PAUSE** at every objection — this phase is inherently interactive.

## Step 9: Deliver

Report: input type + scope + item count; the active config values (rate / MF list / high factor); Total Days and the LOW–HIGH dollar range; the sheet URL; the roster (people × Count, months); the audit checklist result; the Red Team verdict and any documented-but-overridden objections; any `#REF!` awaiting the operator's Allow-access click.

## Document Ripple

- The Google Sheet (external) — T-Shirt Size Estimate, Team Mix, Technology Stack (+ Overview cells verified) + optional `share/<Repo>-estimate-redteam-notes.md`.
- If renumbering (Step 1) ran: the input + plain-English + `scan/*.md` + `docs/*` + README + `share/*` were remapped (archives untouched) — note it in the report so the numbering change is traceable.
- No PRD. A client PRD is `/gsd-t-prd`.

## ▶ Next Up

Standalone command — no auto-successor. After delivering, the user shares the sheet with the client (and runs `/gsd-t-prd` if a PRD is wanted).
