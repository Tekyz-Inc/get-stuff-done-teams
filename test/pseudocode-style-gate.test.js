/**
 * Contract §1.1 flow-line style gate — discrimination tests.
 *
 * A style gate that only ever passes is worthless, so these tests are written as
 * a DISCRIMINATION bar (the §2/§3 non-vacuity pattern): the gate must PASS the
 * converted reference doc AND FAIL each banned form individually. A gate that
 * cannot fail is itself a failure.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  run,
  gateDoc,
  checkLine,
  splitRegions,
  looksLikeParagraph,
} = require("../bin/gsd-t-pseudocode-style.cjs");

const REPO = path.join(__dirname, "..");
const PSEUDOCODE_DIR = path.join(REPO, ".gsd-t", "pseudocode");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gsdt-style-"));
}

function writeDoc(dir, name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, "utf8");
  return p;
}

/** A minimal doc conforming to §1.1 — used as the passing baseline. */
const CLEAN = `# Clean Doc

One sentence of purpose.

\`\`\`text
Settings screen
  Enter a value in the Profile URL field — click Save
  Is the URL the right shape:
    Yes: Open the page it points at
      Is that page a real profile page:
        Yes: Save it, show the green check
        No:  Show "that page isn't a profile"
    No:  Show "that doesn't look like a profile URL"
\`\`\`

---

## The rules

\`\`\`text
A bad URL never saves          [RULE] bad-url-never-saves
\`\`\`
`;

test("clean §1.1 doc passes", () => {
  const d = tmpDir();
  const p = writeDoc(d, "PseudoCode-Clean.md", CLEAN);
  const r = gateDoc(p, new Set());
  assert.strictEqual(r.exitCode, 0, JSON.stringify(r.violations, null, 2));
  assert.strictEqual(r.ok, true);
});

test("the converted reference doc passes the gate", () => {
  // PseudoCode-BrokenGraphHalts.md is the worked reference shipped with v1.2.0.
  const p = path.join(PSEUDOCODE_DIR, "PseudoCode-BrokenGraphHalts.md");
  const r = gateDoc(p, new Set());
  assert.strictEqual(r.exitCode, 0, JSON.stringify(r.violations, null, 2));
});

test("DISCRIMINATION: each banned form is caught individually", () => {
  const cases = [
    ["loadStore(storePath):", "no-function-call-syntax"],
    ["if not storePath: return nothing", "no-code-keyword:return"],
    ["catch the parse error", "no-code-keyword:catch"],
    ["in ONE tx: write the row", "no-code-keyword:tx"],
    ["GATE: duplicate → 409", "no-bare-status-code"],
    ["the reader printed MODULE_NOT_FOUND", "no-bare-error-constant"],
    ["A webhook arrives", "gloss-on-first-use:webhook"],
    ["Read the payload", "gloss-on-first-use:payload"],
  ];
  for (const [line, expectedRule] of cases) {
    const broken = checkLine(line, new Set());
    assert.ok(
      broken.some((b) => b === expectedRule),
      `line ${JSON.stringify(line)} should break ${expectedRule}, got ${JSON.stringify(broken)}`,
    );
  }
});

test("a glossed term passes, and stays passing later in the same section", () => {
  const glossed = new Set();
  const first = checkLine("Zoom's webhook (its automatic ping to us) arrives at /zoom/events", glossed);
  assert.deepStrictEqual(first, [], `glossed first use should pass, got ${JSON.stringify(first)}`);
  assert.ok(glossed.has("webhook"), "gloss should be recorded for the section");

  const second = checkLine("The webhook tells us the meeting ended", glossed);
  assert.deepStrictEqual(second, [], "bare use AFTER a gloss in the same section passes");
});

test("gloss scope resets per section — a new section must re-gloss", () => {
  const d = tmpDir();
  const p = writeDoc(d, "PseudoCode-Scope.md", `# Scope

Purpose.

\`\`\`text
Zoom's webhook (its automatic ping) arrives
\`\`\`

---

## What changes

\`\`\`text
The webhook arrives
\`\`\`
`);
  const r = gateDoc(p, new Set());
  assert.strictEqual(r.exitCode, 4, "un-glossed term in a NEW section must fail");
  assert.ok(
    r.violations.some((v) => v.rule === "gloss-on-first-use:webhook" && v.section === "What changes"),
    JSON.stringify(r.violations, null, 2),
  );
});

