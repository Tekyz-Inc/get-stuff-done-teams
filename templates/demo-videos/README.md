# Demo-video pipeline templates

Working scripts behind `/gsd-t-demo-videos`. These are the real thing from a
completed 12-walkthrough production run, not sketches. Copy them into a project
and fill the `{tokens}`; do not re-derive the pipeline.

## Install into a project

```bash
mkdir -p e2e/walkthrough scripts scripts/demo-data docs/demo-videos
cp <gsd-t>/templates/demo-videos/e2e/*      e2e/walkthrough/
cp <gsd-t>/templates/demo-videos/scripts/walkthrough-*.mjs  scripts/
cp <gsd-t>/templates/demo-videos/scripts/seed-lib.mjs       scripts/demo-data/

# auto-editor, bundled so it does not depend on PATH
python3 -m venv .venv-tools/auto-editor
.venv-tools/auto-editor/bin/pip install auto-editor

printf '\n.demo-build/\n.tts-cache-gcloud/\n.tts-cache-v2/\ndocs/demo-videos/*.mp4\n' >> .gitignore
```

Add a Playwright project:

```ts
{
  name: 'walkthrough',
  testDir: './e2e/walkthrough',
  testMatch: /\.spec\.ts$/,
  timeout: 15 * 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.DEMO_URL || 'https://demo.example.com',
    viewport: { width: 1440, height: 900 },
    // PIN THE SIZE. Unpinned, Playwright downscales and the result is
    // upscaled back to a blurry finish.
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    trace: 'off',
  },
}
```

Then fill: `signin.ts` (persona + tenant id), `preflight.spec.ts` (targets), and
one `<name>.lines.mjs` + `<name>.spec.ts` pair per walkthrough.

## Run

```bash
DEMO_RUN=1 npx playwright test --project=walkthrough --grep preflight   # 0 check targets
node scripts/walkthrough-lines-check.mjs <name>                         #   every line used once, in order
node scripts/walkthrough-voice-ensure.mjs <name>                        # 1 narration + gate
DEMO_RUN=1 npx playwright test --project=walkthrough --grep "<name>"    # 2 record
node scripts/walkthrough-mux.mjs  <name>                                # 3 lay audio on video
node scripts/walkthrough-trim.mjs <name>                                # 4 cut the silence
node scripts/walkthrough-implied-clicks.mjs <name>                      # verify: no implied clicks
```

Stage 4 is not optional — it removed 7.4 minutes of dead air across twelve
videos in the source run.

## Environment

| Variable | Purpose |
|---|---|
| `DEMO_URL` | the running app to film |
| `DEMO_GATE_PW` | password gate in front of a demo site, if any |
| (none — auth) | Google Cloud TTS uses Application Default Credentials: `gcloud auth application-default login` |
| `TTS_VOICE`, `TTS_RATE`, `TTS_PITCH`, `VOICE_LUFS` | narrator (default `en-US-Chirp3-HD-Algieba`, rate 1.1, −18 LUFS) |
| `GOOGLE_TTS_PROJECT` | quota project for Cloud TTS |
| `VOICE_PITCH_MIN` / `VOICE_PITCH_MAX` | mean-pitch band the voice gate expects (default 95–120 Hz; re-band for a new voice) |
| `VOICE_RENDERER` | `walkthrough-voice.mjs` selects the superseded Gemini renderer explicitly |
| `WT_RESULTS` | per-video Playwright output folder, so parallel builds do not wipe each other |
| `TRIM_MARGIN` | silence kept either side of speech (default `0.2s`) |
| `HEADED=1` | watch a seeder run |

## What each file is for

| File | Role |
|---|---|
| `e2e/runtime.ts` | `step()`, `highlight()`, `click()`, `hold()`, `enter()`, `choose()`, `act()`, `park()`, `goTo()`; narration + the mux gap is the clock; throws when a target is missing or a typed/chosen value did not land |
| `e2e/manifest.ts` | loads narration; a spec **skips** when its audio is missing rather than failing the run |
| `e2e/signin.ts` | shared sign-in + the tenant constant — **ask for this, don't derive it** |
| `e2e/preflight.spec.ts` | walks every target without recording, reports all misses in one pass |
| `e2e/cast.mjs` | **the demo's cast** — Tyler (the voice), Maya (the reason), the syllabus and the priced products; spoken twins for anything with a symbol |
| `e2e/example.lines.mjs` | narration shape, with the writing rules — follows one named student through one named course |
| `e2e/example.spec.ts` | spec shape, with the overlay/settle rules |
| `scripts/walkthrough-voice-gcloud.mjs` | **the narrator** — Google Cloud TTS fixed voice, one sentence per request, two-pass loudnorm |
| `scripts/walkthrough-voice.mjs` | SUPERSEDED — Gemini batched TTS; its voice drifts mid-video |
| `scripts/walkthrough-voice-check.mjs` | volume spread + MEAN-pitch speaker identity + rate + miscuts; **exit 4** on drift |
| `scripts/walkthrough-voice-ensure.mjs` | render → measure → re-render → halt at 3 |
| `scripts/walkthrough-normalise.mjs` | force existing clips to one loudness, no API calls |
| `scripts/walkthrough-mux.mjs` | places clips at recorded timestamps; **halts** on a truncated run or overrun; warns on a stale kept recording |
| `scripts/walkthrough-lines-check.mjs` | every narration line used exactly once, in order; **exit 4** |
| `scripts/walkthrough-implied-clicks.mjs` | highlight-then-navigate without `park()` reads as a click that never happened; **exit 4** |
| `scripts/walkthrough-clip-rates.mjs` | per-sentence speaking rate, to find the line tripping the rate gate |
| `scripts/walkthrough-trim.mjs` | auto-editor silence removal, in place, re-runnable |
| `scripts/demo-data/seed-lib.mjs` | seeder sign-in, settle, and the refusal-reporting rule |

The reasoning behind every threshold and retry is in the file headers — they are
the record of what failed, so read them before changing a constant.
