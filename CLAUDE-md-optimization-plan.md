# CLAUDE.md Optimization Plan

Decision log for the deletion-and-reorganization pass on `/Users/david/projects/GSD-T/CLAUDE.md`.
Inherited global: `~/.claude/CLAUDE.md`.

## Starting-state note

The `<claudeMd>` snapshot injected into this session's context contained a longer, unoptimized version of `CLAUDE.md` (7095 chars) — it included a full `# Destructive Action Guard (MANDATORY)` section that duplicated the global guard. **The on-disk file was already shorter** (6220 chars at `HEAD~1`): a prior commit (`abf0bb1` — *"CLAUDE.md optimization"* on the same day) had already removed that duplicate section.

So this pass re-classifies the file as-it-currently-exists-on-disk, documents what the prior optimization took out, and adds one missing override marker.

## (a) DUPLICATE-OF-GLOBAL — Already deleted (by prior commit `abf0bb1`)

- **`# Destructive Action Guard (MANDATORY)` section** (had been ~790 chars: header paragraph + 8-item trigger list + "Adapt new code to existing structures" maxim). Restated the global guard at `~/.claude/CLAUDE.md` lines 81-116 (which also carries richer "How to handle schema/architecture mismatches" steps and "Why this matters" rationale). Removed cleanly; no further action.

No other duplicates found in the current on-disk file.

## (b) OVERRIDE-OF-GLOBAL — Keep, with explicit override marker

- **`## Autonomy Level` — "Level 3 — Full Auto"** — Global says "If not specified, use Level 3" (line 391). The project pins it explicitly so intent survives changes to the global default. **Added `> Overrides global:` marker** this pass so the override is obvious to a reader. This is the only content change made.
- **`## Pre-Commit Gate (project-specific additions)`** — Explicitly additive: first line is "The global gate applies first". Items are all project-specific file paths (`GSD-T-README.md`, `commands/gsd-t-help.md`, `bin/gsd-t.js`, `templates/CLAUDE-global.md`, etc.). Keep as-is — the section heading already signals the override relationship.

## (c) PROJECT-SPECIFIC — Keep

- **Header + `## Overview`** — Describes this repo (`@tekyzinc/gsd-t` npm package).
- **`## Tech Stack`** — Node.js version, zero-dep invariant, CLI entry, test runner. Protected by constraint.
- **`## Project Structure`** — Specific directory layout (`bin/`, `commands/`, `templates/`, `scripts/`, `examples/`). Protected by constraint.
- **`## Meta-Project Notes`** — Unique: this repo *defines* `.gsd-t/` commands while using them; no src dir.
- **`## Conventions`** — All bullets reference specific files/patterns in this repo (CLI style, command-file format, template tokens, `.gsd-t/` directory structure, publishing step).
- **`## Observability Logging (MANDATORY)`** — Specific paths (`.gsd-t/token-log.md`, `.gsd-t/qa-issues.md`), specific shell snippets, specific table schemas. Project-defined logging contract.
- **`## Don't`** — Every bullet names specific files (`GSD-T-README.md`, `commands/`, `templates/prompts/`) or project-specific invariants (zero-dep installer, command-count sync, wave phase sequence). No generic duplicates of the global `# Don't Do These Things`.
- **`## Recovery After Interruption`** — Protected by constraint (keep wholesale). Lists project-specific files (`README.md` of this package, `commands/`, `package.json`).
- **`## Current Status`** — Pointer to `.gsd-t/progress.md`.

## (d) STALE — None

All referenced files/commands/scripts (`bin/gsd-t.js`, `commands/gsd-t-execute.md`, `templates/prompts/*-subagent.md`, `.gsd-t/token-log.md`, `.gsd-t/qa-issues.md`, `scripts/`, `templates/stacks/`, etc.) exist in the current repo.

---

## Report

Measured against the on-disk starting state (`HEAD~1`), which prior work had already trimmed:

- **Before (on-disk `HEAD~1`)**: 6220 chars
- **After (this pass, `HEAD`)**: 6305 chars
- **Net delta**: +85 chars (~+1.4%) — the `> Overrides global:` marker added to `## Autonomy Level`.

Measured against the unoptimized snapshot from the injected context (historical baseline, for completeness):

- **Unoptimized baseline**: 7095 chars
- **Current**: 6305 chars
- **Total reduction**: 790 chars (~11.1%)

### Top 5 largest deletions by char count

1. **`# Destructive Action Guard (MANDATORY)` entire section** (~790 chars, section heading + header paragraph + 8 trigger bullets + "Adapt new code…" maxim) — removed by prior commit `abf0bb1`. This was the sole bulk deletion available; it fully duplicated the global guard.

No additional deletable content was identified this pass. All remaining sections are PROJECT-SPECIFIC or OVERRIDE.
