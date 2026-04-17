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
4. **Design system / component library?**
   - Ask user: "Is a design system or component library being used (e.g., shadcn-vue, Vuetify, Radix, MUI, Ant Design)? If so, provide the URL."
   - If yes → fetch the docs landing page, catalog available components (cards, tables, tabs, charts, buttons, etc.)
   - Record in working memory: which design elements can be mapped to library primitives vs. built custom
   - Factor into Step 2 classification: if the library provides a component (e.g., `Card`, `Table`, `Tabs`), the element contract should reference it as the implementation target
   - Factor into Step 3 widget composition: library layout primitives (e.g., `Grid`, `Flex`, `Sheet`) inform widget structure
   - If no → proceed as normal (all components built custom)
5. **Load the chart taxonomy (MANDATORY)**
   - READ `templates/design-chart-taxonomy.md` from the GSD-T package (or `~/.claude/` if installed)
   - This is the **CLOSED SET** of valid element names. You MUST pick from this list. Inventing new element names is FORBIDDEN without user approval to extend the taxonomy.
   - Keep the taxonomy in working memory while classifying — every element you identify MUST be matched against it
   - **Filename rule**: the element contract filename MUST match the taxonomy name exactly (`chart-bar-vertical-single.contract.md`, not `bar-vertical-single.contract.md`). Shortened aliases are FORBIDDEN — they create taxonomy drift and make link-integrity checks fail. If an existing legacy contract uses a shortened name, prefer renaming it to the taxonomy name over creating a parallel file.

## Step 1: Survey the Design — Node-Level Figma Decomposition (MANDATORY)

> **⚠  This is the highest-leverage step in the entire workflow.** Most design-to-code errors originate here — the agent glances at a page screenshot, guesses chart types, and writes contracts from wrong assumptions. The fix is STRUCTURED NODE-LEVEL EXTRACTION, not "look harder."

### 1a. Map the page tree

Call `get_metadata` on the page/frame to get the full node tree. This returns the Figma component hierarchy — every group, frame, and component instance as named nodes with IDs.

### 1b. Identify widget-level nodes

From the metadata tree, identify every distinct visual group (card, widget, section). These are typically direct children of a page frame or section frame. List them:

```
Node tree for page "Analytics":
├── stat-card-campaign (id: 123:456)
├── stat-card-visitors (id: 123:457)
├── most-popular-tools-card (id: 123:458)
├── number-of-tools-card (id: 123:459)
├── ...
```

### 1c. Call `get_design_context` on EACH widget node individually (MANDATORY)

**Do NOT skip this.** Do NOT classify from the page screenshot alone. For each widget node identified in 1b:

1. Call `get_design_context` with the specific node ID
2. Record the returned: component type, code hints, text content, layout properties
3. Extract EVERY text string visible in the node (titles, subtitles, labels, column headers, legend items, axis labels, KPI values)

> **⚠  Figma MCP size guard**: `get_design_context` on a full-page frame (e.g., a 390×3372px mobile screen) can return 250KB+ and be auto-saved to a tool-results file. **Never call it on the full page.** Call it on each leaf card/component node individually (typically < 100KB each). If you must inspect a large frame, use `excludeScreenshot: true` to halve the payload.

**Anti-pattern**: Looking at a page screenshot and writing "I see a donut chart" without calling `get_design_context` on that specific node. The MCP returns structured data about the component — use it.

> **⚠ Tool guard**: NEVER use `get_screenshot` for Figma design extraction. `get_screenshot` returns pixels — you cannot extract exact property values, spacing, colors, or text from an image with confidence. `get_design_context` returns structured code, component properties, and design tokens. Always use `get_design_context` per widget node.

### 1d. Produce the flat inventory table WITH data inventory

