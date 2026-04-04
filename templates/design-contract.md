# Design Contract: {Component/Page Name}

## Source

| Property         | Value                                             |
|------------------|---------------------------------------------------|
| Source Type      | {Figma MCP / Image / Screenshot / Prototype URL}  |
| Source Reference | {Figma URL, file path, image path, etc.}          |
| Extracted Via    | {Figma MCP / Visual Analysis / Design Tokens File} |
| Extracted Date   | {YYYY-MM-DD}                                      |
| Precision Level  | {Exact (MCP) / High (exported tokens) / Estimated (visual analysis)} |
| Breakpoints      | {mobile: 375px, tablet: 768px, desktop: 1280px}   |

## Stack Evaluation

| Requirement          | Stack Capability | Notes                                        |
|----------------------|------------------|----------------------------------------------|
| {CSS Grid layouts}   | {Supported}      | {e.g., framework supports CSS Grid natively} |
| {Custom fonts}       | {Supported}      | {e.g., font loading via next/font}           |
| {Complex animations} | {Partial}        | {e.g., may need Framer Motion addon}         |
| {SVG manipulation}   | {Supported}      | {e.g., inline SVG supported}                 |

## Color Palette

| Token Name             | Value                    | Usage                        |
|------------------------|--------------------------|------------------------------|
| --color-primary        | {#1A73E8}                | {Primary buttons, links}     |
| --color-primary-hover  | {#1557B0}                | {Primary button hover state} |
| --color-text-primary   | {#202124}                | {Body text, headings}        |
| --color-text-secondary | {#5F6368}                | {Captions, helper text}      |
| --color-surface        | {#FFFFFF}                | {Card backgrounds}           |
| --color-border         | {#DADCE0}                | {Dividers, input borders}    |

## Typography

| Token Name     | Family  | Weight | Size   | Line-Height | Letter-Spacing | Usage          |
|----------------|---------|--------|--------|-------------|----------------|----------------|
| --font-h1      | {Inter} | {700}  | {36px} | {1.2}       | {-0.02em}      | {Page title}   |
| --font-h2      | {Inter} | {600}  | {24px} | {1.3}       | {-0.01em}      | {Section head}  |
| --font-body    | {Inter} | {400}  | {16px} | {1.5}       | {normal}       | {Body text}    |
| --font-caption | {Inter} | {400}  | {12px} | {1.4}       | {0.01em}       | {Helper text}  |

## Spacing System

| Token Name    | Value  | Usage                              |
|---------------|--------|------------------------------------|
| --spacing-xs  | {4px}  | {Inline element gaps}              |
| --spacing-sm  | {8px}  | {Tight element spacing}            |
| --spacing-md  | {16px} | {Standard padding, component gaps} |
| --spacing-lg  | {24px} | {Section padding, card padding}    |
| --spacing-xl  | {32px} | {Section margins}                  |
| --spacing-2xl | {48px} | {Page-level spacing}               |

## Borders & Shadows

| Token Name      | Property      | Value                            |
|-----------------|---------------|----------------------------------|
| --radius-sm     | border-radius | {4px}                            |
| --radius-md     | border-radius | {8px}                            |
| --radius-lg     | border-radius | {16px}                           |
| --radius-full   | border-radius | {9999px}                         |
| --shadow-sm     | box-shadow    | {0 1px 2px rgba(0,0,0,0.05)}    |
| --shadow-card   | box-shadow    | {0 2px 8px rgba(0,0,0,0.1)}     |
| --shadow-modal  | box-shadow    | {0 8px 32px rgba(0,0,0,0.15)}   |
| --border-default| border        | {1px solid var(--color-border)}  |

## Component Tree

```
{Page/Component Name}
  ├── {Section}
  │     ├── {Component} (variant: {variants})
  │     │     ├── {SubComponent}
  │     │     └── {SubComponent}
  │     └── {Component}
  ├── {Section}
  │     └── {Component} (x{count}, reusable)
  │           ├── {Element}
  │           └── {Element}
  └── {Section}
```

## Layout Specifications

### Mobile ({breakpoint}px)

| Container      | Layout  | Columns/Direction | Gap    | Alignment | Notes          |
|----------------|---------|-------------------|--------|-----------|----------------|
| {.page}        | {grid}  | {1fr}             | {16px} | {stretch} | {full-width}   |
| {.feature-grid}| {grid}  | {1fr}             | {16px} | {stretch} | {stacked}      |

### Tablet ({breakpoint}px)

| Container      | Layout  | Columns/Direction | Gap    | Alignment | Notes          |
|----------------|---------|-------------------|--------|-----------|----------------|
| {.page}        | {grid}  | {1fr}             | {24px} | {stretch} | {centered}     |
| {.feature-grid}| {grid}  | {repeat(2, 1fr)}  | {24px} | {stretch} | {2-column}     |

### Desktop ({breakpoint}px)

| Container      | Layout  | Columns/Direction | Gap    | Alignment | Notes          |
|----------------|---------|-------------------|--------|-----------|----------------|
| {.page}        | {grid}  | {max-width 1280px}| {32px} | {center}  | {contained}    |
| {.feature-grid}| {grid}  | {repeat(3, 1fr)}  | {32px} | {stretch} | {3-column}     |

## Interactive States

| Component    | Default         | Hover            | Focus              | Active           | Disabled         |
|--------------|-----------------|------------------|--------------------|------------------|------------------|
| {CTAButton}  | {bg: primary}   | {bg: primary-hover}| {outline: 2px primary}| {scale: 0.98} | {bg: border, 0.6}|
| {NavLink}    | {color: text}   | {color: primary} | {underline}        | {font-weight: 600}| {color: muted}  |
| {TextInput}  | {border: default}| {border: primary}| {ring: 2px primary}| {—}             | {bg: gray-50}    |

## Verification Status

| Check                              | Status      | Notes                             |
|------------------------------------|-------------|-----------------------------------|
| Token extraction complete          | {pending}   |                                   |
| Component tree matches design      | {pending}   |                                   |
| Mobile layout verified             | {pending}   |                                   |
| Tablet layout verified             | {pending}   |                                   |
| Desktop layout verified            | {pending}   |                                   |
| Typography matches design          | {pending}   |                                   |
| Colors match design                | {pending}   |                                   |
| Spacing matches design             | {pending}   |                                   |
| Interactive states implemented     | {pending}   |                                   |
| Accessibility checks pass          | {pending}   |                                   |
| Visual verification loop completed | {pending}   |                                   |
