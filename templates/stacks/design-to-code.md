# Design-to-Code Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

These rules apply when implementing a visual design as frontend code. The design already exists (Figma, screenshot, image, prototype) — your job is to replicate it faithfully in code with pixel-perfect accuracy.

---

## 0. Contract Structure — Flat or Hierarchical

Two contract layouts are supported. Pick the one that fits the project scope:

**Flat** (single file: `.gsd-t/contracts/design-contract.md`)
- Use when: single page, ≤10 distinct elements, nothing reusable across pages
- Pros: fast to set up; fine for a landing page or one-off screen
- Cons: no reuse; visual spec repeats; drift between instances is easy

**Hierarchical** (directory: `.gsd-t/contracts/design/{elements,widgets,pages}/`)
- Use when: multiple pages, reusable components (charts, cards, legends), design system in play
- Pros: element contracts are the single source of truth for visual spec — widgets and pages SELECT and POSITION but cannot override. Drift is structurally impossible.
- Cons: more contracts to write upfront (elements: ~10-20, widgets: ~5-10, pages: N)
- Bootstrap via: `/user:gsd-t-design-decompose {Figma URL or image path}`
- Templates: `templates/element-contract.md`, `templates/widget-contract.md`, `templates/page-contract.md`

**Precedence rule (hierarchical only)**:
```
element contract  >  widget contract  >  page contract
```
A widget that uses `chart-donut` cannot change `chart-donut`'s bar-gap, colors, or label positioning. If customization is needed, create a new element variant (`chart-donut-compact.contract.md`) instead.

**Hierarchical Execution Order (MANDATORY when hierarchical contracts exist)**:
```
BUILD ORDER:
  Wave 1: Elements   — build each element in isolation from its element contract
                        ONE task per element. Verify each against its contract.
  Wave 2: Widgets    — IMPORT built elements, compose per widget contract
                        ONE task per widget. Verify assembly matches contract.
  Wave 3: Pages      — IMPORT built widgets, compose per page contract
                        ONE task per page. Full Design Verification Agent runs here.

NO INLINE REBUILDS:
  Widget tasks MUST import element components. If chart-donut exists in
  src/components/elements/, you MUST import it — not build a second donut.
  Page tasks MUST import widget components. The page's job is composition
  and data wiring, not reimplementing widgets.
  Rebuilding a lower-level component inline is a TASK FAILURE.

CONTRACT IS AUTHORITATIVE:
  If the element contract says 'bar-vertical-grouped' (vertical bars),
  build vertical bars — even if the Figma screenshot looks ambiguous.
  The contract was written from careful design analysis. When in doubt,
  follow the contract, not the screenshot.
```

**Detection at execute-time**:
- If `.gsd-t/contracts/design/` exists → hierarchical mode, verify elements first, then widgets, then pages
- Else if `.gsd-t/contracts/design-contract.md` exists → flat mode
- Else → bootstrap flat contract during partition

---

## 1. Design System Detection

```
MANDATORY:
  ├── BEFORE any extraction or implementation, check for a design system:
  │     Ask user: "Is a design system or component library being used
  │       (e.g., shadcn-vue, Vuetify, Radix, MUI, Ant Design, Chakra)?
  │       If so, provide the URL."
  ├── If YES:
  │     Fetch the library's docs landing page
  │     Catalog available components (cards, tables, tabs, charts, buttons,
  │       inputs, dialogs, dropdowns, etc.)
  │     Identify the theming system (CSS variables, Tailwind config, theme object)
  │     Determine customization model:
  │       Copy-paste (shadcn) → full control, edit component source directly
  │       Config-based (MUI theme) → customize via theme overrides
  │       Utility-first (Tailwind + headless) → style via utility classes
  │     Map design elements to library primitives — use library components
  │       instead of building custom whenever a match exists
  │     Record in the design contract: library name, URL, version,
  │       components used, theming approach
  ├── If NO:
  │     Proceed with fully custom implementation
  │     Note in design contract: "No design system — all components custom"
  └── WHY: Design system components provide battle-tested accessibility,
        interactive states, and responsive behavior out of the box.
        Building custom when a library component exists wastes effort
        and produces inferior results (missing focus states, ARIA, etc.)
```

