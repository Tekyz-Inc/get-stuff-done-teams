# GSD-T: Guardrails for Claude Code

**v6.0.10** — a small set of commands, hooks and rules that keep Claude Code honest on real projects.

Claude plans, builds and tests directly. GSD-T supplies what a strong model still gets wrong on its own:

- **Code graph** — structural questions (who calls this, what breaks if I change it) are answered from an index, not by grep. A hook enforces it.
- **No fallbacks** — code that quietly continues after a failure is blocked unless you approved it.
- **Architect + red team** — a design pass before building, and an independent attack on risky changes.
- **Worktrees** — one session per working tree, provisioned so it actually runs.
- **Environments registry** — connection details written down once, never guessed, never holding a secret.
- **Demo videos and client estimates** — two production pipelines Tekyz uses every week.

v6 removed the milestone → partition → plan → execute → verify chain and everything built around it. See [CHANGELOG.md](CHANGELOG.md) for the full cut list and [docs/methodology.md](docs/methodology.md) for why.

---

## Install

Requires Node.js ≥ 16 and Claude Code.

```bash
npx @tekyzinc/gsd-t install      # commands, global CLAUDE.md block, hooks, SCIP indexers
npx @tekyzinc/gsd-t init         # scaffold the current project (auto-registers it)
```

Then, inside Claude Code:

```
/gsd-t-init-scan-setup           # full onboarding: git + init + scan + project CLAUDE.md
```

**Updating:**

```bash
npx @tekyzinc/gsd-t update       # global commands, CLAUDE.md block, hooks
npx @tekyzinc/gsd-t update-all   # the above + every registered project
```

`update` and `update-all` also **retire what v6 no longer ships**: old `gsd-t-*` commands, `~/.claude/bin` tools, `~/.claude/scripts` hooks, the status line, their `settings.json` hook entries, and stray copies in each project's `bin/`. Retired files are moved (never deleted) to `~/.claude/.gsd-t-retired/<date>/` (project files to `<project>/.gsd-t/retired/<date>/`), and only when they carry the exact header GSD-T shipped them with; a same-named file of your own is left alone. A symlink, a malformed `settings.json` or malformed CLAUDE.md markers stop the run before anything changes.

---

## Commands

| Command | What it does |
|---|---|
| `/gsd-t-architect` | Design pass before building: grounds in the code and standing rules, asks only what the code can't answer, checks reuse via the graph, writes a plain-English PseudoCode plan for approval |
| `/gsd-t-tidy-directives` | Cleans a project's directive files (CLAUDE.md, AGENTS.md, `.claude/` commands/skills/rules/settings) that still name retired GSD-T commands. `update-all` flags the project; the next session there runs it automatically, backs up each file first, and leaves the edits uncommitted |
| `/gsd-t-red-team` | Opt-in adversarial review of a change — a fresh-context agent tries to break it. For complex or security / money / permissions / data-integrity work |
| `/gsd-t-debug` | Graph-localized debug loop: two fix cycles, then HALT and hand back to you |
| `/gsd-t-scan` | Deep codebase analysis and tech-debt register, sliced by volume and built on the graph; stops at once when the project has no code yet |
| `/gsd-t-init` | Scaffold `.gsd-t/`, `docs/`, project `CLAUDE.md`; register the project |
| `/gsd-t-init-scan-setup` | Full onboarding: git, init, scan, and a project CLAUDE.md written from the scan |
| `/gsd-t-demo-videos` | Narrated walkthrough videos of a running app (Playwright + Cloud TTS) |
| `/gsd-t-estimate` | Tekyz client estimate sheet: T-shirt sizes, team mix, technology stack |
| `/gsd-t-estimate-rescale` | Re-price an existing estimate on the AI-assisted scale |
| `/gsd-t-pause` | Save exact position to a continue-here file |
| `/gsd-t-resume` | Restore from `progress.md` + the newest continue-here file |
| `/gsd-t-version-update-all` | Update GSD-T globally and in every registered project |
| `/cpua` | Commit, publish, update all — with landed-version checks |
| `/checkin` | Stage, commit and push changes, with a version bump |
| `/branch` | Create a new branch |
| `/global-change` | Apply one change across every registered GSD-T project |
| `/concise` | Rewrite the last reply short |
| `/Claude-md` | Reload CLAUDE.md directives |

Planning, building and testing have no command — Claude does them directly, under the rules in `~/.claude/CLAUDE.md`.

---

## What the hooks enforce

`install` registers these in `~/.claude/settings.json`. Each runs from the installed package; `uninstall` removes all of them.