test("concrete real names need no gloss", () => {
  for (const line of [
    "Save it in the invoices table",
    "Zoom tells our system the meeting ended",
    "Click the Save button",
    "Post it to /zoom/events",
  ]) {
    assert.deepStrictEqual(checkLine(line, new Set()), [], `"${line}" should pass unglossed`);
  }
});

test("the §2 guard map below the divider is EXEMPT from style checks", () => {
  // The guard map legitimately carries call-shaped invariant text and error
  // constants. If §1.1 checked it, the two grammars would fight.
  const d = tmpDir();
  const p = writeDoc(d, "PseudoCode-Exempt.md", `# Exempt

Purpose.

\`\`\`text
Settings screen
  Is the value present:
    Yes: Save it
    No:  Refuse it
\`\`\`

---

## The rules

\`\`\`text
loadStore(path) never returns null   [RULE] reader-never-returns-null
a crash maps to MODULE_NOT_FOUND     [RULE] crash-classified
if duplicate → 409                   [RULE] duplicate-refused
\`\`\`

## Where it lives

| Step | File |
|------|------|
| Save it | \`bin/save.cjs\` |
`);
  const r = gateDoc(p, new Set());
  assert.strictEqual(r.exitCode, 0, `below-divider content must be exempt, got ${JSON.stringify(r.violations, null, 2)}`);
});

test("a paragraph inside the flow block fails", () => {
  assert.ok(
    looksLikeParagraph(
      "This line is a long prose paragraph explaining the rationale at length. It continues into a second sentence, which is the preamble the user asked to remove.",
    ),
  );
  // Question lines and outcome lines are never paragraphs, however long.
  assert.strictEqual(
    looksLikeParagraph("  Is the profile URL the right shape for a public LinkedIn profile page that we can actually open and read:"),
    false,
  );
  assert.strictEqual(
    looksLikeParagraph("    Yes: Open the page it points at and check whether it is a real profile page. Then save it."),
    false,
  );
});

test("NON-VACUITY: a doc with no flow block cannot pass by having nothing to check", () => {
  const d = tmpDir();
  const p = writeDoc(d, "PseudoCode-Empty.md", `# Empty

All prose, no flow.

---

## The rules
\`\`\`text
x   [RULE] y
\`\`\`
`);
  const r = gateDoc(p, new Set());
  assert.strictEqual(r.exitCode, 4);
  assert.ok(r.violations.some((v) => v.rule === "no-flow-block"), JSON.stringify(r.violations));
});

test("grandfathered docs skip WITH A REASON, never silently", () => {
  const d = tmpDir();
  const p = writeDoc(d, "PseudoCode-Old.md", "# Old\n\nprose only, no flow\n");
  fs.writeFileSync(path.join(d, ".style-grandfathered"), "PseudoCode-Old.md\n", "utf8");

  const r = run({ dir: d });
  assert.strictEqual(r.exitCode, 0, "a grandfathered doc does not fail the gate");
  assert.strictEqual(r.skips.length, 1, "the skip must be SURFACED");
  assert.strictEqual(r.skips[0].reason, "grandfathered");
});

test("a doc NOT on the grandfather list is gated", () => {
  const d = tmpDir();
  writeDoc(d, "PseudoCode-Old.md", "# Old\n\nprose only\n");
  writeDoc(d, "PseudoCode-New.md", "# New\n\nprose only, no flow\n");
  fs.writeFileSync(path.join(d, ".style-grandfathered"), "PseudoCode-Old.md\n", "utf8");

  const r = run({ dir: d });
  assert.strictEqual(r.exitCode, 4, "the un-listed doc must FAIL");
  assert.ok(r.violations.some((v) => v.doc.endsWith("PseudoCode-New.md")));
  assert.ok(!r.violations.some((v) => v.doc.endsWith("PseudoCode-Old.md")));
});

test("the real corpus is clean (converted reference passes, rest grandfathered)", () => {
  const r = run({ dir: PSEUDOCODE_DIR });
  assert.strictEqual(r.exitCode, 0, JSON.stringify(r.violations, null, 2));
  // Non-vacuity: the reference doc must be checked, not skipped.
  const ref = r.results.find((x) => x.doc.endsWith("PseudoCode-BrokenGraphHalts.md"));
  assert.ok(ref, "the reference doc must be discovered");
  assert.strictEqual(ref.skipped, false, "the reference doc must be GATED, not grandfathered");
});

