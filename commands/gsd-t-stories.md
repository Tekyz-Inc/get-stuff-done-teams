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
6. **Flow Diagram** (the LAST-but-one section; the diagram carries its OWN title banner INSIDE the image — see Step 4d — so there is NO external `Flow Diagram:` markdown label and NO footer label): a per-story Mermaid flowchart of THIS story's workflow → rendered PNG (with in-image title) → embedded (Step 4).
7. **Mapped Test Cases** (the LAST section of every story — each story ENDS here): a colored table `TC ID | Type | Test Title | Expected Result` (styling in Step 4e). `TC-NNN` sequential across the whole doc; `Type` ∈ {Positive, Negative, Edge}; cover happy-path + failure + boundary; every acceptance-criteria group represented by ≥1 test case.

**Pagination (MANDATORY — hard rule, exactly as stated):**
- **Each Epic (`EP-NN`) starts a NEW PAGE** (page-break BEFORE the epic heading).
- **The FIRST story of that epic flows on the SAME page** as the epic heading (no break between them).
- **Each SUBSEQUENT story in the same epic starts a NEW PAGE** (page-break BEFORE that story's `PREFIX-NNN` heading).
- Because every story ENDS with its Mapped Test Cases table, a page thus contains exactly one story (or epic-heading + first story). Enforce in `.docx` via page-break-before on epic headings and on every non-first story heading.

**Heading placement + no orphans (MANDATORY layout rules):**
- **Each section label sits ABOVE the content it introduces — never below it.** `Mapped Test Cases:` immediately PRECEDES its table; `Workflow:` precedes its steps; `Acceptance Criteria:` precedes its bullets. A label rendered after/below its block is a defect. (The Flow Diagram is the EXCEPTION — it has NO external label; its title is baked into the image, Step 4d.)
- **Headings must NOT be orphaned across a page break.** A section label (`Mapped Test Cases:`, a story `PREFIX-NNN` title, an epic `EP-NN`) must stay on the same page as at least the first line of its content (keep-with-next). Enforce with `keepNext` on heading paragraphs in the `.docx` conversion. With the pagination rule above (one story per page), orphaning is largely prevented structurally, but keep-with-next remains the backstop.

**No confabulation** (`feedback_no_confabulated_examples`): every story, workflow step, and test case must trace to something in the actual input source. If the source is silent on a needed detail, mark it a `[TODO: confirm with client]` — never invent product specifics.

## Step 3: Scope Summary (§3)

A table mapping every story → phase → epic: `| Story ID | Title | Phase | Epic |`. Gives the team the MVP-vs-later-phase picture at a glance.

## Step 4: Diagrams — Mermaid rendered to EMBEDDED images (MANDATORY method)

Per the standing directive, diagrams are authored as Mermaid but **embedded as rendered images** (matching the sample's `<img>` flow charts) — NOT left as raw Mermaid text.

### 4a. Semantic coloring (MANDATORY — never flat single-color)

Every diagram MUST use **intelligent, role-based coloring** — NOT mermaid's default flat purple. Assign each node a `class` by its ROLE and define matching `classDef`s. Standard palette (green=go/success, orange=decision, red=destructive, blue=new/optional, purple=screen/state, grey=terminal):

```mermaid
%% put at the TOP of every flowchart:
classDef start     fill:#fff,stroke:#333,color:#000;                         %% start/end terminals (ellipse)
classDef decision  fill:#fdebc8,stroke:#e8a33d,color:#7a4f00;               %% decisions (diamonds)
classDef screen    fill:#ece9fb,stroke:#8b7fd6,color:#2d2160;              %% screens / states
classDef action    fill:#d4f4dd,stroke:#4caf72,color:#0f5132;             %% success / go / user actions
classDef destructive fill:#fde2e2,stroke:#e06666,color:#7a1f1f;           %% end / delete / irreversible
classDef newfeat   fill:#e2f0fb,stroke:#5b9bd5,color:#1f4e79,stroke-dasharray:4 3; %% NEW / optional (dashed)
```

- **Decisions** are diamonds `{...}` classed `decision`; **terminals** (start/end) are stadium/round `([...])` classed `start`; **screens/states** classed `screen`; **success/go paths** classed `action`; **destructive/irreversible** (End, Delete) classed `destructive`; **new/optional** classed `newfeat` (dashed).
- Label decision-branch edges (`-->|Yes|`, `-->|Returning User|`).
- Reference the sample styling in `~/.claude/playbooks/tekyz-user-stories-format.md`.

### 4b. Fit-to-page by ASPECT-RATIO CONTAIN (MANDATORY — the deterministic method)

The whole diagram MUST fit inside the page's visible area. **Compare aspect ratios first, then clamp ONLY the constraining dimension** — this is the standard "contain" fit; it guarantees no clipping and no distortion. Do NOT eyeball it or rely on layout luck.

**Page dimensions** (the visible printable area) default to **US Letter portrait content box ≈ 6.5in × 9in** (W×H, i.e. 8.5×11 minus 1in margins) unless the deliverable specifies otherwise. Because the diagram carries its OWN title banner INSIDE the image (Step 4d) — there is NO external label above it — the image may use the FULL page box: `avail_width = page_width`, `avail_height = page_height`. `page_AR = avail_width / avail_height`. (The one-story-per-page pagination rule means the diagram owns its page.)

**Algorithm — run per rendered diagram:**
1. **Render** the Mermaid to PNG (Step 4c), then **measure its actual pixel dimensions** `img_w × img_h` (e.g. via `sips -g pixelWidth -g pixelHeight <png>` on macOS, or `mmdc` output metadata). `img_AR = img_w / img_h`.
2. **Compute both aspect ratios** — compare SHAPES, not sizes yet.
3. **Clamp the constraining dimension:**
   - **If `img_AR > page_AR`** (image is *wider* than the page box) → **width is the constraint → set embedded `width = avail_width` (= page_width)** (height scales proportionally, lands ≤ avail_height). *Example: a 5-wide × 4-tall image → set width = page width.*
   - **If `img_AR < page_AR`** (image is *taller* than the page box) → **height is the constraint → set embedded `height = avail_height` (= page_height)** (width scales proportionally). *Example: a 2-wide × 4-tall image → set height = page height.*
   - **If equal** → either works; set width = avail_width.
4. **Embed at that ONE clamped dimension** so the renderer scales the other proportionally. In markdown, use an HTML `<img>` with only the clamped side set (e.g. `<img src="media/<name>.png" width="…" />` or `height="…"`) — never set both (that distorts). For `.docx`, pandoc honors the single dimension.

**Layout still matters as an INPUT to the ratio** (not a substitute for it): choose `flowchart LR` for long linear flows and `TD` for short ones so the rendered `img_AR` is closer to the page shape *before* clamping — this maximizes the final on-page size. But the aspect-ratio clamp above is what GUARANTEES the fit; the direction choice only optimizes how much of the page it fills.

Never ship a diagram wider or taller than the page (`feedback_no_silent_degradation`).

### 4c. Render pipeline

1. Write each diagram's Mermaid source (with the `classDef` block + role classes + fit-appropriate direction) to `.gsd-t/user-stories/diagrams/<name>.mmd` (app-flow = `app-flow`, per-story = `<PREFIX>-NNN-flow`).
2. Render each to PNG: `mmdc -i <src>.mmd -o share/media/<name>.png --width 1600 --backgroundColor white --scale 2 --padding 20` (Mermaid CLI `@mermaid-js/mermaid-cli`; fall back to `npx @mermaid-js/mermaid-cli …`).
3. **If `mmdc` is unavailable → HALT** and tell the user to install it (`npm i -g @mermaid-js/mermaid-cli`). Do NOT silently ship raw Mermaid where an embedded image is expected (`feedback_no_silent_degradation`).
4. **Measure + clamp per the 4b aspect-ratio algorithm:** read the rendered PNG's pixel `img_w × img_h` (`sips -g pixelWidth -g pixelHeight share/media/<name>.png`), compute `img_AR` vs `page_AR`, and pick the ONE clamped dimension (width=page_width if wider, else height=page_height).
5. Embed each rendered PNG at that clamped dimension using an HTML `<img>` with only the constraining side set — e.g. `<img src="media/<name>.png" width="6.5in" />` OR `<img src="media/<name>.png" height="9in" />` (never both). Place it directly where the story's diagram belongs — with NO external `Flow Diagram:` label and NO footer label (the title is in the image, Step 4d).
6. Keep the `.mmd` source (editable, version-controllable) alongside the PNG.

### 4d. In-image title banner (MANDATORY — replaces the external Flow Diagram label)

Each per-story diagram carries its OWN title INSIDE the rendered image — a filled banner at the TOP showing the story id + title (matching the sample: `NWMN-003` bold on line 1, the story title on line 2, on a light-purple fill). This lets the doc DROP the external `Flow Diagram:` markdown label AND any footer label. Implement as the first node(s) of the flowchart, styled as the banner (a full-width `screen`-class node with the two lines), OR via a mermaid `title`/subgraph header styled to match. Font: bold id line + regular title line, dark-purple text (`#2d2160`) on light-purple fill (`#ece9fb`) — the `screen` classDef. The app-flow chart (§1) gets a matching banner with the product name.

### 4e. Mapped Test Cases table coloring (MANDATORY)

The test-case table is COLORED, not plain (matching the sample):
- **Header row:** white bold text on a **purple gradient / solid purple fill** (`#7c5cfc`-ish), all four columns.
- **`Type` cell tinted by value:** **Positive → green** (`#e6f4ea` fill, green text) · **Negative → peach/orange** (`#fdecd8` fill, amber text) · **Edge → blue** (`#e2eefb` fill, blue text). Only the Type cell is tinted; other cells stay white with normal text.
- Markdown tables can't carry cell fills, so for the `.docx` this coloring is applied at conversion (a pandoc pipeline / post-process on the table), OR the table is authored as raw HTML with inline styles that pandoc converts to Word table shading. Keep the plain-markdown table as the editable source; apply the color styling in the rendered/delivered output.

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
