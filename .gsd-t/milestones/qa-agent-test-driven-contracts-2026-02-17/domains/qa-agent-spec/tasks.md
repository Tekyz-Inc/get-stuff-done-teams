# Tasks: qa-agent-spec

## Task 1: Write QA agent command file
**Status**: pending
**Blocked by**: contract-test-gen (all 3 tasks)
Create `commands/gsd-t-qa.md` — the QA teammate's instruction set. Must include:
- Agent identity and role: "You are the QA agent. You only write and run tests."
- Phase-specific behavior (what to do during partition vs execute vs verify etc.)
- Contract test generation rules (from contract-test-gen domain)
- Test execution and reporting format
- Communication protocol: how to report results to lead
- Blocking rules: what constitutes pass/fail

## Task 2: Add QA Agent spawn rule to global template
**Status**: pending
**Blocked by**: Task 1
Add a "QA Agent" section to `templates/CLAUDE-global.md` (and live `~/.claude/CLAUDE.md`) defining:
- The spawn rule: "Any phase that produces or validates code MUST spawn a QA teammate"
- List of commands that must spawn QA agent
- Reference to `commands/gsd-t-qa.md` for the agent's instructions

## Task 3: Update command references
**Status**: pending
**Blocked by**: Task 1
Update all 4 reference files for the new command:
- `commands/gsd-t-help.md` — add gsd-t-qa entry
- `README.md` — add to commands table
- `GSD-T-README.md` — add to command reference
- `templates/CLAUDE-global.md` — add to commands table
- Update command counts (41 → 42)
