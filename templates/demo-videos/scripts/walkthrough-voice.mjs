/**
 * The narrator. One voice, one delivery, one loudness — for a whole video.
 *
 * WHY THIS REPLACED THE PER-LINE CALL
 * -----------------------------------
 * The old stage sent every sentence to Gemini as its own request. Gemini
 * re-decides delivery on each request, so tone and volume drifted from one
 * sentence to the next inside a single video. Describing the speaker in the
 * prompt did not fix it — the model was simply being asked to act, fresh,
 * dozens of times.
 *
 * Two changes, both deterministic:
 *
 *   1. BATCH. Several sentences go in ONE request, numbered, with an explicit
 *      instruction to leave two seconds of silence between them. One request
 *      means one performance, so the delivery carries across the whole batch.
 *      The returned audio is then cut back apart on those silences, giving one
 *      file per sentence exactly as the rest of the pipeline expects.
 *
 *   2. NORMALISE. Every finished clip is run through ffmpeg `loudnorm` to the
 *      same target loudness (EBU R128, -18 LUFS). Volume stops being something
 *      the model decides and becomes something the pipeline enforces.
 *
 * The split is VERIFIED, never assumed: if a batch does not come back with the
 * expected number of gaps, that batch is retried, and if it still disagrees the
 * lines in it are rendered one at a time. A batch is never split "close enough"
 * — a wrong split puts half a sentence on the wrong step, which is worse than
 * the drift it was meant to cure.
 *
 *   node scripts/walkthrough-voice.mjs <script-name>
 */
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const NAME = process.argv[2];
if (!NAME) throw new Error('usage: walkthrough-voice.mjs <script-name>');

const ROOT = process.cwd();
const OUT = path.join(ROOT, '.demo-build', 'audio', NAME);
const CACHE = path.join(ROOT, '.tts-cache-v2');
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
    } catch {
      /* installed but broken — fall through to the plain build */
    }
  }
  return 'ffmpeg';
})();
const FFPROBE = FF.replace(/ffmpeg$/, 'ffprobe');

// ── Voice constants ────────────────────────────────────────────────────────
// Every one of these is part of the cache key: change any of them and the
// whole video is re-rendered rather than mixing two deliveries together.
// Quotas are counted PER MODEL PER DAY (100 on the paid tier), so the model
// choice is also the quota choice — and running out of one says nothing about
// the others. These are tried in order and the first with headroom is used;
// a spent model is skipped for the rest of the run rather than retried into
// its 22-hour reset. Loudness is forced downstream by loudnorm and the persona
// is identical, so a swap changes which allowance is drawn, not the narrator.
const MODELS = process.env.TTS_MODEL
  ? [process.env.TTS_MODEL]
  : [
      'gemini-3.1-flash-tts-preview',
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-pro-preview-tts',
    ];
/** Models known to be out of quota for the rest of this run. */
const spent = new Set();
const liveModel = () => MODELS.find((m) => !spent.has(m));
const MODEL = MODELS[0];
const VOICE = process.env.VOICE_NAME ?? 'Schedar';
const SPEED = Number(process.env.VOICE_SPEED ?? 1.1);
/**
 * Sentences per request — how much of a video is spoken in one performance.
 *
 * MEASURED, not assumed. More lines per request is not automatically steadier:
 * rendering fleet as a single 18-line take gave a pitch spread of 46 Hz, while
 * the same script in 8-line batches gave 16 Hz. Tracing pitch line by line
 * showed why — the narrator holds around 100-115 Hz for a dozen or so lines and
 * then slips (140 Hz at line 15), losing the persona the further it gets from
 * the instruction. So the batch is capped where the voice is still reliably
 * itself. Re-measure with walkthrough-voice-check.mjs before changing this.
 */
const BATCH = Number(process.env.VOICE_BATCH ?? 8);
/** Target loudness, EBU R128. Broadcast-ish and quiet enough to leave headroom. */
const LUFS = Number(process.env.VOICE_LUFS ?? -18);
/** Gap the model is asked to leave, and the floor we cut on. */
const GAP_S = 2.0;
const SILENCE_DB = -40;
const SILENCE_MIN_S = 0.7;

/** No single request may hang the render. Generous, but finite. */
const REQUEST_TIMEOUT_MS = Number(process.env.VOICE_TIMEOUT_MS ?? 180_000);
/** Wait between requests. The limit that bites first is per-MINUTE, not per-day,
 *  so pacing up front is cheaper than discovering the limit and backing off. */
const PACE_MS = Number(process.env.VOICE_PACE_MS ?? 6_000);

