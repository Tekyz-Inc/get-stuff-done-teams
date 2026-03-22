# Tasks: headless-exec

## Task 1: Core headless exec subcommand
- Add doHeadlessExec(command, args, opts) to bin/gsd-t.js
- Detect claude CLI availability (execFileSync claude --version)
- Build claude -p invocation string
- Spawn process, capture stdout/stderr
- Map exit codes to GSD-T exit codes

## Task 2: Flags + structured output
- Parse --json, --timeout=N, --log flags from args
- --json: output JSON envelope {success, exitCode, output, command, timestamp}
- --timeout: kill spawned process after N seconds (default 300)
- --log: write full output to .gsd-t/headless-{timestamp}.log

## Task 3: Help + exports
- Update showHelp() to show `headless` subcommand
- Add headless to main switch statement
- Export doHeadlessExec, parseHeadlessFlags, mapHeadlessExitCode

## Task 4: Tests
- Test parseHeadlessFlags parses --json, --timeout, --log
- Test mapHeadlessExitCode maps known patterns correctly
- Test buildHeadlessCmd builds correct claude -p invocation
- Test log file path generation
