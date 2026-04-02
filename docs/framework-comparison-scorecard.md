# Framework Comparison Scorecard

**Purpose**: Unbiased comparison of development frameworks.
**Instructions**: Score each framework 1-5 per dimension. Use the rubric at the bottom. Equal weights — no dimension gaming.

---

## Frameworks Being Compared

| Slot | Framework | Version/Variant | Evaluator | Date |
|------|-----------|-----------------|-----------|------|
| F1   |           |                 |           |      |
| F2   |           |                 |           |      |
| F3   |           |                 |           |      |
| F4   |           |                 |           |      |

---

## A. Onboarding & Adoption (Dimensions 1-3)

| # | Dimension | What to Evaluate | F1 | F2 | F3 | F4 |
|---|-----------|------------------|----|----|----|----|
| 1 | Time to first productive output | How quickly can someone go from choosing the framework to shipping real work? |    |    |    |    |
| 2 | Team adoption friction | How willing is a typical team to adopt it after initial exposure? |    |    |    |    |
| 3 | Works without specific tooling | Can it be used with any IDE, editor, or AI assistant? |    |    |    |    |
| | **Category Average** | | **—** | **—** | **—** | **—** |

## B. Execution & Delivery (Dimensions 4-7)

| # | Dimension | What to Evaluate | F1 | F2 | F3 | F4 |
|---|-----------|------------------|----|----|----|----|
| 4 | Defect prevention | How effectively does the framework prevent bugs from reaching production? |    |    |    |    |
| 5 | Throughput | How many features can be shipped per unit time? |    |    |    |    |
| 6 | Rework prevention | How well does the framework prevent completed work from needing redo? |    |    |    |    |
| 7 | Idea-to-deploy cycle time | How quickly can a concept move from idea to production? |    |    |    |    |
| | **Category Average** | | **—** | **—** | **—** | **—** |

## C. Sustainability & Maintenance (Dimensions 8-11)

| # | Dimension | What to Evaluate | F1 | F2 | F3 | F4 |
|---|-----------|------------------|----|----|----|----|
| 8  | New member ramp-up | How quickly can a new team member contribute independently? |    |    |    |    |
| 9  | Context recovery | How easily can work resume after an interruption of days or weeks? |    |    |    |    |
| 10 | Tech debt management | How well does the framework track and control technical debt? |    |    |    |    |
| 11 | Documentation freshness | How well does the framework keep documentation accurate and current? |    |    |    |    |
| | **Category Average** | | **—** | **—** | **—** | **—** |

## D. Flexibility & Universality (Dimensions 12-15)

| # | Dimension | What to Evaluate | F1 | F2 | F3 | F4 |
|---|-----------|------------------|----|----|----|----|
| 12 | Minimum viable process | Can you use a small portion of it and still get value? |    |    |    |    |
| 13 | Project type coverage | Does it work across web, mobile, data, infra, and non-code projects? |    |    |    |    |
| 14 | Team size range | Is it effective from 1-person teams to 50-person teams? |    |    |    |    |
| 15 | Overhead proportionality | Does ceremony scale with project size rather than being fixed? |    |    |    |    |
| | **Category Average** | | **—** | **—** | **—** | **—** |

## E. Automation & AI-Agent Capabilities (Dimensions 16-19)

| # | Dimension | What to Evaluate | F1 | F2 | F3 | F4 |
|---|-----------|------------------|----|----|----|----|
| 16 | Agentic workflow support | Does the framework enable AI agents to execute work autonomously (task dispatch, parallel execution, adaptive replanning)? |    |    |    |    |
| 17 | QA automation | Does the framework automate test generation, execution, and gap detection — not just run existing tests? |    |    |    |    |
| 18 | QA coverage enforcement | Does the framework enforce minimum coverage and block progress when tests are missing or failing? |    |    |    |    |
| 19 | Contract enforcement | Does the framework define and validate interfaces between components automatically (API shapes, schemas, props)? |    |    |    |    |
| | **Category Average** | | **—** | **—** | **—** | **—** |

## F. Observability & Decision Quality (Dimensions 20-22)

| # | Dimension | What to Evaluate | F1 | F2 | F3 | F4 |
|---|-----------|------------------|----|----|----|----|
| 20 | Decision traceability | Can you find why a choice was made 6 months later? |    |    |    |    |
| 21 | Progress accuracy | Does reported progress match actual state? |    |    |    |    |
| 22 | Risk visibility | Do problems surface early or only at integration? |    |    |    |    |
| | **Category Average** | | **—** | **—** | **—** | **—** |

---

## Summary

| Category                                    | F1 | F2 | F3 | F4 |
|---------------------------------------------|----|----|----|----|
| A. Onboarding & Adoption (1-3)              |    |    |    |    |
| B. Execution & Delivery (4-7)               |    |    |    |    |
| C. Sustainability & Maintenance (8-11)      |    |    |    |    |
| D. Flexibility & Universality (12-15)       |    |    |    |    |
| E. Automation & AI-Agent Capabilities (16-19) |    |    |    |    |
| F. Observability & Decisions (20-22)        |    |    |    |    |
| **Overall Average (1-5)**                   | **—** | **—** | **—** | **—** |
| **Normalized Score (/100)**                 | **—** | **—** | **—** | **—** |

### Calculation

```
Category Average = sum of dimension scores in category / number of dimensions in category
Overall Average  = sum of all 22 dimension scores / 22
Normalized /100  = Overall Average × 20
```

---

## Radar Chart Data

For visual comparison, plot each framework on a 6-axis radar chart using the category averages:

```
Axis 1: Onboarding & Adoption
Axis 2: Execution & Delivery
Axis 3: Sustainability & Maintenance
Axis 4: Flexibility & Universality
Axis 5: Automation & AI-Agent Capabilities
Axis 6: Observability & Decisions
```

---

## Scoring Rubric

Use this rubric consistently across all frameworks and dimensions:

| Score | Label         | Definition                                                                   |
|-------|---------------|------------------------------------------------------------------------------|
| 1     | Absent        | Not addressed by the framework. User must solve this entirely on their own.  |
| 2     | Minimal       | Acknowledged but not enforced. Ad-hoc or optional guidance only.             |
| 3     | Supported     | Present with some structure, but inconsistently applied or easy to skip.     |
| 4     | Systematic    | Well-integrated, mostly enforced, clear process with known exceptions.       |
| 5     | Core strength | Foundational to the framework. Systematically enforced, hard to bypass.      |

### Scoring guidelines

- **Score what the framework provides**, not what a disciplined team could achieve without it
- **Score the default experience**, not the best-case customized setup
- **Score independently** — don't let a high score in one dimension inflate adjacent ones
- **Use 3 as the anchor** — most frameworks land at 3 for most dimensions. Reserve 1 and 5 for clear extremes
- **When uncertain**, score conservatively (lower)

---

## Bias Checks

Before finalizing scores, verify:

- [ ] No single framework scores 5 on more than 9 of 22 dimensions
- [ ] No single framework scores below 2 on more than 9 of 22 dimensions
- [ ] Every framework has at least one category where it leads
- [ ] The evaluator did not design or build any of the frameworks being compared (if they did, note the conflict and consider a second evaluator)
- [ ] Dimensions were not added or removed after seeing preliminary scores

---

## Notes & Justifications

Use this section to record reasoning for any score that might be controversial:

| Dimension | Framework | Score | Justification |
|-----------|-----------|-------|---------------|
|           |           |       |               |
|           |           |       |               |
|           |           |       |               |
|           |           |       |               |
