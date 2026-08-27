/**
 * Prove the narrator is one voice, at one volume, across a whole video.
 *
 * "Sounds consistent" is not checkable, so this turns it into three numbers per
 * clip and reports the SPREAD across the video:
 *
 *   loudness  how loud it is           (EBU R128 integrated, LUFS)
 *   pitch     how high the voice sits  (median fundamental frequency, Hz)
 *   rate      how fast it is spoken    (syllable-ish peaks per second)
 *
 * Volume is forced by loudnorm, so its spread should be near zero. Pitch and
 * rate are NOT forced — they come from the model, and they are the measurable
 * part of "tone". A batch rendered in ONE request should hold them close; a
 * video whose pitch spread is wide is one where the narrator audibly changes,
 * which is the defect this whole rewrite exists to remove.
 *
 *   node scripts/walkthrough-voice-check.mjs <name>     one video
 *   node scripts/walkthrough-voice-check.mjs --all      every video
 *
 * Exit code 4 if any video exceeds the thresholds, so it can gate a release.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

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
    } catch {
      /* installed but broken — fall through to the plain build */
    }
  }
  return 'ffmpeg';
})();

// What counts as "one voice". Loudness is machine-enforced so it is strict;
// pitch and rate are human-variable even for a real person reading a script,
// so these allow natural variation while still catching a changed narrator.
const MAX_LUFS_SPREAD = 1.5;   // dB
const MAX_PITCH_SPREAD = 35;   // Hz between the lowest and highest-pitched line
const MAX_RATE_SPREAD = 5.0;   // energy peaks per second

// A clip should last about as long as its sentence takes to say. When it does
// not, the batch was cut in the wrong place and this clip holds a fragment of
// its neighbour or is missing its own ending — which is worse than tone drift,
// because it puts the wrong words against the wrong screen.
const WORDS_PER_SEC = 2.8;
const MIN_LEN_RATIO = 0.6;
const MAX_LEN_RATIO = 1.7;

const arg = process.argv[2];
if (!arg) throw new Error('usage: walkthrough-voice-check.mjs <name>|--all');

const names =
  arg === '--all'
    ? readdirSync(path.join(ROOT, '.demo-build'))
        .filter((f) => /^audio-.*\.json$/.test(f))
        .map((f) => f.replace(/^audio-|\.json$/g, ''))
        .sort()
    : [arg];

/** Integrated loudness, LUFS. */
function loudness(file) {
  const out = execFileSync('/bin/sh', ['-c',
    `${JSON.stringify(FF)} -i ${JSON.stringify(file)} -af ebur128=framelog=quiet -f null - 2>&1`,
  ], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const all = out.match(/I:\s*(-?[\d.]+)\s*LUFS/g);
  return all ? Number(all[all.length - 1].match(/(-?[\d.]+)/)[1]) : null;
}

/** Raw mono 16-bit samples, so pitch and rate can be computed directly. */
function samples(file, rate = 16_000) {
  const buf = execFileSync(FF, ['-v','error','-i',file,'-ac','1','-ar',String(rate),
    '-f','s16le','-'], { maxBuffer: 1 << 28 });
  const n = Math.floor(buf.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = buf.readInt16LE(i * 2) / 32768;
  return { data: out, rate };
}

/**
 * Median fundamental frequency over voiced frames, by autocorrelation.
 * Median rather than mean so one creaky frame cannot drag the answer.
 */
function pitchHz({ data, rate }) {
  const frame = Math.round(rate * 0.04);      // 40 ms
  const hop = Math.round(rate * 0.02);
  const minLag = Math.floor(rate / 300);      // 300 Hz ceiling
  const maxLag = Math.floor(rate / 70);       // 70 Hz floor
  const found = [];

  for (let start = 0; start + frame < data.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < frame; i += 1) energy += data[start + i] ** 2;
    if (energy / frame < 1e-4) continue;      // silence / breath

    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let sum = 0;
      for (let i = 0; i + lag < frame; i += 1) sum += data[start + i] * data[start + i + lag];
      if (sum > best) { best = sum; bestLag = lag; }
    }
    // Only trust clearly periodic frames — unvoiced sounds have no real pitch.
    if (bestLag && best / energy > 0.35) found.push(rate / bestLag);
  }
  if (!found.length) return null;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
}

/** Speaking rate: energy peaks per second, a decent proxy for syllables. */
function rateHz({ data, rate }) {
  const win = Math.round(rate * 0.02);
  const env = [];
  for (let s = 0; s + win < data.length; s += win) {
    let e = 0;
    for (let i = 0; i < win; i += 1) e += data[s + i] ** 2;
    env.push(Math.sqrt(e / win));
  }
  if (env.length < 3) return null;
  const peak = Math.max(...env);
  const floor = peak * 0.15;
  let count = 0;
  for (let i = 1; i < env.length - 1; i += 1) {
    if (env[i] > floor && env[i] >= env[i - 1] && env[i] > env[i + 1]) count += 1;
  }
  const seconds = data.length / rate;
  return seconds ? count / seconds : null;
}

const spread = (xs) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);
let failed = false;

for (const name of names) {
  const manPath = path.join(ROOT, '.demo-build', `audio-${name}.json`);
  if (!existsSync(manPath)) { console.log(`${name}: no manifest`); continue; }
  const man = JSON.parse(readFileSync(manPath, 'utf8'));

  const L = [], P = [], R = [];
  const miscut = [];
  for (const [i, line] of man.lines.entries()) {
    if (!existsSync(line.file)) continue;
    const l = loudness(line.file);
    const s = samples(line.file);
    const p = pitchHz(s);
    const r = rateHz(s);
    if (l !== null) L.push(l);
    if (p !== null) P.push(p);
    if (r !== null) R.push(r);

    const words = line.text.trim().split(/\s+/).length;
    const seconds = s.data.length / s.rate;
    const ratio = seconds / (words / WORDS_PER_SEC);
    if (ratio < MIN_LEN_RATIO || ratio > MAX_LEN_RATIO) {
      miscut.push({ i, ratio, text: line.text.slice(0, 46) });
    }
  }

  const ls = spread(L), ps = spread(P), rs = spread(R);
  const bad =
    ls > MAX_LUFS_SPREAD || ps > MAX_PITCH_SPREAD || rs > MAX_RATE_SPREAD ||
    miscut.length > 0;
  if (bad) failed = true;

  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log(
    `${bad ? 'DRIFT' : '  ok '} ${name.padEnd(14)} ` +
    `${String(man.lines.length).padStart(2)} clips  ` +
    `vol ${mean(L).toFixed(1)} LUFS ±${ls.toFixed(1)}  ` +
    `pitch ${mean(P).toFixed(0)} Hz ±${ps.toFixed(0)}  ` +
    `rate ${mean(R).toFixed(1)}/s ±${rs.toFixed(1)}` +
    (miscut.length ? `  ${miscut.length} MISCUT` : ''),
  );
  for (const m of miscut) {
    console.log(
      `        line ${String(m.i).padStart(2)} is ${(m.ratio * 100).toFixed(0)}% of ` +
      `its expected length — "${m.text}"`,
    );
  }
}

if (failed) {
  console.log(
    `\nThresholds: volume ±${MAX_LUFS_SPREAD} dB, pitch ±${MAX_PITCH_SPREAD} Hz, rate ±${MAX_RATE_SPREAD}/s`,
  );
  process.exit(4);
}
