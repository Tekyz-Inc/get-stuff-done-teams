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

## Elements Used

| Slot             | Element Contract                        | Rationale                          |
|------------------|-----------------------------------------|------------------------------------|
| {chart}          | chart-donut                             | {part-to-whole comparison}         |
| {legend}         | legend-vertical-right                   | {6+ series, needs vertical space}  |
| {title}          | heading-h3                              | {widget header}                    |
| {filter}         | select-dropdown                         | {time-range selector}              |

**Rule**: Each slot references an element contract by name. Widget CANNOT override element visual spec. To customize, create a new element variant.

## Layout

```
┌──────────────────────────────────────────────┐
│ {title}                        [{filter}]    │
├──────────────────────────────────────────────┤
│              │                               │
│   {chart}    │      {legend}                 │
│              │                               │
└──────────────────────────────────────────────┘
```

| Property           | Value                                               |
|--------------------|-----------------------------------------------------|
| container_width    | {100% of parent / fixed 480px}                      |
| container_height   | {auto / fixed 320px}                                |
| padding            | {tokens.spacing.6}                                  |
| gap                | {tokens.spacing.4}                                  |
| background         | {tokens.color.surface.card}                         |
| border             | {1px solid tokens.color.border.subtle}              |
| border_radius      | {tokens.radius.lg}                                  |
| shadow             | {tokens.shadow.sm}                                  |
| chart_area_ratio   | {60% of widget width}                               |
| legend_area_ratio  | {40% of widget width}                               |

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
- [ ] Layout dimensions (width, height, padding, gap) match design
- [ ] Responsive breakpoints adapt as specified
- [ ] Data binding produces correct element inputs (spot-check with sample data)
- [ ] Inter-element interactions fire (hover sync, click propagation)
- [ ] Loading/empty/error states render correctly
- [ ] Accessibility landmark and keyboard order correct

## Used By

**Pages**: {list page contracts that reference this widget}
