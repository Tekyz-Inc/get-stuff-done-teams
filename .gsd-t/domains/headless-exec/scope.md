# Domain: headless-exec

## Purpose
Add `gsd-t headless {command} [args]` CLI subcommand that wraps `claude -p` for non-interactive execution.

## File Ownership
- `bin/gsd-t.js` — adds doHeadlessExec, doHeadless dispatch functions
- `test/headless.test.js` — unit tests for headless-exec

## Scope
- Detect `claude` CLI availability
- Spawn `claude -p "/user:gsd-t-{command} {args}"` as child process
- Map exit codes: 0=success, 1=verify-fail, 2=context-budget-exceeded, 3=error, 4=blocked-needs-human
- --json flag: wrap output in structured JSON envelope
- --timeout flag: kill process after N seconds (default: 300)
- --log flag: write output to .gsd-t/headless-{timestamp}.log
- Update showHelp() to include headless subcommand

## Out of Scope
- Actual LLM call routing (delegated to claude CLI)
- headless query (headless-query domain)
- CI/CD templates (pipeline-integration domain)

## Tasks
1. Add `headless` subcommand + doHeadlessExec (spawns claude -p, exit code mapping)
2. Add --json, --timeout, --log flags + structured output
3. Update help text and module.exports
4. Tests for headless-exec logic
