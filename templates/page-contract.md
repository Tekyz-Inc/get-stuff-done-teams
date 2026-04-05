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

| Position in Grid                 | Widget Contract                 | Notes                        |
|----------------------------------|---------------------------------|------------------------------|
| header                           | page-header-widget              | {sticky}                     |
| sidebar                          | nav-sidebar-widget              | {collapsible at <1024px}     |
| grid[row=1, cols=1-4]            | stat-strip-widget               | {4 KPI tiles}                |
| grid[row=2, col=1-2]             | revenue-breakdown-widget        | {spans 2 columns}            |
| grid[row=2, col=3-4]             | user-growth-widget              | {spans 2 columns}            |
| grid[row=3, col=1-4]             | recent-activity-table-widget    | {full width}                 |

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
- **Guards**: {requires authentication, role: user|admin}
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
- **Skip link**: "Skip to main content" at top, focuses `<main>` on activation
- **Keyboard order**: header → sidebar → widgets in visual reading order
- **Page title**: Set via `<title>` per route

## Implementation Notes

- **Component path**: {src/pages/DashboardOverview.vue or src/routes/dashboard/overview.tsx}
- **Composes**: {list widget imports}
- **Router integration**: {vue-router / react-router / next.js app dir}
- **Data fetching**: {composable / hook / server component}

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

{List any element contracts referenced directly by the page (rare — usually everything goes through widgets). E.g., `button-primary` for a floating action button.}
