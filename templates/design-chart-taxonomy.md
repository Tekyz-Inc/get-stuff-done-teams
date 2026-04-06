# Design Chart & Atom Taxonomy (Closed Set)

When decomposing a design into element contracts, you MUST pick from this enumerated list. DO NOT invent element names. If a design element doesn't fit any of these, STOP and ask the user to extend the taxonomy before proceeding.

## Why this is a closed set

The catastrophic failure mode is: agent sees "bars" in Figma, picks `chart-bar-grouped-vertical`, but the design is actually `chart-bar-stacked-horizontal-percentage`. Different element, different contract, different data binding. Closed enumeration with visual distinguishers prevents this.

---

## Charts

### Bar charts

| Element name                                  | Visual distinguisher                                                                 |
|------------------------------------------------|--------------------------------------------------------------------------------------|
| `chart-bar-horizontal-single`                  | One bar per category, horizontal orientation, single series                          |
| `chart-bar-vertical-single`                    | One bar per category, vertical orientation, single series                            |
| `chart-bar-grouped-horizontal`                 | Multiple bars per category SIDE-BY-SIDE, horizontal, ≥2 series (legend required)     |
| `chart-bar-grouped-vertical`                   | Multiple bars per category SIDE-BY-SIDE, vertical, ≥2 series (legend required)       |
| `chart-bar-stacked-horizontal`                 | Segments STACKED in one bar per category, horizontal, ≥2 series with absolute values |
| `chart-bar-stacked-vertical`                   | Segments STACKED in one bar per category, vertical, ≥2 series with absolute values   |
| `chart-bar-stacked-horizontal-percentage`      | SINGLE horizontal bar, 100% width, segments sum to 100% (distribution viz)           |
| `chart-bar-stacked-vertical-percentage`        | SINGLE vertical bar, 100% height, segments sum to 100%                               |
| `chart-bar-diverging-horizontal`               | Bars extend left AND right from a center axis (sentiment, pos/neg)                   |
| `chart-bar-range-horizontal`                   | Floating bars showing min-max range (no origin axis)                                 |
| `chart-bar-waterfall-vertical`                 | Sequential bars showing cumulative change, pos/neg                                   |

**Decision rule for bar charts:**
1. Does the chart show ONE bar with segments that sum to 100%? → `*-stacked-*-percentage`
2. Does the chart show multiple bars stacked together? → `*-stacked-*` (non-percentage if absolute values shown)
3. Does the chart show multiple bars side-by-side per category? → `*-grouped-*`
4. Single-series, one bar per category? → `*-single`

### Line / area charts

| Element name                     | Visual distinguisher                                                 |
|----------------------------------|----------------------------------------------------------------------|
| `chart-line-single`              | One line, continuous x-axis                                          |
| `chart-line-multi`               | ≥2 lines, shared x-axis, legend required                             |
| `chart-area-single`              | Line with filled area below                                          |
| `chart-area-stacked`             | Multiple filled areas stacked (summed)                               |
| `chart-area-stacked-percentage`  | Multiple filled areas stacked to 100%                                |
| `chart-line-step`                | Stepped line (no diagonal connectors)                                |
| `chart-line-smooth`              | Smoothed/curved line (bezier)                                        |

### Circular charts

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `chart-pie`               | Full circle, no hole                                      |
| `chart-donut`             | Circle with center hole, may show center label/value      |
| `chart-donut-gauge`       | Partial donut (half or quarter circle) as gauge/progress  |
| `chart-radial-bar`        | Concentric arcs, one per category                         |
| `chart-polar`             | Radial grid with data plotted by angle                    |

> **Note on `-percentage` suffix**: Circular charts (`chart-pie`, `chart-donut`) are inherently part-to-whole — the circle is 100% by definition — so they do **NOT** take a `-percentage` suffix. Whether segment labels show percentages (`30%`) or absolute values (`$485`) is a labelling choice recorded in the element contract's Test Fixture, not a distinct element name. Do not invent `chart-donut-percentage` or `chart-pie-percentage`.

### Distribution / comparison

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `chart-scatter`           | Points on x/y plane, no connecting lines                  |
| `chart-bubble`            | Scatter with variable point size (z-axis)                 |
| `chart-heatmap`           | Grid of cells with color intensity                        |
| `chart-treemap`           | Nested rectangles sized by value                          |
| `chart-histogram`         | Bars showing distribution over continuous range           |
| `chart-boxplot`           | Box + whiskers showing quartiles                          |

### Inline / mini

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `chart-sparkline-line`    | Tiny inline line chart, no axes                           |
| `chart-sparkline-bar`     | Tiny inline bar chart, no axes                            |
| `chart-sparkline-area`    | Tiny inline filled area, no axes                          |
| `chart-progress-bar`      | Horizontal bar showing % complete                         |
| `chart-progress-ring`     | Circular ring showing % complete                          |

