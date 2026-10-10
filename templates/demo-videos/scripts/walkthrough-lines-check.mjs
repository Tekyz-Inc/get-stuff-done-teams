/**
 * Check a spec uses every narration line exactly once, in order.
 *
 * A duplicated index plays the same sentence twice; a missing one silently
 * drops a sentence from the video; an out-of-order one desynchronises the rest.
 * All three are easy to introduce when editing a spec by hand and invisible
 * until you watch the finished video.
 *
 *   node scripts/walkthrough-lines-check.mjs [name ...]
 *
 * Exit 0 clean, 4 on any problem.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'e2e/walkthrough';
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter((f) => f.endsWith('.spec.ts') && f !== 'preflight.spec.ts')
      .map((f) => path.basename(f, '.spec.ts'));

let bad = 0;
for (const name of names) {
  const specFile = path.join(DIR, `${name}.spec.ts`);
  const linesFile = path.join(DIR, `${name}.lines.mjs`);
  if (!fs.existsSync(specFile) || !fs.existsSync(linesFile)) {
    // A name that resolves to nothing is a BROKEN INVOCATION, not a pass.
    // Reporting it and exiting 0 lets a whole verification run check nothing
    // and still print a tick.
    console.log(`  ??   ${name.padEnd(22)} spec or lines missing`);
    bad += 1;
    continue;
  }
  const { LINES } = await import(path.resolve(linesFile));
  const used = [...fs.readFileSync(specFile, 'utf8').matchAll(/L\[(\d+)\]/g)].map((m) => +m[1]);

  const dupes = [...new Set(used.filter((v, i) => used.indexOf(v) !== i))];
  const missing = LINES.map((_, i) => i).filter((i) => !used.includes(i));
  const outOfRange = used.filter((i) => i >= LINES.length);
  const ordered = JSON.stringify(used) === JSON.stringify([...used].sort((a, b) => a - b));

  const problems = [];
  if (dupes.length) problems.push(`duplicated ${JSON.stringify(dupes)}`);
  if (missing.length) problems.push(`never used ${JSON.stringify(missing)}`);
  if (outOfRange.length) problems.push(`out of range ${JSON.stringify(outOfRange)}`);
  if (!ordered) problems.push('out of order');

  bad += problems.length;
  console.log(`  ${problems.length ? 'BAD ' : 'ok  '} ${name.padEnd(22)} ${LINES.length} lines` +
    (problems.length ? `  — ${problems.join('; ')}` : ''));
}

if (bad) { console.log('\n✗ narration/spec mismatch'); process.exit(4); }
console.log('\n✓ every line used once, in order');
