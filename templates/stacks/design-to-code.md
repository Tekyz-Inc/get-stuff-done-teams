# Design-to-Code Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

These rules apply when implementing a visual design as frontend code. The design already exists (Figma, screenshot, image, prototype) — your job is to replicate it faithfully in code with pixel-perfect accuracy.

---

## 1. Design Source Setup

```
MANDATORY:
  ├── NEVER write CSS or layout code without a design reference
  ├── Identify the source type: Figma file, image, screenshot, prototype URL
  ├── If source is a Figma URL/file → check if Figma MCP is available
  │     YES → Use Figma MCP to extract component data, styles, and layout
  │     NO  → Inform user: "Figma MCP recommended for precise extraction"
  │           Fallback: use image analysis (Claude's multimodal vision)
  ├── If source is an image/screenshot → use visual analysis to extract values
  ├── Store the source reference in the design contract
  └── NEVER proceed to implementation without completing the extraction step
```

**BAD** — Glancing at a design and writing CSS from memory or approximation.

**GOOD** — Systematically extracting every value from the design before writing a single line of CSS.

---

## 2. MCP & Tool Detection

```
MANDATORY:
  ├── Before extraction, detect available tools:
  │     Figma MCP → precise token extraction from Figma files
  │     Claude Preview → render + screenshot for verification loop
  │     Chrome MCP → alternative render + screenshot for verification
  ├── If Figma MCP is available and source is Figma:
  │     Use MCP to get exact colors, spacing, typography, component structure
  │     MCP values are authoritative — override visual estimates
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

## 3. Stack Capability Evaluation

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

## 4. Design Token Extraction Protocol

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

## 5. Design Contract Generation

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

## 6. Component Decomposition

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

## 7. Layout Analysis

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

---

## 8. Responsive Breakpoint Strategy

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

## 9. Semantic HTML Structure

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

## 10. CSS Precision Rules

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

## 11. Typography Rendering

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

## 12. Color Accuracy

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

## 13. Interactive States

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

## 14. Visual Verification Loop

```
MANDATORY:
  ├── After implementing any design component, you MUST verify it visually.
  │   Skipping this step is a TASK FAILURE — not optional, not "if tools available".
  │
  ├── Step 1: GET THE FIGMA REFERENCE
  │     If Figma MCP available → call get_screenshot with nodeId + fileKey
  │     If no MCP → use design image/screenshot from the design contract
  │     You MUST have a reference image before proceeding
  │
  ├── Step 2: RENDER IN A REAL BROWSER
  │     Start the dev server (npm run dev, etc.)
  │     Open the page using Claude Preview, Chrome MCP, or Playwright
  │     You MUST see real rendered output — not just read the code
  │
  ├── Step 3: SCREENSHOT AT EVERY BREAKPOINT
  │     Mobile (375px), Tablet (768px), Desktop (1280px) minimum
  │     Each breakpoint is a separate screenshot
  │
  ├── Step 4: PIXEL-BY-PIXEL COMPARISON
  │     Place Figma screenshot and browser screenshot side-by-side
  │     Check EVERY element systematically:
  │       Chart types — bar vs stacked bar vs donut (exact type match)
  │       Colors — exact hex values, not "close enough"
  │       Typography — font family, weight, size, line-height, letter-spacing
  │       Spacing — padding, margins, gaps (exact pixel match)
  │       Layout — grid structure, alignment, positioning
  │       Component states — toggle active/inactive, expanded/collapsed
  │       Data visualization — axis labels, legends, chart orientation
  │       Icons and imagery — correct icon set, correct sizes
  │
  ├── Step 5: FIX EVERY DEVIATION
  │     Log each deviation with specifics before fixing
  │     Fix one by one, tracing each fix to the design contract
  │     Re-render after each batch of fixes
  │     Maximum 3 fix-and-recheck iterations
  │
  ├── Step 6: FINAL VERIFICATION
  │     After fixes, take fresh screenshots at all breakpoints
  │     Confirm every deviation is resolved
  │     If deviations remain → CRITICAL finding in .gsd-t/qa-issues.md
  │     Task is NOT complete until visual match is confirmed
  │
  ├── NO BROWSER TOOLS = BLOCKER
  │     If Claude Preview, Chrome MCP, and Playwright are ALL unavailable:
  │     This is a CRITICAL blocker, not a warning to log and move on
  │     The task CANNOT be marked complete without visual verification
  │     Log to .gsd-t/qa-issues.md with severity CRITICAL
  │
  └── Log all verification results in the design contract Verification Status table
```

**BAD** — Writing CSS, committing, moving on without ever opening a browser to see the result. "Tests pass" is not visual verification.

**GOOD** — Render at 375px → Screenshot → Compare to Figma → "Donut chart missing center text, stacked bars rendered as vertical bars" → Fix chart type → Fix center text → Re-render → Confirm match → Repeat at 768px and 1280px → All match → Log "verified at 3 breakpoints" in design contract.

---

## 15. Anti-Patterns

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

## 16. Design-to-Code Verification Checklist

Before marking any design implementation task as complete:

- [ ] Design source identified and documented in design contract
- [ ] Stack capability evaluated — all design requirements achievable (or alternatives approved)
- [ ] All design tokens extracted (colors, typography, spacing, borders, shadows)
- [ ] Tokens written to `.gsd-t/contracts/design-contract.md`
- [ ] Component tree documented and matches design hierarchy
- [ ] Every CSS value traces to a design contract entry
- [ ] CSS custom properties (or Tailwind config) define all design tokens
- [ ] Semantic HTML used (no div-soup, proper heading hierarchy)
- [ ] All interactive states implemented (hover, focus, active, disabled)
- [ ] Responsive behavior implemented for all target breakpoints
- [ ] Visual verification loop completed at mobile, tablet, and desktop widths
- [ ] Typography exact: family, weight, size, line-height, letter-spacing all match
- [ ] Colors exact: every fill, stroke, text color matches design values
- [ ] Spacing exact: every padding, margin, gap matches design values
- [ ] Accessibility: focus indicators, alt text, ARIA where needed, 44px touch targets
- [ ] No magic numbers — every value is documented or uses a design token
- [ ] Verification results logged in design contract Verification Status table