### Flow / hierarchy

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `chart-sankey`            | Flow diagram with weighted links                          |
| `chart-funnel`            | Decreasing bars/trapezoids showing attrition              |
| `chart-chord`             | Circular chord diagram                                    |

### Geo

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `chart-choropleth`        | Map with regions colored by value                         |
| `chart-symbol-map`        | Map with points/symbols at locations                      |

---

## Axes (referenced by charts via `extends`)

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `axis-x-categorical`      | Category labels on x-axis                                 |
| `axis-x-time`             | Time/date labels on x-axis                                |
| `axis-x-numeric`          | Numeric scale on x-axis                                   |
| `axis-y-categorical`      | Category labels on y-axis                                 |
| `axis-y-numeric`          | Numeric scale on y-axis                                   |
| `axis-y-log`              | Logarithmic y-axis                                        |
| `axis-y-dual`             | Two y-axes (left + right) with different scales           |

---

## Legends

| Element name               | Visual distinguisher                                      |
|----------------------------|-----------------------------------------------------------|
| `legend-horizontal-top`    | Horizontal row above chart                                |
| `legend-horizontal-bottom` | Horizontal row below chart                                |
| `legend-vertical-left`     | Vertical column left of chart                             |
| `legend-vertical-right`    | Vertical column right of chart                            |
| `legend-inline`            | Labels placed directly on chart (no separate legend area) |
| `legend-interactive`       | Legend items toggle series visibility on click            |

---

## Cards / Containers (widget chrome, but each is itself an element)

| Element name                    | Visual distinguisher                                                    |
|---------------------------------|-------------------------------------------------------------------------|
| `stat-card`                     | Label + large value                                                     |
| `stat-card-with-delta`          | Label + value + delta indicator (↑↓ + % change)                         |
| `stat-card-with-sparkline`      | Label + value + inline sparkline                                        |
| `stat-card-with-icon`           | Label + value + icon tile (colored square/circle with icon)             |
| `stat-card-kpi-large`           | Large value centered, small label below (used above charts)             |
| `card-bordered`                 | Generic card with border + padding                                      |
| `card-elevated`                 | Generic card with shadow                                                |

---

## Tables

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `table-dense`             | Tight row height, small padding                           |
| `table-comfortable`       | Standard row height                                       |
| `table-zebra`             | Alternating row backgrounds                               |
| `table-striped-header`    | Only header row has distinct background                   |

**Decision rule: table vs list?**
- Columns aligned across rows, with a header row labelling columns → **table-\***
- Each row is self-contained (thumbnail + text stack + meta, no shared column grid) → **list-\*** (see Lists section)

---

## Lists

| Element name                   | Visual distinguisher                                                                              |
|--------------------------------|---------------------------------------------------------------------------------------------------|
| `list-simple-vertical`         | Vertical stack of single-line text rows                                                           |
| `list-icon-vertical`           | Vertical stack of rows; each row has leading icon + text                                          |
| `list-avatar-vertical`         | Vertical stack of rows; each row has leading avatar + text stack                                  |
| `list-thumbnail-vertical`      | Vertical stack of rows; each row has leading thumbnail (bounded rect image) + text stack + meta   |

**Decision rule: which list variant?**
- Leading visual is a circular profile image → `list-avatar-vertical`
- Leading visual is a glyph → `list-icon-vertical`
- Leading visual is a bounded-rect image (video thumb, article cover) → `list-thumbnail-vertical`
- No leading visual → `list-simple-vertical`

---

## Controls

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `button-primary`          | Filled, brand color                                       |
| `button-secondary`        | Outlined or muted fill                                    |
| `button-ghost`            | No border/fill, text + hover state only                   |
| `button-icon`             | Icon-only button                                          |
| `button-fab`              | Floating action button (circular, elevated)               |
| `input-text`              | Single-line text input                                    |
| `input-search`            | Text input with leading search icon                       |
| `input-textarea`          | Multi-line text input                                     |
| `select-dropdown`         | Native-or-custom select with chevron                      |
| `select-multi`            | Multi-select (tags/chips)                                 |
| `checkbox`                | Square binary toggle                                      |
| `radio`                   | Circular exclusive choice                                 |
| `toggle`                  | Binary switch                                             |
| `slider-range`            | Continuous range input                                    |
| `tabs-underline`          | Tabs with underline indicator                             |
| `tabs-pill`               | Tabs rendered as pills                                    |
| `tabs-segmented`          | Connected segmented-control style                         |
| `filter-pill`             | Removable filter chip                                     |
| `date-picker`             | Date input with calendar popup                            |
| `date-range-picker`       | Date range input                                          |

---

