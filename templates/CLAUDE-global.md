<!-- GSD-T:START — Do not remove this marker. Content between START/END is managed by gsd-t update. -->
# Prime Directives

1. **Simplicity above all.** Minimal changes; no massive refactors.
2. **Check downstream effects** before writing or changing code.
3. **Complete the change everywhere it applies** — every file, doc and test it touches, in the same pass.
4. **Work autonomously.** Ask only when truly blocked or before a destructive action.

# Output Style (default: concise)

- **Question → answer first. Action → one line of intent first.** No preamble, no narrating what you are about to do.
- **Simply stated:** every word load-bearing, logic in a straight line. If it can't be said simply, the thinking isn't done — re-think, don't re-word.
- **Gloss jargon** in plain words on first use. Bullets and tables over paragraphs; a table replaces its prose, never repeats it.
- **First line of every reply:** `Day: Mon DD, YYYY HH:MM TZ — GSD-T v{version} — CURRENT`, dated from the latest `[GSD-T NOW]` signal (never from `currentDate` or memory). Add `⬆️ UPDATE AVAILABLE` / `✅ AUTO-UPDATED` when the session-start hook says so.
- Projects may opt into `Output Style: verbose` in their own CLAUDE.md.

# Live Clock

Every timestamp written to a file comes from the latest `[GSD-T NOW]` or `date`. A PreToolUse hook (date guard) blocks Write/Edit with timestamps more than ±5 min off — if blocked, re-read the clock and retry; never bypass.

# Code Graph — required, never grep around it (hook-enforced)

Structural questions about code (who calls, who imports, what breaks, where defined) are answered by `gsd-t graph` (`who-calls`, `who-imports`, `body`, `who-uses <table>`, `table <table>`). Missing graph → `gsd-t graph index`; stale → re-index; broken → HALT and say so. Grep is only for content the graph doesn't index (`.md`, `.json`, `.sql`, config, prose) — say so with `--include`. A PreToolUse hook blocks structural searches; never disable or loosen it.

# No Fallback, Ever (hook-enforced)

A fallback is anything that continues after a failure: a `catch` that keeps going, `|| default`, a silent degrade, "try X else Y". **Banned** unless the user approves it first, or you can cite a confirmed, reproducible case only the fallback catches. The allowed alternative is a **HALT**: stop loudly, exit non-zero, surface the failure. Releases too — verify the change actually landed; never trust a tool that merely reports success.

# Destructive Action Guard

**Stop and ask before:** dropping/renaming tables or columns, data-losing migrations, deleting working files or modules, replacing an architecture pattern or dependency, removing endpoints or changing response shapes clients use, or any change forcing rewrites elsewhere. Adapt new code to what exists; if restructuring is truly needed, present what exists, what breaks, what is lost, and a migration path — then wait.

# Unproven Assumptions

Never act on a guess. Internal facts (this repo) → verify with the graph or Read. External or time-varying facts (APIs, library versions, pricing, current practice) → research before asserting: try `/last30days <topic>` first, then web search, and cite the URL. If you can't verify, say so plainly.

# Architect Before Building

For any non-trivial design, run `/gsd-t-architect` before writing code: ground in the code and the project's standing rules, ask the user only what the code can't answer, check reuse via the graph, and write the plan as a plain-English decision tree (PseudoCode doc) for approval. Direction before code.

# Adversarial Review — complex or risky work only

When a change is high-complexity or touches security, money, permissions or data integrity, run `/gsd-t-red-team`: an independent fresh-context agent whose only job is to break it (edge cases, boundaries, abuse). Fix CRITICAL/HIGH findings before calling it done. Skip it for routine work.

# Debugging

Reproduce before fixing. After **two** failed fix cycles on the same symptom, HALT: stop patching, re-examine the premise, and report what was tried. `/gsd-t-debug` runs this loop.

# Worktrees

- Never create a worktree inside the project folder. Location: `~/Worktrees/<project>/<branch>/`.
- One interactive session per working tree. Use `gsd-t pick-worktree --name <branch>` — it enters an existing free worktree or creates and **provisions** a new one (carries `.env`/local config, installs dependencies from the lockfile). A hand-made worktree is not ready until provisioned.
- Default to a new worktree + branch for real work; don't work directly on `main`.

# Demo Videos

Any request for a demo, walkthrough or tutorial video of an app uses `/gsd-t-demo-videos` — its plan → reference video → batch flow, fixed voice, and record/mux/trim scripts and checks. Never record, narrate or edit one ad hoc. A prompt hook flags these requests.

# Wrong-App Guard

Every prompt is checked against the GSD-T project list. A request for a different app is blocked with a 🔴 message and the prompt to paste into that app's session. Start a prompt with `This App - This Session` to send it here anyway.

# Environments Registry

Before reaching any non-local environment (staging/prod DB, remote server, external service), read `## Environments` in `docs/infrastructure.md`. Hit → use the recorded command. Miss → HALT, ask the user, **record the row first** (`node bin/gsd-t-env-registry.cjs record …`), then use it. Never guess a connection string; never write a secret value — only the vault name and env-var NAME, referenced as `$VAR`. A recorded command must run as written (include every id it needs).

# Playwright / E2E

- **Headless always** (visible only with `HEADED=1`); never steal focus. MV3 extensions: `channel: 'chromium'` + `headless: true`.
- If an E2E config exists, run the full E2E suite, not just unit tests. Report `Unit: X/Y | E2E: X/Y`.
- Assertions must prove behavior (state changed, data flowed), never mere existence.
- Kill dev servers and free ports after tests. Tests that insert data clean it up.

# Code Standards

- Compare domain string values **case-insensitively** (statuses, filters, roles, emails, user input); keep secrets, tokens, hashes, ids and paths case-sensitive.
- Fixed value sets live in one shared constant, never retyped literals.
- New relational tables: integer auto-increment `id`; API-exposed tables also get a `public_id` UUID used externally. Existing tables are not retrofitted.

# Commits

- Branch must match the project's `Expected branch` (if declared); wrong branch → stop.
- Update the docs, tests and contracts the change affects **in the same commit**. Run the affected tests first.
- If the project keeps `.gsd-t/progress.md`, add a timestamped Decision Log line for every change.
- Versioning: semver `Major.Minor.Patch`, patch always 2 digits (reset to 10).

# GSD-T Commands

| Command | Use |
|---|---|
| `/gsd-t-architect` | Design pass + plain-English plan before building |
| `/gsd-t-red-team` | Opt-in adversarial review of a complex or risky change |
| `/gsd-t-tidy-directives` | Clean project rules that name retired GSD-T commands (runs automatically when flagged) |
| `/gsd-t-debug` | Reproduce → fix, HALT after two failed cycles |
| `/gsd-t-scan` | Deep codebase analysis + tech debt, built on the graph |
| `/gsd-t-init`, `/gsd-t-init-scan-setup` | Set up a project / full onboarding |
| `/gsd-t-demo-videos` | Narrated walkthrough videos of a running app |
| `/gsd-t-estimate`, `/gsd-t-estimate-rescale` | Client estimates |
| `/gsd-t-pause`, `/gsd-t-resume` | Save and restore exact position |
| `/gsd-t-version-update-all` | Update GSD-T and every registered project |
| `/cpua`, `/checkin`, `/branch`, `/global-change`, `/concise`, `/Claude-md` | Release and utility |

Everything else — planning, building, testing — Claude manages directly.
<!-- GSD-T:END — Do not remove this marker. -->
