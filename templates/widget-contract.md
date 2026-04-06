# Widget Contract: {widget-name}

Composition of elements + data binding + layout. Widgets SELECT and POSITION elements; they cannot redefine element visual specs. If a design needs a variant not covered by an existing element, create a new element contract — do not override from the widget.

## Metadata

| Field          | Value                                           |
|----------------|-------------------------------------------------|
| widget         | {e.g., revenue-breakdown-widget}                |
| version        | {1.0}                                           |
| design_source  | {Figma node URL or image reference}             |
| extracted_date | {YYYY-MM-DD}                                    |

## Purpose

{One sentence — what this widget shows and why. E.g., "Displays revenue breakdown by product category with donut chart and accompanying legend-table, used on the dashboard Overview page and the Analytics detail page."}

## Card Chrome Slots (MANDATORY — fill every row or explicitly mark N/A)

Every widget is a card with consistent chrome. Missing chrome is the #1 cause of "looks off" verification results. Document EVERY slot, even if empty.

| Slot                    | Element Contract (or N/A)                | Content / Behavior                               | Alignment       |
|-------------------------|------------------------------------------|--------------------------------------------------|-----------------|
| `title`                 | heading-h3                               | {exact title text from design}                   | {left / center} |
| `subtitle`              | text-caption or N/A                      | {exact subtitle text — "Which tools members interact with most."} | {left / center} |
| `header_right_control`  | select-dropdown, button-ghost, or N/A    | {e.g., "Members ▼" filter dropdown in card header} | right           |
| `kpi_header`            | stat-card-kpi-large or N/A               | {e.g., "2.4" + "Avg tools per member" shown above chart} | {left / center} |
| `body`                  | {primary element, e.g., chart-donut}     | {main visual}                                    | {center / left} |
| `body_sidebar`          | {e.g., legend-vertical-right or N/A}     | {element positioned alongside body}              | {left / center} |
| `footer`                | {e.g., text-caption or N/A}              | {e.g., "Last updated: ..."}                      | {left / center} |
| `footer_legend`         | {e.g., legend-horizontal-bottom or N/A}  | {legend below body}                              | {center / left} |

**Rules**:
- If the design shows it, document it. If the design doesn't show it, write "N/A". Do NOT leave blank.
- The **Alignment** column is MANDATORY. Incorrect alignment (left vs center) is the #2 cause of "looks off" results after missing chrome. Extract alignment from the Figma node — do not default to left.

## Elements Used (body composition)

| Slot             | Element Contract                        | Rationale                          |
|------------------|-----------------------------------------|------------------------------------|
| {body element}   | {e.g., chart-donut}                     | {why this element}                 |
| {sidebar}        | {e.g., legend-vertical-right}           | {why this variant}                 |

**Rule**: Each slot references an element contract by name from `design-chart-taxonomy.md`. Widget CANNOT override element visual spec. To customize, create a new element variant.

## Layout

```
┌──────────────────────────────────────────────┐
│ {title}                        [{filter}]    │
│ {subtitle}                                   │
├──────────────────────────────────────────────┤
│              │                               │
│   {chart}    │      {legend}                 │
│              │                               │
├──────────────────────────────────────────────┤
│          {footer_legend}                     │
└──────────────────────────────────────────────┘
```

### Card Container

