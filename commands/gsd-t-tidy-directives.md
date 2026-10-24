# GSD-T: Tidy Directives — Clean Project Rules That Name Retired GSD-T Commands

Fixes a project's directive files — CLAUDE.md (any depth), AGENTS.md, `.cursorrules`, project
`.claude/` commands, skills, rules, agents and settings — that still point at GSD-T commands
removed in v6. Runs automatically: `gsd-t update` flags the project and the next session there
starts it. **Pre-approved — do not ask before editing.** Nothing is committed.

## Step 1: Find what needs fixing

```bash
gsd-t directives-scan --json
```

No hits → delete `.gsd-t/directives-pending.json` if present, say "directives already clean", stop.

## Step 2: Back up every file you will edit

Copy each listed file to `.gsd-t/retired/<YYYY-MM-DD>/directives/<same relative path>` (date from
`date +%F`) before touching it. Never overwrite an existing backup — add `.1`, `.2`.

## Step 3: Edit — minimal, and only what v6 retired

Read `~/.claude/CLAUDE.md` first: it is what v6 is. Then, per file:

| Old reference | Replace with |
|---|---|
| milestone, partition, plan, discuss, project, feature, brainstorm, impact, gap-analysis | `/gsd-t-architect` (design before building) |
| execute, quick, wave, integrate | build the change directly |
| verify, qa, test-sync, test-plan | run the full unit + E2E suites; `/gsd-t-red-team` for risky work |
| setup, populate | `/gsd-t-init-scan-setup` |
| complete-milestone, doc-ripple | update affected docs and tests in the same commit |
| version-update | `/gsd-t-version-update-all` |
| status, help, log, metrics, health, visualize, prompt, reflect, audit, optimization-*, unattended*, backlog-*, design-*, prd, stories, triage-and-merge, migrate-logging, promote-debt | remove the reference (rewrite the sentence so it still reads cleanly) |
| `.gsd-t/domains/` pointers | remove the line |

Also remove rules that contradict the v6 global rules: mandatory phase sequences, "every phase
ends with the QA/Red Team triad", GSD-T-native effort units, mandatory trace/audit logging
scaffolds, model tiers/profiles, competition mode, auto-`/clear` between phases.

**Keep everything project-specific**: tech stack, run/test/deploy commands, environments,
domain rules, Expected branch, autonomy level, the Destructive Action Guard, real logging code
the project built. Change the fewest words that make the file correct; keep the author's voice.

For `.claude/settings*.json`: remove only hook entries whose GSD-T script no longer exists.
Never touch a user's own hook.

## Step 4: Prove it

```bash
gsd-t directives-scan
```

Must exit 0. If any hit remains, fix it; if one cannot be fixed (quoted history, a changelog
line), say which and why — that is a HALT, not a pass. When clean, delete
`.gsd-t/directives-pending.json`.

## Step 5: Report

One short block: files changed, one plain line per file on what changed, backup folder, and
"uncommitted — review with `git diff`, undo with `git checkout <file>`". Then continue with
whatever the user asked for.
