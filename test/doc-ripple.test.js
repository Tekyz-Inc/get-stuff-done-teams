/**
 * Tests for doc-ripple threshold logic, manifest format, and blast radius analysis.
 * Validates the rules defined in .gsd-t/contracts/doc-ripple-contract.md.
 * Uses Node.js built-in test runner (node --test).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// ─── Threshold Logic Helpers ────────────────────────────────────────────────
// Pure functions that implement the contract's threshold rules for testability.

/**
 * Count unique directories from a list of file paths.
 */
function countDirectories(files) {
  const dirs = new Set(files.map((f) => {
    const parts = f.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
  }));
  return dirs.size;
}

/**
 * Classify a file by type based on its path.
 * Types: contract, template, claude, command, test, doc, config, source
 */
function classifyFile(filePath) {
  if (filePath.match(/\.gsd-t\/contracts\/.*\.md$/)) return "contract";
  if (filePath.match(/^templates\/.*\.md$/)) return "template";
  if (filePath.match(/CLAUDE\.md$/)) return "claude";
  if (filePath.match(/^commands\/.*\.md$/)) return "command";
  if (filePath.match(/^test\//)) return "test";
  if (filePath.match(/^docs\//)) return "doc";
  if (filePath.match(/\.(json|yml|yaml|toml|env|ini|cfg)$/)) return "config";
  return "source";
}

/**
 * Detect cross-cutting signals from a list of changed files.
 * Returns array of signal descriptions.
 */
function detectCrossCuttingSignals(files) {
  const signals = [];
  const dirs = countDirectories(files);
  if (dirs >= 3) signals.push(`${dirs} directories changed`);

  const types = files.map((f) => ({ file: f, type: classifyFile(f) }));
  if (types.some((t) => t.type === "contract")) signals.push("contract modified");
  if (types.some((t) => t.type === "template")) signals.push("template modified");
  if (types.some((t) => t.type === "claude")) signals.push("CLAUDE.md modified");
  if (types.some((t) => t.type === "command")) signals.push("command file modified");

  return signals;
}

/**
 * Detect content-based cross-cutting signals from diff content.
 * These require reading the actual diff, not just file names.
 */
function detectContentSignals(diffContent, files) {
  const signals = [];
  if (!diffContent) return signals;

  // FIRE condition 6: API endpoint/route patterns in diff
  const routePatterns = /\b(app\.(get|post|put|delete|patch)|router\.(get|post|put|delete|patch)|@(Get|Post|Put|Delete|Patch)|endpoint|@app\.route)\b/;
  if (routePatterns.test(diffContent)) {
    signals.push("API endpoint/route pattern detected");
  }

  // FIRE condition 7: Convention keywords in non-test files
  const nonTestFiles = files.filter((f) => classifyFile(f) !== "test");
  if (nonTestFiles.length > 0) {
    const conventionPattern = /\b(MUST|NEVER|MANDATORY|ALWAYS)\b/;
    if (conventionPattern.test(diffContent)) {
      signals.push("convention keyword detected (MUST/NEVER/MANDATORY/ALWAYS)");
    }
  }

  return signals;
}

/**
 * Evaluate threshold: FIRE or SKIP.
 * FIRE when ANY cross-cutting signal is detected.
 * SKIP when ALL conditions for skip are met.
 * @param {string[]} files - changed file paths
 * @param {string} [diffContent] - optional diff content for content-based signals
 */
function evaluateThreshold(files, diffContent) {
  const signals = [
    ...detectCrossCuttingSignals(files),
    ...detectContentSignals(diffContent, files),
  ];
  return {
    decision: signals.length > 0 ? "FIRE" : "SKIP",
    signals,
    fileCount: files.length,
    dirCount: countDirectories(files),
  };
}

/**
 * Determine which documents are affected based on file classifications.
 * Returns array of { document, status, action, reason }.
 */
function analyzeBlastRadius(files) {
  const types = files.map((f) => ({ file: f, type: classifyFile(f) }));
  const manifest = [];

  // progress.md always checked — UPDATED if any file was modified
  manifest.push({
    document: ".gsd-t/progress.md",
    status: files.length > 0 ? "UPDATED" : "SKIPPED",
    action: files.length > 0 ? "Decision Log entry" : "No changes",
    reason: files.length > 0 ? "Files modified" : "—",
  });

  // contracts — check if API/schema/component contracts need updating
  const hasApiChange = types.some((t) => t.file.match(/route|endpoint|api/i));
  manifest.push({
    document: ".gsd-t/contracts/api-contract.md",
    status: hasApiChange ? "UPDATED" : "SKIPPED",
    action: hasApiChange ? "API shape changed" : "No API changes",
    reason: hasApiChange ? "Route/endpoint file modified" : "—",
  });

  // requirements.md — updated if source files implement requirements
  const hasSourceChange = types.some((t) => t.type === "source");
  manifest.push({
    document: "docs/requirements.md",
    status: hasSourceChange ? "UPDATED" : "SKIPPED",
    action: hasSourceChange ? "Requirement implementation changed" : "No requirement changes",
    reason: hasSourceChange ? "Source files modified" : "—",
  });

  // architecture.md — updated if new components or data flow changes
  const hasArchChange = types.some((t) =>
    t.type === "source" && t.file.match(/component|module|service|controller/i)
  );
  manifest.push({
    document: "docs/architecture.md",
    status: hasArchChange ? "UPDATED" : "SKIPPED",
    action: hasArchChange ? "Component added/changed" : "No architecture changes",
    reason: hasArchChange ? "Architecture-relevant file modified" : "—",
  });

  // Command reference files — updated if command files changed
  const hasCommandChange = types.some((t) => t.type === "command");
  const cmdDocs = ["GSD-T-README.md", "README.md", "templates/CLAUDE-global.md", "commands/gsd-t-help.md"];
  for (const doc of cmdDocs) {
    manifest.push({
      document: doc,
      status: hasCommandChange ? "UPDATED" : "SKIPPED",
      action: hasCommandChange ? "Command reference updated" : "No command changes",
      reason: hasCommandChange ? "Command file modified" : "—",
    });
  }

  // CLAUDE.md — updated if conventions change
  const hasConventionChange = types.some((t) => t.type === "claude" || t.type === "template");
  manifest.push({
    document: "CLAUDE.md",
    status: hasConventionChange ? "UPDATED" : "SKIPPED",
    action: hasConventionChange ? "Convention updated" : "No convention changes",
    reason: hasConventionChange ? "Convention-affecting file modified" : "—",
  });

  return manifest;
}

/**
 * Format manifest as markdown string per contract spec.
 */
function formatManifest(command, files, blastRadius) {
  const threshold = evaluateThreshold(files);
  const updated = blastRadius.filter((r) => r.status === "UPDATED").length;
  const skipped = blastRadius.filter((r) => r.status === "SKIPPED").length;

  let md = `# Doc-Ripple Manifest — 2026-03-24\n\n`;
  md += `## Trigger\n`;
  md += `- Command: ${command}\n`;
  md += `- Files changed: ${threshold.fileCount}\n`;
  md += `- Threshold: ${threshold.decision} — ${threshold.signals.join(", ") || "none"}\n\n`;
  md += `## Blast Radius\n\n`;
  md += `| Document | Status | Action | Reason |\n`;
  md += `|----------|--------|--------|--------|\n`;
  for (const entry of blastRadius) {
    md += `| ${entry.document} | ${entry.status} | ${entry.action} | ${entry.reason} |\n`;
  }
  md += `\n## Summary\n`;
  md += `- Documents checked: ${blastRadius.length}\n`;
  md += `- Documents updated: ${updated}\n`;
  md += `- Documents skipped (already current): ${skipped}\n`;
  return md;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

// ─── countDirectories ───────────────────────────────────────────────────────

describe("countDirectories", () => {
  it("counts single root-level file as 1 dir", () => {
    assert.equal(countDirectories(["file.js"]), 1);
  });

  it("counts files in same directory as 1 dir", () => {
    assert.equal(countDirectories(["src/a.js", "src/b.js"]), 1);
  });

  it("counts files in 3 directories as 3", () => {
    assert.equal(
      countDirectories(["src/a.js", "test/b.test.js", "commands/c.md"]),
      3
    );
  });

  it("counts nested directories distinctly", () => {
    assert.equal(
      countDirectories(["src/auth/login.js", "src/auth/logout.js", "src/ui/form.js"]),
      2
    );
  });
});

// ─── classifyFile ───────────────────────────────────────────────────────────

describe("classifyFile", () => {
  it("classifies contract files", () => {
    assert.equal(classifyFile(".gsd-t/contracts/api-contract.md"), "contract");
  });

  it("classifies template files", () => {
    assert.equal(classifyFile("templates/CLAUDE-global.md"), "template");
  });

  it("classifies CLAUDE.md files", () => {
    assert.equal(classifyFile("CLAUDE.md"), "claude");
    assert.equal(classifyFile("project/CLAUDE.md"), "claude");
  });

  it("classifies command files", () => {
    assert.equal(classifyFile("commands/gsd-t-execute.md"), "command");
  });

  it("classifies test files", () => {
    assert.equal(classifyFile("test/doc-ripple.test.js"), "test");
  });

  it("classifies doc files", () => {
    assert.equal(classifyFile("docs/requirements.md"), "doc");
  });

  it("classifies config files", () => {
    assert.equal(classifyFile("package.json"), "config");
    assert.equal(classifyFile(".env"), "config");
    assert.equal(classifyFile("config.yml"), "config");
  });

  it("classifies source files as default", () => {
    assert.equal(classifyFile("src/auth/login.js"), "source");
    assert.equal(classifyFile("bin/gsd-t.js"), "source");
  });
});

// ─── Threshold Logic: FIRE conditions ───────────────────────────────────────

describe("threshold FIRE conditions", () => {
  it("fires when files span 3+ directories", () => {
    const result = evaluateThreshold([
      "src/a.js",
      "test/b.test.js",
      "commands/c.md",
    ]);
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.some((s) => s.includes("3 directories")));
  });

  it("fires when a contract file is modified", () => {
    const result = evaluateThreshold([
      ".gsd-t/contracts/api-contract.md",
    ]);
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.some((s) => s.includes("contract")));
  });

  it("fires when a template file is modified", () => {
    const result = evaluateThreshold([
      "templates/CLAUDE-global.md",
    ]);
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.some((s) => s.includes("template")));
  });

  it("fires when CLAUDE.md is modified", () => {
    const result = evaluateThreshold(["CLAUDE.md"]);
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.some((s) => s.includes("CLAUDE.md")));
  });

  it("fires when a command file is modified", () => {
    const result = evaluateThreshold([
      "commands/gsd-t-execute.md",
    ]);
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.some((s) => s.includes("command")));
  });

  it("fires with multiple signals simultaneously", () => {
    const result = evaluateThreshold([
      "CLAUDE.md",
      "templates/CLAUDE-global.md",
      ".gsd-t/contracts/doc-ripple-contract.md",
      "commands/gsd-t-doc-ripple.md",
    ]);
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.length >= 4);
  });

  it("fires on 3 dirs even with only source files", () => {
    const result = evaluateThreshold([
      "src/auth/login.js",
      "lib/utils/helper.js",
      "bin/gsd-t.js",
    ]);
    assert.equal(result.decision, "FIRE");
  });

  it("fires when diff contains API endpoint/route patterns", () => {
    const result = evaluateThreshold(
      ["src/routes/users.js"],
      '+ app.get("/api/users", handler);'
    );
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.some((s) => s.includes("API endpoint")));
  });

  it("fires when diff contains router.post pattern", () => {
    const result = evaluateThreshold(
      ["src/api/auth.js"],
      '+ router.post("/login", authController.login);'
    );
    assert.equal(result.decision, "FIRE");
  });

  it("fires when diff contains convention keywords in non-test files", () => {
    const result = evaluateThreshold(
      ["src/rules.js"],
      '+ // MUST validate input before processing'
    );
    assert.equal(result.decision, "FIRE");
    assert.ok(result.signals.some((s) => s.includes("convention keyword")));
  });

  it("fires on NEVER keyword in non-test files", () => {
    const result = evaluateThreshold(
      ["src/constraints.js"],
      '+ // NEVER modify files outside owned scope'
    );
    assert.equal(result.decision, "FIRE");
  });

  it("skips convention keywords if only in test files", () => {
    const result = evaluateThreshold(
      ["test/rules.test.js"],
      '+ assert.equal(rule, "MUST validate");'
    );
    // Only test files changed + convention keyword — but contract says non-test files only
    assert.equal(result.decision, "SKIP");
  });
});

