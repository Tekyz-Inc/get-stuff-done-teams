#!/usr/bin/env node

/**
 * GSD-T Design Build Workflow
 *
 * Workflow definition for the design-build pipeline (elements → widgets → pages).
 * Plugs into the base Orchestrator engine for deterministic flow control.
 *
 * Usage:
 *   gsd-t design-build [--resume] [--tier elements|widgets|pages] [--dev-port N] [--review-port N]
 *
 * Or directly:
 *   node bin/design-orchestrator.js [options]
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Orchestrator, info, warn, success, error, log, BOLD, RESET, DIM } = require("./orchestrator.js");

// ─── Constants ──────────────────────────────────────────────────────────────

const PHASES = ["elements", "widgets", "pages"];
const PHASE_SINGULAR = { elements: "element", widgets: "widget", pages: "page" };
const CONTRACTS_DIR = ".gsd-t/contracts/design";

// ─── Contract Discovery ─────────────────────────────────────────────────────

function discoverWork(projectDir) {
  const contractsDir = path.join(projectDir, CONTRACTS_DIR);
  const indexPath = path.join(contractsDir, "INDEX.md");

  if (!fs.existsSync(indexPath)) {
    error("No design contracts found. Run /user:gsd-t-design-decompose first.");
    process.exit(1);
  }

  const result = { elements: [], widgets: [], pages: [] };
  const indexContent = fs.readFileSync(indexPath, "utf8");
  const linkRegex = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)/gm;
  let match;

  while ((match = linkRegex.exec(indexContent)) !== null) {
    const name = match[1];
    const relPath = match[2];
    const fullPath = path.join(contractsDir, relPath);

    if (!fs.existsSync(fullPath)) {
      warn(`Contract file missing: ${relPath}`);
      continue;
    }

    let phase = null;
    for (const p of PHASES) {
      if (relPath.startsWith(`${p}/`)) { phase = p; break; }
    }
    if (!phase) continue;

    const contract = parseContract(fullPath, name);
    contract.contractPath = relPath;
    contract.fullContractPath = fullPath;
    result[phase].push(contract);
  }

  return result;
}

function parseContract(filePath, fallbackName) {
  const content = fs.readFileSync(filePath, "utf8");
  const contract = {
    id: fallbackName,
    name: fallbackName,
    sourcePath: null,
    selector: null,
    route: "/",
  };

  const nameMatch = content.match(/\|\s*(?:element|widget|page)\s*\|\s*(.+?)\s*\|/i);
  if (nameMatch) contract.id = nameMatch[1].trim();

  const sourceMatch = content.match(/\|\s*source_path\s*\|\s*(.+?)\s*\|/i);
  if (sourceMatch) contract.sourcePath = sourceMatch[1].trim();

  const selectorMatch = content.match(/\|\s*selector\s*\|\s*(.+?)\s*\|/i);
  if (selectorMatch) contract.selector = selectorMatch[1].trim();

  const routeMatch = content.match(/\|\s*route\s*\|\s*(.+?)\s*\|/i);
  if (routeMatch) contract.route = routeMatch[1].trim();

  contract.componentName = contract.id
    .split("-")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");

  return contract;
}

// ─── Prompt Building ────────────────────────────────────────────────────────

function buildPrompt(phase, items, prevResults, projectDir) {
  const singular = PHASE_SINGULAR[phase];
  const contractList = items.map(c => {
    const sourcePath = c.sourcePath || guessPaths(phase, c);
    return `- ${c.componentName}: read contract at ${c.fullContractPath}, write to ${sourcePath}`;
  }).join("\n");

  const prevPaths = [];
  for (const [, result] of Object.entries(prevResults)) {
    if (result.builtPaths) prevPaths.push(...result.builtPaths);
  }

  const importInstructions = prevPaths.length > 0
    ? `\n## Imports from Previous Tier\nImport these already-built components — do NOT rebuild their functionality inline:\n${prevPaths.map(p => `- ${p}`).join("\n")}\n`
    : "";

  return `You are building ${singular} components for a Vue 3 + TypeScript project.

## Task
Build ONLY the following ${items.length} ${phase} components from their design contracts.
Read each contract file for exact visual specs — do NOT approximate values.

## Components to Build
${contractList}

${importInstructions}
## Rules
- Read each contract file (the full path is given above) for exact property values
- Write components to the specified source paths
- Follow the project's existing code conventions (check existing files in src/)
- Use the project's existing dependencies (check package.json)
- When ALL ${items.length} components are complete, STOP. Do not start a dev server, do not ask for review, do not build components from other tiers.

## Important
This is a FINITE task. Build the ${items.length} ${phase} listed above, then EXIT.`;
}

function buildSingleItemPrompt(phase, item, prevResults, projectDir) {
  const singular = PHASE_SINGULAR[phase];
  const sourcePath = item.sourcePath || guessPaths(phase, item);

  const prevPaths = [];
  for (const [, result] of Object.entries(prevResults)) {
    if (result.builtPaths) prevPaths.push(...result.builtPaths);
  }

  const importInstructions = prevPaths.length > 0
    ? `\n## Imports from Previous Tier\nImport these already-built components — do NOT rebuild their functionality inline:\n${prevPaths.map(p => `- ${p}`).join("\n")}\n`
    : "";

  return `You are building ONE ${singular} component for a Vue 3 + TypeScript project.

## Task
Build this component from its design contract. Read the contract for exact visual specs — do NOT approximate values.

## Component
- **${item.componentName}**
- Contract: ${item.fullContractPath}
- Write to: ${sourcePath}
${importInstructions}
## Rules
- Read the contract file for exact property values
- Write the component to the specified source path
- Follow the project's existing code conventions (check existing files in src/)
- Use the project's existing dependencies (check package.json)
- When the component is complete, STOP. Do not start a dev server or build other components.

This is a FINITE task. Build this ONE ${singular}, then EXIT.`;
}

// ─── Measurement ────────────────────────────────────────────────────────────

function hasPlaywright(projectDir) {
  try {
    return fs.existsSync(path.join(projectDir, "node_modules", "@playwright", "test", "package.json"));
  } catch {
    return false;
  }
}

function measure(projectDir, phase, items, ports) {
  if (!hasPlaywright(projectDir)) {
    warn("Playwright not found — skipping automated measurement. Human review only.");
    const results = {};
    for (const c of items) results[c.id] = [];
    return results;
  }

  info(`Measuring ${items.length} ${phase} with Playwright...`);

  const measureScript = buildMeasureScript(items, ports.reviewPort);
  const scriptDir = path.join(projectDir, ".gsd-t", "design-review");
  try { fs.mkdirSync(scriptDir, { recursive: true }); } catch { /* exists */ }
  const scriptPath = path.join(scriptDir, "_measure.mjs");
  fs.writeFileSync(scriptPath, measureScript);

  const results = {};
  try {
    const output = execFileSync("node", [scriptPath], {
      encoding: "utf8",
      timeout: 60_000,
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const parsed = JSON.parse(output.trim());
      for (const [id, measurements] of Object.entries(parsed)) {
        results[id] = measurements;
      }
    } catch {
      warn("Could not parse measurement output — proceeding without measurements");
    }
  } catch (e) {
    warn(`Measurement failed: ${(e.message || "").slice(0, 100)}`);
  }

  try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }

  let passing = 0, failing = 0;
  for (const measurements of Object.values(results)) {
    for (const m of measurements) {
      if (m.pass) passing++; else failing++;
    }
  }
  if (failing > 0) warn(`Measurements: ${passing} pass, ${failing} fail`);
  else if (passing > 0) success(`Measurements: ${passing} pass, 0 fail`);

  return results;
}

