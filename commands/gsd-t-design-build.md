# GSD-T: Design Build — Build from Design Contracts with Two-Terminal Review

You are the design builder (Term 1). You build UI components from design contracts, measure them against specs, and coordinate with an independent review session (Term 2) for unbiased verification.

**Architecture**: Term 1 builds → file system → Term 2 reviews → file system → Term 1 reads feedback. Zero shared context between sessions.

## Step 0: Validate Prerequisites

1. Read `.gsd-t/contracts/design/INDEX.md` — if missing, STOP: "Run `/user:gsd-t-design-decompose` first to create design contracts."
2. Read `.gsd-t/progress.md` for current state
3. Verify `scripts/gsd-t-design-review-server.js` exists (GSD-T package)
   - Get the GSD-T install path: `npm root -g` → `{global_root}/@tekyzinc/gsd-t/scripts/`
   - If not found: "Update GSD-T: `/user:gsd-t-version-update`"

## Step 1: Start Infrastructure

### 1a. Dev Server

Check if a dev server is running:
```bash
lsof -i :5173 2>/dev/null | head -2
```

If not running, detect and start:
```bash
# Check package.json for dev command
npm run dev &
# Wait for server to be ready
for i in $(seq 1 30); do curl -s http://localhost:5173 > /dev/null 2>&1 && break; sleep 1; done
```

Record the dev server port as `$DEV_PORT`.

### 1b. Review Server

Find the review server script:
```bash
GSD_ROOT=$(npm root -g)/@tekyzinc/gsd-t/scripts
```

Start the review server as a background process:
```bash
node $GSD_ROOT/gsd-t-design-review-server.js \
  --target http://localhost:$DEV_PORT \
  --project $PWD \
  --port 3456 &
REVIEW_PID=$!
```

Verify it's running:
```bash
curl -s http://localhost:3456/review/api/status
```

### 1c. Launch Term 2 (Independent Review Session)