**BAD** — Building a custom card component, dropdown, and table from scratch when shadcn-vue already provides them with full accessibility and Tailwind theming.

**GOOD** — Detecting shadcn-vue, mapping 60% of the design's UI elements to library components, customizing via Tailwind theme tokens, and only building custom for elements the library doesn't cover (specialized charts, domain-specific widgets).

---

## 2. Design Source Setup

```
MANDATORY:
  ├── NEVER write CSS or layout code without a design reference
  ├── Identify the source type: Figma file, image, screenshot, prototype URL
  ├── If source is a Figma URL/file → check if Figma MCP is available
  │     YES → Use Figma MCP `get_design_context` per widget/component node
  │           `get_design_context` returns structured code, component properties,
  │           and design tokens — this is what you extract values from.
  │           ⚠ NEVER use `get_screenshot` for extraction — it returns pixels,
  │             not properties. You cannot reliably extract exact spacing, colors,
  │             or text from an image. `get_screenshot` is only for verification
  │             (comparing built output to design visually).
  │     NO  → Inform user: "Figma MCP recommended for precise extraction"
  │           Fallback: use image analysis (Claude's multimodal vision)
  ├── If source is an image/screenshot → use visual analysis to extract values
  ├── Store the source reference in the design contract
  └── NEVER proceed to implementation without completing the extraction step
```

**BAD** — Glancing at a design and writing CSS from memory or approximation.

**GOOD** — Systematically extracting every value from the design before writing a single line of CSS.

---

## 3. MCP & Tool Detection

```
MANDATORY:
  ├── Before extraction, detect available tools:
  │     Figma MCP → precise token extraction from Figma files
  │       `get_design_context` → structured code + tokens (USE THIS for extraction)
  │       `get_metadata` → node tree enumeration (USE THIS to find widget nodes)
  │       `get_screenshot` → visual image only (NEVER use for extraction —
  │         only for post-build verification comparisons)
  │     Claude Preview → render + screenshot for verification loop
  │     Chrome MCP → alternative render + screenshot for verification
  ├── If Figma MCP is available and source is Figma:
  │     Call `get_metadata` to enumerate the page's widget/component nodes
  │     Call `get_design_context` per widget node to extract structured data
  │     Extract exact colors, spacing, typography, component structure from the response
  │     MCP `get_design_context` values are authoritative — override visual estimates
  ├── If no Figma MCP but source is Figma:
  │     Recommend setup: "For precise extraction, install the Figma MCP server.
  │       Remote (recommended): https://mcp.figma.com/mcp
  │       Or install the Figma Plugin for Claude Code which includes MCP settings."
  │     Fallback: request a screenshot/export of each component at 1x and 2x
  │     Use visual analysis — note reduced precision in the design contract
  ├── Log which tools were used in the design contract Source section
  └── Future MCPs (Sketch, Adobe XD, Penpot) follow the same pattern
```

**BAD** — Ignoring available MCPs and eyeballing a Figma screenshot.

**GOOD** — Detecting Figma MCP, using it to extract exact `fill: #1A73E8`, `font-size: 14px`, `padding: 16px 24px`, then writing CSS from those exact values.

---

## 4. Stack Capability Evaluation

