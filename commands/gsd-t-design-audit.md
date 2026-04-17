# GSD-T: Design Audit — Compare Built Screen Against Figma Design

You are the design audit agent. Your ONLY job is to compare an existing built screen against the original Figma design and produce a structured deviation report. You write ZERO code. You fix ZERO issues. You report what's wrong.

**Input**: A Figma URL/file key + a running app URL or route path.
**Output**: A markdown deviation report with per-widget comparison tables.

---

## Step 0: Parse Inputs

Extract from `$ARGUMENTS`:
- **Figma source**: file key, node ID, or full URL (e.g., `TFojdtYYss7J2qHscfRDRO`, `figma.com/design/...`)
- **Built app target**: route path (e.g., `/analytics`), full URL (e.g., `http://localhost:5173/analytics`), or "current page"
- **Scope** (optional): specific widget name or section to audit. Default: full page.

If Figma source is missing → ask user: "Provide the Figma file key or URL"
If built app target is missing → check if a dev server is running. If not → ask user: "Provide the route or URL of the built page to audit"

**Design system / component library?**
- Ask user: "Is a design system or component library being used (e.g., shadcn-vue, Vuetify, Radix, MUI)? If so, provide the URL."
- If yes → fetch the docs, note which components the library provides and their default styling (padding, radius, shadows, colors)
- Factor into Step 3 comparisons: deviations that match library defaults (not Figma) may indicate "used library default instead of design value" — flag as a distinct deviation category
- If no → proceed as normal

## Step 0.5: Hierarchical Audit Mode (when design hierarchy exists)

Check if `.gsd-t/contracts/design/INDEX.md` exists. If it does NOT, skip to Step 1 (flat audit mode).

**If it EXISTS**: The design was decomposed hierarchically (elements → widgets → pages). Audit bottom-up — this pinpoints exactly WHERE a deviation originates.

### Level 1 — Element Audit

For each element contract in `.gsd-t/contracts/design/elements/`:

1. Read the element contract — extract visual spec (sizes, colors, spacing, chart type, props)
2. Find the corresponding built component in the project (`src/components/elements/` or equivalent)
3. If the component DOES NOT EXIST → ❌ CRITICAL: "Element `{name}` has no built component"
4. If it EXISTS:
   a. Render the component in isolation (if a dev route or Storybook exists) or locate it within the full page
   b. Compare chart type: does the contract say `bar-vertical-grouped`? Is the built component actually vertical bars?
   c. Compare visual spec: dimensions, colors, spacing, typography per the element contract
   d. Produce a comparison row: `| {element-name} | {contract chart type} | {built chart type} | {verdict} |`

```markdown
### Element Audit

| # | Element | Contract Type | Built Type | Key Properties | Verdict |
|---|---------|--------------|------------|----------------|---------|
| 1 | chart-donut | donut 192px, 32px stroke | donut 192px, 32px stroke | ✅ | ✅ MATCH |
| 2 | bar-vertical-grouped | vertical bars, 4 groups | horizontal bars | ❌ wrong axis | ❌ CRITICAL |
| 3 | bar-vertical-single | vertical bars, single color | donut chart | ❌ wrong chart type | ❌ CRITICAL |
```

**If ANY element has a chart type mismatch → flag CRITICAL immediately.** This is the exact failure mode that caused the BDS rebuild to fail: the element contract says vertical bars, but a donut was built. No amount of widget or page-level auditing can fix a wrong element.

### Level 2 — Widget Assembly Audit

For each widget contract in `.gsd-t/contracts/design/widgets/`:

1. Read the widget contract — extract "Elements Used" list and layout spec
2. Find the built widget component (`src/components/widgets/` or equivalent)
3. If the widget DOES NOT EXIST → ❌ CRITICAL: "Widget `{name}` has no built component"
4. If it EXISTS:
   a. Check: does the widget IMPORT its element components, or does it rebuild element functionality inline?
      - Grep the widget file for imports from `elements/` or `components/elements/`
      - If the widget contains inline chart/card implementations that duplicate element components → ❌ HIGH: "Widget rebuilds `{element}` inline instead of importing"
   b. Check: does the widget compose the CORRECT elements per the contract?
      - Contract says "uses chart-donut, legend-vertical-right" — does the widget import both?
   c. Check layout: spacing between elements, responsive behavior per widget contract