test("empty dir surfaces a reason, bad input exits 64", () => {
  const d = tmpDir();
  const empty = run({ dir: d });
  assert.strictEqual(empty.exitCode, 0);
  assert.strictEqual(empty.skips[0].reason, "no-pseudocode-docs");

  assert.strictEqual(run({}).exitCode, 64, "no --doc and no --dir is bad input");
  assert.strictEqual(run({ doc: "/nope/PseudoCode-Missing.md" }).exitCode, 64);
  assert.strictEqual(run({ dir: "/nope/nowhere" }).exitCode, 64);
});

test("the shipped mold is not gated as a doc", () => {
  // templates/PseudoCode-spec.md is the blank mold — full of {placeholders}.
  const r = run({ dir: path.join(REPO, "templates") });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(r.skips[0] && r.skips[0].reason, "no-pseudocode-docs", JSON.stringify(r));
});

test("FIRST-RUN SEED: a project whose docs predate the gate is not retroactively failed", () => {
  // Found live during propagation: the gate shipped to 33 projects, and binvoice
  // (19 docs), NiceNote (6) and IssueRecorder (2) had no grandfather list — so an
  // unrelated verify run would have failed on work nobody touched.
  const d = tmpDir();
  writeDoc(d, "PseudoCode-Legacy1.md", "# Legacy\n\nprose only, no flow\n");
  writeDoc(d, "PseudoCode-Legacy2.md", "# Legacy2\n\nloadStore(path): return null\n");

  const r = run({ dir: d });
  assert.strictEqual(r.exitCode, 0, "pre-existing docs must NOT be retroactively failed");
  assert.ok(r.seeded, "the seed must be SURFACED in the envelope, never silent");
  assert.strictEqual(r.seeded.reason, "seeded-pre-existing");
  assert.strictEqual(r.seeded.count, 2);
  assert.deepStrictEqual(r.seeded.docs, ["PseudoCode-Legacy1.md", "PseudoCode-Legacy2.md"]);
  assert.ok(fs.existsSync(path.join(d, ".style-grandfathered")), "the list must be written to disk");
});

test("the seed NEVER re-runs — a doc added after it is gated normally", () => {
  // A list that re-seeded itself would silently absolve every newly-drifted doc,
  // which is exactly the banned behavior the gate exists to prevent.
  const d = tmpDir();
  writeDoc(d, "PseudoCode-Legacy.md", "# Legacy\n\nprose only\n");

  const first = run({ dir: d });
  assert.strictEqual(first.exitCode, 0);
  assert.ok(first.seeded, "first run seeds");

  // A NEW non-conforming doc arrives after the starting line was established.
  writeDoc(d, "PseudoCode-New.md", "# New\n\nprose only, no flow\n");
  const second = run({ dir: d });
  assert.strictEqual(second.exitCode, 4, "a doc added AFTER the seed must FAIL");
  assert.ok(!second.seeded, "the seed must not run a second time");
  assert.ok(second.violations.some((v) => v.doc.endsWith("PseudoCode-New.md")));
  assert.ok(
    !second.violations.some((v) => v.doc.endsWith("PseudoCode-Legacy.md")),
    "the grandfathered doc stays grandfathered",
  );
});

test("a single --doc call never seeds a list", () => {
  const d = tmpDir();
  const p = writeDoc(d, "PseudoCode-Solo.md", "# Solo\n\nprose only, no flow\n");
  const r = run({ doc: p });
  assert.strictEqual(r.exitCode, 4, "an explicit single-doc check gates without grandfathering");
  assert.ok(!fs.existsSync(path.join(d, ".style-grandfathered")), "--doc must not write a list");
});

test("an un-writable dir surfaces exit 64 rather than mass-failing or mass-passing", () => {
  const d = tmpDir();
  writeDoc(d, "PseudoCode-Legacy.md", "# Legacy\n\nprose only\n");
  fs.chmodSync(d, 0o500); // read + execute, no write
  try {
    const r = run({ dir: d });
    assert.strictEqual(r.exitCode, 64, "cannot seed → surface it, never silently pass/fail the set");
    assert.match(r.reason, /cannot seed/);
  } finally {
    fs.chmodSync(d, 0o700);
  }
});

test("splitRegions ignores a --- that sits inside a fence", () => {
  const { flowRegion } = splitRegions(`# T

p

\`\`\`text
Line one
---
Line two
\`\`\`

---

## Below
`);
  assert.ok(flowRegion.includes("Line two"), "a fenced --- must not end the flow region");
  assert.ok(!flowRegion.includes("## Below"));
});
