# GSD-T: Setup — Generate or Restructure Project CLAUDE.md

You are generating or restructuring the project-level CLAUDE.md for the current project. The goal is a well-structured file that complements the global `~/.claude/CLAUDE.md` without duplicating it.

## Step 1: Read Global Context

Read `~/.claude/CLAUDE.md` to understand what's already covered globally:
- Prime Directives
- GSD-T workflow, commands, living documents
- Versioning, Destructive Action Guard, Pre-Commit Gate
- Autonomous Execution Rules, Workflow Preferences defaults
- Code Standards defaults

**Rule**: Anything in the global file should NOT be repeated in the project file. The project file only contains project-specific information and overrides.

## Step 2: Scan the Project

Gather as much as possible automatically:

### 2a: Project Identity
- Project name from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, repo name, or directory name
- Description from package manifest or README

### 2b: Tech Stack Detection
Scan for and identify:
- **Language**: from file extensions, configs (`tsconfig.json`, `pyproject.toml`, `go.mod`, etc.)
- **Framework**: from dependencies (`package.json`, `requirements.txt`, `Pipfile`, etc.)
- **Database**: from dependencies, config files, docker-compose, `.env` vars
- **Frontend**: from dependencies, directory structure (`client/`, `src/components/`)
- **Testing**: from test configs (`vitest.config`, `pytest.ini`, `jest.config`, etc.)
- **Deployment**: from `Dockerfile`, CI/CD configs, cloud configs

### 2c: Project Structure
- Scan directories to build "Where Things Live" table
- Identify key entry points, config files, and module boundaries

### 2d: Existing Conventions
- **Naming**: Sample 5-10 files and functions to detect naming patterns (snake_case, camelCase, kebab-case, PascalCase)
- **File organization**: Flat, feature-based, layer-based?
- **Import style**: Absolute, relative, aliases?

### 2e: Existing Documentation
- Check for `docs/` directory and which living documents exist
- Check for `.gsd-t/` directory (already initialized?)
- Check for `.env.example` or environment docs

### 2f: Git State
- Current branch (for Branch Guard)
- Remote URL (for reference)

## Step 3: Check Existing CLAUDE.md

### If CLAUDE.md exists:

Read it and categorize every section:

1. **Project-specific (KEEP)**: Overview, Tech Stack, Branch Guard, Where Things Live, Conventions, Testing, Environment Variables, Deployed URLs, Reference Projects, project-specific "Don't Do" rules
2. **Global duplicate (REMOVE)**: Anything that duplicates the global CLAUDE.md — Prime Directives, GSD-T workflow descriptions, Destructive Action Guard (unless project-specific additions), Pre-Commit Gate, Autonomous Execution Rules
3. **GSD/legacy sections (MIGRATE)**: `## GSD Workflow Preferences` or similar → extract project-specific preferences into `## Workflow Preferences` using the new format
4. **Stale content (FLAG)**: Sections that reference outdated tech, removed features, or incorrect paths

Present findings to user:
```
CLAUDE.md Analysis:
  KEEP:    {N} project-specific sections
  REMOVE:  {N} sections that duplicate global CLAUDE.md
  MIGRATE: {N} GSD sections → Workflow Preferences format
  FLAG:    {N} potentially stale sections
```

### If no CLAUDE.md exists:

Note: "No existing CLAUDE.md — will generate from scratch."

## Step 3.5: Read what actually happened here

Before writing anything, read the project's own history. A rule that keeps
getting broken is the rule that most needs writing down, and nobody remembers
those on request — they have to be found.

```bash
node bin/gsd-t-project-history.cjs --project . --json
```

Three sources, cheapest first. Each reports whether it was there; a missing one
is **named**, never skipped in silence:

| Source | What it gives |
|---|---|
| Git | Files fixed the same way repeatedly, and real reverts |
| Decision log | Directives already recorded, with dates |
| Past sessions | What the user typed when something kept going wrong |

Session history is large — one project holds 315 MB — so the tool funnels it:
keep only the user's own turns, drop pasted logs, keep only complaint-shaped
lines. Under a second, and the result fits in context.

**If it exits 4, there is no history at all.** Do not carry on and write a
thinner file. Stop and ask:

```
Sources found: git 67 commits | decision log 1 line | sessions 0 | contracts 0

I can mine 0 rules from this project's history.

  a) Write stack and commands only — the rules section left out, with the
     reason written into the file. Not a normal CLAUDE.md.
  b) You dictate the rules now.
  c) Stop.
```

Whichever they pick, the gap goes **into the generated file** — "Rules: none
derivable, no project history" — so thinness stays visible rather than reading
as "this project has no rules."

## Step 4: Show the rules found, and let the user tick them

Do **not** ask the user to recall rules. Mine every rule the project already
states, and let them confirm:

```bash
node bin/gsd-t-rule-mine.cjs --project . --top 12
```

Six sources, ranked by how many agree — a rule found in three places ranks top,
because repetition is the evidence. The output is a tick-list:

```
12 candidate rules for binvoice. Tick the ones that must NEVER be broken.

     RULE                                                    SEEN IN
 1 [ ] NEVER contact the buyer directly                      CLAUDE.md (HC-003)
 2 [ ] TEXT-FIRST capture (enforced by a pre-write gate)     CLAUDE.md (HC-004)
 3 [ ] NEVER scan the whole page                             CLAUDE.md (HC-005)

Tick numbers (e.g. 1,3,4) or 'all':
```

The right-hand column is what makes this fast — the user is confirming
something they already said, not recalling it. **Cap the screen at 12.**
Anything below goes to `.gsd-t/setup-rules-full.md`; nothing is dropped.

**Never invent a rule.** Every one comes from somewhere in the project, and the
tick-list shows where. A rule the user did not tick is not inviolable — it may
still belong elsewhere in the file, but not in that section.

**Determine these by reading, never by asking:**

| | How |
|---|---|
| Which branch | `git branch --show-current` |
| Where the repo misleads | Two version fields disagreeing, a legacy path that still looks live |
| Which files are dangerous | Fixed 5+ times in the git history |
| Stack, build, test | The manifest |

**Ask only if genuinely unresolvable:** the autonomy level when no existing
CLAUDE.md declares one, and deployed URLs when nothing records them.

## Step 5: Generate CLAUDE.md

Use the mold at `templates/CLAUDE-project.md`. It is a real mold — do NOT copy
any existing project's file, and never GSD-T's own.

**Every section may be left out, with the reason stated. None may be padded.**

| Section | Include when | Fill from |
|---|---|---|
| Title + one-line what-this-is | Always | The manifest, the README |
| **Rules that can never be broken** | The user ticked at least one | Step 4's tick-list, verbatim |
| Where the repo misleads you | Reading the code gives a confident wrong answer | Determined, never asked |
| Files riskier than they look | Some file was fixed 5+ times | Git history |
| Where this differs from global | A genuine difference exists | Compared against `~/.claude/CLAUDE.md` |
| Stack and commands | Always | The manifest |
| Where things are written down | Always | Fixed pointers |

**Target 40–70 lines.** If it is longer, something in it is either restating a
global rule or repeating what the repo already says.

### What must never appear

| Never | Why |
|---|---|
| Anything the global file already says | Three projects each paste the entire Destructive Action Guard verbatim — 15 wasted lines apiece |
| Anything a hook or gate enforces | The machine does not read this file |
| A version number, a line count, "currently in progress" | Wrong within a week. It belongs in `progress.md` |
| A file listing, a dependency list, a command count | The repo answers it, and answers it currently |
| A rule nobody stated | Every rule comes from the tick-list, and the tick-list shows its source |

### The line that matters most

A rule states **what must never happen and what breaks if it does**. If it is
enforced by a hook or a gate, say so — the reader should know a machine is
watching:

```
- **Never touch facebook.com** — no permissions, no requests, no DOM writes.
  A single write turns a read-only observer into an actor on someone else's
  account. Enforced by a pre-write gate.
```

Not: *"Be careful with Facebook interactions."*
## Step 5.5: Quality North Star Configuration

After generating the CLAUDE.md content (Step 5) and before presenting it to the user, offer a Quality North Star section if one is not already present.

**Skip this step if the existing or generated CLAUDE.md already contains `## Quality North Star`.**