// ─── Threshold Logic: SKIP conditions ───────────────────────────────────────

describe("threshold SKIP conditions", () => {
  it("skips when 1 dir and implementation-only", () => {
    const result = evaluateThreshold([
      "src/auth/login.js",
      "src/auth/logout.js",
    ]);
    assert.equal(result.decision, "SKIP");
    assert.equal(result.signals.length, 0);
  });

  it("skips when 2 dirs and implementation-only", () => {
    const result = evaluateThreshold([
      "src/auth/login.js",
      "test/auth.test.js",
    ]);
    assert.equal(result.decision, "SKIP");
  });

  it("skips for test-only changes", () => {
    const result = evaluateThreshold([
      "test/auth.test.js",
      "test/utils.test.js",
    ]);
    assert.equal(result.decision, "SKIP");
  });

  it("skips for single config file change", () => {
    const result = evaluateThreshold(["package.json"]);
    assert.equal(result.decision, "SKIP");
  });

  it("skips for single source file change", () => {
    const result = evaluateThreshold(["src/utils.js"]);
    assert.equal(result.decision, "SKIP");
  });
});

// ─── Content Signal Detection ───────────────────────────────────────────────

describe("detectContentSignals", () => {
  it("returns empty array when no diff content", () => {
    const result = detectContentSignals(null, ["src/a.js"]);
    assert.deepEqual(result, []);
  });

  it("detects Express app.get pattern", () => {
    const result = detectContentSignals('app.get("/users")', ["src/a.js"]);
    assert.ok(result.some((s) => s.includes("API endpoint")));
  });

  it("detects Express app.post pattern", () => {
    const result = detectContentSignals('app.post("/login")', ["src/a.js"]);
    assert.ok(result.some((s) => s.includes("API endpoint")));
  });

  it("detects router.delete pattern", () => {
    const result = detectContentSignals('router.delete("/item/:id")', ["src/a.js"]);
    assert.ok(result.some((s) => s.includes("API endpoint")));
  });

  it("detects MANDATORY keyword", () => {
    const result = detectContentSignals("This is MANDATORY", ["src/a.js"]);
    assert.ok(result.some((s) => s.includes("convention keyword")));
  });

  it("detects ALWAYS keyword", () => {
    const result = detectContentSignals("ALWAYS run tests", ["src/a.js"]);
    assert.ok(result.some((s) => s.includes("convention keyword")));
  });

  it("ignores convention keywords when only test files changed", () => {
    const result = detectContentSignals("MUST validate", ["test/a.test.js"]);
    assert.equal(result.length, 0);
  });

  it("detects both API and convention signals simultaneously", () => {
    const result = detectContentSignals(
      'app.post("/api/data"); // MUST validate input',
      ["src/api.js"]
    );
    assert.equal(result.length, 2);
  });
});

