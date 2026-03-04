# Constraints: reflect

## Must Follow
- gsd-t-reflect.md MUST include OBSERVABILITY LOGGING block (mandatory for all commands that spawn subagents — see CLAUDE.md)
- gsd-t-reflect.md is a new command — update all 4 reference files (README, GSD-T-README, CLAUDE-global, gsd-t-help)
- Distillation writes to CLAUDE.md require explicit user confirmation — never auto-write (Destructive Action Guard applies)
- Pattern detection threshold: ≥3 occurrences within current milestone events only (YYYY-MM-DD.jsonl files from current milestone start date)
- Retrospective output format: structured markdown with sections: ## What Worked, ## What Failed, ## Patterns Found, ## Proposed Memory Updates
- Command count in reference files: increment from 46 to 47 (42 GSD-T + 5 utility: gsd, branch, checkin, Claude-md, reflect? — actually gsd-t-reflect IS a gsd-t command, so it's 43 GSD-T + 4 utility = 47 total)
  - Wait: 41 GSD-T + 4 utility = 45 currently (before gsd-t-prd was added). After prd: 42 + 4 = 46. After reflect: 43 + 4 = 47.
- Use Step 0 self-spawn pattern (subagent) like gsd-t-health.md — read that command for the pattern

## Must Not
- Auto-write to CLAUDE.md without user confirmation
- Retroactively modify existing Decision Log entries
- Create event-writer.js or touch scripts/ — that is event-stream domain
- Modify execute.md, debug.md, or wave.md — that is learning-loop domain

## Must Read Before Using
- `commands/gsd-t-complete-milestone.md` — full file — understand current step structure and gap-analysis gate before adding distillation step
- `commands/gsd-t-health.md` — Step 0 self-spawn subagent pattern to replicate in gsd-t-reflect.md
- `.gsd-t/contracts/event-schema-contract.md` — required event fields for reading distillation events
- `README.md` — current command counts and table structure before updating
- `GSD-T-README.md` — current structure before adding reflect entry
- `templates/CLAUDE-global.md` — current commands table before updating
- `commands/gsd-t-help.md` — current command list before adding reflect

## External Reference Dispositions
- dashboard mockup (scripts/gsd-t-dashboard-mockup.html): not relevant to M14 — M15 scope only

## Dependencies
- Depends on: event-stream for events/ JSONL schema (what fields to read for pattern detection)
- Depends on: learning-loop for outcome-tagged Decision Log entries (what [failure]/[learning] data looks like)
  - Note: reflect can be implemented before learning-loop populates real data — it just reads events/ and Decision Log
- Depended on by: nothing (terminal domain)
