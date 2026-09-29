# GSD-T: Estimate Rescale — Re-price an Existing Estimate on the AI-Assisted Scale

You are re-estimating an **existing** Tekyz estimate sheet with the AI-assisted sizing model, **without touching the original**. The tool copies the sheet's `T-Shirt Size Estimate` and `Team Mix` tabs into two new tabs — **`T-Shirt Size Estimate (Rescale)`** and **`Team Mix (Rescale)`** — and re-sizes the copies. The original tabs, the Overview tab and the Hilo Estimates Summaries index (which reads the Overview) are never written. `$ARGUMENTS` carries `--sheet <url>` and optionally the project type (`--project <type>`).

**THE SHEET IS WRITTEN BY A TOOL, NOT BY HAND.** `gsd-t estimate-sheet rescale` (`bin/gsd-t-estimate-sheet.cjs`, project-local `bin/` first, else the global `gsd-t`) lists the rows, validates your plan, makes the copies, writes the sizes, rebuilds the Team Mix and audits the copies by reading back — halting on any violation. **You never PUT a cell yourself.** Your output is judgment only: a size per row. Spec: `~/.claude/templates/estimate-sheet-spec.md` §1.4 (the sizing model) and §7 (rescale).

> **Client-billed work.** Dollar figures here are client deliverables, not GSD-T build cost.

## Human-in-the-Loop (SUPERVISED)

**Step 2 (sizing) PAUSES for review** before anything is written. Steps 1, 3 and 4 flow but show their result.

## Step 1: Inputs + the rows to re-size (MECHANICAL · show result)

1. Resolve the sheet from `--sheet <url>`; otherwise ask for the URL. A `403` means the sheet is not shared with the service account (`gsd-t-sheets-writer@ai-estimator-415612.iam.gserviceaccount.com`) — ask the operator to share it as Editor, then re-run.
2. **Confirm the project type** (spec §1.4) — it sets every row's multiplier:

   | Project | `--project` | Multiplier |
   |---|---|---|
   | Greenfield, solo | `greenfield-solo` | × 1 |
   | Greenfield, team | `greenfield-team` | × 3 |
   | Yellow-field (existing app), solo | `yellowfield-solo` | × 2 |
   | Yellow-field, team — isolated change | `yellowfield-team-isolated` | × 5 |
   | Yellow-field, team — big blast radius | `yellowfield-team-wide` | × 7 |

   A yellow-field team estimate chooses isolated vs wide **per row**, from the code graph of the app being changed (`gsd-t graph blast-radius <file-or-symbol>` in that repo) — not a guess. No graph for the app → say so and ask the operator which rows are wide.
3. List the rows: `gsd-t estimate-sheet rescale --sheet <url> --list`. It prints every sized item row (row number, module, functionality, requirement, phase, current sizes), the size-column labels, the current legend and the sheet's overhead factor. Show the operator the count and the current Low hours.

## Step 2: Re-size every row — JUDGMENT · PAUSE FOR REVIEW

Nobody hand-writes code. For each row and each size column:

1. Estimate the **solo AI-assisted minutes** — one person directing Claude, greenfield, counting the person's time AND Claude's time. Runway rate (26 h = 13 human + 13 Claude): ~10 min for a trivial change, ~40 min for a typical screen element or endpoint, 2–4½ hrs for the heaviest pieces. Read the Functionality and Low Level Requirements; do not scale the old size mechanically — the old sizes assumed hand-coding.
2. Run `gsd-t estimate-sheet size --solo-min <n> --project <type> --xxs` — it multiplies, adds task switching after the multiplier, and prints the size. `--xxs` is always on here: the (Rescale) tab carries **XXS (0.5 hr)** so sub-hour work does not round up to XS. Count switching once per row: pass `--switch-min 0` for the row's smaller column.
3. Build the plan — one entry per listed row, `functionality` copied **exactly** from the list (the tool matches row AND text, and halts on a row that moved):

   ```json
   { "items": [ { "row": 15, "functionality": "Route the existing permission resolver into every unguarded surface", "sizes": ["S", "M"] } ] }
   ```

   `sizes` follows the size-column order the list printed; `""` for a column with no work. Every sized row must be in the plan — a missing row halts, because its copy would silently re-price on the new scale.
4. Write it to `.gsd-t/estimate-rescale-plan.json` and preview: `gsd-t estimate-sheet rescale --sheet <url> --plan .gsd-t/estimate-rescale-plan.json --dry-run` (old Low hours → new Low hours; nothing written).
5. **PAUSE:** show the operator the per-row table (row · functionality · solo min · multiplier · size) and the before → after Low hours. Wait for `continue` or corrections.

## Step 3: Write the (Rescale) tabs (MECHANICAL · show result)

```bash
gsd-t estimate-sheet rescale --sheet <url> --plan .gsd-t/estimate-rescale-plan.json   # add --replace to rebuild existing (Rescale) tabs
```

It copies the two tabs next to their originals, puts the AI-assisted scale in the copy's legend (XXS 0.0625 · XS 0.1 · S 0.25 · M 0.5 · L 1 · XL 2 · XXL 4 days; XXS in the row under XXL), switches the copy's Days formulas to an exact size lookup (the template's two-letter prefix would read `XX*` as XXS + XXL), writes the sizes, rebuilds `Team Mix (Rescale)` with the original tab's roster staffed from the copy's phase rollups, and audits the copies. `--suffix "<name>"` writes a separately named pair (`… (<name>)`) instead of `(Rescale)`. Existing (Rescale) tabs halt the run unless `--replace` — and `--replace` deletes only the two (Rescale) tabs. **Exit 4 = a ✗ — fix and re-run. Exit 64 = auth/API/input halt.** Show the tool's output verbatim.

## Step 4: Report

Sheet URL · project type · rows re-sized · Low hours before → after · the Team Mix (Rescale) roster and months · the audit result. State plainly that the original tabs and the Summary index still show the old figures.

## Document Ripple

- The Google Sheet (external) — only the two `(Rescale)` tabs are created or rebuilt.
- `.gsd-t/estimate-rescale-plan.json` — the sizing judgment, kept so the re-estimate is reproducible.

## ▶ Next Up

Standalone command — no auto-successor.
