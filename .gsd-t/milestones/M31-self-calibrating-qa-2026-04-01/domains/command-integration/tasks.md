# Domain: command-integration (M31) — Tasks

## Task 1: Wire QA calibration into execute, quick, integrate commands
**Files**: `commands/gsd-t-execute.md`, `commands/gsd-t-quick.md`, `commands/gsd-t-integrate.md`
**Scope**: Add QA calibration injection point to each command's QA subagent spawn. Before spawning QA, call qa-calibrator.js generateQAInjection() and prepend result to QA prompt. Injection is conditional — skip silently if qa-miss-log.jsonl doesn't exist or no weak spots found. Max 10 lines added per command file.
**Contract**: qa-calibration-contract.md (integration points section)
**Depends on**: qa-calibrator Task 1

## Task 2: Wire token budget into execute and wave commands
**Files**: `commands/gsd-t-execute.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-quick.md`
**Scope**: Add pre-spawn budget check to execute (before each subagent spawn, check getSessionStatus() and apply getDegradationActions()). Add milestone pre-flight to wave (call estimateMilestoneCost() before starting). Add budget-aware model selection to quick. Injection is conditional — skip if token-budget.js not available.
**Contract**: token-budget-contract.md (integration points section)
**Depends on**: token-orchestrator Task 1

## Task 3: Wire harness audit into complete-milestone and status
**Files**: `commands/gsd-t-complete-milestone.md`, `commands/gsd-t-status.md`
**Scope**: Add component impact evaluation step to complete-milestone distillation (call recordImpact() for each active component). Add flagged component display to status command (call getFlaggedComponents()). Add QA miss-rate logging to complete-milestone (call logMiss() for Red Team findings not in QA report).
**Contract**: harness-audit-contract.md + qa-calibration-contract.md
**Depends on**: harness-audit Task 1, qa-calibrator Task 1

## Task 4: Update documentation — help, README, GSD-T-README, templates
**Files**: `commands/gsd-t-help.md`, `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md`, `bin/gsd-t.js`
**Scope**: Add gsd-t-audit to command tables in all 4 reference files. Update command count in bin/gsd-t.js (51→52). Document QA calibration and token-aware orchestration in CLAUDE-global.md. Add optional "Daily Token Budget" field to CLAUDE-project.md template. Update feature sections in README.md.
**Depends on**: Tasks 1-3 (all wiring complete before docs)
