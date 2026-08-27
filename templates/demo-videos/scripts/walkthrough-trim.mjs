/**
 * Stage 4 — take the silence out.
 *
 * The recording pauses whenever a page is loading, and those pauses are dead
 * air in the finished video: 20-45 seconds per walkthrough, which makes a
 * 3-minute video feel much longer than it is. auto-editor cuts every stretch
 * where nobody is speaking, keeping a small margin either side so a sentence
 * never starts abruptly.
 *
 *   node scripts/walkthrough-trim.mjs <name>     one walkthrough
 *   node scripts/walkthrough-trim.mjs --all      every video in docs/demo-videos
 *
 * It rewrites the .mp4 in place, and is safe to re-run: a second pass finds
 * almost nothing left to cut. The untrimmed version can always be rebuilt by
 * re-running the mux, so nothing is lost.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs/demo-videos');

/** Bundled so this does not depend on what happens to be on PATH. */
const AE = path.join(ROOT, '.venv-tools/auto-editor/bin/auto-editor');
if (!existsSync(AE)) {
  throw new Error(
    `auto-editor not found at ${path.relative(ROOT, AE)}\n` +
    '  python3 -m venv .venv-tools/auto-editor && ' +
    '.venv-tools/auto-editor/bin/pip install auto-editor',
  );
}

const FFPROBE = existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe';
/** Silence either side of speech that is KEPT, so lines do not start clipped. */
const MARGIN = process.env.TRIM_MARGIN ?? '0.2s';

const arg = process.argv[2];
if (!arg) throw new Error('usage: walkthrough-trim.mjs <name>|--all');

const names =
  arg === '--all'
    ? readdirSync(OUT_DIR)
        .filter((f) => /^walkthrough-.*\.mp4$/.test(f))
        .map((f) => f.replace(/^walkthrough-|\.mp4$/g, ''))
        .sort()
    : [arg];

const durationOf = (f) =>
  Number(
    execFileSync(FFPROBE, ['-v','error','-show_entries','format=duration',
      '-of','default=noprint_wrappers=1:nokey=1', f], { encoding: 'utf8' }).trim(),
  );

let cutTotal = 0;
for (const name of names) {
  const file = path.join(OUT_DIR, `walkthrough-${name}.mp4`);
  if (!existsSync(file)) { console.log(`${name}: no video, skipped`); continue; }

  const before = durationOf(file);
  const tmp = path.join(OUT_DIR, `.${name}-trimmed.mp4`);

  execFileSync(AE, [file, '--margin', MARGIN, '-o', tmp, '--no-open'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  if (!existsSync(tmp) || statSync(tmp).size < 1000) {
    console.log(`${name}: auto-editor produced nothing, left untouched`);
    continue;
  }
  const after = durationOf(tmp);
  renameSync(tmp, file);

  const cut = before - after;
  cutTotal += cut;
  console.log(
    `${name.padEnd(14)} ${fmt(before)} -> ${fmt(after)}   cut ${cut.toFixed(0)}s of silence`,
  );
}

function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

if (names.length > 1) console.log(`\ntotal removed: ${(cutTotal / 60).toFixed(1)} min`);