const SAMPLE_RATE = 24_000;
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Quotas are per PROJECT, so a key on a fresh project is the way past a spent
// one. Newest first: _3 is the paid project that actually draws credit, _2 is
// free tier (10 requests per day, per model), and the original is a paid
// project whose prepaid credit is gone.
const KEY =
  process.env.GEMINI_API_KEY_3 ??
  process.env.GEMINI_API_KEY_2 ??
  process.env.GEMINI_API_KEY ??
  process.env.GOOGLE_API_KEY;
if (!KEY) throw new Error('no GEMINI_API_KEY_3 / _2 / GEMINI_API_KEY set');

// One narrator, described as a person, plus the mechanical instruction that
// makes the batch splittable. The delivery direction and the pause direction
// must both survive — hence they are stated separately and plainly.
const PERSONA =
  'You are one narrator recording a single continuous product voiceover: an ' +
  'adult male instructor with a steady mid-range voice, walking a new user ' +
  'through software they are about to use for the first time. Plain and ' +
  'practical, like a colleague showing you how the job is done. Do NOT sound ' +
  'enthusiastic, do NOT sell, do NOT vary your delivery for emphasis. Keep ' +
  'pitch, pace, volume and timbre IDENTICAL for every line.';

const SPLIT_RULE =
  `Read the numbered lines below aloud, in order. Do NOT read the numbers ` +
  `aloud. Leave ${GAP_S} full seconds of complete silence between the end of ` +
  `one line and the start of the next. Read every line exactly as written.`;

// ── WAV helpers (Gemini returns raw PCM, not a playable file) ───────────────
function pcmToWav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const durationOf = (file) =>
  Number(
    execFileSync(FFPROBE, ['-v','error','-show_entries','format=duration',
      '-of','default=noprint_wrappers=1:nokey=1', file], { encoding: 'utf8' }).trim(),
  );

function atempoChain(rate) {
  const parts = [];
  let r = rate;
  while (r > 2) { parts.push('atempo=2.0'); r /= 2; }
  while (r < 0.5) { parts.push('atempo=0.5'); r /= 0.5; }
  parts.push(`atempo=${r.toFixed(4)}`);
  return parts.join(',');
}

/** One Gemini TTS request. Retries transient failures; a 4xx fails fast. */
let lastCallAt = 0;

async function speak(prompt, label, attemptsLeft = 3) {
  // Space requests out rather than firing them back to back.
  const since = Date.now() - lastCallAt;
  if (lastCallAt && since < PACE_MS) {
    await new Promise((r) => setTimeout(r, PACE_MS - since));
  }
  lastCallAt = Date.now();

  let res;
  let detail = '';
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const model = liveModel();
    if (!model) throw new Error(`every TTS model is out of quota (${label})`);
    // A request with no deadline can hang forever, and a render that never
    // returns looks identical to one that is still working. Time it out and
    // treat that as a retryable failure like any other.
    try {
      res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      detail = String(err).slice(0, 200);
      if (attempt === 6) break;
      const wait = 4_000 * attempt;
      console.log(`  gemini request failed on ${label} (${detail}) — retry ${attempt}/5 in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.ok) break;
    detail = await res.text().catch(() => '');

    // A daily cap does not clear by waiting — the retry delay is ~22 hours.
    // Retire this model and try the next one instead of sleeping on it.
    if (res.status === 429 && /per_?day|PerDay/i.test(detail)) {
      console.log(`  ${model} is out of quota for today — switching model`);
      spent.add(model);
      if (!liveModel()) break;
      continue;
    }
    // 400 INVALID_ARGUMENT is normally a real, permanent problem — but this
    // model also returns it transiently under load, and the identical request
    // succeeds moments later. Retrying a 400 costs one call; treating a
    // transient one as fatal loses the whole render.
    const retryable = res.status >= 500 || res.status === 429 || res.status === 400;
    if (!retryable || attempt === 6) break;
    const wait = res.status === 429 ? 20_000 * attempt : 4_000 * attempt;
    console.log(`  gemini ${res.status} on ${label} — retry ${attempt}/5 in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!res || !res.ok)
    throw new Error(`Gemini TTS ${res ? res.status : 'no response'} on ${label}: ${detail.slice(0, 200)}`);

  const json = await res.json();
  const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (b64) return pcmToWav(Buffer.from(b64, 'base64'));

  // A 200 that carries no audio is the same kind of transient failure as a 500
  // — the model answered, just not with speech. Retrying costs one call;
  // treating it as fatal throws away every batch already rendered.
  const why = json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? 'no reason given';
  if (attemptsLeft > 0) {
    console.log(`  gemini returned no audio for ${label} (${why}) — retrying`);
    await new Promise((r) => setTimeout(r, 5_000));
    return speak(prompt, label, attemptsLeft - 1);
  }
  throw new Error(`Gemini returned no audio for ${label} after retries (${why})`);
}

function silenceRanges(file) {
  // ffmpeg prints the detector output on stderr, so redirect it into stdout.
  const text = execFileSync('/bin/sh', ['-c',
    `${JSON.stringify(FF)} -v info -i ${JSON.stringify(file)} ` +
    `-af silencedetect=noise=${SILENCE_DB}dB:d=${SILENCE_MIN_S} -f null - 2>&1`,
  ], { encoding: 'utf8', maxBuffer: 1 << 24 });

  const ranges = [];
  let start = null;
  for (const line of text.split('\n')) {
    const s = line.match(/silence_start:\s*([\d.]+)/);
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start !== null) { ranges.push([start, Number(e[1])]); start = null; }
  }
  return ranges;
}