function buildMeasureScript(items, reviewPort) {
  const selectors = items
    .filter(c => c.selector)
    .map(c => `  "${c.id}": "${c.selector}"`)
    .join(",\n");

  return `
import { chromium } from "playwright";

const SELECTORS = {
${selectors}
};

async function measure() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  try {
    await page.goto("http://localhost:${reviewPort}/", { waitUntil: "networkidle", timeout: 15000 });
  } catch {
    await page.goto("http://localhost:${reviewPort}/", { waitUntil: "load", timeout: 10000 });
  }

  await page.waitForTimeout(2000);

  const results = {};

  for (const [id, selector] of Object.entries(SELECTORS)) {
    try {
      const measurements = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return [{ property: "element exists", expected: "yes", actual: "no", pass: false, severity: "critical" }];

        const s = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return [
          { property: "element exists", expected: "yes", actual: "yes", pass: true },
          { property: "display", expected: "visible", actual: s.display === "none" ? "hidden" : "visible", pass: s.display !== "none" },
          { property: "width", expected: ">0", actual: String(Math.round(rect.width)) + "px", pass: rect.width > 0 },
          { property: "height", expected: ">0", actual: String(Math.round(rect.height)) + "px", pass: rect.height > 0 },
        ];
      }, selector);

      results[id] = measurements;
    } catch {
      results[id] = [{ property: "measurement", expected: "success", actual: "error", pass: false, severity: "critical" }];
    }
  }

  await browser.close();
  process.stdout.write(JSON.stringify(results));
}

measure().catch(e => {
  process.stderr.write(e.message);
  process.exit(1);
});
`;
}

