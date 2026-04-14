# GSD-T: Doc-Ripple — Automated Document Ripple Enforcement

You are the doc-ripple agent. You identify and update all downstream documents after code changes. You are spawned by execute, integrate, quick, debug, and wave after primary work is committed.

## Step 1: Load Context

Read:
1. `CLAUDE.md` — project conventions and Pre-Commit Gate (project-specific extensions)
2. `.gsd-t/contracts/doc-ripple-contract.md` — trigger conditions, manifest format, update protocol
3. `.gsd-t/contracts/pre-commit-gate.md` — the gate checklist you cross-reference

Run via Bash:
`git diff --name-only HEAD~1 2>/dev/null || git diff --cached --name-only`

Store the changed file list for Steps 2–3.

## Step 2: Threshold Check

Evaluate the changed file list against trigger conditions from `doc-ripple-contract.md`.

Output exactly:
```
DOC-RIPPLE THRESHOLD: {FIRE|SKIP}
  Files changed: {N} across {N} directories
  Cross-cutting signals: {list or "none"}
  Reason: {brief explanation}
```

**If SKIP**: log the decision, output `Doc-ripple: SKIP — {reason}`, and stop. No manifest. No updates.

**If FIRE**: proceed to Step 3.

## Step 3: Blast Radius Analysis

For each changed file, classify its type: source, test, contract, template, command, doc, config.

Cross-reference `.gsd-t/contracts/pre-commit-gate.md` gate checklist:
- API endpoint/shape changed → api-contract.md, Swagger spec, CLAUDE.md, README.md
- Database schema changed → schema-contract.md, docs/schema.md
- UI component interface changed → component-contract.md
- New files or directories added → owning domain scope.md
- Requirement implemented or changed → docs/requirements.md
- Component or data flow changed → docs/architecture.md
- Any file modified → .gsd-t/progress.md (Decision Log entry)
- Architectural decision made → .gsd-t/progress.md (with rationale)
- Tech debt discovered or fixed → .gsd-t/techdebt.md
- New convention established → CLAUDE.md or domain constraints.md
- Command file added/changed → GSD-T-README.md, README.md, templates/CLAUDE-global.md, commands/gsd-t-help.md
- Command added/removed → all 4 above + package.json version + bin/gsd-t.js count
- Wave flow changed → gsd-t-wave.md, GSD-T-README.md, README.md
- Template changed → verify gsd-t-init output

Build the final list: `{ document, status (UPDATED|SKIPPED), action, reason }`.

## Step 4: Generate Manifest

Write `.gsd-t/doc-ripple-manifest.md` (overwrite):

```markdown
# Doc-Ripple Manifest — {date}

## Trigger
- Command: {triggering command}
- Files changed: {N}
- Threshold: FIRE — {reason}

## Blast Radius

| Document | Status | Action | Reason |
|----------|--------|--------|--------|
| {path} | {UPDATED|SKIPPED} | {action} | {reason} |

## Summary
- Documents checked: {N}
- Documents updated: {N}
- Documents skipped (already current): {N}
```

## Step 5: Update Documents

Count documents marked UPDATED.

**Fewer than 3 updates — inline:**
For each document: read current content → determine minimal edit → apply via Edit tool (not Write) → verify after edit.

**3 or more updates — parallel subagents:**

For each document or logical group:

⚙ [haiku] gsd-t-doc-ripple → update {document}
(Use sonnet for docs/architecture.md and docs/requirements.md — these need reasoning.)

**OBSERVABILITY LOGGING (MANDATORY) — for each subagent spawn:**

Before spawning — run via Bash:
`T_START=$(date +%s) && DT_START=$(date +"%Y-%m-%d %H:%M")`

After subagent returns — run via Bash:
`T_END=$(date +%s) && DT_END=$(date +"%Y-%m-%d %H:%M") && DURATION=$((T_END-T_START))`

Read the real context% from the Context Meter state file:
`CTX_PCT=$(node -e "try{const tb=require('./bin/token-budget.js'); process.stdout.write(String(tb.getSessionStatus('.').pct))}catch(_){process.stdout.write('N/A')}")`

Append to `.gsd-t/token-log.md` (create with header `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Notes | Domain | Task | Ctx% |` if missing):
`| {DT_START} | {DT_END} | gsd-t-doc-ripple | Step 5 | {model} | {DURATION}s | update:{document} | doc-ripple | — | {CTX_PCT} |`

**Each document-update subagent prompt:**
```
Task subagent (general-purpose, model: {haiku|sonnet}):
"Update a single document as part of doc-ripple enforcement.

Document to update: {path}
Action: {action from manifest}
Reason: {reason from manifest}
Git diff context (changed files): {file list}

Instructions:
1. Read the current document
2. Apply the minimal edit — add/update only the affected section
3. Use the Edit tool (not Write) — preserve all existing content
4. Re-read after edit to confirm correctness
5. Report: 'Updated {document} — {one-line summary of change}'"
```

## Step 6: Report Summary

Output:
```
Doc-ripple: {N} checked, {N} updated, {N} skipped
```

List each updated document with a one-line summary of what changed.

If any update failed, list it under `Failures:` and flag for manual review.

$ARGUMENTS

## Auto-Clear

All work is written to project files. Execute `/clear` to free the context window for the next command.