| # | Element on Design | Figma Node ID | Appears On Pages | Text Content Extracted | Visual Variant |
|---|-------------------|---------------|------------------|----------------------|----------------|
| 1 | Donut chart with center label | 123:458 | Overview, Analytics | Title: "Most Popular Tools", Subtitle: "Which tools members interact with most", Center: "485", Center sub: "Total Interactions", Legend: ["Steps to Stay Covered 30%", "Broker Contact 21%", ...] | chart-donut |
| 2 | Stacked bar with KPI header | 123:459 | Analytics | Title: "Number of Tools", Subtitle: "How many tools members interact with", KPI: "2.4", KPI sub: "Avg tools per member", Legend: ["1 Tool", "2 Tools", "3 Tools", "4+ Tools"], Labels: ["{num}%", ...] | chart-bar-stacked-horizontal-percentage |
| ... | | | | | |

**Rules**:
- Distinct visual variants = distinct rows. A horizontal stacked bar and a vertical stacked bar are TWO rows.
- The "Text Content Extracted" column is MANDATORY. Every text string visible in the Figma node MUST be listed. This kills hallucinated column headers and invented data models.
- If `get_design_context` is unavailable (no Figma MCP), extract text from the screenshot with maximum care and flag "⚠ extracted from screenshot, not MCP — verify manually".

## Step 2: Classify Each Element — Show Your Reasoning (MANDATORY)

For each row in the inventory, assign:

- **Category** — chart / legend / axis / card / table / list / control / atom / typography / layout
- **Element name** — **MUST come from `templates/design-chart-taxonomy.md`** (closed set). If no match found, STOP and ask user to extend the taxonomy with rationale.
- **Reuse count** — how many times does it appear across the entire design?
- **Owner layer** — element / widget-internal / page-internal

### Classification reasoning (MANDATORY — show your work)

For EACH chart/visualization element, you MUST walk the taxonomy decision tree and document your reasoning. This is not optional — skipping this step is how donut charts get classified as stacked bars and vice versa.

**Required format for each element:**

```
Element #2: node 123:459 "Number of Tools"
  I SEE: A horizontal bar that fills full width, divided into 4 colored segments
         with percentage labels above each segment. Legend below: "1 Tool", "2 Tools",
         "3 Tools", "4+ Tools". Single bar, not multiple bars per category.
  DECISION TREE:
    - Is it a bar chart? YES — has rectangular segments
    - Stacked or grouped? STACKED — segments touch, share one bar
    - Horizontal or vertical? HORIZONTAL — bar extends left to right
    - Percentage or absolute? PERCENTAGE — single bar, segments sum to 100%,
      labels show {num}%
  CLASSIFICATION: chart-bar-stacked-horizontal-percentage
  CONFIDENCE: HIGH — matches taxonomy distinguisher exactly
```

**If confidence is LOW or MEDIUM**, flag it for human review in Step 5.

### Visual distinguisher decision rules (consult taxonomy)

Before naming an element, apply the visual distinguisher rules from the taxonomy:

- **Bar chart?** → is it stacked/grouped, horizontal/vertical, percentage/absolute? These are ALL distinct element contracts.
- **Circular?** → pie vs donut (hole in center?) vs gauge (partial arc?)
- **Line?** → single vs multi, stepped vs smooth, with area or without
- **Table vs list?** → columns aligned across rows with header = table; self-contained rows = list

**Anti-pattern to avoid**: "it has bars so it's a bar chart" → WRONG. The failure mode is picking `chart-bar-grouped-vertical` when the design is `chart-bar-stacked-horizontal-percentage`. These render completely differently with completely different data bindings.

**Anti-pattern to avoid**: "it has circles so it's a donut" → WRONG. A pair of stacked vertical bar charts side-by-side is NOT two donut charts, even if the bars have rounded segments. LOOK AT THE ACTUAL SHAPE.

**Promotion rule**: an item becomes an **element contract** if:
- It appears ≥2 times across the design, OR
- It has non-trivial visual spec (≥5 distinct spec properties), OR
- It has states or interactions beyond "static display"

Otherwise, it stays internal to its widget or page (no contract needed).

### Atoms are NOT optional

Icons, badges, chips, dividers, avatars, status dots, spinners — every small artifact that appears in the design gets an element contract if it meets the promotion rule. These are the #1 most-missed tier and produce the "feels off" verification result.

## Step 3: Identify Widgets