```
MANDATORY:
  ├── BEFORE implementation, evaluate whether the project's chosen stack
  │   can achieve pixel-perfect fidelity for this specific design:
  │
  ├── Evaluate these capabilities against design requirements:
  │     CSS Grid / Flexbox support → complex layouts
  │     Custom font loading → non-system typography
  │     CSS custom properties → design token system
  │     Animation / transition support → interactive states, micro-interactions
  │     SVG support → icons, illustrations, complex shapes
  │     Responsive units (clamp, container queries) → fluid scaling
  │     Pseudo-elements (::before, ::after) → decorative elements
  │     Backdrop filters / blend modes → glassmorphism, overlays
  │     Gradient support → complex gradient fills
  │     Component scoping → style isolation (CSS Modules, Shadow DOM, scoped styles)
  │
  ├── For each design requirement, assess:
  │     Supported → stack handles this natively, proceed
  │     Partial → needs an addon/library — name it, estimate effort
  │     Unsupported → stack CANNOT achieve this — flag as a blocker
  │
  ├── If ANY requirement is Unsupported:
  │     STOP and present to the user:
  │       1. What the design requires
  │       2. What the current stack cannot do
  │       3. Recommended alternatives that CAN achieve it:
  │            Example: "Design requires backdrop-filter blur — current stack
  │            uses older browser targets that don't support it. Options:
  │            (a) Update browserslist to modern-only
  │            (b) Switch from CSS Modules to Tailwind (has backdrop-blur utility)
  │            (c) Use a polyfill (reduced fidelity)"
  │       4. Wait for user decision before proceeding
  │
  ├── If design requires a component library:
  │     Evaluate: Can it be customized to match the design exactly?
  │     Component libraries with opinionated styling (Material UI defaults,
  │     Bootstrap themes) often FIGHT pixel-perfect custom designs
  │     Recommend headless/unstyled alternatives when customization is needed:
  │       Radix UI, Headless UI, React Aria, Shadcn/ui (Tailwind-based)
  │
  └── Document all findings in the design contract Stack Evaluation table
```

**BAD** — Starting implementation with Material UI and discovering halfway through that you can't match the design's custom border radius, shadow, and spacing because MUI's theme system fights you.

**GOOD** — Evaluating upfront: "Design uses custom card shadows and non-standard spacing. MUI's elevation system won't match. Recommend: Tailwind + Radix for full styling control, or MUI with a fully custom theme override."

---

## 5. Design Token Extraction Protocol

```
MANDATORY:
  ├── Extract EVERY value before writing any implementation code:
  │     Colors    → exact hex/rgba/hsl for every fill, stroke, text color
  │     Typography → family, weight, size, line-height, letter-spacing per text style
  │     Spacing   → padding, margin, gap values for every element
  │     Borders   → radius, width, style, color
  │     Shadows   → x-offset, y-offset, blur, spread, color
  │     Opacity   → any transparency values
  │     Sizing    → exact width/height for fixed-size elements
  │     Z-index   → layering order for overlapping elements
  ├── Record each token with its usage context (which element, which state)
  ├── Group tokens into a consistent naming system (--color-primary, --spacing-md, etc.)
  ├── Cross-reference: if a value appears multiple times, it's a shared token
  └── Write ALL tokens to .gsd-t/contracts/design-contract.md BEFORE coding
```

**BAD** — Writing `padding: 15px` because "it looks about right."

**GOOD** — Extracting `padding: 16px` from the design tool, recording it as `--spacing-md: 1rem`, tracing it to "card container padding" in the design contract.

---

## 6. Design Contract Generation

```
MANDATORY:
  ├── Write extracted tokens to .gsd-t/contracts/design-contract.md
  │     Use the design-contract template from templates/design-contract.md
  ├── Every CSS value in the implementation MUST trace to a contract entry
  ├── If a value isn't in the contract, the extraction was incomplete — go back
  ├── The contract is the source of truth — not the code, not your memory
  └── Update the contract if the design changes during implementation
```

The design contract serves the same purpose as API contracts in GSD-T: it defines the exact interface between design and code. Any deviation is a violation.

---

## 7. Component Decomposition

```
MANDATORY:
  ├── Before coding, analyze the design and produce a component tree:
  │     Root container → sections → components → sub-components → atoms
  ├── Identify repeated patterns → these become reusable components
  ├── Identify variant states → these become component props
  │     Example: Button has primary/secondary/ghost → variant prop
  ├── Identify slot boundaries → where dynamic content gets injected
  ├── Map the tree to your framework's component model (React, Vue, etc.)
  ├── Name components semantically — match the design's layer names when clear
  └── Document the tree in the design contract's Component Tree section
```

