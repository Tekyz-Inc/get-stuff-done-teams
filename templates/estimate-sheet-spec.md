# Tekyz Estimate Sheet — Structure & Formatting Spec

The exact layout, formulas, and styling of the three tabs `/gsd-t-estimate` writes:
**T-Shirt Size Estimate**, **Team Mix**, **Technology Stack** (plus the **Overview** cells
the estimates index reads). Every rule here came from a real correction on a real client
sheet (Hilo ATOS, Sep 2026). **Read this before writing a single cell. Re-read the target
sheet's actual layout before writing — layouts drift between estimates.**

Reference implementation (read it, don't guess): "ATP SOW Gap Analysis and Estimate"
`1jHWUUi68YyJjCI5cXcbDVOFTAKxYWPx3KaXwQSqQK28` — Team Mix tab is the hand-revised
2026-09-17 layout; T-Shirt tab is the current template.

---

## 0. Universal rules (every tab)

| Rule | Why it exists |
|---|---|
| **Read before write.** Dump the tab (`includeGridData=true`) and derive every coordinate from what is there. Never write from remembered coordinates. | The header was row 2; a second header was written into row 3 from memory, doubling every label. |
| **Formulas, not values, for anything derived.** Only judgment inputs (sizes, Count, Mths, ramped month hours) are values. | Values computed in Python drifted from the row total by rounding and could not be audited on the sheet. |
| **Clear, then paint.** Before restyling, clear `userEnteredFormat` below the last data row and right of the last data column (to ~row 60 / col Z). Then paint the area computed from the CURRENT shape. | Row/column counts change between runs; bands stayed stranded outside the data and new columns went unformatted. |
| **Small batches, halt on the first failure.** `mergeCells`, `deleteDimension`, `insertDimension` each in their own `batchUpdate`; cell paints in batches ≤ 50 requests; the first failing batch STOPS the run and reports what landed — later batches are not sent, and the audit shows the partial state. Never continue past a failed batch. | One malformed request killed a whole batch; formatting was half-applied with no error on the cells that never painted. `mergeCells` on an already-merged range 400s — unmerge first. |
| **Verify by reading back**, never by the 200. After every restyle dump background colour, font, validation, and formulas for the data area and compare to this spec. | Wrong colours and a missing dropdown look identical to correct ones until someone clicks. |
| **URL-encode every range** (`urllib.parse.quote`). Tab names have spaces. | `'T-Shirt Size Estimate'!A19` breaks the URL unencoded. |
| **Do NOT send `X-Goog-User-Project`.** A 403 with it present is the header, not an unshared sheet. Retry without it BEFORE telling the operator to share. | The operator was asked to share an already-shared sheet twice. |
| **Insert rows with `insertDimension`**, never write into rows below a summed range. Then re-point EVERY aggregate on the tab (totals row, phase rollups, summary block). | A `SUMIF($E$18:$E$19,…)` kept summing one stale row and rendered a plausible $1,000. |
| **Map sheet rows to items BY NAME, not by counting.** | Section header rows shift positional alignment and put a whole column on the wrong tasks. |
| **Recompute the total from raw sizes independently** (`Σ(FE,BE days) × (1 + MF)`) before reporting a number. | A total was reported from a cell just repaired; the true figure differed by 13 days. |
| **`IMPORTRANGE` `#REF!` on the index sheet needs a human "Allow access" click.** Report it; do not "fix" it. | The service account cannot grant it. |
| Access token expires in 1 h — mint fresh per run; regenerate on a sudden 401. | |

---

## 1. T-Shirt Size Estimate tab

### 1.1 Fixed header block (rows 1–13) — READ these, never overwrite them

| Cells | Content | Style |
|---|---|---|
| `A1` | `Date Submitted` | bg `#D9D9D9`, bold, Calibri |
| `B1` | date `mm/dd/yyyy` | Calibri 11, left |
| `A3:B3` | `Legends` / `Person Days` | bg `#3D85C6`, white bold Calibri |
| `A4:B9` | **Size legend** — `XS - Extra Small` 0.25 · `S - Small` 0.5 · `M - Medium` 1 · `L - Large` 3 · `XL - Extra Large` 5 · `XXL - Extra Extra Large` 7 | Calibri, right |
| `E3` | `Multiplication Factor` | bg `#3D85C6`, white bold |
| `E4:F9` | **MF list** — one row per factor (e.g. `QA` 0.3 · `PM` 0.1 · `Analysis` 0.1 · `Deployment` 0.05 · `StdUps/Mtgs` 0.15 · `Buffer` 0.2). **Read the live list — it varies per sheet and is the roster contract for Team Mix (§2.4).** | |
| `E10:F10` | `Total MF` = `=sum(F4:F9)` | bg `#C9DAF8`, bold |
| `G3` / `G4` | `High $ Factor` / value (1.25 default; 1.3 seen) | |
| `H3` / `H4` | `Avg. Hrly Rate` / `$50.00` | nf `"$"#,##0.00` |
| `J3:N3` | phase rollup headers: (blank) · `Low ($)` · `Low Hrs` · `High ($)` · `High Hrs` | bg `#3D85C6`, white bold |
| `J4:J7` | `MVP` · `Phase 1` · `Phase 2` · `Phase 3` | bg `#3D85C6`, white bold |
| `K4:N7` | `=SUMIF($E$14:$E$<last>,$J4,$K$14:$K$<last>)` · `=SUMIF(…,$J$14:$J$<last>)*8` · `=SUMIF(…,$L$14:$L$<last>)` · `=IF($H$4=0,0,M4/$H$4)` — **`<last>` must equal the last item row; re-point after every insert** | bold, `$` / `0.00` |
| `J8:N8` | `Totals` · `=SUM(K4:K7)` … | bg `#9FC5E8`, bold |
| `E12` / `F12:G12` / `H12:L12` | `Phase` / `Complexity` (merged) / `Effort & Cost Breakdown` (merged) | bg `#F9CB9C` / `#A2C4C9` / `#B6D7A8`, bold, centered |
| `A13:L13` | `Module/Functionality` · `User Type` · `Functionality` · `Low Level Requirements` · `Phase` · `Web Portal` · `Backend/API` · `Days` · `MFactor Days` · `Total Days` · `LOW $` · `HIGH $` | bg `#F3F3F3` (C–D `#E8E8E8`), bold Calibri; H–L right |

Column widths: `[150, 120, 300, 430, 122, 90, 90, 61, 53, 76, 81, 81]`.

### 1.2 Body (row 14 → last item)

**Section heading row** — one per domain group: text in `A` (e.g. `A. AUTH & TRANSPORT CONTRACT`), **merge `A:L`**, bg `#1C4F8B`, white bold **Arial 10**, left. Nothing else on the row. No subtotals.

**Item row** — Calibri 10, left for text, centered for `E:G`, right for `H:L`:

| Col | Content | Rule |
|---|---|---|
| `A` | Module | |
| `B` | User type | |
| `C` | Functionality — **include the item id** `(GA-n)` / `(TD-n)` / `(FR-n)` | |
| `D` | Low-level requirement (one or two sentences) | |
| `E` | Phase — `MVP` / `Phase 1` / `Phase 2` / `Phase 3` | **Carries a `ONE_OF_LIST` validation + chip format. Populate by `copyPaste` (`PASTE_NORMAL`) from an existing MVP cell — a values-write drops the dropdown.** |
| `F` | Web Portal (frontend) size | **Bare code only: `XS` `S` `M` `L` `XL` `XXL`. Never the legend text `"XS - Extra Small"`.** Blank = 0. |
| `G` | Backend/API size | same |
| `H` | `=(IF(F{r}="",0,SUMIF($A$4:$A$9,LEFT(F{r},2)&"*",$B$4:$B$9))+IF(G{r}="",0,SUMIF($A$4:$A$9,LEFT(G{r},2)&"*",$B$4:$B$9)))` | the working legend lookup — `LEFT(size,2)&"*"` against the legend labels |
| `I` | `=H{r}*$F$10` | |
| `J` | `=H{r}+I{r}` | |
| `K` | `=J{r}*8*$H$4` | nf `$#,##0.00` |
| `L` | `=K{r}*$G$4` | nf `$#,##0.00` |

### 1.3 Totals and summary (directly under the last item — NO blank rows)

```
<last item row>
Total (Days) | … | H =SUM(H14:H<last>) | I =SUM(I…) | J =SUM(J…) | K =SUM(K…) | L =SUM(L…)     ← bg #D8DDE8, bold 10, A:L
                                       J: Total Days | K: =J<tot>       | L: =J<tot>*$G$4      ← label bold, 0.00
                                       J: Total Hrs  | K: =J<tot>*8     | L: =J<tot>*$G$4*8    ← label bold, 0.00
                                       J: Total Cost | K: =K<tot>       | L: =L<tot>           ← label bold, $#,##0.00
```

- The totals row is the template's grey band (`#D8DDE8`, bold, size 10) across `A:L`; its numbers stay in General format (`79.25`, `158.5`, `63400`).
- No blank row above or below the totals row (David, 2026-09-21).
- **The summary block never sits inside the summed range** (the template ships it at rows 18–20, which becomes circular `#REF!` once items extend past it).

---

## 2. Team Mix tab (David's 2026-09-17 layout · one grid per phase, 2026-09-21)

### 2.1 Layout of ONE grid

```
Row t   Title  — EXACTLY the phase name: "MVP" / "Phase 1" / …  (merged A:<Total Hrs col>; nothing else in it)
Row t+1 Header (the ONLY header row in the grid)
Row t+2.. one row PER PERSON
Row T   Total        (T = t + 2 + nroles)
Row T+1 Total Days   (right half only, H onward)
```

**One grid per phase with hours** (§2.6): the first grid starts at row 1; every further grid starts **exactly 2 blank rows** below the previous grid's Total Days row. All grids live on the one Team Mix tab.

| Col | Header | Content | Style |
|---|---|---|---|
| `A` | `Skill set` | person label, e.g. `Backend / API Engineer 1` | left |
| `B` | `Count` | the person's share of full time (FTE — 1.00 = full time), **≤ 1.00** | right, `0.00` |
| `C` | — spacer — | empty | width 14 |
| `D` | `Mths` | project duration, same value every row | right, `0.00` |
| `E` | `Days` | `=D{r}*20*B{r}` | **sage `#D6E2DD` bold** |
| `F` | `Hrs` | `=E{r}*8` | **sage bold** |
| `G` | — spacer — | empty | width 60 |
| `H` | `Resource` | same label as `A` | left |
| `I..` | `Mon 1` … `Mon N` | months 1..N-1: **ramped hour values** (§2.5); month N: **`=F{r}-SUM(I{r}:<N-1>{r})`** (the remainder) | right, `0.00`, white |
| last | `Total Hrs` | `=SUM(I{r}:<N>{r})` | **sage bold** |

Widths: `[170, 60, 14, 55, 55, 55, 60, 159, 48 × N, 66]`.

Total row: `A` `Total` · `B` `=SUM(B3:B<last>)` · `E`,`F` sums · `H` `Total Hours` · each month + Total Hrs `=SUM(…)`. bg `#E5E5E5`, bold.
Total Days row: `H` `Total Days` · each month + Total Hrs `=<cell above>/8`. bg `#9EC1EF`, bold. **Nothing in A–G.**

Styling: title bg `#3C78D8`, white **Montserrat 20 bold**, centered. Header bg `#1C4F8C`, white **Arial 10 bold**. Body **Arial 10 — never Calibri** (Calibri is the T-Shirt tab). Every numeric cell right-aligned `0.00`; labels left. Sage marks exactly the three per-person totals (`Days`, `Hrs`, `Total Hrs`) on role rows — the monthly columns are calculated too and **stay white**. The sage is deliberate; do not clear it as a stray fill.

The old `Month / Days / Tot Days / Hrs` layout is retired: `Days` IS the per-person total.

### 2.2 The math

- **The Team Mix staffs the MIDPOINT of the Low and High figures** (David, 2026-09-21): `staffDays = Low Total Days × (1 + high factor) / 2` — per phase, from that phase's `Low Hrs` and `High Hrs` rollups. Never the Low figure alone.
- `months = staffDays / (Σ Count × 20)` — solve so `Σ Days` equals that midpoint.
- Month columns `N = ceil(months)`, EXCEPT when the fractional tail is under ~0.1 month AND a full-time person still fits under the soft ceiling (`months × 160 ≤ N × 172`): then fold it into the last full month instead of opening a near-empty column.
- **Recompute `months` and `N` after ANY roster change.** Adding a role raises Σ Count, shortens the duration, and turns the remainder column negative (−12.80 hrs was the symptom).
- The remainder formula makes each row sum exactly. Never write a fractional last month as a value.

### 2.6 One grid per phase

**Phases are contiguous.** Items use `MVP`, then `Phase 1`, `Phase 2`, `Phase 3` with no empty phase between used ones — `MVP` + `Phase 2` with nothing in `Phase 1` is a defect; renumber (`Phase 2` → `Phase 1`, `Phase 3` → `Phase 2`) so the numbering has no gap (`gsd-t estimate-sheet phases` does this and rebuilds the grids). The audit fails a gap.

**The title row of each grid is the phase name and nothing else** — `MVP`, `Phase 1`, … Never the estimate title, never "<title> — Phase 1" (David, 2026-09-21).

Every phase (`MVP` / `Phase 1` / `Phase 2` / `Phase 3`) whose T-Shirt items have hours > 0 gets its own Team Mix grid, in phase order, on the same tab, with 2 blank unformatted rows between grids. Each grid's `Σ Days` reconciles to **the midpoint of that phase's Low and High days** (`(Low Hrs + High Hrs) ÷ 2 ÷ 8` from the phase rollups), and the grids together reconcile to the midpoint of `Total Days` and `Total Days × high factor`. Months and column count are computed per grid. The team mix is the same for every phase unless the plan gives `teamMix.phases.<phase>.fte`.

### 2.3 Roster shape — one row per PERSON

1. **No row over Count 1.00.** `Backend Engineer 1.40` is two people → two rows.
2. **Saturate, then spill.** 1.21 FTE of backend = `Backend / API Engineer 1` at 1.00 + `… 2` at 0.21. Rows per discipline = `ceil(disciplineFTE)`; only the last row is fractional. Never 0.42 / 0.56 / 0.23 across three part-timers.
3. Each full-time row reads 160 hrs in a full month. If a row needs more, the team is too small for the calendar — add a person, don't stretch one.

### 2.4 Roster coverage — every MF factor has a person

Read the live MF list (`E4:F9` on the T-Shirt tab). **Every non-zero factor is a person in Team Mix**, not abstract overhead:

| Factor | Person |
|---|---|
| QA | `QA Engineer` — a named row |
| PM | `Project Manager` — a named row |
| Analysis | `Business Analyst` — a named row |
| Deployment, StdUps/Mtgs, Buffer | absorbed across the engineers and the lead — no row of their own (the hand-corrected ATP sheet has no DevOps row and is correct) |

Minimum roster: delivery engineers + `QA Engineer` + `Project Manager` + `Business Analyst` + `Tech Lead / Architect`. Typical fractions: PM 0.20–0.25 · BA 0.10 · Tech Lead 0.25 · QA 0.40–0.50. A mix whose totals reconcile is still wrong if nobody is managing the project.

### 2.5 Ramping — flat allocation is unrealistic

Monthly hours follow when the work happens. Normalise the weights, multiply by the person's total hours, write months 1..N-1 as values, month N as the remainder formula.

| Role | Mon 1 / Mon 2 / Mon 3 weights | Shape |
|---|---|---|
| UI / Frontend | 1.35 / 1.05 / 0.60 | front-loaded, tapers |
| Backend / API | 0.90 / 1.15 / 0.95 | steady, peaks mid |
| QA | 0.40 / 0.90 / 1.70 | back-loaded — ~30% early, bulk at the end |
| Business Analyst | 1.75 / 0.80 / 0.45 | front-loaded, small tail for change requests |
| DevOps | 0.45 / 0.85 / 1.70 | back-loaded — mirror of BA |
| Project Manager | 1.00 / 1.00 / 1.00 | flat |
| Tech Lead / Architect | 1.30 / 0.80 / 0.90 | design-heavy, uptick at integration |
| Design / UX | 1.60 / 0.90 / 0.50 | heaviest at the start, a tail for revisions |
| Mobile | 1.35 / 1.05 / 0.60 | same shape as frontend |

- A flat `160 / 160 / 147` for every role is the tell that no ramping was applied.
- **The only ceiling is 160 hrs per person per month, soft to ~172.** There is NO `Count × 160` per-row ceiling — a 0.40 QA can work 106 hrs in their heavy month; that is what ramping means.

---

## 3. Technology Stack tab

`A1` `Technology Stack` (merged `A:B`, bg `#1C4F8C`, white bold 12). Rows 2+: `A` category · `B` one-line description, Arial. Widths `[210, 760]`.

Fill it from the codebase and docs (`docs/architecture.md`, `docs/infrastructure.md`, package manifests) — internal facts, grep-able, never guessed. Categories seen in a filled sheet: `Frontend` · `Backend` · `LLM / Reasoning` · `Tools / Integrations` · `Auth` · `Events / Webhooks` · `Data Store` · `Cache / Session Store` · `Object Storage` · `Observability` · `Infrastructure`. Use the ones that apply; add ones the project needs. **An empty Technology Stack tab is a defect** — two shipped estimates left it blank.

---

## 4. Overview tab — cells the estimates index reads

The Hilo Estimates Summaries index (`1sOf6dpd8gvMo0eTfc1uJuf6jH6wrTGjYinPrVh1FBAg`) pulls every estimate via `IMPORTRANGE("<id>","Overview!C2")` etc. Keep this shape exactly:

| Row | A | B | C | D | E |
|---|---|---|---|---|---|
| 1 | `Estimate` | `Effort Summary` | `Estimated Hours` | `Estimated Avg. Hourly Rate` | `Cost Estimate` |
| 2 | `Low` | `Project Hours` | `='T-Shirt Size Estimate'!L8` | `='T-Shirt Size Estimate'!H4` | `='T-Shirt Size Estimate'!K8` |
| 3 | `High` | `Project Hours` | `='T-Shirt Size Estimate'!N8` | `='T-Shirt Size Estimate'!H4` | `='T-Shirt Size Estimate'!M8` |

`A7` `Disclaimer` + `A8` the Tekyz disclaimer text (merged `A8:F22`) ships with the template — leave it. Row 2 = Low, row 3 = High; if a title row is added above, the index's cell refs break for that estimate.

---

## 5. Post-write audit — run it, print it, then report

**This checklist is code: `gsd-t estimate-sheet audit --sheet <id>`** (`bin/gsd-t-estimate-sheet.cjs`) reads the live sheet back and prints every line below with ✓/✗, exit 4 on any ✗. `write` runs it automatically after writing. The list below is what it checks.

Every item is a read-back check against the live sheet. Any ✗ blocks delivery.

```
T-SHIRT
  [ ] every size cell in F:G is one of XS S M L XL XXL or blank (no legend text)
  [ ] every item row's E cell has ONE_OF_LIST validation
  [ ] every item row's H:L are the §1.2 formulas (no values)
  [ ] section heading rows are merged A:L, bg #1C4F8B, and hold no sizes
  [ ] totals row + phase rollups (K4:N7) + summary block reference <last item row>
  [ ] totals row directly under the last item, grey band #D8DDE8 bold across A:L; summary block directly under it, labels bold, Total Cost in dollars
  [ ] Σ raw sizes × (1+MF) == Total Days cell (recomputed independently)
  [ ] phases are contiguous — no empty phase between used ones
TEAM MIX (each grid)
  [ ] one grid per phase with hours; the title row is EXACTLY the phase name; exactly 2 empty, unformatted rows between grids
  [ ] the header is the row under the title; the row under the header is a person
  [ ] header months read Mon 1..Mon N with N == month column count; last header is Total Hrs
  [ ] no Count > 1.00; per discipline, all rows but the last are 1.00
  [ ] every non-zero MF factor has a matching person row
  [ ] Days/Hrs/Total Hrs are formulas; last month is the remainder formula; no negative month
  [ ] no month cell > 172; full-time rows read 160 in a full month
  [ ] ramp applied: no two roles share the same flat pattern (unless PM)
  [ ] font Arial 10 everywhere; sage on exactly E, F, Total Hrs of role rows; monthly cells white
  [ ] Total row (#E5E5E5) and Total Days row (#9EC1EF) span every month column + Total Hrs
  [ ] nothing formatted outside the data area
  [ ] each grid's Σ Days == midpoint of that phase's Low/High days; all grids together == midpoint of Total Days and Total Days × high factor
TECH STACK
  [ ] at least the categories that apply are filled; none says TBD
OVERVIEW
  [ ] C2/E2/C3/E3 formulas resolve to numbers
```

---

## 6. The tool — `gsd-t estimate-sheet` (v5.20.10)

Everything in §1–§5 is executed by `bin/gsd-t-estimate-sheet.cjs`, not re-derived from this prose. The model supplies **judgment only** as a JSON plan; the tool computes and writes everything derived, then audits by reading back. Any violation halts (exit 4); an API or input problem halts (exit 64). Nothing continues past a failure.

```
gsd-t estimate-sheet plan-schema                              # the plan shape
gsd-t estimate-sheet read       --sheet <id|url> [--tab <name>]   # read-before-write dump
gsd-t estimate-sheet plan-check --sheet <id|url> --plan plan.json # validate + the roster it WOULD write (the Step 4 pause)
gsd-t estimate-sheet write      --sheet <id|url> --plan plan.json [--replace]   # T-Shirt + Team Mix + Tech Stack, then audit
gsd-t estimate-sheet audit      --sheet <id|url>                  # §5 checklist by read-back
gsd-t estimate-sheet format     --sheet <id|url> [--dry-run]      # normalise T-Shirt FORMATTING only: section rows (§1.2), grey totals band directly under
                                # the last item, standard summary block directly under it (§1.3); no size, phase, text or item formula is touched;
                                # rows under the totals row that are not the old summary block are never overwritten (rows are inserted above them)
gsd-t estimate-sheet phases     --sheet <id|url> [--dry-run]      # close phase gaps on the T-Shirt tab (Phase 2→1, 3→2 …), then rebuild the Team Mix grids
gsd-t estimate-sheet titles     --sheet <id|url> [--dry-run]      # set each Team Mix grid's title row to exactly its phase name
gsd-t estimate-sheet teammix    --sheet <id|url> [--fte '{"backend":1.5,…}'] [--dry-run]
                                # rebuild the Team Mix (one grid per phase) from the sheet's OWN roster and phase rollups — no plan needed;
                                # the roster is derived from the existing grid (entered Counts summed per discipline; older peak-utilisation
                                # rosters split the sheet's total FTE by each role's hours); --fte overrides it; halts on a role it cannot map
```

Both the current template and the older layout (Project/Client rows on top, legend from row 8, up to four size columns, header row 17) are READ by `audit` and `teammix` — every coordinate comes from the labels, never a fixed row. `write` produces the current template only.

The plan (judgment only):

```json
{
  "title": "Hilo ATOS — ATP Gap Closure",
  "tshirt": { "mode": "items",
    "sections": [ { "heading": "A. AUTH & TRANSPORT CONTRACT",
      "items": [ { "id": "GA-1", "module": "Ingest API", "userType": "ATP System",
                   "functionality": "Reconcile HMAC signing contract", "requirement": "Align canonical string with Exhibit B.",
                   "phase": "MVP", "fe": "", "be": "M" } ] } ] },
  "teamMix": { "fte": { "backend": 1.5, "frontend": 0.4, "qa": 0.4, "pm": 0.25, "ba": 0.1 } },
  "techStack": [ { "category": "Frontend", "description": "Next.js 16 App Router / React" } ]
}
```

- `tshirt.mode` `items` writes whole rows below the header (halts if rows exist unless `--replace`); `sizes` fills `E:L` on rows that already exist (a gap-analysis sheet), matched by the `(id)` suffix in column C — never by position.
- `teamMix.fte` is per-discipline FTE (`backend` `frontend` `qa` `pm` `ba` `devops` `techlead` `design` `mobile`). The tool splits it into people (saturate then spill), computes months and the column count, ramps by discipline, writes the remainder formula, and refuses a roster that leaves a weighted MF factor unstaffed. It writes **one grid per phase with hours** (§2.6); `teamMix.phases: { "Phase 1": { "fte": {…} } }` overrides the mix for one phase.
- The MF list, legend, rate and high factor are READ from the sheet; the plan never carries them.