A **widget** is a self-contained card with ONE headline job: one title, one body, optional header controls, optional footer/legend. Examples: "Revenue Breakdown" (donut + legend + title + filter), "Device Type" (donut + legend), "Number of Tools" (KPI + bar + legend).

A **section** is a visual grouping of MULTIPLE widgets that share a common heading or layout container. Sections live in the page contract's layout — they are NOT widgets.

### The Sub-Card Rule (MANDATORY)

**If a visual grouping contains multiple titled sub-cards (each with its own h3/header and its own body), each sub-card is its own widget. The grouping is a section handled in the page layout phase.**

```
WRONG — one widget conflating three cards:
  device-browser-widget
    ├── sub-card "Device Type" (donut)
    ├── sub-card "Operating System" (bar)
    └── sub-card "Browser" (bar)

RIGHT — three widgets + a page-level section:
  device-type-widget         ← widget
  operating-system-widget    ← widget
  browser-widget             ← widget
  device-browser-section     ← page-layout section grouping the 3 widgets
```

**Test**: Count the number of distinct titled headers (h3 / card title) inside the visual group. If > 1, it is a section, not a widget. Split it.

### Widget vs. Page-Internal Composition

For each candidate widget, determine:
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

## Step 5: Confirm Decomposition With User — Contract Review Checkpoint

Present the full hierarchy summary WITH classification reasoning:

```
DECOMPOSITION SUMMARY
─────────────────────
Elements: 14 contracts
  Charts: 4 (chart-donut, chart-bar-stacked-horizontal-percentage, chart-line-single, chart-sparkline-line)
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
```

**Then present the classification reasoning table** (from Step 2) as a condensed review:

| # | Widget/Element | Classified As | Key Reasoning | Confidence |
|---|----------------|---------------|---------------|------------|
| 1 | Most Popular Tools body | chart-donut | Circle with center hole + center label "485" + 5 colored segments | HIGH |
| 2 | Number of Tools body | chart-bar-stacked-horizontal-percentage | Single horizontal bar, 4 segments summing to 100%, {num}% labels | HIGH |
| 3 | Member State chart | chart-bar-stacked-vertical | Multiple stacked vertical bars, 2 groups side-by-side, percentage labels | MEDIUM — verify |
| ... | | | | |

**Highlight any MEDIUM/LOW confidence entries** — these are the misclassification risks.

**Present the data inventory** for each widget — the user can quickly spot if column headers or labels were hallucinated:

| Widget | Title | Subtitle | Data Labels |
|--------|-------|----------|-------------|
| Video Playlist | "Video Playlist" | (none) | Columns: Video, Viewed, Clicked Thumbnail, Clicked CTA, Avg. Seconds Watched |
| Tool Engagement | "Tool Engagement" | (none) | Tabs: [Your 2026 Plan Options, ...], Stats: "487 Total members who viewed", "300 Total members who clicked CTA" |

Ask user: "Proceed with this decomposition? [y/n/edit]"
- **y** → Step 6
- **n** → abort
- **edit** → accept user revisions to the hierarchy, re-present

> **Why this checkpoint matters**: The 13-task validation (v2.59–v2.67) proved contracts→code is airtight. But Figma→contracts was unverified — misclassifications at this step propagate through the entire build uncaught. This 5-minute review catches: wrong chart types, hallucinated data models, missing elements, wrong labels.

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
4. **Extract layout CSS from `get_design_context` output (MANDATORY)**:
   The Figma MCP returns code with explicit CSS layout properties. Parse these into the
   widget contract's "Internal Element Layout" section:
   - `body_layout`: Look at the parent container's CSS in the Figma output.
     `flex flex-row` or `flex gap-[16px] items-center` → `flex-row`.
     `flex flex-col` or `flex-col gap-[16px]` → `flex-column`.
     `grid grid-cols-2` → `grid 2-col`. Write EXACTLY what the Figma shows.
   - `body_gap`: Extract the gap value from the Figma CSS (e.g., `gap-[16px]` → `16px`)
   - Legend position: If legend is a SIBLING of the chart in a `flex-row` container →
     legend is BESIDE the chart (`body_sidebar`). If legend is BELOW the chart in a
     `flex-col` container → legend is in `footer_legend`. This distinction is CRITICAL —
     it's the difference between a side-by-side layout and a stacked layout.
   - `container_height`: If the Figma shows `h-[334px]` → fixed height `334px`.
     If no explicit height → `auto`.

