# Constraints: cross-project-sync

## Must Follow
- Zero external dependencies — Node.js built-ins only (consistent with gsd-t.js)
- All file operations use synchronous API (consistent with gsd-t.js patterns)
- New functions in gsd-t.js must follow existing patterns: helper functions with ANSI color logging, error handling via try/catch with `warn()` calls
- Functions under 30 lines — split if longer
- Global rule sync is additive to `doUpdateAll()` — a new step after existing project updates
- Rules propagated to projects are always injected as `status: 'candidate'` — never as promoted or graduated (each project must re-validate)
- Universal rule threshold: promotion in 3+ projects marks as universal; promotion in 5+ projects qualifies for npm distribution

## Must Not
- Modify existing helper functions in gsd-t.js (only add new ones and a call in doUpdateAll)
- Add external npm dependencies to gsd-t.js
- Write directly to `.gsd-t/metrics/` in target projects — use global-sync-manager API
- Remove or alter any existing doUpdateAll behavior (project CLAUDE.md updates, health checks, etc.)

## Dependencies
- Depends on: global-metrics domain for `global-sync-manager.js` API (read global rules, write candidate rules to projects)
- Depends on: M26 rule-engine.js for rule schema validation
- Depended on by: command-extensions domain (commands reference the sync behavior in their help text)

## Must Read Before Using
- `bin/gsd-t.js` — `doUpdateAll()`, `updateSingleProject()`, `getRegisteredProjects()` functions to understand the update loop pattern
- `bin/global-sync-manager.js` — the API this domain calls (created by global-metrics domain)
- `.gsd-t/contracts/rule-engine-contract.md` — rules.jsonl schema (must match when injecting candidates)
- `.gsd-t/contracts/cross-project-sync-contract.md` — propagation protocol defined in this milestone
