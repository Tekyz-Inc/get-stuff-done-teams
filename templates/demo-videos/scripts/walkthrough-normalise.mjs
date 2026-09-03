/**
 * Force every already-rendered narration clip to one loudness.
 *
 * This exists because volume drift and tone drift have different cures. Tone
 * needs re-rendering (several sentences in one request, so one delivery covers
 * them) — that costs API calls. Volume does not: the clips already on disk can
 * be measured and corrected with ffmpeg alone, which is exact and free.
 *
 * So when a re-render is not available, this still removes the loudness half of
 * the problem from videos that already exist. Run the mux afterwards; the
 * recording does not need redoing.
 *
 *   node scripts/walkthrough-normalise.mjs <name>        one walkthrough
 *   node scripts/walkthrough-normalise.mjs --all         every manifest
 *
 * It rewrites the clips a manifest points at, in place, and is safe to re-run:
 * a clip already at the target measures as such and comes back unchanged.
 */
import { execFile, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
/**
 * Prefer ffmpeg-full (it carries libass, needed for subtitle burn-in) but only
 * if it actually runs — a Homebrew upgrade can leave it on disk with a missing
 * shared library, where it aborts on launch and every render fails at once.
 */
const FF = (() => {
  const full = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';
  if (existsSync(full)) {
    try {
      execFileSync(full, ['-version'], { stdio: 'ignore' });
      return full;
    } catch (err) {
      // Installed but broken (a Homebrew upgrade left a shared library missing).
      // Rendering with a different binary would change the output silently —
      // ffmpeg-full carries filters the plain build lacks. Halt with the fix.
      throw new Error(
        `ffmpeg-full is installed at ${full} but does not run (${String(err).slice(0, 120)}). ` +
        'Fix: brew reinstall ffmpeg-full',
      );
    }
  }
  return 'ffmpeg';
})();
const FFPROBE = FF.replace(/ffmpeg$/, 'ffprobe');
const LUFS = Number(process.env.VOICE_LUFS ?? -18);

const arg = process.argv[2];
if (!arg) throw new Error('usage: walkthrough-normalise.mjs <name>|--all');

const names =
  arg === '--all'
    ? readdirSync(path.join(ROOT, '.demo-build'))
        .filter((f) => /^audio-.*\.json$/.test(f))
        .map((f) => f.replace(/^audio-|\.json$/g, ''))
    : [arg];

const durationOf = (f) =>
  Number(
    execFileSync(FFPROBE, ['-v','error','-show_entries','format=duration',
      '-of','default=noprint_wrappers=1:nokey=1', f], { encoding: 'utf8' }).trim(),
  );

/** Integrated loudness of a file, in LUFS. */
function loudnessOf(file) {
  const out = execFileSync('/bin/sh', ['-c',
    `${JSON.stringify(FF)} -i ${JSON.stringify(file)} -af ebur128=framelog=quiet -f null - 2>&1`,
  ], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = out.match(/I:\s*(-?[\d.]+)\s*LUFS/g);
  if (!m) return null;
  return Number(m[m.length - 1].match(/(-?[\d.]+)/)[1]);
}

/** Two-pass loudnorm, so the clip lands ON the target rather than near it. */
async function normalise(file) {
  const measured = execFileSync('/bin/sh', ['-c',
    `${JSON.stringify(FF)} -i ${JSON.stringify(file)} -af ` +
    `loudnorm=I=${LUFS}:TP=-1.5:LRA=7:print_format=json -f null - 2>&1`,
  ], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = measured.slice(measured.lastIndexOf('{')).match(/\{[\s\S]*\}/);
  const s = m ? JSON.parse(m[0]) : null;

  const filter = s
    ? `loudnorm=I=${LUFS}:TP=-1.5:LRA=7:measured_I=${s.input_i}:` +
      `measured_TP=${s.input_tp}:measured_LRA=${s.input_lra}:` +
      `measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true`
    : `loudnorm=I=${LUFS}:TP=-1.5:LRA=7`;

  const tmp = file.replace(/\.wav$/, '.norm.wav');
  await execFileAsync(FF, ['-y','-loglevel','error','-i',file,
    '-af', filter, '-ar','24000','-ac','1', tmp]);
  copyFileSync(tmp, file);
  return tmp;
}

for (const name of names) {
  const manPath = path.join(ROOT, '.demo-build', `audio-${name}.json`);
  if (!existsSync(manPath)) { console.log(`${name}: no manifest, skipped`); continue; }
  const man = JSON.parse(readFileSync(manPath, 'utf8'));

  const before = [];
  const after = [];
  for (const line of man.lines) {
    if (!existsSync(line.file)) { console.log(`  missing clip: ${line.file}`); continue; }
    const b = loudnessOf(line.file);
    await normalise(line.file);
    const a = loudnessOf(line.file);
    if (b !== null) before.push(b);
    if (a !== null) after.push(a);
    // Loudness correction can shift length very slightly; keep the clock honest.
    line.ms = Math.round(durationOf(line.file) * 1000) + 350;
  }

  const spread = (xs) => (xs.length ? (Math.max(...xs) - Math.min(...xs)) : 0);
  man.lufs = LUFS;
  man.totalMs = man.lines.reduce((t, l) => t + l.ms, 0);
  writeFileSync(manPath, JSON.stringify(man, null, 2));

  console.log(
    `${name.padEnd(14)} ${man.lines.length} clips  ` +
    `spread ${spread(before).toFixed(1)} dB → ${spread(after).toFixed(1)} dB  ` +
    `(now ${LUFS} LUFS)`,
  );
}
