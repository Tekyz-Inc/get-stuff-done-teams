# Domain: reflect

## Responsibility
Implement the retrospective and distillation system:
1. `gsd-t-reflect` command (new) — reads `.gsd-t/events/*.jsonl` for the current milestone,
   generates structured retrospective (what worked, what failed, patterns found, proposed memory
   updates), outputs to `.gsd-t/retrospectives/YYYY-MM-DD-{milestone}.md`
2. Distillation step in `complete-milestone` — scans events for patterns found ≥3 times within
   the current milestone, presents proposed CLAUDE.md / constraints.md rule additions to user,
   writes only after explicit user confirmation
3. Reference documentation updates — update all 4 reference files (README, GSD-T-README,
   CLAUDE-global template, gsd-t-help) to include gsd-t-reflect command

## Owned Files/Directories
- `commands/gsd-t-reflect.md` — new command file
- `commands/gsd-t-complete-milestone.md` — addition: distillation step + outcome-tagged completion entry
- `README.md` — add gsd-t-reflect to command count (46→47) and commands table
- `GSD-T-README.md` — add gsd-t-reflect to command reference
- `templates/CLAUDE-global.md` — add gsd-t-reflect to commands table
- `commands/gsd-t-help.md` — add gsd-t-reflect summary line

## NOT Owned (do not modify)
- `scripts/gsd-t-event-writer.js` — event-stream domain
- `commands/gsd-t-execute.md` — learning-loop domain
- `commands/gsd-t-debug.md` — learning-loop domain
- `commands/gsd-t-wave.md` — learning-loop domain
