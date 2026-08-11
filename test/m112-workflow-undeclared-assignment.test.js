'use strict';

/**
 * M112 — a workflow assigned to a variable that was never declared, and shipped.
 *
 * hilo-figma-atos, 2026-08-11. The Atos scan died after 4 agents with
 * `slices is not defined`, before a single finder ran:
 *
 *     618:  slices = budgetPlan.slices;   // never declared at this scope
 *
 * v5.11.26 added that assignment to a bare name. v5.11.27 then added a
 * `const slices` INSIDE a helper function — a different scope, which made the
 * top-level name look declared to a reader skimming the file. The workflow
 * sandbox runs in strict mode, where assigning to an undeclared name throws.
 *
 * Nothing caught it:
 *
 *   · `node --check` parses the file happily — an undeclared assignment is
 *     legal syntax, and only strict mode makes it an error, at RUNTIME.
 *   · The existing sandbox lint checks for banned requires and `args` handling,
 *     not scope.
 *   · No test executes this path; the workflow only runs against a real project.
 *
 * So the check is static and specific: every bare assignment in a workflow must
 * name something declared somewhere in that file. It is not full scope analysis
 * — it catches the case that shipped twice, which is a name declared nowhere at
 * all, or declared only inside a function body.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WF_DIR = path.join(__dirname, '..', 'templates', 'workflows');
const files = fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.workflow.js'));

// Names the sandbox provides, plus JS globals a workflow may legitimately touch.
const PROVIDED = new Set([
  'agent', 'parallel', 'pipeline', 'log', 'phase', 'budget', 'args', 'workflow',
  'meta', 'console', 'JSON', 'Math', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Set', 'Map', 'Promise', 'Error', 'setTimeout', 'clearTimeout',
  'globalThis', 'undefined', 'NaN', 'Infinity',
]);

/**
 * For each line: is it inside a FUNCTION body?
 *
 * Indentation is not the boundary. An `if` or `else` block is indented but is
 * still script-body scope, and a `let` declared there is visible to the code
 * after it — treating that as a nested scope produced a false alarm on
 * `statusResult`, which is declared inside an `else`. Only a function opens the
 * scope this check cares about.
 */
function functionBodyMap(lines) {
  const map = [];
  let depth = 0;      // brace depth INSIDE the innermost function, 0 = script body
  let pending = false; // a function keyword seen, its opening brace not yet counted
  for (const line of lines) {
    map.push(depth > 0);
    const opensFn = /\bfunction\b|=>\s*\{|\)\s*=>\s*$/.test(line);
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (depth > 0) {
      depth += opens - closes;
      if (depth < 0) depth = 0;
    } else if (opensFn || pending) {
      if (opens > 0) { depth += opens - closes; pending = false; }
      else pending = true;
      if (depth < 0) depth = 0;
    }
  }
  return map;
}

/**
 * Bare assignments (`name = ...`) whose name is declared nowhere in the file.
 *
 * Deliberately conservative: it only reports a name with NO declaration anywhere
 * in the source, which is precisely the shape that shipped. A name declared in a
 * sibling function still passes here — catching that needs real scope analysis,
 * and a check that cries wolf gets switched off.
 */
