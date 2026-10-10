/**
 * Audit for the implied click: a step that HIGHLIGHTS something, immediately
 * followed by a step that NAVIGATES, reads on camera as "the narrator clicked
 * that thing and it took us here". It did not — the pointer is simply parked on
 * the previous sentence's target while the page changes underneath it.
 *
 * A navigation preceded by park() is FINE: the cursor was moved to neutral
 * space and the ring cleared, so nothing appears pressed. park() records itself
 * on the preceding step, which is what makes the two cases distinguishable
 * here rather than a judgement call.
 *
 *   node scripts/walkthrough-implied-clicks.mjs [name ...]
 *
 * Exit 0 clean, 4 if any unparked implied click is found.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = '.demo-build/walkthroughs';
const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json'));

let bad = 0;
for (const name of names) {
  const file = path.join(DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    // A name that resolves to nothing is a BROKEN INVOCATION, not a pass.
    // Reporting it and exiting 0 lets a whole verification run check nothing
    // and still print a tick.
    console.log(`  ??   ${name.padEnd(22)} no step log`);
    bad += 1;
    continue;
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const steps = parsed.steps ?? parsed;

  const found = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i];
    const b = steps[i + 1];
    if (a.action === 'highlight' && b.action === 'goto' && !a.parked) {
      found.push(`step ${a.index} "${a.focus}" → ${b.route}`);
    }
  }

  bad += found.length;
  console.log(`  ${found.length ? 'BAD ' : 'ok  '} ${name.padEnd(22)} implied-clicks=${found.length}`);
  found.forEach((f) => console.log(`         ${f}`));
}

if (bad) {
  console.log(`\n✗ ${bad} implied click(s). Either click the real navigation, or call park(page) before the goTo.`);
  process.exit(4);
}
console.log('\n✓ no implied clicks');
