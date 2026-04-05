# Page Contract: {page-name}

Top-level assembly of widgets + global layout + routing + data loading. Pages POSITION widgets in a layout grid; they cannot redefine widget internals or element visual specs.

## Metadata

| Field          | Value                                           |
|----------------|-------------------------------------------------|
| page           | {e.g., dashboard-overview}                      |
| route          | {e.g., /dashboard or /dashboard/overview}       |
| version        | {1.0}                                           |
| design_source  | {Figma page URL or image reference}             |
| extracted_date | {YYYY-MM-DD}                                    |

## Purpose

{One sentence — what this page is for and who uses it. E.g., "Primary landing page after login. Displays KPIs, revenue trends, and recent activity for executives scanning performance at-a-glance."}

## Widgets Used

| Position in Grid                 | Widget Contract                 | Layout Notes                 |
|----------------------------------|---------------------------------|------------------------------|
| header                           | page-header-widget              | sticky                       |
| sidebar                          | nav-sidebar-widget              | collapsible at <1024px       |
| grid[row=1, cols=1-4]            | stat-strip-widget               | full-width row               |
| grid[row=2, col=1-2]             | revenue-breakdown-widget        | spans 2 columns              |
| grid[row=2, col=3-4]             | user-growth-widget              | spans 2 columns              |
| grid[row=3, col=1-4]             | recent-activity-table-widget    | full width                   |

**Grid position format**: use EITHER `grid[row=N, col=M]` / `grid[row=N, cols=M-K]` OR named CSS grid areas (`grid-area: strip`). Be consistent within one page. The **Layout Notes** column documents positioning metadata only (spans, stacking, sticky/fixed) — NOT widget configuration (widget props live in the widget contract).

## Page Fixture (OPTIONAL)

If you want to formalize the composition chain (element → widget → page), declare a page-level fixture that references each widget's fixture by `$ref`:

```json
{
  "__fixture_source__": "composed-from-widgets",
  "strip":  "$ref:stat-strip-widget#/fixture",
  "donut":  "$ref:revenue-breakdown-widget#/fixture",
  "bar":    "$ref:user-growth-widget#/fixture"
}
```

Skip this section for pages that are pure assembly with no storybook / harness target. Include it when the page has a dedicated demo route or when multiple pages share widget fixtures and you want to document which instance each page references.

**Multi-state pages** (when page state swaps widget data): declare **one full fixture per state**, keyed by the state name. Prefer full duplication over override deltas — it's more verbose but makes each state independently runnable and avoids merge ambiguity.

```json
{
  "__fixture_source__": "composed-from-widgets",
  "__states__": ["Members", "Sessions"],
  "Members": {
    "donut": "$ref:donut-chart-card-widget#/fixture",
    "bar":   "$ref:bar-chart-card-widget#/fixture"
  },
  "Sessions": {
    "donut": "$ref:donut-chart-card-widget#/fixture-sessions",
    "bar":   "$ref:bar-chart-card-widget#/fixture-sessions"
  }
}
```

Widget contracts that have multiple fixture variants expose them as named sub-fixtures (`#/fixture-sessions`, `#/fixture-q4`, etc.) rather than a single `#/fixture`.

**Inline-stub promotion**: if a page-scope control or chrome element (segmented control, tab bar, breadcrumb) is used in ≥2 pages, promote it to its own widget contract. Until promoted, list the stub in **Composes Elements (direct)** with a `(promotion candidate)` tag and the page paths that use it.

## Layout

```
┌──────────────────────────────────────────────────────┐
│                  page-header-widget                  │
├──────────┬───────────────────────────────────────────┤
│          │  stat-strip-widget                        │
│   nav-   ├─────────────────────┬─────────────────────┤
│  sidebar │  revenue-breakdown  │   user-growth       │
│  -widget │                     │                     │
│          ├─────────────────────┴─────────────────────┤
│          │       recent-activity-table-widget        │
└──────────┴───────────────────────────────────────────┘
```

| Property            | Value                                          |
|---------------------|------------------------------------------------|
| layout_type         | {grid / flex / fixed-sidebar+fluid-content}    |
| grid_columns        | {4}                                            |
| grid_column_gap     | {tokens.spacing.6}                             |
| grid_row_gap        | {tokens.spacing.6}                             |
| page_padding        | {tokens.spacing.8}                             |
| max_content_width   | {1440px}                                       |
| sidebar_width       | {240px (expanded) / 64px (collapsed)}          |
| header_height       | {64px}                                         |
| background          | {tokens.color.bg.page}                         |

## Data Loading

**Page-level data requirements:**
```typescript
{
  stats: Stat[];
  revenue: RevenueData[];
  userGrowth: GrowthData[];
  activity: ActivityRow[];
}
```

