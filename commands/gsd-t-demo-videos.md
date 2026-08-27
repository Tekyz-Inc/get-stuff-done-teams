# GSD-T: Demo Videos — Narrated Walkthrough Videos of a Running App

Produce narrated screen-recording walkthroughs of an application, from a coverage
plan through to finished MP4s. `$ARGUMENTS` names what to do: a walkthrough name
(`fleet`), `--all`, `--plan`, `--seed`, `--audit`, or nothing (plan then build
everything).

Distilled from a real 200-turn production run (HILO ATOS, 12 walkthroughs,
2026-08-19 → 2026-08-27). **Every gate below exists because its absence cost a
re-record, a re-render, or a shipped video the user had to catch.** Do not
re-derive them.

---

## The shape of the thing

**Narration is the master clock. The picture obeys it.**

A step is one spoken sentence plus one thing happening on screen. The step lasts
exactly as long as the sentence takes to say — **measured from the rendered
audio file**, never estimated, never a constant. The action fires when the
sentence starts, then the pointer rests wherever it landed for the remainder.
That is what reads on camera as "pointing at a thing while explaining it".

The first version of this pipeline gave every step a fixed 5 seconds. That single
constant is why narration drifted out of sync with the screen, and it is the
defect the whole design exists to remove.

**One continuous recording per walkthrough**, clipped afterward — never
per-screen clips assembled later, and never stills. Stills cannot show a
transition, and a slideshow does not read as software being used.

---

## Prerequisites — check these before Step 1

| Need | Why | Halt if missing |
|---|---|---|
| A **running app with real data** — deployed/preview URL, not a local build with an empty database | An empty tenant on video is indistinguishable from a feature that was never built | Yes — ask for the URL, a login, and the name of a tenant that actually has data |
| **Playwright** installed | The recorder | Yes — `gsd-t setup-playwright` |
| **ffmpeg** | Every audio operation | Yes |
| **auto-editor** (Python venv, bundled into the project, not PATH) | Silence removal, Stage 5 | Yes |
| A **TTS key** with quota | The narrator | Yes — see § Quota |

**Ask for the tenant by name.** In the source run, two videos were filmed
against the wrong location before the right ID was pinned down; the numbering
was counter-intuitive and no amount of code reading would have revealed it.
Record the answer in the project's walkthrough `signin` module as a named
constant with a comment, so it is never re-derived.

---

## Step 1 — PLAN: the coverage map

Do not start from the code. **Walk the running app** and enumerate what a viewer
could actually be shown. The source run's first nine videos covered roughly 25 of
~55 populated screens, and the gaps were only found by an audit against the live
site — a whole top-level navigation section, the app's actual landing page, and
the richest populated feature in the product were all missed.

Produce a plan table, one row per walkthrough:

| Column | Content |
|---|---|
| Name | kebab-case, becomes every filename (`fleet`, `flight-risk`) |
| Workflow | the job a real user is doing, not the menu name |
| Screens | every route it visits |
| Tabs/sub-surfaces | **count them on screen** — a record with 7 tabs narrated as 3 is a shipped error |
| Data state | populated / partly empty / empty |
| Target length | under 90 seconds preferred; note if genuinely longer |

**Group by workflow, not by menu.** Give the viewer the dependency chain: *before
you can schedule a student for a course, a program must exist and be linked to a
course.* That context is what makes a walkthrough useful rather than a tour.

Write the plan to `docs/demo-videos/PLAN.md`. If the user supplies a spreadsheet,
mirror it there too.

---

## Step 2 — PROBE the empty screens (never assume)

For every screen the plan marks empty or doubtful, **open it in the running app
and look**. In the source run the empty-screen table was written from the seed
scripts, and probing the live app **reversed four of five verdicts**:

- one screen looked empty only because it opened on a period with no data — the
  fix was a click, not a seeder
- three were already populated
- built-but-empty is not the same as a stub: an empty screen with working
  controls is worth filming

Classify each: **already populated** / **needs seeding** / **empty by design**
(say so in narration) / **blocked by an app bug** (report it, do not film it).

---

## Step 3 — SEED, through the real UI only

Seeders drive the actual forms as a real user, so every guardrail the app
enforces still applies. A record created this way is a record a person could have
created, which is the only reason the screen it fills is showing something true.

**The rule every seeder follows: when the app refuses, report what it said and
stop.** Never retry past a refusal, never reach around the form into the
database. A refusal is information — usually that the screen is empty for a
reason worth knowing. (In the source run, one seeder's refusal turned out to be a
genuine app bug: an enabled button with an inert click handler.)

Two silent-failure traps seen in practice, worth checking for in any form:

- **Labels not wired to inputs** — `getByLabel` matches nothing, every required
  field stays empty, and the dialog just sits there. Fall back to filling by
  input position, and say so in a comment.