Write the review prompt to disk (Term 2 reads this, not Term 1's context):
```bash
cat > .gsd-t/design-review/review-prompt.md << 'PROMPT'
You are the design review agent (Term 2). You are an INDEPENDENT reviewer — you have NO knowledge of how components were built. Your job is to compare built output against design contracts.

## Your Loop

1. Poll `.gsd-t/design-review/queue/` every 5 seconds for new JSON files
2. For each queue item:
   a. Read the queue JSON — it has component name, selector, measurements, source path
   b. Read the matching design contract from `.gsd-t/contracts/design/`
   c. Open the app at http://localhost:3456/ (proxied through review server)
   d. Use Playwright to navigate to the component and evaluate it against the contract
   e. AI Review — check what measurements can't catch:
      - Does the visual hierarchy feel right?
      - Are proportions correct even if individual measurements pass?
      - Does the component look like the contract describes, holistically?
   f. If CRITICAL issues found (wrong chart type, missing elements, wrong data model):
      - Write rejection to `.gsd-t/design-review/rejected/{id}.json`:
        `{ "id": "...", "reason": "...", "severity": "critical", "timestamp": "..." }`
      - The review server will notify Term 1 automatically
   g. If no critical issues → the component passes to human review (review UI handles this)
3. When `.gsd-t/design-review/shutdown.json` appears → exit cleanly

## Rules
- You write ZERO code. You ONLY review.
- You have NO context about how anything was built — judge purely by contract vs. output.
- Be harsh. Your value is in catching what the builder missed.
- Check `.gsd-t/contracts/design/elements/`, `widgets/`, and `pages/` for specs.
PROMPT
```

Launch a new terminal with an independent Claude session:
```bash
# macOS
osascript -e "tell application \"Terminal\" to do script \"cd $(pwd) && claude --print 'Read .gsd-t/design-review/review-prompt.md and execute the instructions. This is your only directive.'\""
```

```bash
# Linux (fallback)
gnome-terminal -- bash -c "cd $(pwd) && claude --print 'Read .gsd-t/design-review/review-prompt.md and execute the instructions. This is your only directive.'; exec bash"
```

Display to user:
```
Design Build — Infrastructure Ready
  ✓ Dev server:    http://localhost:$DEV_PORT
  ✓ Review server: http://localhost:3456
  ✓ Review UI:     http://localhost:3456/review
  ✓ Term 2:        Independent review session launched
```

Auto-open the review UI:
```bash
open http://localhost:3456/review 2>/dev/null || xdg-open http://localhost:3456/review 2>/dev/null
```

## Step 2: Build Phase — Elements

Read all element contracts from `.gsd-t/contracts/design/elements/`. Sort by any `order` field or alphabetically.

For each element contract:

### 2a. Build the Element

Read the element contract. Build or update the component at the specified source path. Follow the contract exactly:
- Chart type, dimensions, colors, spacing, typography
- Props interface matching the contract's data model
- Import patterns (use existing design system components where specified)

### 2b. Render-Measure-Compare

After building, use Playwright to measure the rendered component against the contract specs:

```javascript
// In Playwright page.evaluate():
const el = document.querySelector(selector);
const s = getComputedStyle(el);
const rect = el.getBoundingClientRect();
// Measure each spec property from the contract
// Compare against expected values
// Build measurements array: [{ property, expected, actual, pass }]
```

### 2c. Queue for Review

Write the queue JSON to `.gsd-t/design-review/queue/{element-id}.json`:
```json
{
  "id": "element-donut-chart",
  "name": "DonutChart",
  "type": "element",
  "order": 1,
  "selector": "svg[viewBox='0 0 200 200']",
  "sourcePath": "src/components/elements/DonutChart.vue",
  "route": "/",
  "measurements": [
    { "property": "chart type", "expected": "donut", "actual": "donut", "pass": true },
    ...
  ]
}
```

### 2d. Check for Auto-Rejections

After queuing, check for immediate rejection from Term 2:
```bash
# Brief wait for Term 2 to process
sleep 3
ls .gsd-t/design-review/rejected/{element-id}.json 2>/dev/null
```

If rejected:
- Read the rejection reason
- Fix the element based on the rejection feedback
- Re-measure and re-queue (max 2 auto-rejection cycles per element)

### 2e. Continue Building

Continue building remaining elements. Don't wait for human review — queue them all.

## Step 3: Wait for Human Review

After all elements are built and queued, enter the poll loop:

```
Waiting for human review...
  Review UI: http://localhost:3456/review
  {N} elements queued, awaiting submission
```

Poll for the review-complete signal:
```bash
while [ ! -f .gsd-t/design-review/review-complete.json ]; do
  sleep 5
done
```

## Step 4: Process Feedback

Read `.gsd-t/design-review/review-complete.json` and each feedback file in `.gsd-t/design-review/feedback/`.

For each element's feedback:

### No changes, no comment → Approved
- Mark element as complete
- No action needed

### Property changes only → Apply and verify
- Read the change list: `[{ property, oldValue, newValue, path }]`
- Map CSS property changes back to source code:
  - Tailwind: `padding: 16px` → find and update the Tailwind class (e.g., `p-6` → `p-4`)
  - Inline styles: update the style binding directly
  - CSS modules: update the CSS rule
- Re-run Playwright measurement to verify the change took effect
- If verification passes → mark complete
- If verification fails → re-queue for review with updated measurements

### Comment only → Interpret and fix
- Read the comment — it describes a change to make
- Implement the change described in the comment
- Re-measure the element
- Re-queue for review

### Changes + comment → Apply changes, use comment as context
- Apply the property changes first
- Read the comment for additional context or fixes beyond the property changes
- Implement any additional changes
- Re-measure and re-queue

After processing all feedback:
- Clear the queue: `rm .gsd-t/design-review/queue/*.json`
- Delete the signal: `rm .gsd-t/design-review/review-complete.json`
- Clear feedback: `rm .gsd-t/design-review/feedback/*.json`

If any elements were re-queued → return to Step 3 (max 3 review cycles total).

## Step 5: Widget Assembly Phase

After all elements are approved:

1. Read widget contracts from `.gsd-t/contracts/design/widgets/`
2. For each widget:
   a. Build the widget — MUST import approved element components, not rebuild them inline
   b. Verify imports: grep the widget file for element imports
   c. Playwright measure the assembled widget
   d. Queue for review (same flow as elements)
3. Wait for human review (Step 3)
4. Process feedback (Step 4)

## Step 6: Page Composition Phase

After all widgets are approved:

1. Read page contracts from `.gsd-t/contracts/design/pages/`
2. For each page:
   a. Build the page — MUST import approved widget components
   b. Verify grid layout, section ordering, responsive breakpoints
   c. Playwright measure the full page
   d. Queue for review
3. Wait for human review
4. Process feedback

## Step 7: Cleanup and Report

```bash
# Signal Term 2 to shut down
echo '{"shutdown": true}' > .gsd-t/design-review/shutdown.json
sleep 2

# Kill review server
kill $REVIEW_PID 2>/dev/null

# Kill dev server if we started it
# (only if we started it in Step 1a)
```

Report:
```
Design Build Complete
  Elements: {N} built, {N} approved
  Widgets:  {N} built, {N} approved
  Pages:    {N} built, {N} approved
  Review cycles: {N}
  
  Changes applied from review: {N}
  Comments addressed: {N}
```

Update `.gsd-t/progress.md` with completion status.

## Coordination Directory Structure

```
.gsd-t/design-review/
├── queue/                    # Term 1 writes, Term 2 + human reads
│   ├── element-donut.json
│   └── element-bar.json
├── feedback/                 # Human review writes, Term 1 reads
│   ├── element-donut.json
│   └── element-bar.json
├── rejected/                 # Term 2 auto-rejects, Term 1 reads
│   └── element-bar.json
├── review-complete.json      # Human submit signal → Term 1 polls
├── review-prompt.md          # Term 2's instructions (no builder context)
├── shutdown.json             # Term 1 signals Term 2 to exit
└── status.json               # Review server state
```

## Rules

- NEVER share builder context with Term 2 — coordination is files only
- NEVER skip the review cycle — every component goes through Term 2 + human
- NEVER proceed to widgets before all elements are approved
- NEVER rebuild element functionality inline in widgets — always import
- Max 3 review cycles per phase — if still failing, stop and present to user
- Auto-open the browser review UI so the user doesn't have to find it
- Kill all background processes on completion or error