**Loading strategy:**
- {e.g., Single API call to `/api/dashboard/overview` on mount}
- {e.g., Parallel fetches per widget; widgets manage own loading states}
- {e.g., Server-side rendered with incremental hydration}

## Routing & Navigation

- **Route**: {/dashboard/overview}
- **Guards**: {requires authentication, role: user|admin} — if the guard is declared but not yet wired, prefix with `(stub)` and link the authentication milestone that will wire it (e.g., `(stub) requires-auth — milestone M4`).
- **Breadcrumbs**: {Home > Dashboard > Overview}
- **Nav active state**: {highlights "Dashboard" in nav-sidebar}

## Global States

| State            | Page Behavior                                           |
|------------------|---------------------------------------------------------|
| unauthenticated  | Redirect to /login                                      |
| page_loading     | Skeleton grid with widget placeholders                  |
| page_error       | Full-page error with retry button                       |
| partial_error    | Individual widgets show own error states; page persists |

## Responsive Behavior

| Breakpoint | Adaptation                                                     |
|------------|----------------------------------------------------------------|
| mobile     | Sidebar becomes drawer; grid collapses to 1 column; stats stack vertically |
| tablet     | Sidebar collapses to icon-only; grid becomes 2 columns         |
| desktop    | Full layout as specified                                       |

## Interactions

- {Sidebar toggle persists across sessions (localStorage)}
- {Widget filter changes do NOT affect other widgets unless explicitly wired}
- {Clicking KPI tile navigates to detail page}

## Performance Budget

| Metric             | Target                                          |
|--------------------|-------------------------------------------------|
| First Contentful Paint | {<1.5s on 4G}                               |
| Time to Interactive    | {<3.0s on 4G}                               |
| JS bundle size         | {<200KB gzipped for this route}             |

## Accessibility

- **Landmarks**: `<header>`, `<nav>`, `<main>`, per-widget `<section role="region">`
- **Skip link**: "Skip to main content" at top, focuses `<main>` on activation. If the skip link targets `<main>`, `<main>` MUST have `tabindex="-1"` to be programmatically focusable via hash-link navigation.
- **Keyboard order**: header → sidebar → widgets in visual reading order
- **Page title**: Set via `<title>` per route

## Implementation Notes

- **Component path**: {src/pages/DashboardOverview.vue or src/routes/dashboard/overview.tsx}
- **Composes**: {list widget imports}
- **Router integration**: {vue-router / react-router / next.js app dir}
- **Data fetching**: {composable / hook / server component}

## Boundary Rules (MANDATORY)

A page is allowed to:
- Pass DATA through a widget's documented `defineProps` / public API (titles, subtitles, fixture data — these are the widget's legitimate inputs)
- Declare page-level layout CSS (grid template, gaps, padding, max-width, background, landmark regions)
- Manage route-level state and data fetching

A page is **FORBIDDEN** from:
- Declaring CSS selectors that target a widget's internal classes (`.card-title`, `.donut-segment`, `.legend-dot`) — this is a boundary violation
- Overriding widget visual spec via `:deep()` selectors or `!important` on widget-owned properties
- Re-specifying element visual spec (colors, font sizes, radii, paddings owned by elements)

**Enforcement check** (line-anchored CSS-only grep, avoids false positives on JS identifiers):
```
grep -En '^\s*(\.card-title|\.donut|\.legend-dot|\.kpi-value|\.chart-wrapper|\.filter-select)[^\w-]*\{' {page-file}
```
The leading `^\s*` anchor + trailing `\{` requirement matches ONLY CSS rules at the start of a line, not JS property access (`obj.donut`) or variable names (`donutProps`). If any match is found, move the styling into the widget contract or create a widget variant.

## Verification Checklist

Page-level verification runs AFTER all widgets pass their own verification. Page verification only checks assembly — widget and element internals are out of scope.

- [ ] All widgets present in correct grid positions
- [ ] Layout dimensions (gaps, padding, max-width) match design
- [ ] Header / sidebar / main regions correctly landmarked
- [ ] Sidebar collapse/expand behavior works
- [ ] Responsive breakpoints rearrange layout as specified
- [ ] Data loading strategy produces correct widget inputs
- [ ] Route guards enforce authentication/roles
- [ ] Performance budget met (measure with Lighthouse)
- [ ] Keyboard navigation follows visual reading order
- [ ] Skip-link and page title present

## Composes Elements (direct, not via widgets)

Split into two lists:

**Existing element contracts used directly:**
- {e.g., `button-primary` — FAB}

**Inline stubs (promotion candidates):**
- {e.g., `page-topbar` — used by: dashboard-shell-page. Promote when ≥2 pages use it.}

The first list is atoms that already have their own contracts and are composed into this page without a wrapping widget. The second list is atoms that DON'T have contracts yet but should be extracted once ≥2 pages use them. Keep them distinct.