- **Save navigates elsewhere** — the control you need is gone on the next
  iteration, so each item must start from a fresh page load.

Also: several elements can carry `role=dialog` (a sidebar, an assistant panel).
Match a dialog by its title, never `.first()`.

State plainly in the handoff whether seeded data survives (a shared demo site
often resets nightly).

---

## Step 4 — WRITE the narration as beats

Two files per walkthrough, and the separation is load-bearing:

- `<name>.lines.mjs` — an ordered array of sentences. Nothing else.
- `<name>.spec.ts` — what happens on screen for each sentence, in the same order.

**A beat is one idea being explained, NOT one screen.** A beat may dwell on three
things within a screen, or carry across a navigation. Building around screens is
what produced fixed-length steps and the drift that followed.

Narration rules, each from a user correction:

- **Never name something the viewer cannot see.** "Groups", "the tabs", "the
  address bar" — if the sentence names a thing, the step must point at that
  thing. Do not invent jargon; say "the left sidebar's top-level menus, which
  expand to show…".
- **Explain, do not sell.** No "exciting", no "powerful", no enthusiasm. A
  colleague showing you how the job is done.
- **Give the dependency context.** Why this screen exists, and what downstream
  reads from it.
- **Count what is on screen before writing about it.** "Eight-step wizard" shipped
  in a video where the UI says *Step 1 of 9*.
- **Naming a whole strip highlights the strip; making a point about one control
  highlights that control; navigating by it moves the mouse and clicks it.**

---

## Step 5 — the five-stage build

Run in this order, every time. Nothing here is optional.

```
0. PREFLIGHT   playwright test --grep preflight       — check every target, no recording
1. VOICE       walkthrough-voice-ensure.mjs <name>    — render, measure, re-render if it drifts
2. RECORD      playwright test --grep "<name>"        — one continuous run
3. MUX         walkthrough-mux.mjs <name>             — lay audio on the recording
4. TRIM        walkthrough-trim.mjs <name>            — CUT THE SILENCE
```

### Stage 0 — Preflight

A single wrong selector fails an entire 5–8 minute recording, at the first
sentence whose target is missing. Three bad selectors therefore cost three full
recordings to find. Preflight walks the same screens without recording and
reports **every** missing target in one pass. It never asserts; it prints a
report. The real gate is still the recording itself.

### Stage 1 — Voice (the hardest-won stage)

**Cause of tone drift, confirmed: one API request per sentence.** The model
re-decides its delivery on every request, so the narrator audibly changed within
a single video. Describing the speaker in the prompt does not fix it — it is
being asked to act, fresh, dozens of times.

Two deterministic fixes, neither of which rests on listening and deciding it
sounds fine:

**Volume — forced.** Every clip goes through a two-pass ffmpeg `loudnorm` to the
same target (EBU R128, −18 LUFS). Measured effect: within-video drift went from
as much as **7.5 dB to ~0.5 dB**, and every video sits at exactly −18.0 so they
match each other too. A normalise-only script fixes existing clips with no API
calls.

**Tone — batched, then verified.** Sentences go **8 per request**, numbered, with
an instruction to leave two seconds of silence between them; the returned audio is
cut back apart on those silences. One request means one performance.

> **BATCH SIZE IS 8 AND THAT WAS MEASURED.** Bigger is not better: an 18-line
> script as a single take gave a pitch spread of **46 Hz**; the same script in
> 8-line batches gave **16 Hz**. Line-by-line pitch tracing showed why — the
> narrator holds ~100–115 Hz for a dozen lines then slips (140 Hz at line 15),
> losing the persona the further it gets from the instruction. Re-measure before
> changing it.

**The split is verified, never assumed.** If a batch does not come back with the
expected number of gaps, retry it; if it still disagrees, render those lines one
at a time. Each piece must also be about as long as its sentence takes to say
(~2.8 words/sec, accepted band 0.6×–1.7×). A wrong split puts half a sentence on
the wrong step — worse than the drift it was meant to cure.

**The gate.** Measure three numbers per clip and report the **spread** across the
video: loudness (LUFS), pitch (median fundamental, Hz), speaking rate (energy
peaks/sec), plus **miscut** clips. Thresholds: volume 1.5 dB, pitch 35 Hz, rate
5/s, zero miscuts.

**Ensure, don't check.** Render → measure → **throw the take away and re-render
if it drifts** (3 attempts, then halt rather than ship). This is not theoretical:
one video's first take came back at 46 Hz and was discarded for a 15 Hz one;
another needed all three attempts (44 → 41 → 31 Hz).

> **Do not trust a single A/B run.** A "persona anchor" prompt looked like a large
> win (7 Hz vs plain) and reversed on the next run (21 Hz vs 9 Hz). It was
> run-to-run variance. Two renders of the same prompt genuinely differ — which is
> exactly why the gate exists instead of a one-time tuning pass.