| Hook | When | What it does |
|---|---|---|
| **Graph search guard** | before Bash / Grep | Blocks a search that asks a structural code question and names the `gsd-t graph` query to run instead. Missing graph also blocks (with `gsd-t graph index`). Searches over `.md`, `.json`, `.sql`, config and prose run normally. Opt out per project only by writing `.gsd-t/graph-search-gate.json` `{"enabled": false}`. |
| **Graph intercept** | after Grep | Answers a structural grep from the graph and replaces the output. |
| **Read intercept** | after Read | When a read lands inside one indexed function, appends a pointer to its `graph body` slice. Never shrinks the output. |
| **Graph use report** | end of turn | Reports a turn that did structural work without asking the graph. Never blocks. |
| **No-fallback guard** | before Write / Edit | Denies a write that adds an unapproved fallback (code that continues after a failure). Approvals live in `.gsd-t/fallbacks.json`. |
| **Date guard** | before Write / Edit | Blocks timestamps more than ±5 minutes off the live clock. |
| **CLAUDE.md changelog** | session start + after Write / Edit | Logs outside edits to `CLAUDE.md` and reminds Claude to log its own, in `CLAUDE.md updates.md`. |
| **Install self-heal** | session start | Restores missing project `bin/` tools before work starts; halts loudly if it can't. |
| **Update check** | session start | Prints the version banner; auto-installs a newer release. |
| **Talk start** | session start | Starts the shared talk program if it is not running (idle until Ctrl+Option+Space). |
| **Wrong-app guard** | every prompt | Asks Haiku (on your Claude login, ~3 s) which app in the GSD-T project list the prompt is for, judged with the session's last six exchanges — a follow-up that names another app stays here. Another app → blocks it with a 🔴 message, the folder to open, and the prompt to paste there. Start a prompt with `This App - This Session` to skip the check. A failed check blocks and says why. |
| **Live clock + Reader Contract** | every prompt | Injects `[GSD-T NOW]` (the time source for banners and log lines) and the reply-style standard. |

---

## Code graph

SQLite index built with tree-sitter, upgraded to compiler-accurate call edges by SCIP (`scip-typescript`, `scip-python`). Stored under `.gsd-t/graphDB/`. Re-indexes changed files before answering.

```bash
gsd-t graph index                      # build or rebuild
gsd-t graph status                     # what is indexed, at which accuracy tier
gsd-t graph who-calls <file#function>
gsd-t graph who-imports <file>
gsd-t graph blast-radius <target>      # everything that reaches the target
gsd-t graph body <file#function>       # source slice + imports + callers
gsd-t graph who-uses <table> [--reads|--writes]   # Drizzle tables
gsd-t graph table <table>              # columns + foreign keys
gsd-t graph metrics                    # graph-vs-grep usage telemetry
```

In a git repo the graph skips everything `.gitignore` leaves out (build output, test bundles). Exclude other ancillary trees with `.gsd-t/graph-exclude.json`. Asking about a file the graph doesn't have fails with a "did you mean" — never an empty answer. Telemetry is on by default; `GSDT_GRAPH_TELEMETRY=0` turns it off.

---

## Worktrees

- Never inside the project folder: `~/Worktrees/<project>/<branch>/`.
- `gsd-t pick-worktree --name <branch>` enters an existing free worktree, or creates and **provisions** a new one: carries `.env*` and local config (permissions kept), skips per-session state and build output, installs dependencies from the worktree's own lockfile. Anything it can't copy is reported; a failed install halts.
- `gsd-t pick-worktree --list` prints `free|busy<TAB><path>` per worktree.

## Multiple Claude accounts

Claude Code keeps one login per config dir (`CLAUDE_CONFIG_DIR`). To use a second account — say a team plan for one client's projects — without losing GSD-T there:

```bash
gsd-t link-config-dir ~/.claude-hilo        # links CLAUDE.md, settings.json, commands, scripts, bin, templates, skills, agents, projects
```

Real files stay in `~/.claude` (GSD-T installs there); the other dir only holds links, plus its own login files, which are never touched. Any conflict halts before anything changes. Point the client's folders at it (e.g. direnv: `export CLAUDE_CONFIG_DIR="$HOME/.claude-hilo"` in an `.envrc`), run `claude` there and `/login`. `gsd-t doctor` flags a broken or missing link.

---

## Environments registry

`docs/infrastructure.md` holds a `## Environments` table (between `gsd-t-env-registry` markers): host, port, database, auth method, vault name, env-var **name**, and a connect command that references the secret as `$VAR`. Before touching a non-local environment, Claude reads it; on a miss it halts, asks you, and records the row first (`node bin/gsd-t-env-registry.cjs record …`). A literal secret value is rejected.

---

## Demo videos

Any request for a demo or walkthrough video is routed to this pipeline: a global rule plus the prompt hook, which flags such requests.

`/gsd-t-demo-videos` copies working templates from `templates/demo-videos/` (Playwright walkthrough specs, cast/manifest/runtime helpers, and `walkthrough-*.mjs` scripts) into the project. Narration is the master clock; the default voice is Google Cloud TTS with a fixed voice (`walkthrough-voice-gcloud.mjs`), checked and re-rendered until it passes.

---

## Estimates