**BAD** — Writing one monolithic 400-line component that renders the entire page.

**GOOD**
```
Page
  ├── Header
  │     ├── Logo
  │     ├── NavLinks
  │     └── UserMenu (variant: logged-in | logged-out)
  ├── HeroSection
  │     ├── Headline
  │     ├── Subheadline
  │     └── CTAButton (variant: primary)
  ├── FeatureGrid
  │     └── FeatureCard (x3, reusable)
  │           ├── Icon
  │           ├── Title
  │           └── Description
  └── Footer
```

---

## 8. Layout Analysis

```
MANDATORY:
  ├── Identify the layout system for every container:
  │     Is it a grid? → CSS Grid with explicit columns/rows/gaps
  │     Is it a row/column? → Flexbox with explicit direction/gap/alignment
  │     Is it positioned? → Relative/absolute with exact offsets
  ├── Measure exact gap values between elements — never approximate
  ├── Identify alignment: start, center, end, stretch, space-between
  ├── Determine sizing: fixed width/height vs flex-grow vs percentage vs min/max
  ├── Note content overflow behavior: hidden, scroll, wrap, ellipsis
  └── Document layout per breakpoint in the design contract
```

**BAD** — `display: flex; gap: 10px;` without measuring the actual gap.

**GOOD** — Extracting gap as exactly `24px` from the design, then: `display: flex; gap: 1.5rem; /* 24px — design contract: section-gap */`

### Flex Centering Anti-Pattern (MANDATORY)

```
NEVER use flex: 1 on a content element to center its text/content.
flex: 1 makes the ELEMENT GROW to fill available space — the content
centers within an oversized box, but the box itself displaces siblings.

  WRONG — content element grows, inflated box shifts layout:
    .kpi { flex: 1; display: flex; justify-content: center; }

  RIGHT — parent grows, children keep natural size:
    .body { flex: 1; display: flex; flex-direction: column;
            justify-content: center; }
    .kpi  { /* no flex: 1 — natural height only */ }

  RULE: flex: 1 belongs on CONTAINERS, not on CONTENT elements.
        To center content vertically, apply justify-content: center
        on the parent — never flex: 1 on the child.
```

### Fixed-Height Container Arithmetic (MANDATORY)

```
When a card or container has a fixed height, BEFORE writing any CSS:
  1. Compute the total available body height:
     body_available = card_height - padding_top - padding_bottom
                      - header_height - header_to_body_gap
  2. List every child element's height (from the design contract)
  3. List every gap between children
  4. SUM them: total_content = child1 + gap1 + child2 + gap2 + ...
  5. Compare: total_content MUST ≤ body_available
  6. If total_content < body_available:
     Document the centering strategy (justify-content: center on parent)
  7. If total_content > body_available:
     The design extraction is wrong — go back to Figma

  This arithmetic goes in the widget contract's Internal Layout
  Arithmetic section. The implementation MUST match the arithmetic.
  If gap: 12px makes the math exceed body_available, use gap: 8px.
```

---

## 9. Responsive Breakpoint Strategy

```
MANDATORY:
  ├── Analyze the design for breakpoint behavior BEFORE coding
  │     What layout changes? (stack, reorder, hide, resize)
  │     What typography changes? (font-size, line-height)
  │     What spacing changes? (padding, margins, gaps)
  ├── Define breakpoints explicitly — match the design's target viewports
  │     Common: mobile 375px, tablet 768px, desktop 1280px, wide 1440px+
  ├── Choose mobile-first or desktop-first per project convention
  ├── Use fluid values where appropriate:
  │     clamp(min, preferred, max) for font sizes
  │     percentage or vw-based widths for flexible containers
  │     container queries for component-level responsiveness
  ├── NEVER assume "it'll work at intermediate sizes" — test every breakpoint
  └── Document breakpoint behavior in the design contract
```

**BAD** — Building desktop only, then adding `@media (max-width: 768px)` as an afterthought.

