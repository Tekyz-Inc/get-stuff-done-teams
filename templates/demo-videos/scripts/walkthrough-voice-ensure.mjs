/**
 * Render a walkthrough's narration, and KEEP re-rendering until the voice
 * actually measures as one narrator.
 *
 * Why this exists: batching makes drift much less likely, but not impossible —
 * the same prompt rendered twice can come back at 7 Hz of pitch spread or 21.
 * A single render is therefore a roll of the dice, and "it sounded fine when I
 * checked" is not a property the next render inherits.
 *
 * So the check is the gate, not the report. Render, measure, and if the video
 * drifts past the threshold, throw that take away and render it again. Volume
 * is already forced by loudnorm; this is here for TONE.
 *
 *   node scripts/walkthrough-voice-ensure.mjs <name> [maxAttempts]
 *
 * Exits non-zero if it cannot get a clean take, rather than shipping a drifting
 * one — a bad narrator is worth a halt, not a shrug.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const NAME = process.argv[2];
const MAX = Number(process.argv[3] ?? 3);
if (!NAME) throw new Error('usage: walkthrough-voice-ensure.mjs <name> [maxAttempts]');

const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.tts-cache-v2');

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

/** Drop just this video's clips, so a retry re-renders instead of re-reading. */
function clearClips() {
  const man = path.join(ROOT, '.demo-build', `audio-${NAME}.json`);
  if (!existsSync(man)) return;
  for (const line of JSON.parse(readFileSync(man, 'utf8')).lines) {
    if (line.file?.startsWith(CACHE)) rmSync(line.file, { force: true });
  }
}

for (let attempt = 1; attempt <= MAX; attempt += 1) {
  console.log(`\n── ${NAME}: render attempt ${attempt} of ${MAX}`);
  try {
    run('node', [path.join('scripts', 'walkthrough-voice.mjs'), NAME]);
  } catch (err) {
    // A render that crashed is one failed attempt; the loop tries again and
    // the halt below fires when every attempt is spent.
    process.stdout.write(err.stdout ?? '');
    console.log(`  render failed on attempt ${attempt}`);
    if (attempt === MAX) {
      console.log(`\n✗ ${NAME}: could not render after ${MAX} attempts`);
      process.exit(4);
    }
    continue;
  }

  try {
    const out = run('node', [path.join('scripts', 'walkthrough-voice-check.mjs'), NAME]);
    process.stdout.write(out);
    console.log(`✓ ${NAME}: one narrator, one volume`);
    process.exit(0);
  } catch (err) {
    process.stdout.write(err.stdout ?? '');
    if (attempt === MAX) {
      console.log(`\n✗ ${NAME}: still drifting after ${MAX} attempts — NOT shipping this take`);
      process.exit(4);
    }
    console.log(`  drifted — discarding this take and re-rendering`);
    clearClips();
  }
}

// Unreachable: every path above either ships (exit 0) or halts (exit 4) on
// the last attempt. Kept so a future edit that drops one of those still halts.
process.exit(4);