// ─── Blast Radius Analysis ──────────────────────────────────────────────────

describe("blast radius analysis", () => {
  it("always includes progress.md as UPDATED when files change", () => {
    const result = analyzeBlastRadius(["src/a.js"]);
    const progress = result.find((r) => r.document === ".gsd-t/progress.md");
    assert.ok(progress);
    assert.equal(progress.status, "UPDATED");
  });

  it("marks command reference docs UPDATED when command file changes", () => {
    const result = analyzeBlastRadius(["commands/gsd-t-execute.md"]);
    const readme = result.find((r) => r.document === "README.md");
    const gsdtReadme = result.find((r) => r.document === "GSD-T-README.md");
    const template = result.find((r) => r.document === "templates/CLAUDE-global.md");
    const help = result.find((r) => r.document === "commands/gsd-t-help.md");
    assert.equal(readme.status, "UPDATED");
    assert.equal(gsdtReadme.status, "UPDATED");
    assert.equal(template.status, "UPDATED");
    assert.equal(help.status, "UPDATED");
  });

  it("marks command reference docs SKIPPED when no command file changes", () => {
    const result = analyzeBlastRadius(["src/a.js"]);
    const gsdtReadme = result.find((r) => r.document === "GSD-T-README.md");
    assert.equal(gsdtReadme.status, "SKIPPED");
  });

  it("marks api-contract UPDATED when API route file changes", () => {
    const result = analyzeBlastRadius(["src/routes/api-endpoint.js"]);
    const api = result.find((r) => r.document === ".gsd-t/contracts/api-contract.md");
    assert.equal(api.status, "UPDATED");
  });

  it("marks api-contract SKIPPED when no API files change", () => {
    const result = analyzeBlastRadius(["src/utils.js"]);
    const api = result.find((r) => r.document === ".gsd-t/contracts/api-contract.md");
    assert.equal(api.status, "SKIPPED");
  });

  it("marks architecture.md UPDATED for component/module/service files", () => {
    const result = analyzeBlastRadius(["src/auth/auth-service.js"]);
    const arch = result.find((r) => r.document === "docs/architecture.md");
    assert.equal(arch.status, "UPDATED");
  });

  it("marks CLAUDE.md UPDATED when template or claude file changes", () => {
    const result = analyzeBlastRadius(["templates/CLAUDE-global.md"]);
    const claude = result.find((r) => r.document === "CLAUDE.md");
    assert.equal(claude.status, "UPDATED");
  });

  it("marks requirements.md UPDATED when source files change", () => {
    const result = analyzeBlastRadius(["src/feature.js"]);
    const req = result.find((r) => r.document === "docs/requirements.md");
    assert.equal(req.status, "UPDATED");
  });

  it("produces correct entry count", () => {
    const result = analyzeBlastRadius(["src/a.js"]);
    // progress + api-contract + requirements + architecture + 4 cmd refs + CLAUDE.md = 9
    assert.equal(result.length, 9);
  });
});