**GOOD** — Analyzing all breakpoints upfront, building mobile-first, progressively enhancing:
```css
/* Mobile (default) */
.feature-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
/* Tablet */
@media (min-width: 768px) { .feature-grid { grid-template-columns: repeat(2, 1fr); gap: 1.5rem; } }
/* Desktop */
@media (min-width: 1280px) { .feature-grid { grid-template-columns: repeat(3, 1fr); gap: 2rem; } }
```

---

## 10. Semantic HTML Structure

```
MANDATORY:
  ├── Use semantic elements: nav, main, section, article, aside, header, footer
  ├── Heading hierarchy: one h1 per page, h2 → h3 → h4 in order, no skips
  ├── Interactive elements: button for actions, a for navigation — NEVER div with onClick
  ├── Form elements: label + input pairs, fieldset + legend for groups
  ├── ARIA landmarks: role attributes only when semantic HTML doesn't suffice
  ├── Alt text: descriptive for content images, empty (alt="") for decorative
  ├── Tab order: logical, follows visual layout, no positive tabindex values
  └── Focus indicators: visible on every interactive element
```

**BAD** — `<div class="button" onclick="...">Click me</div>`

**GOOD** — `<button type="button" class="cta-button">Click me</button>`

---

## 11. Naming Conventions (Classes, IDs, Data Attributes)

```
MANDATORY:
  ├── CSS class naming — use ONE consistent convention per project:
  │     BEM: .block__element--modifier (e.g., .card__title--highlighted)
  │     Tailwind: utility classes only (no custom class names needed)
  │     CSS Modules: camelCase (e.g., styles.cardTitle)
  │     Scoped CSS (Vue/Svelte): semantic kebab-case (e.g., .card-title)
  │     NEVER mix conventions in the same project
  ├── IDs — use sparingly, only when required:
  │     Form label associations: <label for="email-input">
  │     Anchor targets: <section id="pricing">
  │     ARIA references: aria-labelledby, aria-describedby
  │     NEVER use IDs for styling — classes only
  │     NEVER use auto-generated or meaningless IDs (id="div1", id="el-47")
  ├── Data attributes — for JavaScript hooks and testing:
  │     data-testid for test selectors (e.g., data-testid="submit-button")
  │     data-* for component state/config (e.g., data-active="true")
  │     NEVER use classes or IDs for JavaScript selection — use data attributes
  ├── Component naming — match the design system:
  │     If Figma layers are named "Hero/CTA Button" → component is CTAButton
  │     If design system has "Card > Title" → class is .card__title or .card-title
  │     Align code names with design names for traceability
  ├── Semantic naming — describe purpose, not appearance:
  │     BAD: .blue-text, .big-box, .left-panel, .mt-20
  │     GOOD: .primary-action, .feature-card, .sidebar, .section-spacing
  │     Exception: utility classes in Tailwind (appearance-based by design)
  └── File naming — match component names:
        Component: FeatureCard.vue → styles: feature-card.css or scoped
        Component: HeroSection.tsx → test: HeroSection.test.tsx
```

**BAD** — `<div class="div1 blue-thing" id="x47" onclick="...">`

**GOOD** — `<section class="feature-card" data-testid="feature-card-pricing">`

---

## 12. CSS Precision Rules

```
MANDATORY:
  ├── EVERY value must trace to the design contract — no "looks about right"
  ├── Use CSS custom properties for design tokens:
  │     :root { --color-primary: #1A73E8; --spacing-md: 1rem; }
  ├── NO magic numbers without a comment tracing to the design spec
  │     BAD:  padding: 13px;
  │     GOOD: padding: var(--spacing-card); /* 16px — design contract: card-padding */
  ├── Consistent units: rem for spacing/typography, px for borders/shadows
  ├── Box model: use box-sizing: border-box universally
  ├── When the project uses Tailwind: map design tokens to Tailwind config
  │     extend theme with exact values from the design contract
  └── Zero tolerance for deviation — if the design says 16px, the code says 16px
```

**BAD** — Freestyle CSS with values pulled from thin air.