// ─── Queue Items ────────────────────────────────────────────────────────────

function buildQueueItem(phase, item, measurements) {
  const singular = PHASE_SINGULAR[phase];
  const sourcePath = item.sourcePath || guessPaths(phase, item);
  return {
    id: `${singular}-${item.id}`,
    name: item.componentName,
    type: singular,
    selector: item.selector || `.${item.id}`,
    sourcePath,
    route: item.route || "/",
    measurements: (measurements && measurements[item.id]) || [],
  };
}

// ─── Path Guessing ──────────────────────────────────────────────────────────

function guessPaths(phase, item) {
  const dirMap = {
    elements: "src/components/elements",
    widgets: "src/components/widgets",
    pages: "src/views",
  };
  return `${dirMap[phase]}/${item.componentName}.vue`;
}

// ─── Fix Prompt ─────────────────────────────────────────────────────────────

function buildFixPrompt(phase, needsWork) {
  const fixes = needsWork.map(item => {
    const parts = [`Fix ${item.id}:`];
    if (item.changes?.length) {
      for (const c of item.changes) {
        parts.push(`  - ${c.property}: change from ${c.oldValue} to ${c.newValue} in ${c.path || "the component file"}`);
      }
    }
    if (item.comment) parts.push(`  - Additional: ${item.comment}`);
    return parts.join("\n");
  }).join("\n\n");

  return `Apply these specific fixes to ${phase} components:\n\n${fixes}\n\nApply the changes and EXIT. Do not rebuild anything else.`;
}

// ─── Automated AI Review (Term 2 equivalent) ───────────────────────────────