function undeclaredAssignments(src) {
  const declared = new Set();
  let m;

  const lines = src.split('\n');

  // Which lines sit inside a FUNCTION body. Indentation is not the boundary —
  // an `if` or `else` block is indented but still script-body scope, and a
  // `let` declared there is perfectly visible to the code below it. Only a
  // function creates the scope this check cares about.
  const inFn = functionBodyMap(lines);

  // Script-body declarations — the scope the workflow actually runs in. A
  // `const slices` inside a helper does NOT declare the `slices` the body
  // assigns to, and treating it as if it did is what let this ship.
  lines.forEach((line, i) => {
    if (inFn[i]) return;
    const d = line.match(/^\s*(?:export\s+)?(?:const|let|var|function|class)\s+(.+)$/);
    if (d) {
      // `let a, b;` declares BOTH. Taking only the first would report the second
      // as undeclared — a false alarm, and false alarms get checks deleted.
      for (const part of d[1].split(',')) {
        const id = (part.split('=')[0].match(/[A-Za-z_$][\w$]*/) || [])[0];
        if (id) declared.add(id);
      }
    }
    const b = line.match(/^\s*(?:const|let|var)\s*[[{]([^}\]]*)/);
    if (b) {
      for (const part of b[1].split(',')) {
        const id = part.split(':').pop().replace(/[^\w$]/g, '').trim();
        if (id) declared.add(id);
      }
    }
  });

  // Every name bound ANYWHERE — parameters, catch bindings, loop variables,
  // nested declarations. An assignment to one of these is ordinary code.
  //
  // This is what makes the check safe to run at any indent: it reports only a
  // name bound NOWHERE in the file, which cannot be anything but the bug.
  const bound = new Set(declared);
  for (const d of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) bound.add(d[1]);
  for (const c of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) bound.add(c[1]);
  for (const f of src.matchAll(/\bfor\s*\(\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s+(?:of|in)\b/g)) bound.add(f[1]);
  for (const p of src.matchAll(/(?:function\s*[\w$]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|([A-Za-z_$][\w$]*)\s*=>)/g)) {
    for (const part of (p[1] || p[2] || p[3] || '').split(',')) {
      const id = (part.split('=')[0].match(/[A-Za-z_$][\w$]*/) || [])[0];
      if (id) bound.add(id);
    }
  }
  for (const b of src.matchAll(/(?:const|let|var)\s*[[{]([^}\]]*)[}\]]/g)) {
    for (const part of b[1].split(',')) {
      const id = part.split(':').pop().replace(/[^\w$]/g, '').trim();
      if (id) bound.add(id);
    }
  }

  const bad = [];
  lines.forEach((line, i) => {
    // Checked at ANY indent. The line that killed the Atos scan was indented by
    // two spaces, inside an `if` block — a column-zero-only rule walked straight
    // past the one bug this exists to catch.
    const a = line.match(/^\s*([A-Za-z_$][\w$]*)\s*=(?!=|>)/);
    if (!a) return;
    const name = a[1];
    if (PROVIDED.has(name)) return;
    const known = inFn[i] ? bound : declared;
    if (known.has(name)) return;
    bad.push({ line: i + 1, name, text: line.trim().slice(0, 80) });
  });
  return bad;
}

test('M112: no workflow assigns to a variable it never declares', () => {
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(WF_DIR, f), 'utf8');
    for (const b of undeclaredAssignments(src)) {
      offenders.push(`${f}:${b.line} — \`${b.name}\` assigned but never declared: ${b.text}`);
    }
  }
  assert.deepEqual(offenders, [],
    'the sandbox runs in strict mode, so this throws at runtime and kills the workflow mid-run');
});

test('M112: the check catches the exact line that killed the Atos scan', () => {
  // A meta-test, built from the REAL failing code rather than a sketch of it.
  //
  // The first version of this test used a hand-written sample with the offending
  // line at column zero, and passed while the checker missed the actual bug —
  // the real line is indented two spaces, inside an `if` block. Testing against
  // an idea of the bug proves nothing about the bug.
  const broken = [
    'const rawSlices = probe.slices;',
    '',
    'function probePlaceholderFaults(result) {',
    '  const slices = (result && result.slices) || [];',  // the shadow that hid it
    '  return slices.length;',
    '}',
    '',
    'if (budgetPlan && budgetPlan.ok) {',
    '  slices = budgetPlan.slices;',                      // ← indented, and what threw
    '}',
  ].join('\n');
  const found = undeclaredAssignments(broken);
  assert.equal(found.length, 1, `expected exactly one offender, got ${JSON.stringify(found)}`);
  assert.equal(found[0].name, 'slices');
  assert.equal(found[0].line, 9, 'and it must point at the indented assignment');
});

test('M112: an ordinary reassignment is not reported', () => {
  // A checker that fires on legitimate code gets switched off, and then catches
  // nothing at all.
  const fine = [
    'let count = 0;',
    'count = count + 1;',
    'const obj = {};',
    'obj.field = 3;',
    'let a, b;',
    'a = 1;',
    'b = 2;',
    'for (const item of list) { total = total; }',
  ].join('\n');
  const found = undeclaredAssignments(fine).filter((f) => f.name !== 'total');
  assert.deepEqual(found, [], 'declared names and property assignments must pass');
});

test('M112: the scan declares slices at the scope that runs them', () => {
  const src = fs.readFileSync(path.join(WF_DIR, 'gsd-t-scan.workflow.js'), 'utf8');
  assert.match(src, /let slices = rawSlices;/,
    'it must start as the probe carve, so the budget-failed branch needs no assignment');
  assert.match(src, /slices-declared-at-the-scope-that-runs-them/,
    'the rule must be in the guard map');
});