**GOOD** — Every value traceable:
```css
.card {
  padding: var(--spacing-lg);         /* 24px — design contract */
  border-radius: var(--radius-md);    /* 8px — design contract */
  box-shadow: var(--shadow-card);     /* 0 2px 8px rgba(0,0,0,0.1) — design contract */
  background: var(--color-surface);   /* #FFFFFF — design contract */
}
```

---

## 13. Typography Rendering

```
MANDATORY:
  ├── Font loading: preload primary fonts, use font-display: swap
  ├── Exact values from design: family, weight, size, line-height, letter-spacing
  │     NEVER approximate: "looks like 14px" → measure it, confirm it
  ├── Line-height: use unitless values (1.5, not 24px) for scalability
  │     Exception: fixed-height single-line elements where px matches design
  ├── Letter-spacing: convert from design tool units if needed
  │     Figma uses percentage or px; CSS uses em or px
  │     0.5% in Figma ≈ 0.005em in CSS
  ├── Text overflow: match design behavior (ellipsis, wrap, clamp lines)
  ├── Font weight mapping: design tools may use names — map to numeric values
  │     Thin=100, Light=300, Regular=400, Medium=500, SemiBold=600, Bold=700
  └── Responsive typography: use clamp() or breakpoint-specific sizes per design
```

**BAD** — `font-size: 16px; line-height: 1.5;` without checking the actual design values.

**GOOD** — Exact extraction:
```css
.headline {
  font-family: var(--font-heading);       /* Inter — design contract */
  font-weight: 600;                        /* SemiBold — design contract */
  font-size: clamp(1.5rem, 2vw, 2.25rem); /* 24-36px responsive — design contract */
  line-height: 1.3;                        /* 31.2px at 24px — design contract */
  letter-spacing: -0.01em;                 /* -0.16px at 16px — design contract */
}
```

---

## 14. Color Accuracy

```
MANDATORY:
  ├── Extract exact color values — never approximate
  │     #1A73E8 is NOT #1A74E9 — match exactly
  ├── Use the format from the design tool: hex for solid, rgba for transparent
  ├── Define as CSS custom properties — NEVER hardcode throughout stylesheets
  ├── Gradients: extract exact stops (color + position %)
  ├── Opacity: apply via rgba/hsla or opacity property — match the design's approach
  ├── Dark mode (if applicable):
  │     Map each light token to its dark equivalent
  │     Use prefers-color-scheme or class-based toggle per project convention
  ├── Semantic naming: --color-primary, --color-text-secondary, --color-surface
  │     NOT --blue-500 — use design intent, not visual description
  └── Background images/patterns: export at correct resolution, use srcset for retina
```

**BAD** — Using `blue` or `#0000ff` when the design uses `#1A73E8`.

**GOOD** — Exact match with semantic naming:
```css
:root {
  --color-primary: #1A73E8;
  --color-primary-hover: #1557B0;
  --color-text-primary: #202124;
  --color-text-secondary: #5F6368;
  --color-surface: #FFFFFF;
  --color-border: #DADCE0;
}
```

---

## 15. Interactive States

```
MANDATORY:
  ├── Every interactive element MUST have ALL states defined:
  │     default, hover, focus-visible, active, disabled
  ├── Extract state styles from the design — designers often spec these
  │     If not specified: derive logically (hover = slightly darker/lighter)
  │     Document derived states in the design contract with "derived" note
  ├── Transitions: specify duration and easing — don't rely on browser defaults
  │     Standard: transition: all 150ms ease-in-out (or per design spec)
  ├── Focus indicators: visible, high-contrast, not just outline:none
  ├── Touch targets: minimum 44x44px on mobile — pad with transparent area if needed
  ├── Cursor states: pointer for clickable, not-allowed for disabled, text for inputs
  └── Loading states: skeleton/spinner/disabled during async operations
```

**BAD** — Styling only the default state, leaving hover/focus as browser defaults.

