# GSD-T: Design Decompose — Hierarchical Contract Extraction

You are the lead agent for decomposing a design (Figma file, image, screenshot, or prototype URL) into a hierarchy of element / widget / page contracts.

**Output**: A tree of contracts — elements at the bottom (atomic, reusable, variant-per-contract), widgets in the middle (element composition + data binding), pages at the top (widget assembly + layout + routing).

**Why hierarchical contracts:** A flat `design-contract.md` makes verification expensive and lets drift accumulate (two donut charts on two pages diverge over time). Hierarchical contracts verify elements in isolation once, then compose — drift is impossible because elements are the single source of truth for visual spec.

**When to use this command:**
- Starting a design-to-code project with multiple pages sharing components
- Retrofitting an existing flat `design-contract.md` into reusable parts
- Adding a new page that reuses existing elements/widgets

If the project is small (single page, ≤10 elements, nothing reusable), use the flat `design-contract.md` template instead and skip this command.

---

## Step 0: Detect Inputs + Load Taxonomy

Run these checks, log results to user inline:

1. **Figma MCP available?**
   - If yes → log "Figma MCP detected — will extract exact tokens per element"
   - If no → log "Figma MCP unavailable — using visual analysis (reduced precision)"
2. **Existing flat contract? — MANDATORY INGESTION if present**
   - If `.gsd-t/contracts/design-contract.md` exists:
     - **READ IT COMPLETELY** — it is the authoritative ground truth for data labels, values, and verification assertions from prior runs
     - Extract: exact category labels, exact data values, exact center values, exact percentages
     - Use these as **Test Fixture** data in every element contract you write (not placeholder data)
     - If the flat contract has a `## Verification Status` section with 30+ rows, that is the GROUND TRUTH for what each element must match — port every row into the relevant element contract's Verification Checklist
   - If not → fresh decomposition from the design source directly
3. **Design source provided?**
   - Required: Figma URL, image path, or prototype URL in `$ARGUMENTS`
   - If missing → ask user: "Provide the design source (Figma URL, image path, or prototype URL)"
4. **Load the chart taxonomy (MANDATORY)**
   - READ `templates/design-chart-taxonomy.md` from the GSD-T package (or `~/.claude/` if installed)
   - This is the **CLOSED SET** of valid element names. You MUST pick from this list. Inventing new element names is FORBIDDEN without user approval to extend the taxonomy.
   - Keep the taxonomy in working memory while classifying — every element you identify MUST be matched against it

## Step 1: Survey the Design

Enumerate every visual element on every page/screen in the design. Use Figma MCP `get_metadata` or `get_design_context` if available; otherwise use visual analysis on the image.

Produce an initial flat inventory table:

| # | Element on Design                  | Appears On Pages       | Visual Variant                       |
|---|------------------------------------|------------------------|--------------------------------------|
| 1 | Donut chart with center label      | Overview, Analytics    | chart-donut                          |
| 2 | Horizontal stacked bar chart       | Analytics              | chart-bar-stacked-horizontal         |
| 3 | Vertical legend on right           | Overview               | legend-vertical-right                |
| 4 | KPI tile with delta indicator      | Overview (×4)          | stat-card-with-delta                 |
| ...

**Rule**: distinct visual variants = distinct rows. A horizontal stacked bar and a vertical stacked bar are TWO rows, not one.

## Step 2: Classify Each Element (taxonomy-enforced)

For each row in the inventory, assign:

- **Category** — chart / legend / axis / card / table / control / atom / typography / layout
- **Element name** — **MUST come from `templates/design-chart-taxonomy.md`** (closed set). If no match found, STOP and ask user to extend the taxonomy with rationale.
- **Reuse count** — how many times does it appear across the entire design?
- **Owner layer** — element / widget-internal / page-internal

### Visual distinguisher decision rules (consult taxonomy)

Before naming an element, apply the visual distinguisher rules from the taxonomy:

- **Bar chart?** → is it stacked/grouped, horizontal/vertical, percentage/absolute? These are ALL distinct element contracts.
- **Circular?** → pie vs donut (hole in center?) vs gauge (partial arc?)
- **Line?** → single vs multi, stepped vs smooth, with area or without

**Anti-pattern to avoid**: "it has bars so it's a bar chart" → WRONG. The failure mode is picking `chart-bar-grouped-vertical` when the design is `chart-bar-stacked-horizontal-percentage`. These render completely differently with completely different data bindings.

**Promotion rule**: an item becomes an **element contract** if:
- It appears ≥2 times across the design, OR
- It has non-trivial visual spec (≥5 distinct spec properties), OR
- It has states or interactions beyond "static display"

Otherwise, it stays internal to its widget or page (no contract needed).

### Atoms are NOT optional

Icons, badges, chips, dividers, avatars, status dots, spinners — every small artifact that appears in the design gets an element contract if it meets the promotion rule. These are the #1 most-missed tier and produce the "feels off" verification result.

## Step 3: Identify Widgets

A **widget** is a reusable composition of elements + data binding that appears as a visual group in the design. Examples: "Revenue Breakdown" (donut + legend + title + filter), "Stat Strip" (4× stat-card-with-delta).

For each visual group in the design, determine:
- Does it appear on ≥2 pages, OR is it clearly a reusable unit conceptually?
  - Yes → widget contract
  - No → page-internal composition (no widget contract needed)

Produce a widget inventory:

| # | Widget Name               | Appears On Pages       | Elements Used                                   |
|---|---------------------------|------------------------|-------------------------------------------------|
| 1 | revenue-breakdown-widget  | Overview, Analytics    | chart-donut, legend-vertical-right, heading-h3, select-dropdown |
| 2 | stat-strip-widget         | Overview               | stat-card-with-delta (×4)                       |
| ...