```markdown
### Widget Assembly Audit

| # | Widget | Elements (contract) | Elements (built) | Imports elements? | Layout match? | Verdict |
|---|--------|--------------------|--------------------|-------------------|---------------|---------|
| 1 | donut-chart-card | chart-donut, legend-vertical-right, card-header | chart-donut, legend-vertical-right, card-header | ✅ imports | ✅ | ✅ MATCH |
| 2 | bar-chart-card | bar-vertical-grouped, card-header, legend-horizontal | HorizontalBarGroup (inline) | ❌ inline rebuild | ❌ | ❌ HIGH |
```

### Level 3 — Page Composition Audit

For each page contract in `.gsd-t/contracts/design/pages/`:

1. Read the page contract — extract widget list and grid positions
2. Find the built page component
3. Check: does the page IMPORT its widget components, or inline everything?
4. Check: section ordering, grid layout, responsive breakpoints

```markdown
### Page Composition Audit

| # | Widget (contract) | Widget (built) | Imports widget? | Position match? | Verdict |
|---|-------------------|----------------|-----------------|-----------------|---------|
| 1 | filter-bar-widget | FilterBarWidget | ✅ | ✅ | ✅ MATCH |
| 2 | kpi-strip-widget | (inline stat cards) | ❌ inline rebuild | ✅ | ❌ HIGH |
```

### Hierarchy Summary

After all three levels:

```markdown
### Hierarchy Audit Summary

| Level | Total | Match | Deviations | Critical |
|-------|-------|-------|------------|----------|
| Elements | 27 | 24 | 3 | 2 (wrong chart type) |
| Widgets | 10 | 7 | 3 | 0 (3 inline rebuilds) |
| Pages | 1 | 0 | 1 | 0 (inline widgets) |

**Root cause**: 2 element-level chart type mismatches. Fix elements first — widget and page deviations may resolve automatically once correct elements are imported.
```

**After the hierarchy audit, continue to Step 1 for the full Figma comparison.** The hierarchy audit identifies structural issues (wrong types, inline rebuilds). The Figma comparison (Steps 1-4) catches visual property deviations (colors, spacing, sizes).

## Step 1: Map the Figma Design — Node-Level Decomposition

### 1a. Get the page tree

Call `get_metadata` on the Figma page/frame to enumerate all child nodes. List every widget-level group:

```
Figma node tree:
├── stat-card-campaign (id: 123:456)
├── stat-card-visitors (id: 123:457)
├── most-popular-tools-card (id: 123:458)
├── ...
```

### 1b. Extract each widget node

For EACH widget-level node, call **`get_design_context`** (NOT `get_screenshot`) with the specific node ID. `get_design_context` returns structured code and component properties that you can extract exact values from. `get_screenshot` returns only visual images — do NOT use it for Figma data extraction.

Record from the `get_design_context` response:
- **Chart/element type**: what visual pattern does this node contain?
- **All text content**: every title, subtitle, label, column header, legend item, KPI value, axis label
- **Layout properties**: alignment, spacing, sizing from the returned code/structure
- **Colors**: exact hex values for fills, strokes, text

> **⚠ Size guard**: Never call `get_design_context` on the full page frame. Always call on individual widget/card nodes.
> **⚠ Tool guard**: NEVER use `get_screenshot` to extract Figma design values. It gives you pixels, not properties. Use `get_design_context` — it gives you code, tokens, and structured data.

### 1c. Classify each element using the taxonomy

For each chart/visualization, walk the taxonomy decision tree (from `~/.claude/templates/design-chart-taxonomy.md`):

```
Widget: "Member Segmentation: State"
  I SEE: Two groups of vertical bars, each group has 5 stacked colored segments
         with percentage labels. Groups labeled "Members in Campaign" and
         "Members Who Visited Page". Legend below with 5 state names.
  CLASSIFICATION: chart-bar-stacked-vertical (two instances side-by-side)
```

## Step 1.5: Element Count Reconciliation (MANDATORY)