**GOOD**
```css
.cta-button {
  background: var(--color-primary);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 150ms ease-in-out, transform 100ms ease-in-out;
}
.cta-button:hover { background: var(--color-primary-hover); }
.cta-button:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.cta-button:active { transform: scale(0.98); }
.cta-button:disabled { background: var(--color-border); cursor: not-allowed; opacity: 0.6; }
```

---

## 16. Visual Verification — Against FIGMA, Not Just Contracts

**Visual verification is handled by a dedicated Design Verification Agent**, spawned automatically by `gsd-t-execute` (Step 5.25) after all domain tasks complete.

### Critical distinction: TWO verification targets

The verification agent compares the built frontend against **TWO sources** — not just one:

```
VERIFICATION TARGETS (run in this order):
  ├── TARGET 0: ELEMENT COUNT RECONCILIATION (run FIRST)
  │     Does the built page have the same NUMBER of widgets and elements
  │     as the Figma design? A missing widget is the most catastrophic
  │     deviation — catch it before spending effort on property comparison.
  │
  ├── TARGET 1: Built screen vs DESIGN CONTRACTS
  │     Does the code match the contract's claimed values?
  │     (This is what the 13-task validation proved works — airtight.)
  │
  ├── TARGET 2: Built screen vs FIGMA DESIGN (MANDATORY)
  │     Does the BUILT SCREEN match the ORIGINAL FIGMA STRUCTURED DATA?
  │     This catches: contracts that were wrong to begin with,
  │     chart type misclassification, hallucinated data, missing elements.
  │
  ├── TARGET 3: SVG STRUCTURAL OVERLAY (MANDATORY)
  │     Export Figma frame as SVG → parse element positions/dimensions/colors
  │     → compare geometrically against built DOM bounding boxes.
  │     This catches: aggregate spacing drift, alignment issues, proportion
  │     errors that pass property-level checks but look wrong visually.
  │
  └── TARGET 4: DOM BOX MODEL INSPECTION (fixed-height containers)
        Evaluate offsetHeight vs scrollHeight per child element.
        This catches: inflated flex boxes, wrong space distribution,
        elements growing beyond their content size.
```

**Each target catches a different failure class.** Target 0: missing elements. Target 1: wrong values. Target 2: wrong contracts. Target 3: wrong placement. Target 4: wrong space distribution. All five are needed — no single layer catches everything.

### Verification agent workflow

```
SEPARATION OF CONCERNS:
  ├── CODING AGENT (you — Sections 1-15 above):
  │     Extract tokens → write precise CSS → trace every value to design contract
  │     Do NOT open a browser or attempt visual comparison yourself
  │
  └── DESIGN VERIFICATION AGENT (Step 5.25 of gsd-t-execute):
        1. Open browser → screenshot built page at each breakpoint
        2. Get Figma STRUCTURED DATA via `get_design_context` per widget node
           ⚠ Do NOT use `get_screenshot` for Figma data — it returns pixels
             you can't extract exact values from. `get_design_context` returns
             structured code, component properties, and design tokens.
           Use `get_metadata` first to enumerate widget nodes, then
             `get_design_context` on each widget node individually.
        3. STRUCTURED comparison: built page values vs Figma `get_design_context` values
        4. For EACH widget/section on the page:
           a. What does `get_design_context` say this Figma node contains?
              (chart type, text content, layout properties, colors)
           b. What did the CODE actually build? (inspect built page DOM/styles)
           c. Do they match? Not "does code match contract" — does CODE match FIGMA?
        5. Check every text label: does the built screen show the same titles,
           subtitles, column headers, legend items, KPI values as the Figma
           `get_design_context` response?
        6. Produce structured comparison table (30+ rows):
           | Element | Figma (get_design_context) | Built | MATCH/DEVIATION |
        7. SVG STRUCTURAL OVERLAY — mechanical geometry comparison:
           a. Export Figma frame as SVG (API/MCP or user-provided)
           b. Parse SVG DOM: positions, dimensions, fills, text per element
           c. Map SVG elements → built DOM elements by text + position proximity
           d. Compare geometry: position (≤2px=MATCH), dimensions, colors, text
           e. Produce SVG diff table:
              | SVG Element | SVG Position | Built Position | Δ px | Verdict |
           f. Flag unmapped elements (MISSING IN BUILD / EXTRA IN BUILD)
           This catches aggregate spacing/alignment drift the property table misses.
        8. Fix deviations → re-verify → artifact gate enforces completion
```

