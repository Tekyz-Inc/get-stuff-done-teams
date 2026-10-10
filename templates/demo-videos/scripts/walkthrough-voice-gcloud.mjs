/**
 * The narrator — Google Cloud Text-to-Speech.
 *
 * WHY THIS REPLACED THE GEMINI VERSION
 * ------------------------------------
 * Gemini's `generateContent` emits audio from a LANGUAGE model: the "voice" is
 * a style hint the model re-interprets on every request, so the narrator
 * genuinely changed part-way through a video. Batching several sentences into
 * one request reduced how OFTEN it changed, but could never stop it — the
 * boundary between batches was still a boundary between two different readings.
 *
 * Cloud Text-to-Speech is a different kind of service: a voice name is a fixed,
 * trained speaker. The same voice id returns the same speaker on every call,
 * forever. So this stage renders ONE SENTENCE PER REQUEST — which is the simple
 * thing, and is now also the correct thing.
 *
 * What that removes, all at once: batch boundaries, splitting audio on silence,
 * clips miscut at the wrong pause, per-model daily quotas, and drift.
 *
 *   node scripts/walkthrough-voice-gcloud.mjs <script-name>
 *
 * Auth: Application Default Credentials (`gcloud auth application-default
 * login`). Cloud TTS is an OAuth API — it does NOT accept an API key — and it
 * needs a quota project, passed as the `x-goog-user-project` header.
 */
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const NAME = process.argv[2];
if (!NAME) throw new Error('usage: walkthrough-voice-gcloud.mjs <script-name>');

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.demo-build', 'audio', NAME);
const CACHE = path.join(ROOT, '.tts-cache-gcloud');
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

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

/** A fixed, trained speaker — not a style hint. This is the whole point. */
const VOICE = process.env.TTS_VOICE ?? 'en-US-Chirp3-HD-Algieba';
const LANG = process.env.TTS_LANG ?? 'en-US';
const RATE = Number(process.env.TTS_RATE ?? 1.1);
const PITCH = Number(process.env.TTS_PITCH ?? 0);
/** Same target as before, so these clips sit alongside the old ones. */
const LUFS = Number(process.env.VOICE_LUFS ?? -18);
const PROJECT = process.env.GOOGLE_TTS_PROJECT ?? 'gen-lang-client-0210917654';

const API = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/** ADC token. Short-lived, so fetch once per run rather than per request. */
function accessToken() {
  try {
    return execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    throw new Error(
      'no Application Default Credentials — run: gcloud auth application-default login',
    );
  }
}

const durationOf = (file) =>
  Number(
    execFileSync(FFPROBE, ['-v','error','-show_entries','format=duration',
      '-of','default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' }).trim(),
  );

/** Speak one sentence. Transient failures retry; a 4xx is a real problem. */
async function speak(text, token, label) {
  let res;
  let detail = '';
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-goog-user-project': PROJECT,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: LANG, name: VOICE },
          audioConfig: {
            audioEncoding: 'LINEAR16',
            sampleRateHertz: 24_000,
            speakingRate: RATE,
            pitch: PITCH,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      detail = String(err).slice(0, 160);
      if (attempt === 5) break;
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
      continue;
    }
    if (res.ok) break;
    detail = await res.text().catch(() => '');
    if (res.status < 500 && res.status !== 429) break;
    if (attempt === 5) break;
    await new Promise((r) => setTimeout(r, 2_000 * attempt));
  }
  if (!res || !res.ok) {
    throw new Error(`Cloud TTS ${res ? res.status : 'no response'} on ${label}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  if (!json.audioContent) throw new Error(`Cloud TTS returned no audio for ${label}`);
  return Buffer.from(json.audioContent, 'base64');
}

/**
 * Silence added to the end of every clip.
 *
 * Cloud TTS returns audio that stops on the last syllable with no tail at all,
 * so the following sentence begins immediately after it and the ear hears the
 * previous line as clipped even though every word is present. A short pad gives
 * each sentence somewhere to land.
 */
const TAIL_MS = Number(process.env.TTS_TAIL_MS ?? 400);

/** Force every clip to the same loudness, so volume is never the model's call. */
async function normalise(src, dest) {
  const measured = execFileSync('/bin/sh', ['-c',
    `${JSON.stringify(FF)} -i ${JSON.stringify(src)} -af ` +
    `loudnorm=I=${LUFS}:TP=-1.5:LRA=7:print_format=json -f null - 2>&1`,
  ], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = measured.slice(measured.lastIndexOf('{')).match(/\{[\s\S]*\}/);
  const s = m ? JSON.parse(m[0]) : null;
  const filter = s
    ? `loudnorm=I=${LUFS}:TP=-1.5:LRA=7:measured_I=${s.input_i}:` +
      `measured_TP=${s.input_tp}:measured_LRA=${s.input_lra}:` +
      `measured_thresh=${s.input_thresh}:offset=${s.target_offset}:linear=true`
    : `loudnorm=I=${LUFS}:TP=-1.5:LRA=7`;
  await execFileAsync(FF, ['-y','-loglevel','error','-i',src,
    '-af', `${filter},apad=pad_dur=${(TAIL_MS / 1000).toFixed(3)}`,
    '-ar','24000','-ac','1', dest]);
}

// ── Render ─────────────────────────────────────────────────────────────────
const { LINES } = await import(
  `file://${path.join(ROOT, 'e2e/walkthrough', NAME + '.lines.mjs')}`
);

const keyFor = (text) =>
  createHash('sha256')
    .update(JSON.stringify({ text, VOICE, LANG, RATE, PITCH, LUFS }))
    .digest('hex')
    .slice(0, 32);

const token = accessToken();
const manifest = [];
let rendered = 0;

for (const [i, line] of LINES.entries()) {
  const dest = path.join(CACHE, `${keyFor(line)}.wav`);
  if (!existsSync(dest)) {
    const raw = path.join(OUT, `gc-${String(i).padStart(2, '0')}-raw.wav`);
    writeFileSync(raw, await speak(line, token, `line ${i}`));
    await normalise(raw, dest);
    rendered += 1;
  }
  // The tail is baked into the clip now, so the measured length IS the step
  // length — no extra padding to double-count.
  const ms = Math.round(durationOf(dest) * 1000);
  manifest.push({ index: i, text: line, file: dest, ms });
  console.log(`${String(i).padStart(3)}  ${(ms / 1000).toFixed(1)}s  ${line.slice(0, 62)}`);
}

const total = manifest.reduce((a, m) => a + m.ms, 0);
writeFileSync(
  path.join(ROOT, '.demo-build', `audio-${NAME}.json`),
  JSON.stringify({ name: NAME, totalMs: total, lufs: LUFS, voice: VOICE, lines: manifest }, null, 2),
);
console.log(
  `\n${manifest.length} lines · ${(total / 1000 / 60).toFixed(1)} min · ` +
  `${rendered} newly rendered · voice ${VOICE} · ${LUFS} LUFS`,
);
