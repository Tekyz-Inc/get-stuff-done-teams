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
| **auto-editor** (Python venv, bundled into the project, not PATH) | Silence removal, Stage 4 | Yes |
| A **text-to-speech service with FIXED voices** (e.g. Google Cloud TTS) | The narrator. A language-model TTS re-reads a style hint per request and the voice drifts | Yes — see Stage 1 |

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

**Every cast member must have a script that recreates it.** A shared demo site
usually resets (nightly is common), so anything the walkthrough names aloud is
gone by morning — and a walkthrough that references a course which no longer
exists fails at its first selector. Treat the reset as normal and make the data
reproducible: one seeder per cast member, re-runnable, and idempotent where the
app allows it (check whether the record is already there and say so, rather than
creating a duplicate).

`--seed` re-runs the whole cast, so the day's first recording starts from a known
state. State plainly in the handoff which parts of the cast are seeded ahead and
which are created live on camera.

---

## Step 4 — CAST the demo (do this BEFORE writing a word)

**A demo that describes what a form is for, while the form sits empty, teaches
nothing.** The viewer learns that a button exists — not what the software does.
That is the clinical failure, and it is what this step removes.

**Two stories, woven.** The operator's story is what happens on screen, told in
their own voice — *"I'm setting fifty-five hours."* The customer's story is why
every value they type is that value. Neither works alone: the customer alone is a
bio, the operator alone is a person explaining a form.

| The reason | The decision | On screen |
|---|---|---|
| Maya works night shifts | Tyler picks Part 61, not Part 141 | dropdown → **Part 61** |
| Maya has never flown | Tyler sets 55 hours, not the FAA's 40 | types **55** |
| Maya can only fly mornings | Tyler assigns James, who flies mornings | dropdown → **James Rivera** |

**The reason comes BEFORE the value, in the same breath** — *"She's on nights,
so — Part 61."* Value-then-justification is the teacher voice creeping back.

**The tell that you have slipped back into explaining:** a "because" clause
pointing at the software. *"so it's required rather than optional"*, *"which is
what the invoice uses later"*, *"the schedule refuses it otherwise"*. Every
reason must point at the customer, never at the mechanism. Read the finished
narration aloud: **a sentence that would survive with the names removed is
explaining the software, and it is wrong.**

Pick real, named specifics and write them down as a cast list before any
narration is drafted. Not "a course" — a course with a name someone could say out
loud. Not "a student" — a person with a name.

Put the cast in ONE constants block that both the seeder and the spec import, so
a name can be changed in a single edit and can never drift between the narration
and the screen:

```js
// e2e/walkthrough/cast.mjs — the demo's cast. One edit changes it everywhere.
export const CAST = {
  course:  'Private Pilot Certificate — Part 61',
  student: { first: 'Maya', last: 'Ellison', email: 'maya.ellison@example.com' },
  // …aircraft, instructor, dates — everything the walkthrough names aloud
};
```

**Three rules, and the third is the one a spec silently loses:**

1. **Every named thing is real and specific.** A syllabus with actual stage
   names, a certificate someone actually earns, a rate someone actually pays.
   Generic placeholders (`Test Course 1`, `Student A`) read as fake and make the
   whole demo read as fake with them.

2. **The data is ENTERED on camera, not described — and EVERY DROPDOWN IS
   OPENED AND PICKED.** The walkthrough types the values and saves. A sentence
   explaining what a field is for, over an empty field, is the defect.

   A dropdown that is merely highlighted shows nothing: the viewer cannot see
   what the alternatives were, or that a choice happened at all. **The choice is
   the most informative moment in a create-flow** — it is where the customer's
   situation becomes the operator's decision. Use `choose()`, never
   `highlight()`, on a select.

   If the flow creates something, the demo creates it — that also proves the
   create-flow works, which describing it never does.

3. **The names CARRY FORWARD.** Once the course is created, every later sentence
   says that course BY NAME. Once the student is enrolled, they are referred to
   by name for the rest of the video — "Maya's next lesson", not "the student's
   next lesson". This is what makes the walkthrough one story instead of a tour
   of screens. It is easy to lose because each step is written independently, so
   check it as a pass over the finished narration: **a sentence that says "the
   student" or "the course" after the cast has been introduced is a bug.**

**Give any value with a symbol or abbreviation a spoken twin.** The narrator
reads text literally, so `$185/hr` comes out as "dollar one eight five slash h
r" and `9:00 AM` as "nine colon zero zero A M". Keep the typed value for the
form field and a said-aloud version for the sentence, both in the cast block.

**Price it with the real billable parts.** A course, a plan or a subscription is
the SUM of the things a charge attaches to, so build those things on camera and
attach them — not one summary price. In the flight-school example that is four
products: the airplane per hour, the instructor per hour, ground instruction per
hour, and the materials kit once. The payoff line is the one that makes the whole
section land: *"an hour of dual bills Maya two-sixty — a hundred and eighty-five
for the airplane, seventy-five for James"* is arithmetic the viewer just watched
being set up.