The verification agent enforces the **FAIL-BY-DEFAULT** rule: every visual element starts as UNVERIFIED. The only valid verdicts are MATCH (with proof) or DEVIATION (with specifics). "Looks close" and "appears to match" are not verdicts. An artifact gate in the orchestrator blocks completion if the comparison table is missing or empty.

> **Why "vs Figma" matters**: The two-terminal validation (v2.59–v2.67, 13 tasks, all 50/50) proved contracts→code is reliable. But when the BUILT screen was compared to the ACTUAL Figma design, major deviations emerged: wrong chart types (donuts instead of stacked bars), hallucinated column headers, invented data models — all of which scored 50/50 against their (wrong) contracts. Verifying against Figma, not just contracts, is the fix.

---

## 17. Anti-Patterns

```
NEVER DO THESE:
  ├── Eyeballing values — "looks like about 12px padding" (EXTRACT the exact value)
  ├── Hardcoding without traceability — magic numbers with no design reference
  ├── "Close enough" mentality — 14px when the design says 16px is a FAILURE
  ├── Desktop-only implementation — ignoring responsive breakpoints
  ├── State-less components — only styling default, ignoring hover/focus/disabled
  ├── Layout-only testing — checking element existence without visual verification
  ├── Skipping the extraction step — jumping straight to code
  ├── Approximating colors — using a "close" shade instead of the exact value
  ├── Ignoring typography details — wrong font weight, missing letter-spacing
  ├── Fixed pixel values everywhere — not using rem/em for scalable sizing
  ├── Mixing styling approaches — Tailwind + inline styles + CSS modules in one project
  └── Skipping the verification loop — submitting unverified visual output
```

---

## 18. Design-to-Code Verification Checklist

Before marking any design implementation task as complete:

- [ ] Design system / component library identified (or confirmed none) and documented in design contract
- [ ] Library components mapped to design elements — custom build only where no library match exists
- [ ] Design source identified and documented in design contract
- [ ] Element counts recorded in INDEX.md (widgets per page, elements per page)
- [ ] Built page element count matches Figma element count (no missing/extra widgets)
- [ ] Stack capability evaluated — all design requirements achievable (or alternatives approved)
- [ ] All design tokens extracted (colors, typography, spacing, borders, shadows)
- [ ] Tokens written to `.gsd-t/contracts/design-contract.md`
- [ ] Component tree documented and matches design hierarchy
- [ ] Every CSS value traces to a design contract entry
- [ ] CSS custom properties (or Tailwind config) define all design tokens
- [ ] Semantic HTML used (no div-soup, proper heading hierarchy)
- [ ] Naming conventions consistent: classes (BEM/Tailwind/Modules/scoped), IDs (minimal, semantic), data-testid for test hooks
- [ ] All interactive states implemented (hover, focus, active, disabled)
- [ ] Responsive behavior implemented for all target breakpoints
- [ ] Visual verification loop completed at mobile, tablet, and desktop widths
- [ ] Typography exact: family, weight, size, line-height, letter-spacing all match
- [ ] Colors exact: every fill, stroke, text color matches design values
- [ ] Spacing exact: every padding, margin, gap matches design values
- [ ] Accessibility: focus indicators, alt text, ARIA where needed, 44px touch targets
- [ ] No magic numbers — every value is documented or uses a design token
- [ ] SVG structural overlay comparison completed — geometry diff ≤2px per element
- [ ] DOM box model inspection passed — no inflated elements (offsetHeight >> scrollHeight)
- [ ] Layout arithmetic verified — child heights + gaps = body available height (fixed-height cards)
- [ ] No content element uses `flex: 1` for centering — only parent containers
- [ ] Verification results logged in design contract Verification Status table
