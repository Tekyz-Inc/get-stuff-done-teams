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

printf '\n.demo-build/\n.tts-cache-v2/\ndocs/demo-videos/*.mp4\n' >> .gitignore
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
node scripts/walkthrough-voice-ensure.mjs <name>                        # 1 narration + gate
DEMO_RUN=1 npx playwright test --project=walkthrough --grep "<name>"    # 2 record
node scripts/walkthrough-mux.mjs  <name>                                # 3 lay audio on video
node scripts/walkthrough-trim.mjs <name>                                # 4 cut the silence
```

Stage 4 is not optional — it removed 7.4 minutes of dead air across twelve
videos in the source run.

## Environment

| Variable | Purpose |
|---|---|
| `DEMO_URL` | the running app to film |
| `DEMO_GATE_PW` | password gate in front of a demo site, if any |
| `GEMINI_API_KEY_3` / `_2` / `GEMINI_API_KEY` | TTS, tried in that order |
| `VOICE_NAME`, `VOICE_SPEED`, `VOICE_BATCH`, `VOICE_LUFS` | narrator settings — all in the cache key |
| `TTS_MODEL` | pin one model instead of the fallback list |
| `TRIM_MARGIN` | silence kept either side of speech (default `0.2s`) |
| `HEADED=1` | watch a seeder run |

## What each file is for

| File | Role |
|---|---|
| `e2e/runtime.ts` | `step()`, `highlight()`, `click()`, `enter()`, `choose()`, `act()`, `goTo()`; narration is the clock; throws when a sentence has no visible target |
| `e2e/manifest.ts` | loads narration; a spec **skips** when its audio is missing rather than failing the run |
| `e2e/signin.ts` | shared sign-in + the tenant constant — **ask for this, don't derive it** |
| `e2e/preflight.spec.ts` | walks every target without recording, reports all misses in one pass |
| `e2e/cast.mjs` | **the demo's cast** — Tyler (the voice), Maya (the reason), the syllabus and the priced products; spoken twins for anything with a symbol |
| `e2e/example.lines.mjs` | narration shape, with the writing rules — follows one named student through one named course |
| `e2e/example.spec.ts` | spec shape, with the overlay/settle rules |
| `scripts/walkthrough-voice.mjs` | batched TTS (8/request), verified split, two-pass loudnorm |
| `scripts/walkthrough-voice-check.mjs` | measures LUFS/pitch/rate spread + miscuts; **exit 4** on drift |
| `scripts/walkthrough-voice-ensure.mjs` | render → measure → re-render → halt at 3 |
| `scripts/walkthrough-normalise.mjs` | force existing clips to one loudness, no API calls |
| `scripts/walkthrough-mux.mjs` | places clips at recorded timestamps; no overlaps; warns on overrun |
| `scripts/walkthrough-trim.mjs` | auto-editor silence removal, in place, re-runnable |
| `scripts/demo-data/seed-lib.mjs` | seeder sign-in, settle, and the refusal-reporting rule |

The reasoning behind every threshold and retry is in the file headers — they are
the record of what failed, so read them before changing a constant.
