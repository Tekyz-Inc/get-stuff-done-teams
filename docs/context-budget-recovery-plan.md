# Context Budget Recovery Plan

**Generated**: 2026-04-13
**Tool**: `bin/context-budget-audit.js`
**Symptom**: Manual `/compact` prompts started ~2026-04-10, now constant. Long-running unattended tasks stop mid-build with no notification.

## Calibrated baseline

| Layer | Tokens | % of 200K window |
|-------|--------|------------------|
| Claude Code system prompt + tool schemas | 15,600 | 7.8% |
| Global `~/.claude/CLAUDE.md` | 9,679 | 4.8% |
| Project `CLAUDE.md` | 3,506 | 1.8% |
| Auto-memory (10 files) | 3,201 | 1.6% |
| Skill manifest (112 commands × 200 chars) | 5,600 | 2.8% |
| MCP tool manifest | 660 | 0.3% |
| **Static preamble total** | **~38,250** | **19.1%** |

**Conclusion**: Preamble itself is healthy. The problem is **per-invocation cost**.

## Per-invocation cost (where the regression actually hides)

A typical `/gsd-t-execute` invocation loads:

| Item | Tokens | Notes |
|------|--------|-------|
| `gsd-t-execute.md` body | 16,875 | Loaded on skill invocation |
| `.gsd-t/progress.md` | **51,098** | ⚠️ exceeds Read's 10K limit; agent has to chunked-read |
| `.gsd-t/contracts/*.md` | ~5,000-10,000 | Varies by milestone |
| Domain `scope.md` + `tasks.md` + `constraints.md` | ~3,000-8,000 | Per active domain |
| `docs/architecture.md` | ~5,000-15,000 | Re-read on every step |
| `docs/requirements.md` | ~5,000-15,000 | Re-read on every step |
| Subagent spawn (Task tool) overhead | ~5,000-10,000 | Per spawn |
| Bash output forwarding (test runs, builds) | ~5,000-50,000 | Wide variance |
| **Per-invocation typical** | **~95,000-175,000** | + 38K preamble = 133K-213K |

**This is why you hit compaction.** A single execute call can blow past 200K in one phase, even with healthy preamble.

## The two highest-leverage cuts

### CUT #1: Archive old milestones from `progress.md` (saves ~40,000 tokens per invocation)

**File**: `.gsd-t/progress.md`
**Current size**: 51,098 tokens
**Target size**: <10,000 tokens
**Method**:
- Move all COMPLETED milestones older than the last 2 to `.gsd-t/milestones/archive-2026-04.md`
- Keep only: current active milestone, most recent 2 completed (for context), and the Decision Log for the last 30 days
- Older Decision Log entries → `.gsd-t/decision-log-archive.md`

**Files to write a script for**: `bin/archive-progress.js` (one-shot, idempotent)

**Estimated reclaim**: 40,000 tokens per invocation × every command = enormous. This single change probably solves 80% of the problem.

### CUT #2: Slim `gsd-t-execute.md` (saves ~10,000 tokens per execute call)

**File**: `commands/gsd-t-execute.md`
**Current size**: 16,875 tokens (largest command file)
**Target size**: ~6,000 tokens
**Method**:
- Extract the OBSERVABILITY LOGGING block (~2,000 tokens, repeated 5+ times in the file) into `templates/observability-logging-snippet.md` and reference it once
- Extract the QA Subagent prompt block (~1,500 tokens, copy-pasted in 4 commands) into `templates/qa-subagent-prompt.md`
- Extract the Red Team prompt block (~1,500 tokens) into `templates/red-team-prompt.md`
- Extract the Design Verification prompt block (~2,000 tokens) into `templates/design-verification-prompt.md`
- Replace duplications in `gsd-t-execute.md`, `gsd-t-quick.md`, `gsd-t-integrate.md`, `gsd-t-debug.md`, `gsd-t-wave.md`, `gsd-t-complete-milestone.md` with single-line references like `> See: templates/qa-subagent-prompt.md`
- Convert step-by-step prose into terse bullet form where possible
- Remove explanatory paragraphs that duplicate `docs/methodology.md`

**Estimated reclaim**:
- `gsd-t-execute.md`: 16,875 → 6,000 = **−10,875 tokens**
- `gsd-t-quick.md`: 6,553 → 3,000 = **−3,553 tokens**
- `gsd-t-integrate.md`: 5,005 → 2,500 = **−2,505 tokens**
- `gsd-t-debug.md`: 7,015 → 3,500 = **−3,515 tokens**
- `gsd-t-wave.md`: 6,111 → 3,000 = **−3,111 tokens**
- `gsd-t-complete-milestone.md`: 6,362 → 3,000 = **−3,362 tokens**
- **Total per session if these commands invoked**: −26,921 tokens

Note: these savings only apply when a command is invoked. If you only ever run `quick`, you save 3,553 tokens; if you run `wave` you save up to ~27K across the cascade.