function buildReviewPrompt(phase, items, measurements, projectDir, ports) {
  const singular = PHASE_SINGULAR[phase];
  const contractsDir = path.join(projectDir, CONTRACTS_DIR);

  const componentList = items.map(c => {
    const sourcePath = c.sourcePath || guessPaths(phase, c);
    return `- **${c.componentName}** — contract: ${c.fullContractPath}, source: ${sourcePath}, selector: \`${c.selector || "." + c.id}\``;
  }).join("\n");

  // Include any measurement failures for context
  const failedMeasurements = [];
  for (const item of items) {
    const m = measurements[item.id] || [];
    const failures = m.filter(x => !x.pass);
    if (failures.length > 0) {
      failedMeasurements.push(`- ${item.componentName}: ${failures.map(f => `${f.property}: expected ${f.expected}, got ${f.actual}`).join("; ")}`);
    }
  }
  const measurementContext = failedMeasurements.length > 0
    ? `\n## Known Measurement Failures\nPlaywright already detected these — verify they are real issues:\n${failedMeasurements.join("\n")}\n`
    : "";

  return `You are an INDEPENDENT design reviewer. You have NO knowledge of how these components were built. Your job is to compare the built ${phase} against their design contracts and find deviations.

## Components to Review
${componentList}

${measurementContext}
## Review Process

**Step 1 — Code review (do this FIRST for ALL components):**
For each component, read the design contract file and the source file. Check that every contract-specified value (colors, sizes, spacing, border-radius, font, layout, chart type, etc.) is correctly implemented in the code. This is your primary review — most issues are catchable from code alone.

**Step 2 — Playwright spot-check (do this AFTER code review):**
Use Playwright to render components at http://localhost:${ports.reviewPort}/ and verify:
- Components render without errors and have correct dimensions
- Chart types, orientations, and data structures are correct
- Interactive elements respond correctly (hover, click, states)

Focus Playwright on components where code review raised concerns or where visual behavior can't be verified from code alone (e.g., SVG rendering, computed layouts). You do NOT need to re-measure every CSS property — the orchestrator already ran Playwright measurements above.

## Output Format

Output your findings between these markers. Each issue must have component, severity (critical/high/medium/low), and description with SPECIFIC contract vs. actual values:

[REVIEW_ISSUES]
[
  {"component": "ComponentName", "severity": "critical", "description": "Contract specifies donut chart but rendered as pie chart (no inner radius)"},
  {"component": "ComponentName", "severity": "high", "description": "Grid gap: contract 16px, actual 24px"}
]
[/REVIEW_ISSUES]

If ALL components match their contracts, output:
[REVIEW_ISSUES]
[]
[/REVIEW_ISSUES]

## CRITICAL — Output Rules
- Output MUST contain the [REVIEW_ISSUES] markers — the orchestrator parses your result from these markers. Without them, your review is lost.
- You write ZERO code. You ONLY review.
- Be HARSH. Your value is in catching what the builder missed.
- NEVER say "looks close" or "appears to match" — give SPECIFIC values.
- Every contract property must be verified. Missing verification = missed issue.
- Severity guide: critical = wrong component type, missing element, broken render. high = wrong dimensions, colors, layout. medium = spacing/padding off. low = minor visual difference.`;
}

function buildSingleItemReviewPrompt(phase, item, measurements, projectDir, ports) {
  const sourcePath = item.sourcePath || guessPaths(phase, item);

  // Include measurement failures for this item
  const m = measurements[item.id] || [];
  const failures = m.filter(x => !x.pass);
  const measurementContext = failures.length > 0
    ? `\n## Measurement Failures\nPlaywright detected: ${failures.map(f => `${f.property}: expected ${f.expected}, got ${f.actual}`).join("; ")}\n`
    : "";

  return `You are an INDEPENDENT design reviewer. Review this ONE component against its design contract.

## Component
- **${item.componentName}**
- Contract: ${item.fullContractPath}
- Source: ${sourcePath}
- Selector: \`${item.selector || "." + item.id}\`
${measurementContext}
## Review Process

1. Read the design contract file — note every specified property value
2. Read the source file — check that every contract-specified value is implemented correctly
3. If needed, use Playwright to render at http://localhost:${ports.reviewPort}/ and verify visual behavior

## Output Format

[REVIEW_ISSUES]
[
  {"component": "${item.componentName}", "severity": "high", "description": "Contract specifies X, code has Y"}
]
[/REVIEW_ISSUES]

If the component matches its contract, output:
[REVIEW_ISSUES]
[]
[/REVIEW_ISSUES]

## Rules
- You write ZERO code. You ONLY review.
- Be HARSH — specific values only, no "looks close."
- Output MUST contain [REVIEW_ISSUES] markers.`;
}