`/gsd-t-estimate` and `/gsd-t-estimate-rescale` write Tekyz estimate Google Sheets through a deterministic writer, `gsd-t estimate-sheet` (`read`, `plan-check`, `write`, `audit`, and repair verbs such as `teammix` and `format`). The model supplies judgment only (sizes, team FTE, stack lines); formulas, roster, months and styling are computed, written, then audited by reading back. Any violation halts. Rules: `templates/estimate-sheet-spec.md`, `templates/estimate-config.json`.

## Talk

Hold Ctrl+Option+Space in the dictation app (WindowsVoiceTranscription) and talk with the Claude session in the tab you're facing; release to send. Pressing the keys also cuts Claude off mid-sentence. Nothing to start: one shared talk program, started with the first GSD-T session, stays idle until you speak.

- **Which session:** the one in tmux's active pane — the tab you are looking at — read from Claude Code's own session records (every account folder, `~/.claude*`), so sessions already running work too. No session there → it says so.
- **What it knows:** your first words start a copy of that session (`--fork-session`), so it knows your conversation; the session itself is untouched. It also gets the summaries of the project's recent talk conversations.
- **Read-only:** the copy can only read and search (Read, Grep, Glob, web search) — no edits, no shell, no workflows, no messages to sessions, no connected services. It never touches the session's running work; anything to be done goes into the paste.
- **Working sounds:** subtle alternating dings from the moment you release the keys (and while it writes the closing summary) until it speaks; a low-medium-high pattern while it reads files. Both stop when it speaks or you press the keys.
- **No preamble:** no header, date, version or recap, and no explaining how talk works unless you ask — just the answer.
- **What you hear:** answers shaped for quick decisions — the answer first, at most three options with their trade-offs, a recommendation. Tables and code go to the transcript, not the speakers. The mic is only open while the keys are held, so speakers work without headphones.
- **Transcript:** every exchange is written as it happens to `.gsd-t/talk/<date>-<session>.md` in that project.
- **Ending:** "done", "we're done", "that's good, paste it" and the like end the conversation: talk says "Okay", saves a summary and pastes `Claude Voice Session: <summary> Full transcript: <file>` into the session for you to send. Add "ignore" to save without pasting. A short remark that only sounds like closing ("that's good") is checked by Haiku against Claude's last reply — after a question it means yes.
- **Voice:** Kokoro on this Mac by default (needs `uv`; model downloads once to `~/.claude/gsd-t-voice/`), or the demo-video Google voice with `gsd-t talk --voice google`. `gsd-t talk status` lists the sessions it can see; `gsd-t talk stop` ends the program; log: `~/.claude/gsd-t-talk/talk.log`.
- **Crashes:** talk restarts itself after any crash. If a restart fails (it crashes again within a minute), it tries once more; if that fails too, it stops, shows a macOS notification, and sets `~/.claude/gsd-t-talk/status.json` to `crashed`; every crash's full error is in `~/.claude/gsd-t-talk/crashes.log`. The next session start tries again, and also replaces a talk left running an older GSD-T version.

---

## CLI

```
gsd-t install            Install slash commands + global CLAUDE.md + hooks
gsd-t update             Update global commands + CLAUDE.md
gsd-t update-all         Update globally + every registered project
gsd-t init [name]        Scaffold a GSD-T project (auto-registers)
gsd-t register           Register current directory as a GSD-T project
gsd-t status             Show installation status + check for updates
gsd-t uninstall          Remove GSD-T commands and hooks (keeps project files)
gsd-t doctor             Diagnose common issues (--install-playwright)
gsd-t changelog          Open changelog in the browser
gsd-t graph              Code graph (index, status, who-calls, who-imports, blast-radius, body, …)
gsd-t pick-worktree      Print the worktree a session should start in
gsd-t link-config-dir    Share this setup with another Claude config dir (second account)
gsd-t directives-scan    List directive files that still name retired GSD-T commands
gsd-t setup-playwright   Install Playwright into a project
gsd-t workflow-path      Print the absolute path of a workflow (scan, debug)
gsd-t estimate-sheet     Read / write / audit a Tekyz estimate sheet
gsd-t talk               Spoken conversations with your sessions (status, stop)
gsd-t help               Show this help
```

Also used by commands and hooks: `install-check`, `slice-budget`, `pseudocode-style`, `graph-availability`.

---

## What a project gets

```
CLAUDE.md                     project-only rules (global rules live in ~/.claude/CLAUDE.md)
docs/requirements.md, architecture.md, workflows.md, infrastructure.md
.gsd-t/progress.md            state + timestamped Decision Log
.gsd-t/contracts/             interfaces between parts
.gsd-t/graphDB/               code graph
bin/gsd-t-*.cjs               tools the hooks and commands call
```

---

## Repository layout

```
bin/        CLI (gsd-t.js) + graph, worktree, env-registry, estimate, guard tools
commands/   slash commands
scripts/    hook scripts
templates/  CLAUDE-global/project, living docs, progress, PseudoCode spec,
            estimate spec, demo-videos/, workflows/ (scan + debug)
docs/       methodology, architecture, requirements, workflows, infrastructure
```

## License

MIT — Tekyz, Inc.