## Medium-leverage cuts

### CUT #3: Slim global `~/.claude/CLAUDE.md` (saves 5,000 tokens always-on)

**File**: `~/.claude/CLAUDE.md`
**Current size**: 9,679 tokens (4.8% of window — always loaded)
**Target size**: ~4,500 tokens
**Method**:
- The entire "Commands Reference" table (51 rows) duplicates `commands/gsd-t-help.md` — DELETE the table, replace with `Run /gsd-t-help for the full command list.`
- The "Update Notices" / "Auto-Init Guard" / "Playwright Readiness Guard" / "QA Agent" / "Design Verification Agent" / "Red Team" sections (~3,000 tokens combined) are duplicated in the relevant command files. Move them to the command files only and replace with one-line summaries here.
- The "Pre-Commit Gate" decision tree (~1,500 tokens) is also in project CLAUDE.md — keep one, link from the other
- The "Document Ripple Completion Gate" (~1,500 tokens) is duplicated in `gsd-t-doc-ripple.md` — reference only

**Estimated reclaim**: −5,000 tokens permanent baseline. Drops static preamble from 19.1% → 16.6%.

### CUT #4: Slim `docs/architecture.md` and `docs/requirements.md` reads

**Problem**: These are read on every command, but only sections relevant to the current domain are needed.
**Method**:
- Add table-of-contents anchors at the top of each
- Update command files to use `Read` with `offset`/`limit` to load only the relevant section, not the whole file
- For very large architecture docs, split into `docs/architecture/` directory with one file per subsystem

**Estimated reclaim**: 5,000-15,000 tokens per invocation, project-dependent.

### CUT #5: Bash output truncation in command files

**Problem**: When a command runs `npm test` or `playwright test`, the entire stdout (often 5,000-50,000 tokens) gets forwarded into context.
**Method**:
- Add a `bin/log-tail.js` helper: `bash:: { command }; tail -100 .gsd-t/last-build.log`
- Update test/build steps in command files to write full output to a log file and only forward the tail
- Failures: increase tail to 500 lines

**Estimated reclaim**: 5,000-30,000 tokens per build cycle.

## Low-leverage but easy

### CUT #6: Trim `gsd-t-help.md` (saves 4,000 tokens when invoked)

**File**: `commands/gsd-t-help.md`
**Current size**: 7,067 tokens
**Method**: The full command table with summaries duplicates the project CLAUDE.md table and the README table. Pick one source of truth.

### CUT #7: Auto-memory hygiene

**Files**: `~/.claude/projects/-Users-david-projects-GSD-T/memory/*.md`
**Current size**: 3,201 tokens (10 files, always-on)
**Method**: Already well-managed; no action needed unless it grows past ~5,000 tokens.

## Total potential reclaim

| Type | Always-on savings | Per-invocation savings |
|------|-------------------|------------------------|
| CUT #1 (archive progress.md) | — | **−40,000** |
| CUT #2 (slim execute & friends) | — | **−27,000** (if wave) |
| CUT #3 (slim global CLAUDE.md) | **−5,000** | — |
| CUT #4 (chunked doc reads) | — | −10,000 |
| CUT #5 (bash output truncation) | — | −15,000 |
| CUT #6 (slim gsd-t-help.md) | — | −4,000 |
| **Subtotal** | **−5,000** | **−96,000** |

**Net effect**: A typical `gsd-t-execute` call drops from ~133K tokens to ~37K tokens. Compaction prompt becomes mathematically impossible for normal workflows.

## Order of operations (recommended)

1. **Build `bin/archive-progress.js`** (1 hour) — gives 40K reclaim immediately
2. **Slim global CLAUDE.md** (30 min) — gives 5K permanent reclaim
3. **Extract observability/QA/red-team templates** (2 hours) — gives 27K reclaim per execute
4. **Bash output truncation helper** (1 hour) — gives 15K reclaim per build
5. **Chunked doc reads** (2 hours) — gives 10K reclaim per command
6. **Slim gsd-t-help.md** (15 min) — gives 4K reclaim when invoked

Total time: ~6.75 hours of focused work.

## What this plan does NOT solve

The user's stated requirement was: **"long-running unattended tasks must not silently stop."** Even with all cuts above applied, you can still hit compaction on a sufficiently large job. The plan above buys you 3-4× more headroom — but the durable fix for unattended runs is still:

- **Loud-stop hook**: write a sentinel file + audible alert when context > 75%, so the user knows on return
- **Subprocess orchestrator**: route long builds through `bin/orchestrator.js` with `claude -p` subprocesses (each gets a fresh context); parent coordinates via files

These should be a separate milestone after the cuts above are applied.

## Verification

After each cut, re-run:
```
node bin/context-budget-audit.js --top 15 --threshold 3000
```

Track the "Static preamble cost" line over time. Target: keep it below 20% always; keep `progress.md` below 10K tokens always.