Before any property comparison, verify the built page has the correct number of elements:

1. **Count from Figma** (from Step 1):
   - Total widgets/cards identified
   - Total elements within widgets (charts, legends, stat cards, controls, tables)
   - Record: `Figma: {N} widgets, {M} total elements`

2. **Count from built page** (open in browser via Playwright):
   - Count top-level visual groups (cards/widgets)
   - Count elements within each group
   - Record: `Built: {N} widgets, {M} total elements`

3. **Compare**:
   - Widget count match? If NO → ❌ CRITICAL: identify MISSING or EXTRA widgets by name
   - Element count match per widget? If NO → ❌ CRITICAL: identify MISSING or EXTRA elements

```markdown
### Element Count Reconciliation

| Level              | Figma | Built | Verdict |
|--------------------|-------|-------|---------|
| Widgets (page)     | 10    | 9     | ❌ MISSING: video-playlist-widget |
| Elements (total)   | 27    | 24    | ❌ MISSING: 3 elements in video-playlist-widget |
```

A missing widget is the most catastrophic deviation — it means an entire section of the design was silently dropped. Catch it here before spending effort on property-level comparison of widgets that DO exist.

## Step 2: Capture the Built Screen

Open the built app at the target URL/route. For each widget identified in Step 1:

1. Locate the corresponding element in the built page
2. Record:
   - What chart/element type was actually built?
   - All visible text (titles, subtitles, labels, headers, legend items)
   - Layout: alignment, spacing, sizing
   - Colors: rendered values

If the built page has widgets NOT in the Figma → flag as "EXTRA — not in design"
If the Figma has widgets NOT in the built page → flag as "MISSING — not built"

## Step 3: Per-Widget Comparison Table (MANDATORY)

For each widget, produce a comparison table with **minimum 10 rows per widget** (30+ rows for complex widgets):

```markdown
### Widget: {name} — {Figma node ID}

| # | Property | Figma | Built | Verdict |
|---|----------|-------|-------|---------|
| 1 | Chart type | chart-bar-stacked-vertical | chart-donut | ❌ CRITICAL |
| 2 | Title text | "State" | "State" | ✅ MATCH |
| 3 | Subtitle text | (none) | "By region" | ❌ HIGH — subtitle not in Figma |
| 4 | Bar width | 32px | 64px | ❌ HIGH |
| 5 | Bar group gap | 24px | 8px | ❌ HIGH |
| 6 | Label position | inside-center | outside-right | ❌ HIGH |
| 7 | Segment order (bottom→top) | [IL, NM, TX, OK, MT] | [NM, MT, OK, TX, IL] | ❌ MEDIUM |
| 8 | Legend alignment | center | left | ❌ MEDIUM |
| 9 | Legend items | NM, MT, OK, TX, IL | NM, MT, OK, TX, IL | ✅ MATCH |
| 10 | Card padding | 16px | 24px | ❌ MEDIUM |
```

### Mandatory properties to check per widget:

**Structure:**
- Chart/element type (is it even the right kind of chart?)
- Element count (right number of charts, legends, sub-components?)
- Layout arrangement (side-by-side vs stacked, grid vs flex)

**Text content:**
- Title (exact text match)
- Subtitle (present/absent + exact text)
- Column headers / axis labels (exact text + order)
- Legend items (exact text + order)
- KPI values and labels
- Footer text

**Chart-specific (if applicable):**
- Bar width, bar gap, bar group gap
- Segment/slice order
- Label position (inside/outside/above/below)
- Corner radius on bars
- Line stroke width, point radius
- Donut inner/outer diameter, center content

**Layout & spacing:**
- Card padding (top, right, bottom, left)
- Gap between title and body
- Gap between chart and legend
- Chart dimensions (width × height)
- Legend alignment (left/center/right)
- Element alignment within card (centered/left/stretch)

**Colors:**
- Segment/bar/slice fill colors (exact hex)
- Text colors
- Border colors
- Background colors

**Responsive (if mobile design exists):**
- Mobile layout (stacked vs side-by-side)
- Mobile font sizes
- Mobile spacing changes

### Verdict severity scale:

| Severity | Meaning | Examples |
|----------|---------|---------|
| **CRITICAL** | Wrong element type or data model | Donut instead of stacked bar; wrong column headers; invented data |
| **HIGH** | Wrong layout, sizing, or spacing that changes the visual meaning | Bar width 2× too wide; labels inside vs outside; elements missing |
| **MEDIUM** | Wrong alignment, color, or order that looks incorrect but doesn't change meaning | Legend left instead of center; segment order reversed; wrong shade |
| **LOW** | Minor sizing or spacing that's barely noticeable | 2px padding difference; slight font-size mismatch |

## Step 3.5: SVG Structural Overlay Comparison (MANDATORY)

After the per-widget property comparison, run a mechanical SVG-based diff to catch aggregate visual drift that individual property checks miss.

1. **Export the Figma frame as SVG**:
   - Use the Figma REST API or MCP to export the page/frame as SVG
   - If export is unavailable, ask the user to export and provide the SVG path
   - Store the SVG at `.gsd-t/design-verify/{page-name}-figma.svg`

2. **Parse the SVG DOM**: extract every `<rect>`, `<text>`, `<circle>`, `<path>`, `<g>` with their positions (x, y), dimensions (width, height), fills, strokes, and text content

3. **Screenshot the built page** at the same viewport width via Playwright

4. **Map SVG elements → built DOM elements** by:
   - Text content matching (highest confidence)
   - Position proximity (x,y within 10px tolerance)
   - Dimensional similarity (width/height within 10% tolerance)

5. **Compare each mapped pair**:

| Check | SVG Value | Built Value | Threshold |
|-------|-----------|-------------|-----------|
| Position (x,y) | SVG coordinates | DOM bounding box | ≤2px = MATCH, 3-5px = REVIEW, >5px = DEVIATION |
| Dimensions (w,h) | SVG width/height | DOM width/height | ≤2px = MATCH, 3-5px = REVIEW, >5px = DEVIATION |
| Colors | SVG fill/stroke hex | Computed CSS color | Exact hex = MATCH |
| Text content | SVG `<text>` | DOM textContent | Exact = MATCH |

6. **Produce SVG structural diff table**:

```markdown
### SVG Structural Diff

| # | SVG Element | SVG Position | Built Position | Δ px | Verdict |
|---|-------------|-------------|----------------|------|---------|
| 1 | stat-card-1 rect | (24, 120) 320×200 | (24, 118) 320×204 | 2/4 | ⚠ REVIEW |
| 2 | chart-title text | (40, 140) | (40, 140) | 0 | ✅ MATCH |
```

7. **Unmapped elements**:
   - SVG elements with no DOM match → flag as "MISSING IN BUILD"
   - DOM elements with no SVG match → flag as "EXTRA — not in design"

8. **Visual overlay** (optional but recommended):
   - Render SVG in browser at target viewport size
   - Overlay on built page screenshot with 50% opacity or difference blend mode
   - Save to `.gsd-t/design-verify/{page-name}-overlay.png`

This step catches spacing rhythm, alignment drift, and proportion issues that pass the per-widget property check but are visually wrong in aggregate.

## Step 3.75: DOM Box Model Inspection (MANDATORY for fixed-height containers)

For each card/widget with a fixed height, inspect the internal space distribution:

1. **Evaluate in browser** (via Playwright) for each card body child:
   - `offsetHeight` (layout box size), `scrollHeight` (content size), `flex-grow` (computed)

2. **Flag inflated elements**: any element where `offsetHeight > scrollHeight * 1.5`
   - This means `flex: 1` or `flex-grow: 1` is inflating the element's box beyond its content
   - Severity: HIGH — "`.kpi` offsetHeight=144px but content only needs 40px — inflated by flex growth"

3. **Verify layout arithmetic**: sum all child `offsetHeight` values + computed gaps. Compare against card body `offsetHeight`:
   - Sum > body → content overflows (❌ DEVIATION)
   - Sum < body by >20px with no centering strategy → space is unaccounted (❌ DEVIATION)

4. **Produce box model table** per widget:

```markdown
### Box Model: {widget-name}

| # | Element | offsetHeight | scrollHeight | flex-grow | Verdict |
|---|---------|-------------|-------------|-----------|---------|
| 1 | .kpi    | 144px       | 40px        | 1         | ❌ INFLATED |
| 2 | .chart  | 74px        | 74px        | 0         | ✅ MATCH |
```

## Step 4: Summary Report

After all widgets are audited (property tables + SVG structural diff + box model), produce a summary:

```markdown
## Design Audit Summary

**Page**: {page name}
**Figma**: {file key / URL}
**Built**: {route / URL}
**Date**: {YYYY-MM-DD}

### Overall Score

| Severity | Count |
|----------|-------|
| CRITICAL | {N} |
| HIGH     | {N} |
| MEDIUM   | {N} |
| LOW      | {N} |
| MATCH    | {N} |

**Fidelity**: {MATCH count} / {total rows} ({percentage}%)

### Top Issues

1. {Most impactful deviation — severity + widget + description}
2. {Second most impactful}
3. ...

### Widgets Not in Figma (built but shouldn't exist)
- {list or "None"}

### Widgets Not Built (in Figma but missing)
- {list or "None"}
```

## Step 5: Write Report

Save the full report to `.gsd-t/design-audit-{page-name}-{YYYY-MM-DD}.md`

Display the summary to the user inline.

## Step 6: Fix Prompt (auto-triggered if deviations found)

If ANY CRITICAL or HIGH deviations were found, automatically prompt the fix workflow:

```
───────────────────────────────────────────────────────────────

## ▶ Fix Deviations

**{N} CRITICAL + {N} HIGH deviations found.** Fix them now?

The audit report at `.gsd-t/design-audit-{page-name}-{YYYY-MM-DD}.md`
has the exact Figma values for each deviation.

`/gsd-t-quick fix all CRITICAL and HIGH deviations from .gsd-t/design-audit-{page-name}-{YYYY-MM-DD}.md — use the Figma values in the report as the source of truth`

───────────────────────────────────────────────────────────────
```

If ONLY MEDIUM or LOW deviations remain, show:

```
───────────────────────────────────────────────────────────────

## ▶ Polish (optional)

**{N} MEDIUM + {N} LOW deviations.** These are minor — fix if you want pixel-perfect.

`/gsd-t-quick fix MEDIUM and LOW deviations from .gsd-t/design-audit-{page-name}-{YYYY-MM-DD}.md`

───────────────────────────────────────────────────────────────
```

If ZERO deviations → display "✅ Pixel-perfect. No fixes needed."

After fixes are applied, **re-run the audit automatically** to verify. Loop until:
- All CRITICAL and HIGH are resolved, OR
- 2 fix cycles have been attempted (then stop and present remaining deviations to user)

## Rules

- **You write ZERO code during the audit phase (Steps 1-5).** Report only. Code changes happen in Step 6 via `/gsd-t-quick`.
- **You do NOT "look close" at anything.** Every property gets an exact value from Figma and an exact value from the build. They match or they don't.
- **You do NOT skip widgets.** Every widget in the Figma AND every widget in the build gets audited.
- **You MUST call `get_design_context` per widget node — NOT `get_screenshot`.** `get_design_context` returns structured code, component properties, and design tokens. `get_screenshot` returns only a visual image that you cannot extract exact values from. Using `get_screenshot` for widget extraction defeats the entire purpose of structured comparison — you end up eyeballing instead of measuring. The ONLY acceptable use of `get_screenshot` is for the built page (Step 2) where you need to see what was actually rendered. For Figma source data, ALWAYS use `get_design_context`.
- **You walk the taxonomy decision tree** for every chart element — document your reasoning.
- **Minimum 10 rows per widget, 30+ for complex widgets.** Fewer rows means you skipped properties.
- **If you can't determine a value** (e.g., Figma MCP unavailable for exact px), note "⚠ estimated from screenshot" — but still provide your best measurement.

---

## Document Ripple

- Append audit entry to `.gsd-t/progress.md` Decision Log:
  `- {YYYY-MM-DD HH:MM}: gsd-t-design-audit — audited {page} against Figma {file key}. {N} CRITICAL, {N} HIGH, {N} MEDIUM, {N} LOW deviations. Fidelity: {N}%.`

$ARGUMENTS
