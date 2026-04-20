# Constraints: d3-completion-protocol

## Must Follow
- Contract file is authoritative. If contract and helper disagree, fix the helper.
- `assertCompletion` MUST be pure w.r.t. its arguments — no hidden global state, no network calls.
- Use `child_process.execSync` for `git log` / `git status` / `npm test`. Catch non-zero exits; surface them in `details`.
- Report all missing signals in `missing[]` — do not early-return on the first failure. Operators need the full picture for triage.

## Must Not
- Consider a task DONE if tests pass but no commit exists. A "successful dry run" is not done.
- Check off Done Signal items that the task explicitly opted out of (docs-only tasks skip test step) unless the tasks.md entry has an explicit `skip-test: true` marker.
- Declare completion based on filesystem scan alone. Git is the source of truth — uncommitted work is work lost on crash.
- Treat exit-code-0 as sufficient. Claude workers can return 0 without doing anything; only artifact presence proves work.

## Must Read Before Using
- `bin/gsd-t-unattended.cjs` — how the supervisor currently decides worker outcome (simpler rule: exit code + state.json). D3 tightens this.
- `.gsd-t/progress.md` Decision Log format.

## Dependencies
- Depends on: nothing (leaf domain — contract + helper).
- Depended on by: D1, D2, D6.