/**
 * Cut a batch recording into one file per line.
 *
 * Returns null when the audio does not clearly contain the expected number of
 * lines — the caller then falls back rather than guessing where a sentence
 * ended. A silence at the very start or very end is not a separator.
 */
async function splitBatch(wavPath, texts, outPrefix) {
  const count = texts.length;
  if (count === 1) return [wavPath];
  const total = durationOf(wavPath);

  // Silences that top and tail the file are not separators between lines —
  // the model often leaves a beat before the first word and a longer one after
  // the last. Drop anything that touches either end, using a wide margin: a
  // trailing pause can begin well before the file actually ends.
  const SPEECH_EDGE_S = 1.5;
  const internal = silenceRanges(wavPath).filter(
    ([a, b]) => a > SPEECH_EDGE_S && b < total - SPEECH_EDGE_S,
  );

  // There must be at least one separator per join. More than that means the
  // narrator also paused mid-sentence, so keep the LONGEST gaps — the
  // deliberate two-second breaks are always longer than a comma's worth of
  // breath — and put them back in time order.
  if (internal.length < count - 1) return null;
  const ranges = internal
    .slice()
    .sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))
    .slice(0, count - 1)
    .sort((x, y) => x[0] - y[0]);

  const cuts = [];
  let from = 0;
  for (const [s, e] of ranges) {
    cuts.push([from, s]);
    from = e;
  }
  cuts.push([from, total]);

  // A cut is only believable if each piece is about as long as its sentence
  // takes to say. Picking the longest silences is a guess, and it guesses wrong
  // when the narrator also pauses mid-sentence — which puts half of one line
  // onto the next and, downstream, the wrong narration on the wrong screen.
  // Roughly 2.8 words a second is ordinary speech; anything far outside that
  // means the boundaries are not where the sentences are.
  const WORDS_PER_SEC = 2.8;
  const MIN_RATIO = 0.6;
  const MAX_RATIO = 1.7;
  for (const [i, [a, b]] of cuts.entries()) {
    const words = texts[i].trim().split(/\s+/).length;
    const ratio = (b - a) / (words / WORDS_PER_SEC);
    if (ratio < MIN_RATIO || ratio > MAX_RATIO) return null;
  }

  const files = [];
  for (const [i, [a, b]] of cuts.entries()) {
    const f = `${outPrefix}-${String(i).padStart(2, '0')}.wav`;
    // A short pad either side so no consonant is clipped off.
    const ss = Math.max(0, a - 0.12);
    const to = Math.min(total, b + 0.12);
    await execFileAsync(FF, ['-y','-loglevel','error','-i',wavPath,
      '-ss', ss.toFixed(3), '-to', to.toFixed(3), f]);
    if (durationOf(f) < 0.35) return null;   // a line cannot be that short
    files.push(f);
  }
  return files;
}

/**
 * Speed to target, then force the clip to the SAME loudness as every other
 * clip. loudnorm's two-pass form is used so the result actually lands on the
 * target instead of being approximately adjusted.
 */
