# GSD-T: Estimate — Tekyz Client Estimate + PRD from a Scan

You are turning a completed GSD-T tech-debt scan into a **Tekyz client estimate** (a Google Sheet with a T-Shirt-Size tab + a Team-Mix cross-check) and a matching **PRD deliverable**. `$ARGUMENTS` may carry a scope override (e.g. `--severity high`).

**Full proven procedure:** read `~/.claude/playbooks/tekyz-estimation-and-prd-playbook.md` if present, else the bundled copy `templates/playbooks/tekyz-estimation-and-prd-playbook.md` in the GSD-T package (7 phases, produced on the HILO Figma ATOS project: 21 criticals → 32.73 eng-days → $13,090–$16,362). Supporting memories (in the originating project's memory dir): `tekyz-estimation-method`, `tekyz-familiarization-bump`, `tekyz-client-prd-structure`, `tekyz-tech-debt-numbering-caution`, `google-sheets-service-account-workaround`. This skill ENCODES those; read them for edge-case depth.

> **Client-billed work, not GSD-T build work.** This produces a paid client estimate — the "no cost estimates" rule (`feedback_no_human_hour_estimates`) governs GSD-T's OWN Max-funded build work, NOT client deliverables. Dollar figures here are correct and expected.

## Step 0: Inputs + Scope

1. Read `.gsd-t/techdebt.md` (the register). If absent → "No scan register found. Run `/gsd-t-scan` first." and stop.
2. **Scope** (from `$ARGUMENTS`): default = **all CRITICAL findings** ("close the critical gap"). `--severity high` (or `medium`/`low`/`all`) widens it. Confirm the scope + finding count with the user before sizing.
3. Confirm you have (or ask the user for):
   - A copy of the Tekyz estimate template Google Sheet (tabs: **Overview**, **T-Shirt Size Estimate**, **Team Mix**, **Technology Stack**) + its sheet ID.
   - The GCP project id for the service-account write path (Phase 5).
4. Decide whether this is a **new-team project** (triggers the familiarization bump, Step 3.5) — usually YES for a fresh client.

## Step 1: Renumber for the client (if scan TDs start high)

GSD-T continues TD numbering across scans (never resets) — a fresh/crashed-and-rerun scan can start at e.g. TD-618, which looks bad to a client ("why does finding #1 start at 618?"). **For a new client project, renumber the deliverables to start at TD-1.** (`tekyz-tech-debt-numbering-caution`.)

Renumber SAFELY (numbering-only, zero value changes):
- **Confirm the register IDs are contiguous** (`min..max`, no gaps) first, so a blind offset (`subtract base−1`) aligns.
- **Range-bounded regex** — remap ONLY numbers in the register's actual range, so you never corrupt `DC-n`, another project's `TD-4`, or a different repo's numbering.
- **Scope to CURRENT deliverables only:** register, plain-English companion, `.gsd-t/scan/*.md`, `docs/*.md`, README, the PRD, `share/*`, and the Google Sheet labels. **Leave `.gsd-t/scan/archive/`, transcripts, heartbeats UNTOUCHED** (historical run numbering).
- **Second pass for non-`TD-` formats:** bare `| 618 |` table cells, slashed chains (`TD-2/623`, `626/629/631`), header text ("begins at TD-618"). A first-pass `TD-NNN` regex misses these.
- **Back up files before the bulk edit.**
- Offer this as an option; a client that wants the original numbering keeps it.

## Step 2: Size each finding (T-Shirt Size tab)

For each in-scope finding, build a row — cols **A** Module · **B** User Type · **C** Functionality (**include the `(TD-n)`**) · **D** Low-Level Requirement · **E** Phase (MVP) · **F** Web Portal (frontend) size · **G** Backend/API size. **Leave H–L (formulas) alone.**

- **Size each column INDEPENDENTLY** (FE and BE each get their own letter; blank = 0). Sizes: **XS 0.25 · S 0.5 · M 1 · L 3 · XL 5 · XXL 7** person-days.
- The sheet computes: `Days = F+G` · `MFactor Days = Days × Total MF` · `Total Days = Days + MFactor` · `LOW $ = Total × 8hrs × $50/hr` · `HIGH $ = LOW × High Factor (1.25)`. **Ignore the Phase column.**
- **Cluster by fix-shape to size fast:** "add existing auth guard to N routes" (XS–S, repeated pattern) vs "new backend surface" (M, +FE) vs "config / single route" (XS). Size the cluster once, apply to its members.
- **Tune the MF per project:** `Total MF` (default 0.7) = QA 0.3 + PM 0.1 + Analysis 0.05 + Deployment 0.05 + Buffer 0.2. Raise Buffer/QA when confidence is low; raise **High Factor** above 1.25 for more unknowns.

## Step 2.5: Familiarization bump (new-team projects only)

Base sizes assume *familiar* devs. For a team new to the codebase, add ramp by **bumping each item's SIZE in proportion to its complexity — NOT the MF** (the Analysis MF is for a Business Analyst, not dev ramp). (`tekyz-familiarization-bump`.)

- Trivial config / single-route → **no bump**. Repeated-pattern guards, few routes → **+0–1 tier**. High-volume sweeps + new-surface builds → **+1 tier**.
- **⚠️ The scale is NON-LINEAR. M→L is a 3× cliff (1 day → 3 days).** A blind one-tier bump across M→L doubles the total. **Never push an item across M→L unless it is genuinely multi-day.** Cap bumps at M for routine work.
- Optionally add a one-time **"Codebase Onboarding & Downstream Analysis"** Common line (sized L–XL) for initial ramp on a large repo — separate from per-task build. Document it as an optional line the client can remove.
- Reference calibration: HILO 21 criticals = $8,700 familiar → $11,730 new-team (+35%, bumps capped at M) → $13,090 incl Project Setup.

## Step 3: Group by domain + blue headings (T-Shirt tab)

Reorder items into domains (**A–G to match the PRD sections**). Insert a **blue section-heading row** before each group (merge A:L, white bold on blue). **No subtotals** (they complicate formulas).

- **After reordering, WIDEN the rollup SUMIF ranges** (e.g. `E19:En`). Writing cells does NOT auto-expand hardcoded ranges — only `insertDimension` shifts them. A missed widen silently under-counts the total.

## Step 4: Team Mix cross-check

`Count` = fractional headcount per role (e.g. Backend 0.75 = one BE dev at 75% over the window). `Days (E) = Month(D) × 20` · `Total Days = Days × Count`.

- **Solve `Month` (D5:D12)** so `sum(Count) × (Month×20) = the T-shirt total`. Sync the Resource (J) column.
- **Check for hardcoded cells** breaking the formula chain (restore `=E×B`, `=J` where a static number was pasted — the Testing row is a known offender).
- **Verify BOTH halves (F13, J13) equal the T-shirt total.**

## Step 5: Write to the Google Sheet (service-account path)

**gcloud's `spreadsheets` scope is blocked by Google** — use a throwaway service account (`google-sheets-service-account-workaround`):

1. Confirm Sheets API enabled: `gcloud services list --enabled --project=<proj> --filter="config.name:sheets.googleapis.com"` (else `gcloud services enable sheets.googleapis.com`).
2. Create a THROWAWAY SA (don't reuse a prod SA): `gcloud iam service-accounts create sheets-writer-tmp --project=<proj>`. **SA creation is eventually-consistent** — poll `describe` before minting the key.
3. Mint a key: `gcloud iam service-accounts keys create key.json --iam-account=sheets-writer-tmp@<proj>.iam.gserviceaccount.com`.
4. **PROMPT THE USER to share the sheet with the SA email as Editor** — the robot has no access until shared. (If the SA is deleted+recreated the identity changes → must re-share even if the email string is identical.)
5. Sign a JWT (RS256 via `openssl dgst -sha256 -sign key.pem`), scope `https://www.googleapis.com/auth/spreadsheets`, exchange at `oauth2.googleapis.com/token`, call Sheets v4 REST (`values.../PUT?valueInputOption=USER_ENTERED` for cells; `:batchUpdate` for inserts/formatting/merges). Pure Python stdlib + openssl, no libs. **URL-encode sheet ranges** (spaces in tab names break the URL). Token expires in 1h — regenerate.
6. **CLEANUP:** `gcloud iam service-accounts delete` the throwaway SA (removes its keys) + `rm` the local key — but leave the SA alive until the user confirms they're done editing, to avoid re-share churn.

## Step 6: Generate the PRD

**ONE document** (ATOS contractor-handoff template, sections 0–15) with **domain sub-sections (A–G) inside each numbered section** — not one PRD per item. (`tekyz-client-prd-structure`.)

- **§0 Metadata + top-of-doc ⚠️ Estimate Basis & Disclaimer** — planning estimates, NOT a quote/bid/fixed price; will change; no not-to-exceed; no delivery guarantee. **Purge all quote/fixed/guarantee/binding language.**
- **§3.0 FR↔TD crosswalk** — per-domain tables (Requirement · Finding · Fix). `FR-xN` (domain-sequenced requirement id) and `TD-n` (permanent scan finding id) do NOT run in parallel — always crosswalk them.
- **§3.1 FR tables** — a **dedicated Finding column** (never bury `TD-n` in trailing prose).
- **§3.2 NFR** — an **"Applies to" column listing EVERY `TD-n`** each cross-cutting NFR touches.
- **§4 enforcement, §8 API, §10 estimate** — explicit `TD-n` refs (not bare numbers).
- **§10 total MUST equal the live sheet rollup** — verify against the sheet's rollup cell, not memory. Watch that Project Setup carries its MF (M/M = 2 raw → 3.4 total, not 2.0). Point-in-time sync is fine; note it.
- **§15 sign-off = "Approved to proceed (scope, not fixed cost)".**
- Group tables **by domain with a bold header per group** (no repeating "Domain" column — reads as broken).
- **Save to `share/<Repo-Name>-PRD-*.md`** (repo-name prefix, matching `/gsd-t-scan`'s `share/` convention).

## Step 7: Verify + Deliver

**Reconcile the three totals — they MUST agree:** T-Shirt Size total = Team Mix total (F13/J13) = PRD §10 total. If any differ, find the break (usually a hardcoded cell or an un-widened SUMIF range) and fix before reporting done.

All client-facing files land in `share/` with the repo-name prefix. Report: scope + finding count, the eng-days + LOW–HIGH dollar range, the sheet URL, and the PRD path.

## Document Ripple

- `share/<Repo>-PRD-*.md` (new PRD deliverable) + the Google Sheet (external).
- If renumbering (Step 1) ran: the register + plain-English + `scan/*.md` + `docs/*` + README + `share/*` were remapped (archives untouched) — note it in the report so the numbering change is traceable.

## ▶ Next Up

Standalone command — no auto-successor. After delivering, the user shares the sheet + PRD with the client.
