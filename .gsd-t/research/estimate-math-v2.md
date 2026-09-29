# Estimate Math v2 — Human Time Included, No Tuning

Date: 2026-09-29 08:40 PDT
Status: BUILT 2026-09-29 11:37 PDT — David chose ×5 / ×7 with NO sheet overhead (his 2026-09-28 model; the
×8 / ×12 pairing below was wrong — ×8/×12 predates "multiplier includes overhead"). Summary 4 written.

**Result:** 20 ATOS sheets 17,381 → 8,004 Low h (46% of original; Summary 2 tuned ≈ 54%). Summary 4 total
(incl. E-Learning unchanged): Low 8,616 h / $430,787 · High 11,170 h / $558,493 (Summary 2: $491,367 / $637,247).

## Why v2

The ATOS re-estimates came out too aggressive and had to be tuned up to reach ~$650K.
Likely cause: the per-task base rates were fitted to Claude's working time only (~13 hrs on
Runway) and left out the human's time. Runway actually took **26 hrs: 13 David + 13 Claude**.
v2 fixes the base rate and removes every tuning step, to see what the math gives on its own.

## The algorithm (per task, per size column)

**1. Solo minutes = human time + Claude time**, added together — one person plus Claude,
building it from scratch. Benchmark: Runway, 45 tasks, 26 hrs. Every old rate doubles:

| Task | Old rate | v2 rate |
|---|---|---|
| Trivial change | 5 min | **10 min** |
| Typical screen element / endpoint | 20 min | **40 min** |
| Heaviest piece | 1–2¼ hr | **2–4½ hr** |

**2. × project multiplier** — David's original values (2026-09-27), before any tuning. The
multiplier already includes team overhead (reviews, QA, coordination).

| Project | Multiplier |
|---|---|
| Greenfield, solo | × 1 |
| Greenfield, team | × 3 |
| Existing app, solo | × 2 |
| Existing app, team — isolated change | **× 8** |
| Existing app, team — wide change | **× 12** |

Isolated vs wide is decided per row from the code graph's blast radius (what else the change touches).

**3. + task switching**, added AFTER the multiplier (one person's pickup time; it does not grow
with team size). Only the row's larger size column gets it.

| Team time for the task | Add |
|---|---|
| under 2 hrs | 7.5 min |
| 2 to 8 hrs | 15 min |
| 8 hrs or more | 30 min |

**4. Hours** = (team minutes + switching) ÷ 60. **Days** = hours ÷ 8.

**5. Pick the nearest size.** Cut-offs are the midpoints between neighbouring sizes (geometric: √(a × b)).

| Size | Days | Chosen when hours are… |
|---|---|---|
| XXS | 0.0625 | under 0.63 |
| XS | 0.1 | 0.63 – 1.26 |
| S | 0.25 | 1.26 – 2.83 |
| M | 0.5 | 2.83 – 5.66 |
| L | 1 | 5.66 – 11.3 |
| XL | 2 | 11.3 – 22.6 |
| XXL | 4 | 22.6 and up |

**Worked example** — a typical endpoint, existing app, team, isolated:
40 min × 8 = 320 min, + 15 switching = 335 min = 5.6 hrs → **M** (M/L cut-off is 5.66 hrs).

## Sheet math

| Figure | Formula |
|---|---|
| Row Days | Web Portal size days + Backend/API size days |
| Total Days | Row Days × (1 + overhead) — **overhead = 0** (the multiplier already covers it) |
| Low $ | Total Days × 8 × $50 |
| High $ | Low $ × the sheet's high factor (1.25 or 1.3) |
| Team Mix | staffs the midpoint of Low and High per phase (unchanged) |

**No clamping.** Whatever comes out is the estimate.

## What changes from Summary 2

| Step | Summary 2 (current) | Summary 4 (v2) |
|---|---|---|
| Solo minutes | Claude-only rate | × 2 (human time included) |
| Multiplier | × 11 / × 15 (tuned to $650K) | × 8 / × 12 (untuned) |
| Overhead on the sheet | × 1.9 on most tabs (counted twice) | none |
| Phase clamping | yes (100–200% band) | none |

## Decisions pending (recommended option first)

1. **Multipliers × 8 / × 12** — David's pre-tuning values. *(Recommended.)*
2. **Reuse existing sizing judgments × 2** — each row's solo minutes from the 88-task outlier
   review, doubled; keeps the 34 reviewed corrections, drops the clamping. *(Recommended.)*
   Alternative: re-judge every row from scratch at the v2 rates.
3. **New tabs, not overwrites** — `T-Shirt Size Estimate (AI v2)` + `Team Mix (AI v2)` on each
   ATOS sheet; **Summary 4** (same layout as Summary 2) points at them. The `(Rescale)` tabs,
   Summary 2 and Summary 3 are left untouched. E-Learning unchanged.

## Open question

Did David's time and Claude's overlap on Runway (David reviewing while Claude worked)? If so,
elapsed time was under 26 hrs and the rate should use elapsed time, not the sum.