## Atoms (small visual artifacts — the often-forgotten tier)

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `icon`                    | SVG/icon-font glyph — one contract if all icons share spec, multiple variants if styles differ |
| `icon-outline`            | Stroke-only icons (if coexisting with filled variants)    |
| `icon-filled`             | Filled icons (if coexisting with outline variants)        |
| `logo`                    | Brand logo                                                |
| `avatar`                  | User profile image/placeholder (circle or rounded-square) |
| `badge`                   | Small count indicator (typically on avatar or icon)       |
| `chip`                    | Rounded container with text (filter, tag, status)         |
| `status-dot`              | Colored circle indicator                                  |
| `divider-horizontal`      | Horizontal line separator                                 |
| `divider-vertical`        | Vertical line separator                                   |
| `spinner`                 | Loading indicator                                         |
| `skeleton`                | Loading placeholder                                       |
| `tooltip`                 | Hover-triggered info bubble                               |
| `breadcrumb`              | Hierarchical nav trail                                    |
| `pagination`              | Page number navigation                                    |
| `tag`                     | Non-removable text label (unlike chip)                    |

---

## Typography

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `heading-h1`              | Page title                                                |
| `heading-h2`              | Section title                                             |
| `heading-h3`              | Sub-section title / widget title                          |
| `heading-h4`              | Small heading                                             |
| `text-body`               | Body text                                                 |
| `text-caption`            | Small caption/metadata                                    |
| `text-label`              | Form/field label                                          |
| `text-mono`               | Monospaced (code, data)                                   |

---

## Layout primitives

| Element name              | Visual distinguisher                                      |
|---------------------------|-----------------------------------------------------------|
| `container-page`          | Top-level page container with max-width                   |
| `container-card`          | Card with padding + radius + optional border/shadow       |
| `stack-horizontal`        | Flex row                                                  |
| `stack-vertical`          | Flex column                                               |
| `grid`                    | CSS grid layout primitive                                 |
| `divider-section`         | Horizontal divider between page sections                  |

---

## Using this taxonomy during decomposition

When `gsd-t-design-decompose` runs, for EACH visual element encountered in the design:

1. **Identify the category** (chart / legend / axis / card / table / control / atom / typography / layout)
2. **Pick the EXACT element name from this file** — do not rename, do not abbreviate
3. **If no match found** → STOP. Report to user: "Element at Figma node {nodeId} does not match any taxonomy entry. Proposed new variant: {name}, because: {rationale}. Should I extend the taxonomy?"
4. **Never pick a near-match** — "close enough" is exactly how horizontal stacked bar % became grouped vertical bars.

### Visual distinguishers for ambiguous cases

**"Is this a stacked bar or a grouped bar?"**
- Do the bars for a single category TOUCH/STACK or sit SIDE-BY-SIDE?
  - Touch/stack → `chart-bar-stacked-*`
  - Side-by-side → `chart-bar-grouped-*`

**"Is this stacked-absolute or stacked-percentage?"**
- Do segments fill a FIXED WIDTH/HEIGHT regardless of data?
  - Yes (all bars are same length) → `*-stacked-*-percentage`
  - No (bars vary in length by total value) → `*-stacked-*` (non-percentage)

**"Is this a pie or a donut?"**
- Is there a hole in the center?
  - Yes → `chart-donut`
  - No → `chart-pie`

**"Is this a bar chart or a histogram?"**
- Are x-axis values CATEGORIES (distinct labels) or BINS (numeric ranges)?
  - Categories → `chart-bar-*`
  - Numeric bins → `chart-histogram`

---

## Naming grammar

Element names follow a consistent grammar to avoid ad-hoc invention:

```
{category}-{variant}-{orientation/modifier}

Categories: chart, axis, legend, stat-card, card, table, list, button, input,
            select, tabs, filter, icon, text, heading, container, stack, grid

Modifiers (common):
  -single / -multi           — series count
  -horizontal / -vertical    — orientation
  -stacked / -grouped        — arrangement
  -percentage                — values sum to 100%
  -dense / -comfortable      — density
  -outline / -filled         — visual weight
```

When proposing a new entry, match the grammar of its sibling section.

## Extending the taxonomy

If a new element variant is needed:

1. **Write a proposal first**: `.gsd-t/contracts/design/taxonomy-proposals/{name}.proposal.md` with:
   - Section it belongs in (existing or new)
   - Proposed entry name + visual distinguisher (≤80 chars)
   - Sibling entries — how the new entry differs from each
   - Catastrophic-misclassification rationale (what goes wrong if you jam it into an existing entry)
   - Source (Figma node, screenshot)
   - Companion entries flagged (if the new entry implies a cluster of siblings)
2. Add it to the relevant section above with a visual distinguisher
3. If it creates a new section, place it near structurally similar sections (layout-like near Tables, interactive-like near Controls)
4. If it's a new chart variant, add a decision rule under the chart type
5. Bump GSD-T version (minor) and document the addition in CHANGELOG.md
6. Never delete entries — only add (breaking the closed set is destructive)