**Order the walkthrough as the real-life sequence**, so each screen is visited
because the previous one made it necessary: build the course → enrol the named
student → schedule their first lesson → fly it → bill it. That ordering is what
makes the dependency context land ("before you can schedule a student for a
course, a program must exist and be linked to a course") instead of being
asserted.

**When creation hits a guardrail**, that is information, not a blocker — the app
refusing an incomplete enrolment is worth showing. But do not fight it on camera:
fall back to an existing named record, and say in the handoff which parts of the
cast are created live and which are pre-seeded.

---

## Step 5 — WRITE the narration as beats

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
- **Say the cast's names, every time.** After Step 4's cast is introduced, "the
  student" and "the course" are bugs — it is *Maya Ellison* and the *Private
  Pilot Certificate — Part 61*. Read the finished narration once looking only
  for this.
- **Narrate the value being typed, not the field's purpose.** "Her first lesson
  is Tuesday at nine, with James in the Cessna 172" — not "you would select a
  date, an instructor and an aircraft here".
- **Naming a whole strip highlights the strip; making a point about one control
  highlights that control; navigating by it moves the mouse and clicks it.**

---

## Step 6 — the five-stage build

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

### Stage 1 — Voice

**Pick a text-to-speech service whose voice is a FIXED TRAINED SPEAKER, not a
language model reading a style hint.** This one choice decides whether the
narrator can drift at all, and everything else in this stage follows from it.

The source run learned it the expensive way. It started on a language model's
audio output (Gemini `generateContent`), where a voice name is a *style hint the
model re-interprets on every request* — so the narrator audibly changed
part-way through a video. Enormous effort went into mitigation: batching 8
sentences per request so one request meant one performance, splitting the
returned audio back apart on silences, verifying every split, and re-rendering
whole takes that measured as drifted. It reduced how OFTEN the voice changed and
could never stop it, because **a batch boundary is still a boundary between two
different readings**.

Moving to a dedicated speech service (Google Cloud Text-to-Speech) ended it in
one change. A voice id there is a fixed trained speaker: the same id returns the
same speaker every time, forever. That removed batch boundaries, silence
splitting, miscut clips, per-model daily quotas, and drift — all at once — and
made **one sentence per request** both the simple thing and the correct thing.

> **If you are on a language-model TTS and cannot switch**, the mitigation is
> batching: 8 sentences per request (measured — an 18-line single take spread
> 46 Hz of pitch, 8-line batches 16 Hz), a verified split that retries rather
> than guessing where a sentence ended, and a re-render loop. Treat it as a
> workaround, not a design.

**Volume is forced, on every service.** Two-pass ffmpeg `loudnorm` to a fixed
target (EBU R128, −18 LUFS). Measured on the shipped set: ±0.3–0.7 dB within a
video, every video landing on the same target so they match each other too. This
is worth doing even with a fixed speaker — it is the one number a service will
not hold steady for you.

**Every narration line must be a full sentence — 8 words or more.** Integrated
loudness needs enough audio to measure against; a two- or three-word clip
("Create Curriculum.") lands off target and blows the video's volume spread,
and also trips miscut and speaking-rate checks. If a step needs an action the
narration does not describe, run it untimed rather than inventing a stub line.

### The gate — measure IDENTITY, not expressiveness

Measure per clip and report across the video: loudness (LUFS), pitch (median
fundamental, Hz), speaking rate (energy peaks/sec), and **miscut clips** — a
clip whose length is far from what its sentence should take to say.

**Gate on the MEAN pitch, not the within-video spread.** This is the correction
that matters, and it was found by running the gate against twelve videos a human
had already confirmed sounded perfect: **a ±35 Hz spread threshold failed nine
of them.** Within-video pitch spread is ordinary sentence intonation — a
question rising, a list falling, a short line sitting higher — and flattening it
would make the narration robotic. The speaker-identity signal is the mean: across
those same twelve videos it sat in a 7 Hz band (102–109 Hz), which is what a
fixed speaker looks like.

Working thresholds: volume ±1.5 dB, mean pitch inside a band calibrated from
known-good output, rate ±5.5/s, zero miscuts.

> **Calibrate a gate against output a human has approved, before trusting it.**
> A gate that fails most of your known-good work is measuring the wrong thing,
> and the cost of believing it is re-rendering audio that was already correct.

**Ensure, don't just check.** Render → measure → re-render if it fails (3
attempts, then halt rather than ship). Even with a fixed speaker this catches a
bad take: `build-a-course` failed its first attempt on volume and passed the
second.

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

## Step 7 — VERIFY before showing the user

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
7. **The cast is named throughout** — grep the finished narration for "the
   student", "the course", "a user", "the aircraft". After the cast is
   introduced, each of those is a line that should say a name instead.
8. **Data was entered, not described** — any step whose sentence explains what a
   field is for should be typing into that field. A form that stays empty while
   the narration explains it is the clinical failure this exists to prevent.
9. **Every dropdown was opened and picked** — grep the spec for `highlight(`
   on a select; each one should be `choose()`. The step log records `choose`
   as its own action, so count them against the number of selects in the flow.

Then show the user each video as it finishes, not in a batch at the end.

---

## Quota and auth — only if you are on a language-model TTS

A dedicated speech service typically bills per character with no per-model daily
cap, and authenticates with a cloud login rather than an API key (Google Cloud
TTS is OAuth-only — it refuses an API key, and needs a quota project). If that is
what you are on, this section does not apply.

On a language-model TTS the quota rules bite hard:

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
e2e/walkthrough/runtime.ts               step(), highlight(), click(), enter(), choose(), act(), goTo()
e2e/walkthrough/cast.mjs                 the demo's cast — every name said aloud
e2e/walkthrough/signin.ts                shared sign-in + the tenant constant
e2e/walkthrough/manifest.ts              loads narration; skips if audio is missing
e2e/walkthrough/preflight.spec.ts        checks every target without recording
scripts/walkthrough-voice-gcloud.mjs     the narrator — fixed-voice TTS, one sentence/request
scripts/walkthrough-voice.mjs            SUPERSEDED — batched language-model TTS
scripts/walkthrough-voice-check.mjs      volume spread + MEAN-pitch identity + miscuts; exit 4
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