function buildAutoFixPrompt(phase, issues, items, projectDir) {
  const issueList = issues.map((issue, i) => {
    const item = items.find(c => c.componentName === issue.component);
    const contractPath = item ? item.fullContractPath : "check .gsd-t/contracts/design/";
    return `${i + 1}. [${issue.severity}] **${issue.component}** — ${issue.description}\n   Contract: ${contractPath}`;
  }).join("\n");

  return `The automated design reviewer found these issues. Fix each one by reading the design contract and correcting the implementation.

## Issues to Fix
${issueList}

## Rules
- Read each component's design contract for the correct values — do NOT guess
- Fix ONLY the listed issues — do not modify other components or add features
- After fixing all issues, EXIT. Do not start servers or ask for review.`;
}

// ─── Summary ────────────────────────────────────────────────────────────────

function formatSummary(phase, result) {
  return `${phase}: ${result.builtPaths.length} components built (${result.reviewCycles} review cycle${result.reviewCycles > 1 ? "s" : ""})`;
}

// ─── Usage ──────────────────────────────────────────────────────────────────

function showUsage() {
  log(`
${BOLD}GSD-T Design Build Orchestrator${RESET}

${BOLD}Usage:${RESET}
  gsd-t design-build [options]

${BOLD}Options:${RESET}
  --resume          Resume from last saved state
  --tier <name>     Start from specific tier (elements, widgets, pages)
  --project <dir>   Project directory (default: cwd)
  --dev-port <N>    Dev server port (default: 5173)
  --review-port <N> Review server port (default: 3456)
  --timeout <sec>   Claude timeout per tier in seconds (default: 600)
  --skip-measure    Skip Playwright measurement (human-review only)
  --clean           Clear all stale artifacts before starting
  --verbose, -v     Show Claude's tool calls and prompts in terminal
  --parallel <N>    Run N items concurrently (default: 1 = sequential)
  --help            Show this help

${BOLD}Pipeline:${RESET}
  1. Read contracts from .gsd-t/contracts/design/
  2. Start dev server + review server
  3. For each tier (elements → widgets → pages):
     a. Spawn Claude (builder) to build components from contracts
     b. Measure with Playwright
     c. Spawn Claude (reviewer) to compare against contracts — independent, no builder context
     d. If reviewer finds issues → spawn Claude (fixer) → re-measure → re-review (max 2 cycles)
     e. Queue for human review (only after automated review passes)
     f. Wait for human review submission (blocks until human approves)
     g. Process feedback, proceed to next tier
`);
}

// ─── Workflow Definition ────────────────────────────────────────────────────

const designBuildWorkflow = {
  name: "Design Build",
  command: "design-build",
  phases: PHASES,
  reviewDir: ".gsd-t/design-review",
  stateFile: ".gsd-t/design-review/orchestrator-state.json",
  defaults: {
    devPort: 5173,
    reviewPort: 3456,
    timeout: 600_000,
    devServerTimeout: 30_000,
    maxReviewCycles: 3,
    maxAutoReviewCycles: 4,
    reviewTimeout: 600_000,
    perItemTimeout: 120_000,
  },
  completionMessage: "All done. Run your app to verify: npm run dev",

  discoverWork,
  buildPrompt,
  buildReviewPrompt,
  buildSingleItemPrompt,
  buildSingleItemReviewPrompt,
  buildAutoFixPrompt,
  measure,
  buildQueueItem,
  buildFixPrompt,
  guessPaths,
  formatSummary,
  showUsage,

  // Use --tier as alias for --phase (design-build convention)
  parseArgs(argv, parseBase) {
    return parseBase(argv);
  },
};

// ─── Entry Point ────────────────────────────────────────────────────────────

async function run(args) {
  await new Orchestrator(designBuildWorkflow).run(args || []);
}

if (require.main === module) {
  run(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run, workflow: designBuildWorkflow };
