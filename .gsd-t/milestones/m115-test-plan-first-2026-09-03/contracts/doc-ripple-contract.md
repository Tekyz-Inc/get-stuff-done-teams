# Contract: Doc-Ripple Subagent

## Version: 1.0.0
## Status: ACTIVE
## Owner: doc-ripple-agent domain
## Consumers: command-integration domain (execute, integrate, quick, debug, wave)

---

## Purpose

Defines the interface for the doc-ripple agent — an automated document ripple enforcement mechanism that identifies and updates all downstream documents after code changes.

## Trigger Conditions

The doc-ripple agent is spawned when ALL of these are true:
1. A GSD-T command has completed its primary work (code changes committed)
2. The command is one of: execute, integrate, quick, debug, wave
3. The change passes the **threshold check** (see below)

### Threshold Logic

Doc-ripple fires when the change is **cross-cutting** (affects patterns, standards, or interfaces used across multiple files). It skips when the change is **trivial** (localized, no downstream impact).

**Fire when ANY of these are true:**
- Files changed span 3+ directories
- A contract file (`.gsd-t/contracts/*.md`) was modified
- A template file (`templates/*.md`) was modified
- A CLAUDE.md file (global or project) was modified
- A command file (`commands/*.md`) was modified that defines behavior used by other commands
- An API endpoint or response shape was added/changed (detected by diff containing route/endpoint patterns)
- A new convention, standard, or rule was established (detected by diff containing "MUST", "NEVER", "MANDATORY", "ALWAYS" in non-test files)

**Skip when ALL of these are true:**
- Files changed are in 1-2 directories only
- No contract, template, CLAUDE.md, or command files were modified
- Changes are implementation-only (source code, tests, config) with no interface changes

### Threshold Decision Format
```
DOC-RIPPLE THRESHOLD: {FIRE|SKIP}
  Files changed: {N} across {N} directories
  Cross-cutting signals: {list or "none"}
  Reason: {brief explanation}
```

## Blast Radius Analysis

When fired, the agent performs:

1. **Read git diff**: `git diff --name-only HEAD~1` (or `git diff --cached --name-only` if uncommitted)
2. **Classify changed files**: For each changed file, determine its type (source, test, contract, template, command, doc, config)
3. **Cross-reference Pre-Commit Gate**: Read `.gsd-t/contracts/pre-commit-gate.md` — for each gate check, determine if the change triggers it
4. **Identify affected documents**: Build a list of every document that needs updating based on what changed

## Manifest Format

The agent produces a manifest at `.gsd-t/doc-ripple-manifest.md` (overwritten each run):

```markdown
# Doc-Ripple Manifest — {date}

## Trigger
- Command: {command that triggered doc-ripple}
- Files changed: {N}
- Threshold: FIRE — {reason}

## Blast Radius

| Document | Status | Action | Reason |
|----------|--------|--------|--------|
| .gsd-t/progress.md | UPDATED | Added Decision Log entry | Code files modified |
| docs/requirements.md | SKIPPED | No requirement changes detected | — |
| docs/architecture.md | UPDATED | New component added | {file} creates new module |
| .gsd-t/contracts/api-contract.md | SKIPPED | No API changes | — |
| README.md | UPDATED | New command documented | commands/gsd-t-doc-ripple.md added |
| CLAUDE.md | SKIPPED | No convention changes | — |
| templates/CLAUDE-global.md | UPDATED | Template synced with CLAUDE.md | — |
| {domain}/scope.md | UPDATED | New files added to domain | — |

## Summary
- Documents checked: {N}
- Documents updated: {N}
- Documents skipped (already current): {N}
```

## Update Protocol

For each document marked UPDATED in the manifest:

1. **Read the current document** — understand its structure
2. **Determine the minimal edit** — add/update only the affected section, don't rewrite
3. **Apply the edit** — use the Edit tool, not Write (preserves existing content)
4. **Verify** — re-read after edit to confirm correctness

### Parallel Dispatch

When 3+ documents need updating, spawn parallel subagents (one per document or per logical group). Each subagent receives:
- The manifest entry (which document, what action, why)
- The git diff context (what changed)
- The document to update

When fewer than 3 documents need updating, update inline (no subagent overhead).

## Model Assignment

- Threshold check + blast radius analysis: **inline** (no subagent — fast, deterministic)
- Document updates (when parallel): **model: haiku** (mechanical — read doc, apply edit, verify)
- Complex document updates (architecture.md, requirements.md): **model: sonnet** (needs reasoning)

## Integration Pattern

Commands that spawn doc-ripple use this pattern:

```markdown
## Step {N}: Doc-Ripple (Automated)

After all work is committed but before reporting completion:

1. Run threshold check — read `git diff --name-only HEAD~1` and evaluate against doc-ripple-contract.md trigger conditions
2. If SKIP: log "Doc-ripple: SKIP — {reason}" and proceed to completion
3. If FIRE: spawn doc-ripple agent:

⚙ [{model}] gsd-t-doc-ripple → blast radius analysis + parallel updates

Task subagent (general-purpose, model: sonnet):
"Execute the doc-ripple workflow per commands/gsd-t-doc-ripple.md.
Git diff context: {files changed list}
Command that triggered: {command name}
Produce manifest at .gsd-t/doc-ripple-manifest.md.
Update all affected documents.
Report: 'Doc-ripple: {N} checked, {N} updated, {N} skipped'"

4. After doc-ripple returns, verify manifest exists and report summary inline
```

## Breaking Changes

Any change to the manifest format, trigger conditions, or integration pattern is a breaking change. Bump contract version and update all consumers.
