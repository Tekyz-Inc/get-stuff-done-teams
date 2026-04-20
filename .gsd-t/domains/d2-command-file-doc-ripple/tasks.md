# Tasks: d2-command-file-doc-ripple

## Summary
Wire every GSD-T command file that spawns a Task subagent through the D1 `captureSpawn` wrapper. Replace scattered `T_START=$(date +%s)…` + `| … | N/A | …` row snippets with one canonical pattern. Mechanical blast-radius pass: D1 builds the pipe; D2 connects all 20 faucets.

## Tasks

### Task 1: Rewrite the canonical Observability Logging block
- **Files**: `templates/CLAUDE-global.md`, `/Users/david/projects/GSD-T/CLAUDE.md`
- **Contract refs**: `metrics-schema-contract.md`
- **Dependencies**: Requires D1 (wrapper module exists)
- **Wave**: 2
- **Acceptance criteria**:
  - Removes the `T_START=$(date +%s)` bash pair + raw `>>` append snippet from both files
  - Documents Pattern A (wrapper around a spawnFn via `captureSpawn`) and Pattern B (record after-the-fact via `recordSpawnRow`)
  - Declares the new `| Datetime-start | Datetime-end | Command | Step | Model | Duration(s) | Tokens | Notes | Domain | Task | Ctx% |` header as canonical
  - Declares the missing-usage rule: write `—`, never `0`, never `N/A`
  - References `bin/gsd-t-token-capture.cjs` as the source of truth
  - Both files contain identical block text
  - `grep -n 'T_START=\$(date \+\%s)' templates/CLAUDE-global.md CLAUDE.md` returns 0 hits

### Task 2: Convert `gsd-t-execute.md` (reference conversion)
- **Files**: `commands/gsd-t-execute.md`
- **Contract refs**: `metrics-schema-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 2
- **Acceptance criteria**:
  - Identifies every step that spawns a Task subagent (every `OBSERVABILITY LOGGING` block in the file)
  - For each spawn site, replaces the bash block with Pattern A or Pattern B from Task 1
  - Keeps step numbering and step labels unchanged
  - Embedded `node -e "..."` snippets parse under `node --check` (via a wrapper test or inline assertion)
  - Full test suite `npm test` stays green after commit
  - This conversion becomes the worked example for Task 3

### Task 3: Mechanical sweep of remaining 18 command files
- **Files**: all remaining `commands/gsd-t-*.md` with a spawn or token-log reference — 18 files per grep: quick, wave, scan, integrate, complete-milestone, verify, plan, status, prd, design-decompose, visualize, doc-ripple, health, init, init-scan-setup, debug, unattended, unattended-watch (plus help only if it contains a live spawn example)
- **Contract refs**: `metrics-schema-contract.md`
- **Dependencies**: Requires Task 2
- **Wave**: 2
- **Acceptance criteria**:
  - One commit per file so reverts stay surgical
  - Each commit replaces every bash observability block with the canonical Pattern A or Pattern B from Task 1
  - Each commit removes any `| N/A |` row examples
  - Each commit leaves step numbering, step labels, and non-observability logic untouched
  - Each commit appends a Decision Log entry to `progress.md`
  - After all 18 commits: `grep -n '| N/A |' commands/*.md` in the Tokens column returns 0 hits
  - After all 18 commits: `grep -n 'T_START=\$(date' commands/*.md` returns 0 hits

### Task 4: Smoke test — canonical-block drift guard
- **Files**: `test/m41-d2-smoke.test.js` (NEW) or appended to `test/m41-token-capture.test.js`
- **Contract refs**: N/A
- **Dependencies**: Requires Task 3
- **Wave**: 2
- **Acceptance criteria**:
  - Pulls the canonical block text out of `templates/CLAUDE-global.md` via regex
  - Pulls the canonical block text out of `commands/gsd-t-execute.md` via regex
  - Asserts they match (same canonical pattern everywhere)
  - Greps all 20 command files and asserts no `| N/A |` row survives in the Tokens column
  - Fails loud if a command file drifts from the canonical block

## Done Signal
- Task 1: both CLAUDE files updated, no `T_START=$(date +%s)` left in templates
- Task 2: `commands/gsd-t-execute.md` fully converted, full suite green
- Task 3: all 18 remaining command files converted (one commit per file), no `N/A` rows left anywhere
- Task 4: smoke test passes, baseline+1
- Full suite `npm test` at baseline+N green

## Owned Patterns
- Observability blocks inside `commands/*.md`
- Observability Logging section of `templates/CLAUDE-global.md` and `CLAUDE.md`
