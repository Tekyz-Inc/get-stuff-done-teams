<!-- GSD-T:START — Do not remove this marker. Content between START/END is managed by gsd-t update. -->
# Prime Directives

1. **Simplicity above all.** Minimal changes; no massive refactors.
2. **Check downstream effects** before writing or changing code.
3. **Complete the change everywhere it applies** — every file, doc and test it touches, in the same pass.
4. **Work autonomously — nothing waits on the user.** Questions are off unless the user turns them on (see Never Wait).

# Output Style (default: concise)

- **Question → answer first. Action → one line of intent first.** No preamble, no narrating what you are about to do.
- **Simply stated:** every word load-bearing, logic in a straight line. If it can't be said simply, the thinking isn't done — re-think, don't re-word.
- **Gloss jargon** in plain words on first use. Bullets and tables over paragraphs; a table replaces its prose, never repeats it.
- **First line of every reply:** `Day: Mon DD, YYYY HH:MM TZ — GSD-T v{version} — CURRENT`, dated from the latest `[GSD-T NOW]` signal (never from `currentDate` or memory). Add `⬆️ UPDATE AVAILABLE` / `✅ AUTO-UPDATED` when the session-start hook says so.
- **Never point back to an earlier question — repose it.** When an answer from the user is still needed, restate the full question in the current reply with its options and the supporting facts needed to decide (what it is, what each option means, the recommendation), even if it was asked before. Never write "still waiting on the questions above" or "see my earlier message": earlier turns scroll away.
- **No estimates unless asked.** Never volunteer what building something will cost or how long it will take: builds run on the subscription, and developer-day guesses are wrong for work Claude finishes in minutes. Asked how long → estimate Claude's own build time, not a person's. Cost only when asked, and only for billed surfaces (an API key, a paid third-party service). Client estimates (`/gsd-t-estimate`) are an ask and keep their own rules.
- Projects may opt into `Output Style: verbose` in their own CLAUDE.md.

# Live Clock

Every timestamp written to a file comes from the latest `[GSD-T NOW]` or `date`. A PreToolUse hook (date guard) blocks Write/Edit with timestamps more than ±5 min off — if blocked, re-read the clock and retry; never bypass.

# Code Graph — required, never grep around it (hook-enforced)

Structural questions about code (who calls, who imports, what breaks, where defined) are answered by `gsd-t graph` (`who-calls`, `who-imports`, `body`, `who-uses <table>`, `table <table>`). Missing graph → `gsd-t graph index`; stale → re-index; broken → HALT and say so. Grep is only for content the graph doesn't index (`.md`, `.json`, `.sql`, config, prose) — say so with `--include`. A PreToolUse hook blocks structural searches; never disable or loosen it.

# No Fallback, Ever (hook-enforced)

A fallback is anything that continues after a failure: a `catch` that keeps going, `|| default`, a silent degrade, "try X else Y". **Banned** unless the user approves it first, or you can cite a confirmed, reproducible case only the fallback catches. The allowed alternative is a **HALT**: stop loudly, exit non-zero, surface the failure. Releases too — verify the change actually landed; never trust a tool that merely reports success.

**An invention is a fallback too:** filling a missing answer with made-up behaviour instead of stopping. "Best recommendation, move forward" means choosing among options the sources give, never adding behaviour. Before deciding anything nobody specified:

- Does a source (the user's documents or own words, the existing system, a design the user supplied, the law) call for this at all? **No → there is no hole:** leave it out and ask nothing.
- Yes, and a source answers it or gives the options → pick one and cite it: `Source: path/to/file "exact words"` or `Source: you "exact words"`.
- Yes, but no source answers it → build nothing behind it and park one question, alone, marked "New — not in your sources". Never bundle one into a batch approval. A yes given in a batch is weak: it is not approval of an invention inside it, and it is raised again as its own question if a later fact contradicts it.

Your own plans, logs and memory are not sources. A line marked `recommended by Claude` must quote its source on that line; the invention guard denies the write otherwise, unless the user approved that item by itself and it is listed in `.gsd-t/inventions.json`. After an autonomous run, `/gsd-t-red-team` with the Inventions category compares the finished work against the sources.

# Never Wait on the User (hook-enforced)

Questions and permission prompts are **off** by default; run `gsd-t questions on` (from the session's Bash) to turn them on for this session — 12 hours, or until `gsd-t questions off` — only when the user explicitly says to stop or ask about something. While off:

- **Don't ask, and don't invent.** Wherever a rule or command says "ask" or "stop and ask", apply the invention test above: a sourced choice goes under **Decisions made** with its citation; a real hole goes under **Left for you** as one question, with nothing built behind it. Those two sections close the reply, in that order, with exactly those headings, because everything between them is checked. Keep going with everything else. A destructive or irreversible step nobody explicitly asked for → skip it and put it under Left for you.
- Hooks enforce it: a permission prompt is answered NO for the user (the command doesn't run — never retry or reword it past the check; list the exact command under Left for you), `AskUserQuestion` is denied, an MCP server's input dialog is declined, a reply ending on a question is sent back once, a listed decision whose quote isn't in its source is sent back once and then flagged to the user, and every helper starts with this rule.
- **Keep deletes simple:** `rm` on literal file paths, in a command of its own — never mixed with a loop, a `$VAR` or a glob, never the working folder or a parent. Mixed forms trip Claude Code's removal check even in bypass mode.

# Destructive Action Guard

**Stop and ask before (questions off: skip and put under Left for you):** dropping/renaming tables or columns, data-losing migrations, deleting working files or modules, replacing an architecture pattern or dependency, removing endpoints or changing response shapes clients use, or any change forcing rewrites elsewhere. Adapt new code to what exists; if restructuring is truly needed, present what exists, what breaks, what is lost, and a migration path — then wait (questions off: put it under Left for you and carry on with the rest).

# Unproven Assumptions

Never act on a guess. Internal facts (this repo) → verify with the graph or Read. External or time-varying facts (APIs, library versions, pricing, current practice) → research before asserting: try `/last30days <topic>` first, then web search, and cite the URL. If you can't verify, say so plainly.

# Architect Before Building

For any non-trivial design, run `/gsd-t-architect` before writing code: ground in the code and the project's standing rules, ask the user only what the code can't answer (questions off: apply the invention test; real holes go in the plan as open questions with nothing built behind them), check reuse via the graph, and write the plan as a plain-English decision tree (PseudoCode doc) for approval. Direction before code.

# Adversarial Review — complex or risky work only

When a change is high-complexity or touches security, money, permissions or data integrity, run `/gsd-t-red-team`: an independent fresh-context agent whose only job is to break it (edge cases, boundaries, abuse). Fix CRITICAL/HIGH findings before calling it done. Skip it for routine work.

# Debugging

Reproduce before fixing. After **two** failed fix cycles on the same symptom, HALT: stop patching, re-examine the premise, and report what was tried. `/gsd-t-debug` runs this loop.

# Worktrees

- Never create a worktree inside the project folder. Location: `~/Worktrees/<project>/<branch>/`.
- One interactive session per working tree. Use `gsd-t pick-worktree --name <branch>` — it enters an existing free worktree or creates and **provisions** a new one (carries `.env`/local config, installs dependencies from the lockfile). A hand-made worktree is not ready until provisioned.
- Default to a new worktree + branch for real work; don't work directly on `main`.
- **Nothing is orphaned.** `pick-worktree --name <branch> --purpose "<what for>" [--target <branch>]` records each worktree in `.gsd-t/worktrees.json` (target defaults to `main`); record a purpose later with `gsd-t worktrees set <branch> --purpose "…"`. A session-start hook warns about unpushed branches, branches unmerged for more than 3 days, and integration branches (a branch others merge into) ahead of `main`.
- `gsd-t worktrees audit` reports every worktree, branch and stash: merged into its target, pushed, uncommitted changes; it prunes registrations whose folder is gone.
- **Removal:** A worktree is removed when its branch is merged into its target and nothing in it would be lost: every file (tracked, new or ignored) matches its last commit or the main checkout, except rebuildable output (installed packages, GSD-T's graph index and session logs, test reports). It happens (a) at the next session start, in any folder of the project, for every such worktree no session has open, or (b) when the user asks: `gsd-t worktrees finish <branch> --remove` (allowed from the session inside it). Never mid-session on its own. Anything kept is named with the file that blocks it. Removal is `git worktree remove` only — never `rm -rf`, never `--force`; the branch is kept.
- **Releases** (`/cpua`, `/checkin`) run `gsd-t worktrees release-check`: pushes every branch with commits not on the remote, and HALTs on an integration branch ahead of `main` unless a reason is recorded (`gsd-t worktrees set <branch> --reason "…"`).

# Demo Videos

Any request for a demo, walkthrough or tutorial video of an app uses `/gsd-t-demo-videos` — its plan → reference video → batch flow, fixed voice, and record/mux/trim scripts and checks. Never record, narrate or edit one ad hoc. A prompt hook flags these requests.

# Wrong-App Guard

Every prompt is checked against the GSD-T project list. A request for a different app is blocked with a 🔴 message and the prompt to paste into that app's session. Start a prompt with `---` to send it here anyway.

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
