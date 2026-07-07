# GSD-T: Stories — Dev-Handoff User Stories (Tekyz format) from any source

You are generating a **development-team handoff document** in the Tekyz user-stories format: discrete user stories with workflows, grouped acceptance criteria, per-story flow diagrams (Mermaid rendered to embedded images), and mapped test cases. Input can be a GSD-T **scan register**, a **requirements doc**, a **design contract**, or an **existing codebase** (reverse-engineered). `$ARGUMENTS` may carry `--input <path>`, `--source <scan|requirements|design|code>`, `--prefix <PREFIX>`, `--phase-filter <MVP|...>`, `--docx`.

**Canonical format reference (READ FIRST):** `~/.claude/playbooks/tekyz-user-stories-format.md` if present, else the bundled `templates/playbooks/tekyz-user-stories-format.md` in the GSD-T package. It encodes the exact structure + wording conventions reverse-engineered from the Tekyz sample (`Compass_Sample_PRD_2.docx`). This command FILLS that format from the real input.

> **Client/dev-team deliverable — distinct from `/gsd-t-prd`.** `/gsd-t-prd` writes the INTERNAL `docs/prd.md` that feeds the GSD-T pipeline. THIS command emits an EXTERNAL, dev-ready handoff doc in the Tekyz user-story style, saved to `share/`.

## Step 0: Inputs + Source Classification

1. **Resolve the input** (from `$ARGUMENTS --input`, else auto-detect in priority order): `.gsd-t/techdebt.md` (scan) → `docs/requirements.md` → `.gsd-t/contracts/design-contract.md` / `.gsd-t/contracts/design/` → the codebase itself. If none usable → ask the user what to document.
2. **Classify the source** so the extraction method matches:
   - **scan register** → stories derive from the functional gaps/features implied by findings (each cluster of related TDs → a story; Reqs cross-ref the TD-N ids).
   - **requirements doc** → each requirement / requirement-group → a story (Reqs cross-ref R-N/FR-N).
   - **design contract** → each screen/widget/flow → a story.
   - **codebase (reverse-engineer)** → walk real features (routes, pages, flows) and reverse-engineer the discrete user stories + test cases from what's built. **Use the code graph** (`gsd-t graph cluster` / `who-imports` / `who-calls`) to find feature clusters and real interaction paths — do NOT grep-guess the architecture.
3. **Derive the story-id `PREFIX`** from the product name (Compass→`CMPS`, NiceNote→`NN`, Newman Avatar→`NAV`) unless `--prefix` is given. Confirm with the user.
4. **Confirm scope** — which phases/epics to include — before generating.

## Step 1: Application Flow Overview (§1)

Produce the numbered end-to-end user journey (1..N major steps, plain language). Then author the **app-flow chart** as a single Mermaid flowchart of the whole journey and render+embed it (Step 4). This is the reader's map before the story detail.

## Step 2: Decompose into Epics + Stories (§2)

Group functionality into **Epics** (`EP-NN: <name>`), each with a `Phase:`. Under each epic, emit discrete stories. **A story is ONE coherent capability a user exercises** — not a whole feature area, not a single UI control. Right granularity = the sample's (e.g. "Avatar renders full-screen with state indicators" is one story; "Session controls: pause/resume/end" is another).

For EACH story, author in EXACTLY this order (per the format reference):

1. **`<PREFIX>-NNN — <Story Title>`** (sequential, zero-padded).
2. **Meta line** — `*Phase: … | Reqs: <source ids> | Test Cases: <N>*`. `Reqs:` cross-references the source (TD-N / R-N / FR-N); `Test Cases:` = row count of this story's table.
3. **Story:** `*As a <role>, I want <capability>, so that <benefit>.*` (strict template, one sentence.)
4. **Workflow:** numbered concrete interaction steps (user action → system response), present tense.
5. **Acceptance Criteria:** bulleted, **grouped by sub-area** with a bold sub-heading per group; include error/edge/recovery groups. Each bullet one testable assertion.
6. **Flow Diagram:** a per-story Mermaid flowchart of THIS story's workflow → rendered PNG → embedded (Step 4).
7. **Mapped Test Cases:** table `TC ID | Type | Test Title | Expected Result`. `TC-NNN` sequential across the whole doc; `Type` ∈ {Positive, Negative, Edge}; cover happy-path + failure + boundary; every acceptance-criteria group represented by ≥1 test case.

**No confabulation** (`feedback_no_confabulated_examples`): every story, workflow step, and test case must trace to something in the actual input source. If the source is silent on a needed detail, mark it a `[TODO: confirm with client]` — never invent product specifics.

## Step 3: Scope Summary (§3)

A table mapping every story → phase → epic: `| Story ID | Title | Phase | Epic |`. Gives the team the MVP-vs-later-phase picture at a glance.

## Step 4: Diagrams — Mermaid rendered to EMBEDDED images (MANDATORY method)

Per the standing directive, diagrams are authored as Mermaid but **embedded as rendered images** (matching the sample's `<img>` flow charts) — NOT left as raw Mermaid text.

1. Write each diagram's Mermaid source to `.gsd-t/user-stories/diagrams/<name>.mmd` (app-flow = `app-flow`, per-story = `<PREFIX>-NNN-flow`).
2. Render each to PNG beside the deliverable: `mmdc -i <src>.mmd -o share/media/<name>.png` (Mermaid CLI `@mermaid-js/mermaid-cli`; fall back to `npx @mermaid-js/mermaid-cli -i … -o …`).
3. **If `mmdc` is unavailable → HALT** and tell the user to install it (`npm i -g @mermaid-js/mermaid-cli`). Do NOT silently ship raw Mermaid where an embedded image is expected (`feedback_no_silent_degradation`).
4. Embed each rendered PNG in the markdown at its `Flow Diagram:` / §1 position: `![Flow Diagram](media/<name>.png)`.
5. Keep the `.mmd` source (editable, version-controllable) alongside the PNG.

## Step 5: Assemble + Deliver

1. Assemble front matter (product, "Prepared by Tekyz Inc.", version, source-of-truth note; SAMPLE disclaimer only if illustrative) + §1 + §2 + §3.
2. **Write the markdown** to `share/<Repo>-user-stories.md`, with rendered diagram PNGs in `share/media/`.
3. **If `--docx`** (or the user wants Word): convert with `pandoc share/<Repo>-user-stories.md -o share/<Repo>-user-stories.docx` — pandoc embeds the PNGs as real Word images, matching the handoff sample. Report if pandoc is missing (don't fail the markdown).
4. **Report:** story count, epic count, total test cases, diagram count, and the output paths.

## Document Ripple

- New deliverable(s): `share/<Repo>-user-stories.md` (+ `.docx` if requested) + `share/media/*.png` + `.gsd-t/user-stories/diagrams/*.mmd`.
- No living-doc changes (this is an external handoff artifact) — but log a `.gsd-t/progress.md` Decision Log entry noting the deliverable + source.

## ▶ Next Up

Standalone command — no auto-successor. After generating, hand the `share/<Repo>-user-stories.md` (or `.docx`) to the development team.