**Keep the voice identical across the whole set**, not just within a video. Voice
name, speed, model, target loudness and persona text all belong in the cache key:
change any one and the video re-renders rather than mixing two deliveries.

**Retry every one of these** — each returned something other than usable audio and
was fatal until handled:

| Symptom | Handling |
|---|---|
| transient `400 INVALID_ARGUMENT` | retry — the identical request succeeds moments later |
| `200` carrying no audio | retry — the model answered without speech |
| a call with no deadline | time it out; a hung render looks exactly like a working one |
| a crashed attempt | the ensure loop catches it and retries, rather than losing the video |
| `429` per-day quota | switch model or key — see § Quota |

### Stage 2 — Record

One continuous run, real browser, real mouse movement, real clicks, real
transitions. Pin the video size in the Playwright project config (an unpinned
size gets downscaled then upscaled to a blurry result).

Two assertions the runtime must enforce, both from shipped errors:

- **A narrated step with no visible target throws.** Mark genuinely abstract
  lines explicitly; everything else must point at something.
- **`step()` also asserts the page.** A failed click used to produce confident
  narration about a screen that was never on camera.

Give pages **6–8 seconds to populate, not 5.** Reading at 5s reported a populated
page as empty and produced a wrong "this module is empty" call.

The run writes a **step log** — index, start/end ms, narration, measured audio
ms, route, focus, action. That log is the proof of what was on screen when, and
the mux reads it. Copy the recording out of `test-results/` immediately;
Playwright wipes that directory each run, and a kept copy means a re-mux never
needs a re-record.

**When a recording fails, look at `test-results/<name>/test-failed-1.png`
FIRST.** Every wrong theory in the source run came from reasoning about the DOM
instead of looking at the picture the run had already saved. One three-recording
failure was diagnosed twice-wrongly (virtualised rows, then a timing race) before
the failure screenshot showed the truth immediately.

> **Read UI state before clicking it.** Filter chips that are already ON look
> identical to buttons that turn something on. Clicking "Aircraft" removed every
> aircraft row and the next narrated sentence pointed at nothing. Read the state
> and click only to *change* it.

### Stage 3 — Mux

Place each clip at the timestamp the step log recorded. Both sides come from the
same measured timeline, so nothing needs aligning afterward.

Three things it must handle:

- **Wait for the recording to settle.** Playwright finishes writing the `.webm`
  *after* the test function returns; a copy taken instantly can be short, and the
  tail of the narration then plays over black.
- **Trim the unnarrated head** — sign-in, gates, first navigation are all on tape
  before the first word.
- **Never let two sentences overlap.** If a clip is still playing when the next is
  due, start the next after it ends. Re-rendering narration at a different speed
  or voice makes clips no longer fit the slots the recording left for them; a
  slightly late sentence is far less noticeable than two voices at once. (The
  user caught this as "it's almost overspeaking at the transitions" and as a
  clipped sentence end.)
- **Say so loudly if narration outruns the recording** — that means the capture
  was cut short and the video must be re-recorded, not shipped quietly.

### Stage 4 — Trim (never skip)

The recording pauses on every page load, which lands **20–60 seconds of dead air**
in each finished video and makes a 3-minute walkthrough feel far longer.
`auto-editor <file> --margin 0.2s` cuts every stretch where nobody is speaking.
Across twelve videos this removed **7.4 minutes** total.

Run it after **every** mux. It rewrites the MP4 in place and is safe to re-run.
Bundle auto-editor in a project-local venv so it does not depend on PATH.

The user's verdict on this stage was "It's perfect. Run this after every video."

---

## Step 6 — VERIFY before showing the user

The user should never be the one who finds these. Check, per video:

1. **Every planned screen and tab was actually visited** — read the step log's
   routes, not the spec source.
2. **Every narrated claim points at something** — the runtime enforces it, but
   confirm no line is wrongly marked abstract.
3. **Voice gate passes** — one narrator, one volume, zero miscuts.
4. **No narration past the end of the recording.**
5. **No implied click that did not happen** — a `highlight` step immediately
   followed by a `goto` reads on camera as "they clicked that and it took us
   here". It did not. Either click the real navigation, or park the cursor
   somewhere neutral before navigating. Find them by scanning the step log for
   `highlight` → `goto` adjacency. (Audited at 22 instances across 6 videos in
   the source run.)
6. **Counts in the narration match the UI** — tabs, wizard steps, row counts.

Then show the user each video as it finishes, not in a batch at the end.

---

## Quota — it is per PROJECT and per MODEL

- A free tier can be as low as **10 requests per day per model**, and the error
  names it (`…PerDayPerProjectPerModel-FreeTier`). It dies almost immediately.
- A paid project's quota is separate; a **new key on a new project** is the
  reliable way past a spent one.
