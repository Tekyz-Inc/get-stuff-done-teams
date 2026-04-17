# CLAUDE.md Optimization Plan

Decision log for the deletion-and-reorganization pass on `/Users/david/projects/GSD-T/CLAUDE.md`.
Inherited global: `~/.claude/CLAUDE.md`.

## (a) DUPLICATE-OF-GLOBAL — Delete

- **`# Destructive Action Guard (MANDATORY)` section (project lines 78-92)** — Restates the global Destructive Action Guard (global lines 81-116). Same rule set, same "Adapt new code to existing structures" maxim. Global version is more complete (includes "How to handle schema/architecture mismatches" and "Why this matters"). Delete the project duplicate.

## (b) OVERRIDE-OF-GLOBAL — Keep with override marker

- **`## Autonomy Level` — "Level 3 — Full Auto"** — Global says "If not specified, use Level 3" (line 391). This explicitly pins it; keep and mark as override/pin so intent is durable even if the global default changes.
- **`## Pre-Commit Gate (project-specific additions)`** — Explicitly additive to the global Pre-Commit Gate (references it: "The global gate applies first"). Items listed are all project-specific file paths (`GSD-T-README.md`, `commands/gsd-t-help.md`, `bin/gsd-t.js`, etc.). Keep.

## (c) PROJECT-SPECIFIC — Keep

- **Header + `## Overview`** — Describes this repo (`@tekyzinc/gsd-t` npm package).
- **`## Tech Stack`** — Node.js version, zero-dep invariant, CLI entry, test runner. Protected by constraint.
- **`## Project Structure`** — Specific directory layout (`bin/`, `commands/`, `templates/`, `scripts/`, `examples/`). Protected by constraint.
- **`## Meta-Project Notes`** — Unique: this repo *defines* `.gsd-t/` commands while using them.
- **`## Conventions`** — All bullets reference specific files/patterns in this repo (CLI style, command file format, template tokens, `.gsd-t/` directory structure, publishing step).
- **`## Observability Logging (MANDATORY)`** — Specific paths (`.gsd-t/token-log.md`, `.gsd-t/qa-issues.md`), specific shell snippets, specific table schemas. Project-defined logging contract.
- **`## Don't`** — Every bullet names specific files (`GSD-T-README.md`, `commands/`, `templates/prompts/`) or project-specific invariants (zero-dep installer, command-count sync, wave phase sequence). No generic duplicates of global `# Don't Do These Things`.
- **`## Recovery After Interruption`** — Protected by constraint (keep wholesale). Project-specific files referenced (`README.md` of this package, `commands/`, `package.json`).
- **`## Current Status`** — Pointer to `.gsd-t/progress.md`.

## (d) STALE — Delete

- None identified. All referenced files/commands (`bin/gsd-t.js`, `commands/gsd-t-execute.md`, `templates/prompts/*-subagent.md`, `.gsd-t/token-log.md`, etc.) exist in the repo.

---

## Report

- **Before**: 7095 chars
- **After**: 6305 chars
- **Reduction**: 790 chars (~11.1%)

### Top 5 largest deletions by char count

1. **`# Destructive Action Guard (MANDATORY)` entire section** (~790 chars, including section heading, header paragraph, 8 bulleted trigger actions, and the "Adapt new code to existing structures" maxim) — the sole deletion. Duplicates the global guard (which is more comprehensive: global also includes "How to handle schema/architecture mismatches" steps and "Why this matters" rationale). No other sections qualified as DUPLICATE; the rest of the project file is project-specific or an override.

(Net reduction is slightly larger than the deleted section alone because a short `> Overrides global:` pointer was added above the Autonomy Level heading — it cost <120 chars, well under the deletion.)
