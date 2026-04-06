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

## Step 6.5: Contract-vs-Figma Verification Gate (MANDATORY)

After writing all contracts but BEFORE proceeding to partition or build, verify that each contract accurately represents the Figma design. This gate catches errors that would otherwise propagate through the entire build.

### For each widget contract:

1. **Re-read the Figma node** — call `get_design_context` (or re-examine the screenshot) for the specific widget node
2. **Compare the contract's claimed structure against the actual Figma node:**

| Check | What to verify | Failure mode it prevents |
|-------|---------------|------------------------|
| Chart type | Contract's element name matches the actual visual pattern | Donut classified as stacked bar (or vice versa) |
| Data labels | Contract's Test Fixture labels match the Figma text exactly | Hallucinated column headers, invented metrics |
| Element count | Number of sub-elements in contract matches Figma | Missing legends, extra charts, wrong layout |
| Text content | Every title, subtitle, label, legend item matches Figma verbatim | "Engagement per video" subtitle that doesn't exist in Figma |
| Layout structure | Widget's claimed layout matches Figma arrangement | Side-by-side classified as stacked, 2 charts classified as 1 |

3. **Produce a contract-vs-Figma mismatch report:**

```
CONTRACT-VS-FIGMA VERIFICATION
───────────────────────────────
✅ most-popular-tools-card: chart-donut — MATCHES Figma node 123:458
✅ number-of-tools-card: chart-bar-stacked-horizontal-percentage — MATCHES
❌ member-state-card: chart-donut — MISMATCH: Figma shows stacked vertical bars, not donuts
   → Fix: reclassify as chart-bar-stacked-vertical, rewrite element contract
❌ video-playlist-table: columns [Title, Duration, Views, Watch Time, Completion]
   — MISMATCH: Figma shows [Video, Viewed, Clicked Thumbnail, Clicked CTA, Avg. Seconds Watched]
   → Fix: update Test Fixture column headers
```

4. **If ANY mismatches found**: fix the contracts BEFORE proceeding. Do not build from wrong contracts.

> **Why this gate exists**: The two-terminal validation (tasks 001-013) proved the system produces 50/50 scores when contracts are correct — but also revealed that scoring code-vs-contract doesn't catch contract-vs-Figma errors. This gate closes that gap.

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