- Because quota counts **per model**, switching model is also a way past a spent
  allowance. Order the models in a list and skip a spent one for the rest of the
  run rather than sleeping on a ~22-hour reset.
- A billing page showing a balance does not mean the key works.

Batching pays for itself here: 188 sentences across 12 videos cost roughly **28
requests** total.

Pace requests deliberately (several seconds apart) — the per-minute limit bites
before the per-day one.

---

## Files this command creates

```
docs/demo-videos/PLAN.md                 the coverage map
docs/demo-videos/HANDOFF.md              hard-won facts, bugs found, what is open
docs/demo-videos/walkthrough-<name>.mp4  output (gitignore it)
e2e/walkthrough/<name>.lines.mjs         narration, one sentence per entry
e2e/walkthrough/<name>.spec.ts           what happens on screen per sentence
e2e/walkthrough/runtime.ts               step(), highlight(), click(), goTo()
e2e/walkthrough/signin.ts                shared sign-in + the tenant constant
e2e/walkthrough/manifest.ts              loads narration; skips if audio is missing
e2e/walkthrough/preflight.spec.ts        checks every target without recording
scripts/walkthrough-voice.mjs            batched TTS, loudness-normalised
scripts/walkthrough-voice-check.mjs      measures spread + miscuts; exit 4 on drift
scripts/walkthrough-voice-ensure.mjs     render → measure → re-render → halt
scripts/walkthrough-normalise.mjs        force existing clips to one loudness
scripts/walkthrough-mux.mjs              lay audio on the recording
scripts/walkthrough-trim.mjs             remove silent gaps
scripts/demo-data/seed-lib.mjs           shared seeder sign-in + refusal reporting
.demo-build/                             audio, recordings, step logs (gitignore)
```

**Working templates for all of these ship with the GSD-T package. Copy them —
do not re-derive the pipeline.** Resolve the package directory first:

```bash
GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t
TPL="$GSD_T_DIR/templates/demo-videos"
[ -d "$TPL" ] || { echo "demo-video templates not found at $TPL"; exit 1; }

mkdir -p e2e/walkthrough scripts scripts/demo-data docs/demo-videos
cp "$TPL"/e2e/*                        e2e/walkthrough/
cp "$TPL"/scripts/walkthrough-*.mjs    scripts/
cp "$TPL"/scripts/seed-lib.mjs         scripts/demo-data/
python3 -m venv .venv-tools/auto-editor
.venv-tools/auto-editor/bin/pip install auto-editor
printf '\n.demo-build/\n.tts-cache-v2/\ndocs/demo-videos/*.mp4\n' >> .gitignore
```

**Halt if that directory is absent** — an older installed package does not carry
it, and re-deriving the pipeline is exactly what this command exists to prevent.
Run `/gsd-t-version-update` and try again. `$TPL/README.md` carries the wiring
details, including the Playwright project config.

**A spec whose audio has not been rendered yet must SKIP, not throw.** Playwright
imports every spec before applying `--grep`, so an import-time throw takes down
the whole run including the walkthroughs that were ready.

---

## Captions

**Off by default.** They were built, then removed at the user's request — "the
captions just get in the way and are not needed, just the voice over". If a
project wants them: bottom of frame, ~50% width, not full width, drop shadow
(they are unreadable against white), and scroll any narrated target clear of the
caption strip.

---

## Handoff document

Maintain `docs/demo-videos/HANDOFF.md` throughout, holding everything that would
otherwise be re-derived: the tenant ID and why it is counter-intuitive, settle
times, quota state per key, the pipeline stages, **which app bugs were found
while probing**, and what is still open. The source run's handoff is what made a
context-clear-and-resume possible at all.

App bugs found while filming are a real deliverable — they go to the team, not
into the video.

---

## Document Ripple

| Trigger | Update |
|---|---|
| Walkthrough added/removed | `docs/demo-videos/PLAN.md` + `HANDOFF.md` |
| Pipeline stage changed | `HANDOFF.md` pipeline block + this command file |
| Voice settings changed | `HANDOFF.md` (and re-render — settings are in the cache key) |
| Seeder added | `HANDOFF.md` § Seeding, with what it refuses and why |
| App bug found while probing | `HANDOFF.md` § Bugs + `.gsd-t/techdebt.md` |
| New test projects in `playwright.config.ts` | note it — this command must not modify application code |
| Any file changed | `.gsd-t/progress.md` Decision Log entry |

**This command modifies no application code.** Its footprint is the walkthrough
directory, the scripts, two Playwright test projects, and `.gitignore`.

---

## ▶ Next Up

**Verify** — check coverage, voice gate, and implied clicks before shipping.

`/gsd-t-verify`

**Also available:**
- `/gsd-t-backlog-add` — record any app bugs the probing turned up