Ask the user:
```
Would you like to define a Quality North Star for this project?
This is a 1–3 sentence quality identity that subagents read at execute time to calibrate
their judgment. It does not add procedural rules — it shapes what "excellent" means here.

Options:
  [1] library  — "Published npm library: intuitive API, well-documented, backward-compatible, type-safe, zero-dep."
  [2] web-app  — "User-facing app: accessible, performant, visually consistent. UX is the product."
  [3] cli      — "Developer CLI: fast, predictable, clear output. Error messages explain what went wrong and how to fix it."
  [4] custom   — Write your own 1–3 sentences
  [5] skip     — No Quality North Star (can add later via /gsd-t-setup)
```

If the user picks 1–3, use the corresponding preset text from the table below.
If the user picks 4, ask: "Describe what 'excellent' means for this project in 1–3 sentences."
If the user picks 5, skip the section entirely.

| Preset ID | Text |
|-----------|------|
| `library` | `This is a published npm library. Every public API must be intuitive, well-documented, and backward-compatible. Type safety and zero-dependency design are non-negotiable.` |
| `web-app` | `This is a user-facing web application. Every feature must be accessible, performant, and visually consistent. The user experience is the product.` |
| `cli` | `This is a developer CLI tool. Every command must be fast, predictable, and produce clear output. Error messages must explain what went wrong and how to fix it.` |

Insert the chosen section into the generated CLAUDE.md content before `## GSD-T Workflow`:

```markdown
## Quality North Star

{selected preset text or custom text}
```

If the project already has a `CLAUDE.md` with `## Quality North Star`, the generated file preserves the existing section. Do not overwrite user-customized personas.

## Step 5.6: Design Brief Generation (UI Projects)

After the Quality North Star step, check for UI/frontend signals in this project. If detected, offer to generate a design brief.

**Skip this step if `.gsd-t/contracts/design-brief.md` already exists** — user-customized briefs are authoritative. Log: "Design brief: skipped — existing brief preserved."

### Detection — check for ANY of the following

| Signal | How to check |
|--------|-------------|
| React, Vue, Svelte, Next.js | in `package.json` dependencies |
| Flutter | `pubspec.yaml` exists |
| CSS/SCSS files | `.css`, `.scss`, `.sass` files in project |
| Component files | `.jsx`, `.tsx`, `.svelte`, `.vue` files in project |
| Tailwind config | `tailwind.config.js` or `tailwind.config.ts` exists |

If NO signals detected → skip this step entirely. Do not mention it to the user.

If signals detected, ask the user:
```
UI/frontend signals detected ({list signals found}).
Would you like to generate a design brief at .gsd-t/contracts/design-brief.md?
This gives subagents a consistent visual language reference (colors, typography, spacing, patterns).

  [1] Yes — generate now (sources: Tailwind config if exists, then project defaults)
  [2] No — skip for now (can generate later by re-running /gsd-t-setup)
```

If user picks 1: generate `.gsd-t/contracts/design-brief.md` using the format defined in `.gsd-t/contracts/design-brief-contract.md` (or the standard format):
- Extract color palette from `tailwind.config.js/ts` → `theme.colors` if available; else use web defaults
- Extract fonts from `theme.fontFamily` if available; else use system fonts
- Read `## Quality North Star` from `CLAUDE.md` for Tone & Voice (skip if absent)
- Fill remaining fields with sensible defaults and `{placeholder}` markers for user to complete

Log in `.gsd-t/progress.md` Decision Log (if `.gsd-t/` exists): `- {date}: Design brief generated at .gsd-t/contracts/design-brief.md`

## Step 6: Present and Confirm

Show the generated CLAUDE.md content to the user with a summary:

```
Generated CLAUDE.md for {Project Name}:
  Sections: {N} ({list of section names})
  Auto-detected: {tech stack, conventions, structure}
  From existing: {N} sections preserved
  Removed: {N} global duplicates

{Show the full generated content}

Write this as CLAUDE.md? (This will replace the existing file if one exists.)
```

Wait for user confirmation before writing.

## Step 7: Write and Verify

1. Write the CLAUDE.md file
2. Verify it's valid markdown (no broken tables, unclosed code blocks)
3. If `.gsd-t/progress.md` exists, log the setup in the Decision Log

## Document Ripple

### Always update:
1. **`.gsd-t/progress.md`** — Log "Project CLAUDE.md generated/restructured via gsd-t-setup" in Decision Log (if .gsd-t/ exists)

### Skip: No other files are affected by CLAUDE.md generation.

## Test Verification

No tests to run — this command produces a configuration file, not code.

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
