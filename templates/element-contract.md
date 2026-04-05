# Element Contract: {element-name}

Atomic visual unit. One contract per visual variant (e.g., `chart-bar-stacked-horizontal` and `chart-bar-stacked-vertical` are separate contracts). Widgets and pages reference element contracts by name; they CANNOT override the visual spec.

## Metadata

| Field          | Value                                                     |
|----------------|-----------------------------------------------------------|
| element        | {e.g., chart-bar-stacked-horizontal}                      |
| category       | {chart / legend / axis / card / table / control / layout} |
| variant_of     | {base element name, or `null` if base}                    |
| version        | {1.0}                                                     |
| extends        | {[axis-x-numeric, axis-y-categorical] — or []}            |
| design_source  | {Figma node URL or design file path + node id}            |
| extracted_via  | {Figma MCP / Visual Analysis / Design Tokens}             |
| extracted_date | {YYYY-MM-DD}                                              |

## Purpose

{One sentence — what this element is and when to use it. E.g., "Horizontal stacked bar chart for displaying part-to-whole comparisons across categories, with segment labels inside when segment width ≥40px."}

## Visual Spec

| Property      | Value                                                 |
|---------------|-------------------------------------------------------|
| {dimension_1} | {exact value, referencing design tokens if available} |
| {dimension_2} | {exact value}                                         |

*List every measurable visual property: dimensions, spacing, radii, borders, shadows, opacity. Reference design tokens rather than raw values where possible (`tokens.spacing.4` instead of `16px`).*

## Labels / Text (if applicable)

| Property      | Value                                                              |
|---------------|--------------------------------------------------------------------|
| font_family   | {tokens.font.family.sans}                                          |
| font_size     | {tokens.font.size.sm}                                              |
| font_weight   | {tokens.font.weight.medium}                                        |
| color         | {tokens.color.text.primary}                                        |
| position      | {inside-segment-centered / above-bar / below-bar / left / right}   |
| visibility    | {always / conditional: {rule, e.g., `hide if segment width <40px`}} |
| alignment     | {left / center / right / start / end}                              |
| truncation    | {none / ellipsis / tooltip-on-truncate}                            |

## Colors

| Usage       | Token                                |
|-------------|--------------------------------------|
| {fill}      | {tokens.color.chart.sequence[0..n]}  |
| {stroke}    | {tokens.color.chart.border}          |
| {text}      | {tokens.color.text.onPrimary}        |
| {hover}     | {tokens.color.chart.hover.overlay}   |

## States

| State       | Visual Change                                                      |
|-------------|--------------------------------------------------------------------|
| default     | {base appearance}                                                  |
| hover       | {e.g., segment opacity 1.0, siblings 0.6, cursor: pointer}         |
| active      | {e.g., border 2px tokens.color.accent}                             |
| disabled    | {e.g., opacity 0.4, cursor: not-allowed}                           |
| focus       | {e.g., outline 2px tokens.color.focus, offset 2px}                 |
| loading     | {e.g., skeleton shimmer}                                           |
| empty       | {e.g., placeholder icon + "No data" text}                          |

## Interactions

| Event       | Behavior                                                           |
|-------------|--------------------------------------------------------------------|
| hover       | {e.g., show tooltip with {category, series, value, percent}}       |
| click       | {e.g., emit `onSegmentClick({category, series, value})`}           |
| keyboard    | {e.g., Tab focuses, Enter activates, Arrow keys navigate segments} |

## Data Binding

**Input shape:**
```typescript
{
  // Define the minimum data contract required to render this element
  categories: string[];
  series: { name: string; values: number[]; color?: string }[];
}
```

**Invariants:**
- {e.g., All series arrays MUST have length === categories.length}
- {e.g., Values MUST be non-negative for stacked variants}

## Test Fixture (MANDATORY — extracted from design, NOT placeholder)

This is the EXACT data from the design source. Verification compares the built component rendered with this fixture against the Figma design. Placeholder data (Lorem, foo/bar, Calculator/Planner) is FORBIDDEN here — the verifier must be able to compare actual labels and values side-by-side.

### Fixture Resolution Order (when the design has no concrete data)

Figma designs frequently contain template tokens like `{num}%`, `{value}`, `$X,XXX` where concrete numbers are never encoded. When you hit this, follow this order — DO NOT invent unrelated placeholder labels:

1. **Concrete values in Figma text nodes** → use them verbatim (highest priority).
2. **Existing flat `design-contract.md` in the project** → if the card/chart was previously documented with numbers, inherit those numbers.
3. **`docs/requirements.md` sample data** → if requirements specify example values, use them.
4. **Engineered stub that visually matches the Figma render** → measure segment pixel widths (stacked) or relative heights (bar/column) and synthesise values summing to 100% (percentage variants) or matching the visible proportions (absolute variants).
5. Record the resolution choice in a `__fixture_source__` field so verifiers can distinguish "extracted from design" vs "engineered to match visual".

If the design uses template tokens, ALSO record them verbatim in a `__figma_template__` field. This lets the verifier compare both representations — e.g., "design shows `{num}%` placeholder, fixture supplies `27%`, built UI shows `27%`" is a MATCH, not a deviation.

**Labels (category names, series names, legend items) must ALWAYS be extracted verbatim from Figma** — never substituted. Only numeric values fall back through the resolution order above.

```json
{
  "__source__": "{Figma node URL or image file + node id}",
  "__extracted_via__": "{Figma MCP get_design_context | visual analysis}",
  "__extracted_date__": "{YYYY-MM-DD}",

  "categories": ["{exact label 1 from design}", "{exact label 2}", "..."],
  "series": [
    {
      "name": "{exact series name from design}",
      "values": [{exact value 1}, {exact value 2}, ...]
    }
  ],

  "center_value": "{exact value shown in donut center, if applicable}",
  "center_sublabel": "{exact sublabel, if applicable}",
  "percentages_shown": [{30}, {21}, {20}, {15}, {14}],

  "__fixture_source__": "{extracted-from-figma | inherited-from-flat-contract | requirements-sample | engineered-to-match-visual}",
  "__figma_template__": "{if design uses tokens: record them verbatim, e.g. '{num}%'. Omit if design has concrete values.}"
}
```

**Verification rule**: when the component is rendered with THIS fixture, every label, every value, every percentage shown in the built UI MUST match the design. Any substitution is a DEVIATION.

### Verification Harness (how to render the element in isolation)

When building an element for verification, render it on a dedicated `/design-system/{element-name}` route with **only** the visual context needed to compare it side-by-side against Figma:

- **Always include**: the element itself, its data labels, its legend (if owned by the element).
- **Include if the Figma reference shows them adjacent to the element**: card chrome (title, subtitle, KPI header) — but mark these in the page wrapper as `<!-- harness-only: belongs to widget contract -->` so future readers don't mistake them for part of this element contract.
- **Never include**: widget-level controls (dropdowns, date-pickers, header action buttons), surrounding page layout, navigation, filters.

Rule of thumb: if removing an element from the harness would make the Figma↔built comparison impossible (e.g., can't tell which chart the KPI "2.4" refers to), keep it. If it would just make the page look like the real app, strip it.

## Responsive Behavior

| Breakpoint | Adaptation                                                    |
|------------|---------------------------------------------------------------|
| mobile     | {e.g., labels hidden, tap for tooltip}                        |
| tablet     | {e.g., reduced label font-size to tokens.font.size.xs}        |
| desktop    | {full labels as specified}                                    |

## Accessibility

- **Role**: {e.g., `img` with descriptive aria-label, or `figure` with `<figcaption>`}
- **Keyboard**: {e.g., focusable, arrow-key navigation between segments}
- **Screen reader**: {e.g., announces category, series, value on focus}
- **Contrast**: {label text contrast ratio ≥4.5:1 against segment fill}

## Implementation Notes

- **Library**: {e.g., Plotly.js / Recharts / D3 / native SVG}
- **Component path**: {src/components/charts/BarStackedHorizontal.vue}
- **Dependencies**: {list of required packages}

## Verification Checklist

Design Verification Agent uses this list. Every item must resolve to ✅ MATCH or ❌ DEVIATION (with specific values) — never "looks close" or "appears to match".

- [ ] {Visual spec property 1 matches design}
- [ ] {Visual spec property 2 matches design}
- [ ] Label position/font/color match design
- [ ] Color sequence matches design tokens
- [ ] Hover state changes as specified
- [ ] Focus state visible and correct
- [ ] Responsive adaptations fire at correct breakpoints
- [ ] Accessibility attributes present and correct

## Examples

**Used by widgets:** {list widget contracts that reference this element}
**Used by pages:** {list page contracts that reference this element directly}