For each page contract:
1. Copy `templates/page-contract.md` as scaffold
2. Reference widgets in grid positions
3. Define route, data loading, global states, performance budget
4. **Extract grid structure from `get_design_context` output (MANDATORY)**:
   The Figma MCP returns the page's layout as nested containers. Parse the structure:
   - Count "Row" or `flex-row` containers and their children to determine grid dimensions
     (e.g., 2 Row containers with 2 cards each → `grid 2×2`, NOT `grid 1×4`)
   - Extract `gap` values between rows and between cards within rows
   - Extract explicit heights on cards (e.g., `h-[334px]`)
   - Document in the page contract's "Widgets Used" table:
     ```
     | grid[row=1, cols=1-2] | most-popular-tools + number-of-tools | 2 per row |
     | grid[row=2, cols=1-2] | time-on-page + number-of-visits      | 2 per row |
     ```
   - **Anti-pattern**: Seeing 4 sibling cards and writing `grid-cols-4` when the Figma
     groups them into 2 rows of 2. ALWAYS check the parent container structure.

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

## Figma Element Counts (MANDATORY — verification anchor)

These counts are captured from the Figma decomposition and serve as the
ground truth during verification. Any mismatch between these counts and
the built output is a CRITICAL deviation.

| Level    | Count | Source                          |
|----------|-------|---------------------------------|
| Elements | {N}   | Inventory table (Step 1d)       |
| Widgets  | {N}   | Widget inventory (Step 3)       |
| Pages    | {N}   | Page inventory (Step 4)         |
| Total    | {N}   | Sum of all contracts            |

Per-page element manifest (for verification agent):
| Page               | Widgets | Elements (including widget-internal) |
|--------------------|---------|--------------------------------------|
| {dashboard}        | {N}     | {N} — {list: stat-card ×4, chart-donut ×1, ...} |
| {analytics}        | {N}     | {N} — {list} |
```

## Step 6.5: Contract-vs-Figma Verification Gate — SEPARATE AGENT (MANDATORY)

After writing all contracts but BEFORE proceeding to partition or build, spawn a **dedicated verification subagent** to independently verify every chart classification against the Figma source. This agent has FRESH context, no sunk cost in the classifications, and its sole incentive is finding mismatches.

> **Why a separate agent?** The decompose agent that classified the charts cannot objectively verify its own classifications. It has the same blind spots that caused the misclassification. This was proven repeatedly — the same agent rubber-stamps its own work. A fresh agent with only the contracts and Figma access catches what the classifier missed.

**OBSERVABILITY LOGGING (MANDATORY):**
Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`

⚙ [opus] gsd-t-design-decompose → Chart Classification Verifier