| Property           | Value                                               |
|--------------------|-----------------------------------------------------|
| container_width    | {100% of parent / fixed 480px}                      |
| container_height   | {auto / fixed 320px}                                |
| padding            | {16px — extract exact value from Figma}             |
| background         | {#ffffff}                                           |
| border             | {1px solid #e2e8f0}                                 |
| border_radius      | {8px}                                               |
| shadow             | {none / 0 2px 8px rgba(0,0,0,0.1)}                 |

### Internal Element Layout (MANDATORY — the "looks off" killer)

This section specifies how elements are sized, spaced, and aligned WITHIN the card body. Missing or wrong values here produce the "spacing inside widgets" and "legends incorrectly aligned" class of errors.

| Property                    | Value                                                      |
|-----------------------------|------------------------------------------------------------|
| header_to_body_gap          | {16px — gap between title/subtitle row and body content}   |
| body_layout                 | {flex-row / flex-column / grid}                            |
| body_justify                | {center / flex-start / space-between}                      |
| body_align                  | {center / flex-start / stretch}                            |
| body_gap                    | {24px — gap between body element and sidebar element}      |
| chart_width                 | {180px / 60% of body / auto}                               |
| chart_height                | {180px / auto}                                             |
| chart_align_self            | {center / flex-start}                                      |
| legend_width                | {auto / 40% of body}                                       |
| legend_align_self           | {center / flex-start}                                      |
| body_to_footer_gap          | {16px — gap between body and footer/footer_legend}         |
| footer_legend_justify       | {center / flex-start — EXTRACT FROM FIGMA, do not default} |

**Rules**:
- Extract EVERY value from the Figma node — do not approximate.
- `footer_legend_justify` is critical: center-aligned legends look completely different from left-aligned. Check the Figma.
- `body_layout` + `body_justify` + `body_align` together define whether the chart is centered in its card, left-aligned, or stretched. Get this wrong and every widget "looks off."
- These values are WIDGET-OWNED — they describe how the widget positions its elements, not the elements' internal specs (which live in element contracts).

### Internal Layout Arithmetic (MANDATORY for fixed-height cards)

When `container_height` is fixed (not `auto`), you MUST compute and document the internal height budget. The math must add up exactly — no approximation.

```
card_height:           {e.g., 334px}
card_padding_top:      {e.g., 16px}
card_padding_bottom:   {e.g., 16px}
header_height:         {title + subtitle + gap} = {e.g., 48px}
header_to_body_gap:    {e.g., 16px}
─────────────────────────────────────────────────
body_available:        {card_height - padding_top - padding_bottom
                        - header_height - header_to_body_gap}
                       = {e.g., 334 - 16 - 16 - 48 - 16 = 238px}

body_breakdown:
  kpi_height:          {natural content height, e.g., 40px — NOT flex:1}
  kpi_to_chart_gap:    {e.g., 16px}
  chart_section:       {bar + gap + labels + gap + legend}
                       = {e.g., 30 + 8 + 12 + 8 + 16 = 74px}
  ────────────────────
  total_body_content:  {40 + 16 + 74 = 130px}
  remaining_space:     {238 - 130 = 108px}

centering_strategy:    {e.g., body uses flex-column + justify-content: center
                        to vertically center the content group (KPI + chart)
                        in the 238px body area. KPI keeps natural height.}
```

**Rules:**
- Every row must be an exact pixel value extracted from the Figma design
- The sum of all body content MUST equal `body_available` OR explicitly document how remaining space is distributed (centering, padding, etc.)
- **NEVER use `flex: 1` on a content element (KPI, label, text) to center it.** `flex: 1` makes the element grow to fill available space, inflating its box model. Use `flex: 1` + `justify-content: center` on the PARENT container instead. The parent grows; children keep natural size.
- If the math doesn't add up, the design extraction is incomplete — go back to Figma

## Data Binding

**Widget input shape:**
```typescript
{
  title: string;
  timeRange: '7d' | '30d' | '90d' | '1y';
  data: { category: string; value: number; color?: string }[];
  onFilterChange?: (range: string) => void;
}
```

**Element data mapping:**
| Element    | Receives                                                         |
|------------|------------------------------------------------------------------|
| chart      | `{ categories: data.map(d=>d.category), series: [{name:'Revenue', values: data.map(d=>d.value)}]}` |
| legend     | `data.map(d => ({label: d.category, value: d.value, color: d.color}))` |
| filter     | `{ value: timeRange, options: ['7d','30d','90d','1y'], onChange: onFilterChange }` |

## Test Fixture (MANDATORY)

Widget-scope fixture used by the Verification Harness. MUST include:
- Top-level widget chrome fields (title, subtitle, filter value, etc.)
- Body data for each composed element

Prefer referencing the element's own fixture rather than re-inlining its values:

```json
{
  "__fixture_source__": "extracted-from-figma | flat-contract | requirements | engineered-stub",
  "__figma_template__": "{Figma node URL or null}",
  "title": "Most Popular Tools",
  "subtitle": "Which tools members interact with most.",
  "filterValue": "Members",
  "chart_fixture": "$ref:chart-donut#/fixture",
  "legend_fixture": "$ref:legend-vertical-right#/fixture"
}
```

**Rules:**
- `__fixture_source__` and `__figma_template__` are REQUIRED (same Fixture Resolution Order as element contracts).
- Element sub-fixtures should be referenced by `$ref:{element-name}#/fixture` when the widget uses the element's canonical fixture unchanged. Inline only when the widget supplies widget-specific data (e.g., a story-specific dataset).
- Widget fixture MUST NOT contain visual spec fields that belong to an element (colors, font sizes, padding, radii). Those live in the element contract.
- **Boundary check**: if a field name matches a slot in the element's fixture (segments, centerValue, xLabels, etc.), it belongs in the element fixture, not the widget fixture.

## Verification Harness

The widget harness page (`/design-system/{widget-name}`) renders ONE widget instance on a blank page — no app chrome, no navigation. The widget IS the harness. Render the widget with the Test Fixture above; do not wrap it in a page-level layout.

## States

| State       | Widget Behavior                                                   |
|-------------|-------------------------------------------------------------------|
| loading     | Skeleton shimmer replaces chart and legend                        |
| empty       | Chart shows empty state; legend hidden                            |
| error       | Error banner replaces chart; filter stays enabled                 |

## Responsive Behavior

| Breakpoint | Adaptation                                                     |
|------------|----------------------------------------------------------------|
| mobile     | Legend drops below chart; chart becomes square                 |
| tablet     | Legend shrinks to 35% width                                    |
| desktop    | Spec as defined above                                          |

## Interactions

- {Chart segment hover highlights corresponding legend row}
- {Legend row click toggles segment visibility}
- {Filter change triggers data refetch via `onFilterChange`}

## Accessibility

- **Landmark role**: `region` with aria-labelledby pointing to title
- **Keyboard**: Tab order: filter → chart → legend rows
- **Announcements**: Data updates announced via `aria-live="polite"`

## Implementation Notes

- **Component path**: {src/widgets/RevenueBreakdownWidget.vue}
- **Composes**: {list element components the widget imports}
- **State management**: {local state / zustand store / props only}

## Verification Checklist

Widget-level verification runs AFTER all referenced elements pass their own verification. Widget verification only checks composition — element internals are out of scope.

- [ ] All referenced elements present and correctly slotted
- [ ] Card chrome alignment matches design (title left/center, legend center/left, etc.)
- [ ] Internal element layout matches design (body_layout, body_justify, body_align)
- [ ] Inter-element spacing matches design (header_to_body_gap, body_gap, body_to_footer_gap)
- [ ] Element sizing matches design (chart_width, chart_height, legend_width)
- [ ] Legend alignment matches design (footer_legend_justify: center vs left)
- [ ] Card container values match design (padding, border, radius, shadow)
- [ ] Layout arithmetic adds up: sum of child heights + gaps = body_available (fixed-height cards only)
- [ ] No content element uses `flex: 1` for centering — only parent containers may use `flex: 1`
- [ ] DOM box model check: no element's offsetHeight >> its content height (inflated box = wrong flex)
- [ ] Responsive breakpoints adapt as specified
- [ ] Data binding produces correct element inputs (spot-check with sample data)
- [ ] Inter-element interactions fire (hover sync, click propagation)
- [ ] Loading/empty/error states render correctly
- [ ] Accessibility landmark and keyboard order correct

## Used By

**Pages**: {list page contracts that reference this widget}
