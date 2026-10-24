# GSD-T User Guide — v6

GSD-T is a set of guardrails for Claude Code. Claude plans, builds and tests directly; GSD-T keeps it grounded in the real code, stops silent failures, and gives you a few production pipelines. This guide covers day-to-day use. The [README](README.md) is the reference.

## 1. Set up

```bash
npx @tekyzinc/gsd-t install        # once per machine
```

In a project, inside Claude Code:

```
/gsd-t-init-scan-setup
```

That runs git setup, `gsd-t init` (creates `CLAUDE.md`, `docs/`, `.gsd-t/`, copies tools into `bin/`, registers the project), a deep scan, and writes the project `CLAUDE.md` from what the scan found. Use `/gsd-t-init` alone for a bare scaffold.

Keep everything current with `/gsd-t-version-update-all` (or `npx @tekyzinc/gsd-t update`).

## 2. Day-to-day work

Just ask Claude for what you want. There is no phase chain. The rules in `~/.claude/CLAUDE.md` apply every turn:

- **Answer first, plain words, dated banner** on every reply.
- **Graph before grep** for any question about code structure.
- **No fallbacks** without your approval — failures halt loudly.
- **Destructive changes stop and ask** (dropping tables, deleting working code, swapping a framework).
- **Docs, tests and the Decision Log** are updated in the same commit as the change.

Reach for a command when the work calls for it:

| Situation | Command |
|---|---|
| Non-trivial design, before writing code | `/gsd-t-architect` |
| Risky change (security, money, permissions, data integrity, or just complex) | `/gsd-t-red-team` |
| Project rules still name retired GSD-T commands | `/gsd-t-tidy-directives` (runs automatically after `gsd-t update` flags it) |
| A failing test or runtime error | `/gsd-t-debug` |
| New codebase, or a health check on an old one | `/gsd-t-scan` |
| Stopping mid-task | `/gsd-t-pause`, later `/gsd-t-resume` |
| Client wants a walkthrough video | `/gsd-t-demo-videos` |
| Client wants a price | `/gsd-t-estimate`, `/gsd-t-estimate-rescale` |
| Ship a GSD-T release (this repo) | `/cpua` |

## 3. The architect pass

`/gsd-t-architect` answers "is this the smartest, simplest design given what we already have?" before code exists. It reads the code and the project's standing rules, shows you its understanding of how things work today, asks only what the code can't tell it, checks the graph for something to reuse, and writes the plan as a plain-English decision tree in `.gsd-t/pseudocode/PseudoCode-<Title>.md`. You approve direction, then Claude builds.

## 4. The red team

`/gsd-t-red-team [branch | range | PR | description]` launches one fresh-context agent whose only job is to break the change: requirements gaps, boundary inputs, state and concurrency, permissions, money and data integrity, error paths (a fallback that hides a failure counts as a bug), regressions, and shallow tests. It reports only what it reproduced. CRITICAL/HIGH findings get fixed and re-attacked, two rounds at most, then it halts and reports to you. Skip it for routine work.

## 5. Debugging

`/gsd-t-debug "<symptom>"` runs a workflow: localize the failure with the graph, then up to two fix cycles (the second sees the first's failed hypothesis). Still failing after two → it stops and hands back to you with what was tried. It never loops a third time.

## 6. Scanning

`/gsd-t-scan` runs a workflow that sizes the codebase, splits it into line-budgeted slices, runs a deep finder per slice with graph context, and writes a prioritized tech-debt register plus dimension files to `.gsd-t/scan/`, refreshes the living docs, and writes a plain-English companion. A prior register is archived, never overwritten.

## 7. The code graph

Built on first need (`gsd-t graph index`) and kept fresh automatically. You'll mostly see it through Claude's answers, but you can query it too:

```bash
gsd-t graph who-calls src/billing.ts#chargeCard
gsd-t graph blast-radius src/billing.ts
gsd-t graph who-uses invoices --writes
```

If a search is blocked, the message names the graph query to run instead. If the graph is broken, Claude halts and says so — it never answers a structural question by grep.

## 8. Worktrees

Real work goes on its own branch in its own worktree, outside the project folder:

```bash
gsd-t pick-worktree --name my-feature     # enter it, or create + provision it
gsd-t pick-worktree --list                # free|busy per worktree
```

Provisioning copies `.env*` and local config, skips session state and build output, and installs dependencies from the worktree's own lockfile. A worktree made by hand with `git worktree add` is missing all of that.

## 9. Environments

Connection details for staging, prod and external services live in the `## Environments` table of `docs/infrastructure.md` — never a secret value, only the vault name and env-var name (`$VAR`). When Claude needs an environment that isn't recorded, it stops, asks you once, records the row, then proceeds. The next session reads it instead of asking again.

## 10. Demo videos

`/gsd-t-demo-videos` turns a running app into narrated walkthroughs. It copies the templates from `templates/demo-videos/` into the project, writes a Playwright spec and narration lines per walkthrough, voices them with a fixed Google Cloud TTS voice, and muxes, trims and checks each clip. Narration drives the timing.

## 11. Estimates

`/gsd-t-estimate` builds a Tekyz estimate sheet (T-shirt sizes, team mix, technology stack) in Google Sheets. `/gsd-t-estimate-rescale` re-prices an existing one on the AI-assisted scale. Claude supplies the judgment; `gsd-t estimate-sheet` writes the sheet and audits it by reading it back.

## 12. Pause and resume

`/gsd-t-pause` writes a continue-here file with your exact position. `/gsd-t-resume` reads `.gsd-t/progress.md` and the newest continue-here file, reports where you were, and continues.

## 13. What changed in v6

v6 removed the milestone / partition / plan / execute / verify / wave chain, the validation triad, competition mode, model profiles, backlog, design-to-code, the logging scaffolder, the stack rules engine, headless and unattended runs, the dashboard and status line, the `/gsd` router, and test-plan-first. `update` and `update-all` remove their leftover files and hook entries. Why: [docs/methodology.md](docs/methodology.md#v6--guardrails-not-a-pipeline).

## Troubleshooting

| Symptom | Fix |
|---|---|
| A search is blocked "could be asking about code structure" | Run the graph query it names, or add `--include='*.md'` (etc.) for a text search |
| "graph unavailable" | `gsd-t graph status`, then `gsd-t graph index` |
| A write is denied as a fallback | Make it halt instead, or approve it in `.gsd-t/fallbacks.json` |
| A write is blocked for a stale timestamp | Use the time in `[GSD-T NOW]` or `date` |
| Something looks half-installed | `gsd-t doctor` |