```
Task subagent (general-purpose, model: opus):
"You are the Chart Classification Verifier. Your ONLY job is to independently
verify that each element contract's chart type classification matches the actual
Figma design. You have ZERO knowledge of how the charts were classified — you
are seeing them fresh. Your incentive: every misclassification you catch prevents
a wrong chart being built. Every misclassification you miss causes a rebuild.

## Contracts to Verify
{list each element contract filename + its claimed chart type from INDEX.md}

## Figma Source
File key: {fileKey}
Page node: {nodeId}

## Verification Process

For EACH element contract that claims a chart/visualization type:

1. Read the element contract — note its claimed type (e.g., 'bar-vertical-grouped')
2. Find the Figma node ID referenced in the contract (or in the widget that uses it)
3. Call `get_design_context` on that specific node ID — examine the STRUCTURE:
   - Layout mode (horizontal vs vertical arrangement of children)
   - Child elements (are they bars? segments? slices?)
   - How children are arranged (side by side? stacked? overlapping?)
   - Dimensions (do bars extend horizontally or vertically?)

4. Walk the decision tree INDEPENDENTLY (do NOT read the contract's reasoning):

   BAR CHART ORIENTATION PROOF:
   a. Are the data-bearing rectangles arranged HORIZONTALLY (left to right)?
      → Segments share ONE ROW, each segment's WIDTH encodes its value
      → This is HORIZONTAL (stacked if touching, grouped if separated)
   b. Are the data-bearing rectangles arranged VERTICALLY (bottom to top)?
      → Each bar is a COLUMN, each bar's HEIGHT encodes its value
      → This is VERTICAL (stacked if layered, grouped if side-by-side)
   c. Is it ONE bar with colored segments? → STACKED
      Is it MULTIPLE separate bars? → GROUPED
   d. Do labels show percentages summing to 100%? → PERCENTAGE variant

   CRITICAL DISTINCTION — the #1 misclassification:
   A single horizontal bar divided into colored segments (each segment's WIDTH
   represents a percentage) is chart-bar-stacked-horizontal-percentage.
   Multiple vertical columns of different heights side-by-side is
   chart-bar-grouped-vertical. These render COMPLETELY DIFFERENTLY.
   If you see colored blocks in a ROW → HORIZONTAL. Period.

5. Compare YOUR classification against the contract's classification.

6. For EACH element, produce:

   ```
   Element: {name}
   Contract claims: {chart type}
   Figma node: {id}
   I SEE: {describe what the Figma MCP returned — layout, children, arrangement}
   MY CLASSIFICATION: {your independent classification}
   VERDICT: ✅ MATCH or ❌ MISMATCH
   If MISMATCH: Contract says {X} but Figma shows {Y} because {evidence}
   ```

## Report

Produce the full verification table:

| # | Element | Contract Type | Verified Type | Figma Evidence | Verdict |
|---|---------|--------------|---------------|----------------|---------|
| 1 | chart-donut | chart-donut | chart-donut | circular arcs + center hole | ✅ MATCH |
| 2 | bar-vertical-grouped | bar-vertical-grouped | bar-stacked-horizontal-pct | 4 segments in ONE horizontal row | ❌ MISMATCH |

If ANY ❌ MISMATCH found:
- List each mismatch with the correct classification and evidence
- Report: 'VERIFICATION FAILED — {N} misclassifications found. Contracts must be fixed before build.'

If ALL ✅ MATCH:
- Report: 'VERIFICATION PASSED — all {N} chart classifications confirmed against Figma source.'
"
```

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`

Compute tokens/compaction per standard pattern. Append to `.gsd-t/token-log.md`.

**If VERIFICATION FAILED**: Fix every misclassified element contract before proceeding:
1. Rename the contract file to match the correct chart type
2. Rewrite the visual spec section to match the correct chart type
3. Update INDEX.md references
4. Update any widget contracts that reference the renamed element
5. **Re-run the verification subagent** to confirm fixes (max 2 cycles)

**If VERIFICATION PASSED**: Proceed to Step 7.

> **Why this gate exists**: The decompose agent's own examples show the correct classification for "Number of Tools" as `chart-bar-stacked-horizontal-percentage` — yet the agent classified the same chart as `bar-vertical-grouped` in practice. Soft instructions ("MANDATORY decision tree") don't prevent misclassification. A separate agent with fresh context and inverted incentives (success = finding errors) does.

## Step 7: Wire Into Partition

If `.gsd-t/domains/` exists (project is already partitioned), append to relevant domain's `scope.md`:

```markdown
## Design Contracts
This domain owns the following design contracts:
- Elements: chart-donut, legend-vertical-right
- Widgets: revenue-breakdown-widget
- Pages: (none — pages owned by page-assembly domain)
```

If `.gsd-t/domains/` does NOT exist yet, suggest the user run `/gsd-t-partition` next, with a note that design contracts should be partitioned into domains:
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

**Design Build** — build UI from contracts with tiered review gates (elements → widgets → pages)

`/gsd-t-design-build`

**Also available:**
- `/gsd-t-partition` — if you need domain boundaries before building
- `/gsd-t-plan` — if you need task lists before building

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