async function finish(src, dest) {
  // Intermediates live in the work dir, never in the cache — the cache holds
  // finished clips only, so a stale half-processed file can never be served.
  const sped = path.join(OUT, `${path.basename(dest, '.wav')}.sped.wav`);
  if (SPEED !== 1.0) {
    await execFileAsync(FF, ['-y','-loglevel','error','-i',src,
      '-filter:a', atempoChain(SPEED), sped]);
  } else {
    await execFileAsync(FF, ['-y','-loglevel','error','-i',src,'-c','copy',sped]);
  }

  // Pass 1 — measure.
  const measured = execFileSync('/bin/sh', ['-c',
    `${JSON.stringify(FF)} -i ${JSON.stringify(sped)} -af ` +
    `loudnorm=I=${LUFS}:TP=-1.5:LRA=7:print_format=json -f null - 2>&1`,
  ], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = measured.slice(measured.lastIndexOf('{')).match(/\{[\s\S]*\}/);
  const stats = m ? JSON.parse(m[0]) : null;

  const filter = stats
    ? `loudnorm=I=${LUFS}:TP=-1.5:LRA=7:` +
      `measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:` +
      `measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:` +
      `offset=${stats.target_offset}:linear=true:print_format=summary`
    : `loudnorm=I=${LUFS}:TP=-1.5:LRA=7`;

  await execFileAsync(FF, ['-y','-loglevel','error','-i',sped,
    '-af', filter, '-ar', String(SAMPLE_RATE), '-ac', '1', dest]);
  return dest;
}

// ── Render ─────────────────────────────────────────────────────────────────
const { LINES } = await import(
  `file://${path.join(ROOT, 'e2e/walkthrough', NAME + '.lines.mjs')}`
);

const keyFor = (text) =>
  createHash('sha256')
    .update(JSON.stringify({ text, VOICE, MODEL, SPEED, LUFS, PERSONA, v: 2 }))
    .digest('hex')
    .slice(0, 32);

/** Render one line by itself — the fallback when a batch will not split. */
async function renderSingle(text, tag) {
  const raw = path.join(OUT, `single-${tag}-raw.wav`);
  writeFileSync(raw, await speak(`${PERSONA}\n\n${text}`, `line ${tag}`));
  return finish(raw, path.join(CACHE, `${keyFor(text)}.wav`));
}

const results = new Map();   // text -> file

for (let b = 0; b < LINES.length; b += BATCH) {
  const chunk = LINES.slice(b, b + BATCH);
  const need = chunk.filter((t) => !existsSync(path.join(CACHE, `${keyFor(t)}.wav`)));
  if (need.length === 0) {
    console.log(`batch ${b / BATCH + 1}: cached`);
    continue;
  }

  const tag = `b${String(b / BATCH).padStart(2, '0')}`;
  let ok = false;

  for (let attempt = 1; attempt <= 3 && !ok; attempt += 1) {
    const prompt =
      `${PERSONA}\n\n${SPLIT_RULE}\n\n` +
      chunk.map((l, i) => `${i + 1}. ${l}`).join('\n\n');
    const raw = path.join(OUT, `${tag}-a${attempt}-raw.wav`);
    writeFileSync(raw, await speak(prompt, `batch ${tag} attempt ${attempt}`));

    const parts = await splitBatch(raw, chunk, path.join(OUT, `${tag}-a${attempt}`));
    if (!parts) {
      console.log(
        `  ${tag}: could not cut cleanly into ${chunk.length} lines — attempt ${attempt}`,
      );
      continue;
    }
    for (const [i, text] of chunk.entries()) {
      await finish(parts[i], path.join(CACHE, `${keyFor(text)}.wav`));
    }
    ok = true;
    console.log(`batch ${b / BATCH + 1}: ${chunk.length} lines, one delivery`);
  }

  if (!ok) {
    // Batching is what keeps the delivery identical across lines, so it is
    // worth losing only when it truly cannot be made to work. Per-line
    // rendering still produces every clip, and loudnorm still pins the volume;
    // only the tone consistency within this batch is weaker.
    console.log(`  ${tag}: falling back to one call per line (${chunk.length})`);
    for (const [i, text] of chunk.entries()) {
      try {
        await renderSingle(text, `${tag}-${i}`);
      } catch (err) {
        throw new Error(
          `could not render line ${b + i} after batching and per-line both failed: ` +
            `"${text.slice(0, 60)}" — ${String(err).slice(0, 160)}`,
        );
      }
    }
  }
}

// ── Measure and write the manifest the recorder reads ──────────────────────
const manifest = [];
for (const [i, line] of LINES.entries()) {
  const file = path.join(CACHE, `${keyFor(line)}.wav`);
  if (!existsSync(file)) throw new Error(`missing audio for line ${i}: ${line.slice(0, 60)}`);
  // A short tail so the next sentence does not begin on the last syllable.
  const ms = Math.round(durationOf(file) * 1000) + 350;
  manifest.push({ index: i, text: line, file, ms });
  console.log(`${String(i).padStart(3)}  ${(ms / 1000).toFixed(1)}s  ${line.slice(0, 62)}`);
}

const total = manifest.reduce((a, m) => a + m.ms, 0);
writeFileSync(
  path.join(ROOT, '.demo-build', `audio-${NAME}.json`),
  JSON.stringify({ name: NAME, totalMs: total, lufs: LUFS, voice: VOICE, lines: manifest }, null, 2),
);
console.log(`\n${manifest.length} lines · ${(total / 1000 / 60).toFixed(1)} min · normalised to ${LUFS} LUFS`);
