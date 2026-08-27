/**
 * Stage 3 — put the narration onto the recording.
 *
 * Both sides come from the same measured timeline: the recorder logged when
 * each sentence STARTED during the real run, so each audio file is placed at
 * its own recorded timestamp. Nothing is guessed and nothing needs aligning
 * afterward — if a page load ran long, the log already says so.
 *
 *   node scripts/walkthrough-mux.mjs flight-risk
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const NAME = process.argv[2];
if (!NAME) throw new Error('usage: walkthrough-mux.mjs <name>');

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
const FFPROBE = FF.replace(/ffmpeg$/, 'ffprobe');
const ff = (a) => execFileSync(FF, ['-y', '-loglevel', 'error', ...a], { encoding: 'utf8' });

const run = JSON.parse(readFileSync(path.join(ROOT, '.demo-build/walkthroughs', `${NAME}.json`), 'utf8'));
const audio = JSON.parse(readFileSync(path.join(ROOT, '.demo-build', `audio-${NAME}.json`), 'utf8'));
const byText = new Map(audio.lines.map((l) => [l.text, l]));

// Find the recording.
const tr = path.join(ROOT, 'test-results');
// Playwright wipes test-results/ each run, so keep a copy per walkthrough.
const KEEP = path.join(ROOT, '.demo-build', 'recordings');
mkdirSync(KEEP, { recursive: true });
const kept = path.join(KEEP, `${NAME}.webm`);

let video = null;
if (existsSync(tr)) {
  for (const d of readdirSync(tr, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    if (!d.name.startsWith(NAME)) continue;          // folder is named after the spec file
    for (const f of readdirSync(path.join(tr, d.name))) {
      if (f.endsWith('.webm')) video = path.join(tr, d.name, f);
    }
  }
}
/**
 * Playwright finishes WRITING the .webm after the test function returns, so a
 * copy taken the instant the run ends can be short — the tail of the
 * walkthrough is simply missing, and the narration for those steps then plays
 * over black. Wait until the file stops growing before trusting it.
 */
function settled(file, quietMs = 3000, timeoutMs = 120_000) {
  let last = -1;
  let lastChange = Date.now();
  for (;;) {
    const size = statSync(file).size;
    if (size !== last) { last = size; lastChange = Date.now(); }
    else if (Date.now() - lastChange >= quietMs) return size;
    if (Date.now() - lastChange >= timeoutMs) return size;
    execFileSync('/bin/sleep', ['0.5']);
  }
}

if (video) {
  const size = settled(video);
  console.log(`recording settled at ${(size / 1048576).toFixed(1)} MB`);
  copyFileSync(video, kept);
} else if (existsSync(kept)) {
  video = kept;                                      // re-mux without re-recording
}
if (!video) throw new Error(`no .webm recording found for ${NAME}`);

const WORK = path.join(ROOT, '.demo-build', 'mux', NAME);
mkdirSync(WORK, { recursive: true });
const OUT_DIR = path.join(ROOT, 'docs/demo-videos');
mkdirSync(OUT_DIR, { recursive: true });

const dur = Number(execFileSync(FFPROBE, ['-v','error','-show_entries','format=duration',
  '-of','default=noprint_wrappers=1:nokey=1', video], { encoding:'utf8' }).trim());
console.log(`recording : ${path.relative(ROOT, video)}  (${dur.toFixed(1)}s)`);
console.log(`steps     : ${run.steps.length}`);

// Burn captions from the step log, then lay each narration file at its start.
// Trim the unnarrated head. Playwright records from the moment the browser
// opens, so the demo password gate, the sign-in and the first navigation are
// all on tape before the narration begins. Start the video at the first
// spoken word instead, and shift every caption and audio cue to match.
const HEAD_MS = Math.max(0, run.steps[0].startMs - 600);
console.log(`trimming  : ${(HEAD_MS / 1000).toFixed(1)}s of setup before the first line`);

const inputs = [];
const delays = [];
let n = 0;

/**
 * Place each sentence at the moment it was spoken during the run — unless the
 * previous sentence has not finished by then, in which case start it after that
 * one ends.
 *
 * Why this is needed: the recording was timed against whatever narration
 * existed when it was filmed. Re-render the narration faster, or with a
 * different voice, and the clips no longer match the slots the recorder left
 * for them — a clip can still be talking when the next one is due, so the two
 * overlap and the first sentence gets stepped on. Honouring the recorded
 * timings is right; honouring them past the point where sentences collide is
 * not.
 *
 * The video is unchanged, so a pushed sentence drifts slightly late against the
 * pointer. That is far less noticeable than two voices at once, and it only
 * accumulates until the next page load, which always leaves slack.
 */
const GAP_MS = 150;   // a breath between sentences, not a hard join
let freeAt = 0;
let pushed = 0;

for (const s of run.steps) {
  const clip = byText.get(s.narration);
  if (!clip) continue;
  inputs.push('-i', clip.file);

  const wanted = Math.max(0, Math.round(s.startMs - HEAD_MS));
  const at = Math.max(wanted, freeAt);
  if (at > wanted) pushed += 1;
  freeAt = at + clip.ms + GAP_MS;

  delays.push(`[${n + 1}:a]adelay=${at}|${at}[a${n}]`);
  n += 1;
}

if (pushed) console.log(`overlaps  : ${pushed} sentence(s) started late to avoid talking over the previous one`);

// A walkthrough whose narration outlasts its recording plays the tail over a
// black screen — the viewer hears steps described that were never filmed. Say
// so loudly rather than shipping it quietly.
const videoEndsAt = (dur - HEAD_MS / 1000) * 1000;
const overrun = freeAt - 150 - videoEndsAt;
if (overrun > 1500) {
  console.log(
    `\n!! narration runs ${(overrun / 1000).toFixed(1)}s PAST the end of the recording.\n` +
    `   The video is ${(videoEndsAt / 1000).toFixed(1)}s but the last sentence ends at ` +
    `${((freeAt - 150) / 1000).toFixed(1)}s, so that much plays over black.\n` +
    `   Re-record this walkthrough — the capture was cut short.`,
  );
}

const outPath = path.join(OUT_DIR, `walkthrough-${NAME}.mp4`);
const mix = Array.from({ length: n }, (_, k) => `[a${k}]`).join('');

ff([
  '-ss', String(HEAD_MS / 1000),
  '-i', video,
  ...inputs,
  '-filter_complex',
  `${delays.join(';')};${mix}amix=inputs=${n}:normalize=0[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k',
  outPath,
]);

const outDur = Number(execFileSync(FFPROBE, ['-v','error','-show_entries','format=duration',
  '-of','default=noprint_wrappers=1:nokey=1', outPath], { encoding:'utf8' }).trim());
console.log(`\n✓ ${path.relative(ROOT, outPath)}  (${outDur.toFixed(1)}s, ${n} narrated steps)`);