// ─── Manifest Format ────────────────────────────────────────────────────────

describe("manifest format", () => {
  it("contains required header with date", () => {
    const br = analyzeBlastRadius(["src/a.js"]);
    const md = formatManifest("execute", ["src/a.js"], br);
    assert.ok(md.includes("# Doc-Ripple Manifest — 2026-03-24"));
  });

  it("contains Trigger section with command name", () => {
    const br = analyzeBlastRadius(["CLAUDE.md"]);
    const md = formatManifest("integrate", ["CLAUDE.md"], br);
    assert.ok(md.includes("- Command: integrate"));
  });

  it("contains Blast Radius table with 4 columns", () => {
    const br = analyzeBlastRadius(["src/a.js"]);
    const md = formatManifest("execute", ["src/a.js"], br);
    assert.ok(md.includes("| Document | Status | Action | Reason |"));
    assert.ok(md.includes("|----------|--------|--------|--------|"));
  });

  it("contains Summary section with counts", () => {
    const br = analyzeBlastRadius(["commands/gsd-t-execute.md"]);
    const md = formatManifest("execute", ["commands/gsd-t-execute.md"], br);
    assert.ok(md.includes("Documents checked: 9"));
    assert.ok(md.includes("Documents updated:"));
    assert.ok(md.includes("Documents skipped"));
  });

  it("updated + skipped counts equal total checked", () => {
    const br = analyzeBlastRadius(["src/a.js", "commands/gsd-t-wave.md"]);
    const updated = br.filter((r) => r.status === "UPDATED").length;
    const skipped = br.filter((r) => r.status === "SKIPPED").length;
    assert.equal(updated + skipped, br.length);
  });

  it("threshold shows FIRE with signals in manifest", () => {
    const br = analyzeBlastRadius(["CLAUDE.md"]);
    const md = formatManifest("quick", ["CLAUDE.md"], br);
    assert.ok(md.includes("Threshold: FIRE"));
    assert.ok(md.includes("CLAUDE.md modified"));
  });

  it("threshold shows SKIP for trivial changes", () => {
    const br = analyzeBlastRadius(["src/a.js"]);
    const md = formatManifest("debug", ["src/a.js"], br);
    assert.ok(md.includes("Threshold: SKIP"));
  });

  it("each manifest entry has all 4 fields", () => {
    const br = analyzeBlastRadius(["src/a.js"]);
    for (const entry of br) {
      assert.ok(typeof entry.document === "string" && entry.document.length > 0);
      assert.ok(entry.status === "UPDATED" || entry.status === "SKIPPED");
      assert.ok(typeof entry.action === "string" && entry.action.length > 0);
      assert.ok(typeof entry.reason === "string" && entry.reason.length > 0);
    }
  });
});