## Step 4: Identify Pages

Each page/screen in the design becomes a page contract. Document:
- Widgets used and grid position
- Global layout (header, sidebar, main)
- Route + auth guards

## Step 5: Confirm Decomposition With User

Present the full hierarchy summary:

```
DECOMPOSITION SUMMARY
─────────────────────
Elements: 14 contracts
  Charts: 4 (chart-donut, chart-bar-stacked-horizontal, chart-line, chart-sparkline)
  Legends: 2 (legend-vertical-right, legend-horizontal-bottom)
  Cards: 2 (stat-card, stat-card-with-delta)
  Tables: 1 (table-dense)
  Controls: 5 (button-primary, select-dropdown, input-search, tabs-underline, toggle)

Widgets: 6 contracts
  stat-strip-widget, revenue-breakdown-widget, user-growth-widget,
  recent-activity-table-widget, page-header-widget, nav-sidebar-widget

Pages: 3 contracts
  dashboard-overview, analytics-detail, settings

Total: 23 contracts (vs. flat: ~57 elements in single file)

Cost estimate:
  - Decomposition effort: ~{N} hours to write all contracts
  - Verification: elements verified once, reused everywhere → no drift
  - Implementation: widgets become assembly, not reinvention
```

Ask user: "Proceed with this decomposition? [y/n/edit]"
- **y** → Step 6
- **n** → abort
- **edit** → accept user revisions to the hierarchy, re-present

## Step 6: Write Contracts

Create the directory structure:

```
.gsd-t/contracts/design/
├── elements/
│   ├── chart-donut.contract.md
│   ├── chart-bar-stacked-horizontal.contract.md
│   ├── legend-vertical-right.contract.md
│   └── ... (one file per element)
├── widgets/
│   ├── revenue-breakdown-widget.contract.md
│   └── ... (one file per widget)
├── pages/
│   ├── dashboard-overview.contract.md
│   └── ... (one file per page)
└── INDEX.md  (hierarchy map + cross-references)
```

For each element contract:
1. Copy `templates/element-contract.md` as scaffold
2. Fill in visual spec from Figma MCP (exact values) or visual analysis (estimated values)
3. Fill in states, interactions, data binding, accessibility, verification checklist
4. If Figma MCP available → use `get_design_context` per element node to extract tokens

For each widget contract:
1. Copy `templates/widget-contract.md` as scaffold
2. Reference elements by name in the "Elements Used" table
3. Define layout, data binding, responsive behavior, widget-level verification

For each page contract:
1. Copy `templates/page-contract.md` as scaffold
2. Reference widgets in grid positions
3. Define route, data loading, global states, performance budget

Write `INDEX.md` as a navigation map:

```markdown
# Design Contracts: {Project Name}

## Elements (14)
- [chart-donut](elements/chart-donut.contract.md) — used by revenue-breakdown-widget
- [chart-bar-stacked-horizontal](elements/chart-bar-stacked-horizontal.contract.md) — used by analytics-trend-widget
- ...

## Widgets (6)
- [revenue-breakdown-widget](widgets/revenue-breakdown-widget.contract.md) — uses chart-donut, legend-vertical-right
- ...

## Pages (3)
- [dashboard-overview](pages/dashboard-overview.contract.md) — uses stat-strip-widget, revenue-breakdown-widget, user-growth-widget, recent-activity-table-widget
- ...

## Precedence
element contract > widget contract > page contract

Widgets and pages reference elements by name. They CANNOT override element visual spec. To customize, create a new element variant.
```

## Step 7: Wire Into Partition

If `.gsd-t/domains/` exists (project is already partitioned), append to relevant domain's `scope.md`:

```markdown
## Design Contracts
This domain owns the following design contracts:
- Elements: chart-donut, legend-vertical-right
- Widgets: revenue-breakdown-widget
- Pages: (none — pages owned by page-assembly domain)
```

If `.gsd-t/domains/` does NOT exist yet, suggest the user run `/user:gsd-t-partition` next, with a note that design contracts should be partitioned into domains:
- **design-system domain** owns element contracts
- **widgets domain** owns widget contracts
- **pages domain** owns page assembly + routing

## Step 8: Update progress.md Decision Log

Append:
```
- {YYYY-MM-DD HH:MM}: gsd-t-design-decompose — created {N} element / {N} widget / {N} page contracts under .gsd-t/contracts/design/. Hierarchy: elements are single source of truth for visual spec; widgets compose elements; pages compose widgets.
```

## Step 9: Next Up Hint

Display:

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Partition** — decompose project into domains owning the design contracts

`/user:gsd-t-partition`

**Also available:**
- `/user:gsd-t-execute` — build element contracts first (they're independently testable)
- `/user:gsd-t-plan` — plan tasks around the contract hierarchy

───────────────────────────────────────────────────────────────
```

---

## Document Ripple

After writing contracts, update:
- `.gsd-t/progress.md` — Decision Log entry (Step 8)
- `docs/architecture.md` — add "Design Contract Hierarchy" section if not present
- If existing flat `.gsd-t/contracts/design-contract.md` was retrofitted → mark it with a DEPRECATED header pointing to `design/INDEX.md`

## Pre-Commit Gate

- [ ] All contracts written from templates (element/widget/page)
- [ ] `INDEX.md` created with full hierarchy + precedence note
- [ ] Decision Log updated in progress.md
- [ ] architecture.md updated if this is a new concept for the project

$ARGUMENTS