// ─── Integration: threshold + blast radius combined ─────────────────────────

describe("threshold + blast radius integration", () => {
  it("cross-cutting change fires AND produces correct blast radius", () => {
    const files = [
      "commands/gsd-t-doc-ripple.md",
      "CLAUDE.md",
      ".gsd-t/contracts/doc-ripple-contract.md",
      "templates/CLAUDE-global.md",
      "test/doc-ripple.test.js",
    ];
    const threshold = evaluateThreshold(files);
    assert.equal(threshold.decision, "FIRE");
    assert.ok(threshold.dirCount >= 3);

    const br = analyzeBlastRadius(files);
    const updatedDocs = br.filter((r) => r.status === "UPDATED").map((r) => r.document);
    assert.ok(updatedDocs.includes(".gsd-t/progress.md"));
    assert.ok(updatedDocs.includes("README.md"));
    assert.ok(updatedDocs.includes("CLAUDE.md"));
  });

  it("trivial change skips AND still produces blast radius for informational purposes", () => {
    const files = ["src/utils/helper.js"];
    const threshold = evaluateThreshold(files);
    assert.equal(threshold.decision, "SKIP");

    // blast radius analysis still works (used for informational logging)
    const br = analyzeBlastRadius(files);
    assert.ok(br.length > 0);
    assert.ok(br.find((r) => r.document === ".gsd-t/progress.md").status === "UPDATED");
  });
});
