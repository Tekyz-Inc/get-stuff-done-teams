| Date | Command | Step | Model | Duration(s) | Severity | Finding |
|------|---------|------|-------|-------------|----------|---------|
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | CRITICAL | GSD_T_AGENT_ID has no producer — 189 shims write nothing at runtime (D2 feature dead-on-arrival). See .gsd-t/red-team-report.md BUG-1 |
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | CRITICAL | --worker-timeout CLI flag referenced by contract §16 is not parsed by parseArgs; config.workerTimeoutMs also not merged into opts. No escape hatch for >270s iters. BUG-2 |
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | HIGH | bin/gsd-t-unattended.js diverged from .cjs — M39 D2/D3/D4 changes landed only in .cjs; .js still has 3600000 default, no Team Mode, no watch-progress banner. BUG-3 |
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | HIGH | Team Mode prompt + contract §15 reference "Step 4 Team Mode" but Team Mode is Step 3 in commands/gsd-t-execute.md. BUG-4 |
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | MEDIUM | commands/gsd-t-execute.md Step 5.25 shim has truncated --step-label ending "design contract exist" (missing "s)"). BUG-5 |
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | MEDIUM | buildTree with cyclic parent_agent_id refs produces empty tree silently (nodes attach to each other's children, never reach roots/orphans). BUG-6 |
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | LOW | Contract §18 references bin/gsd-t-unattended.js but M39 code lives in .cjs. BUG-7 |
| 2026-04-17 | red-team | M39 W1 | opus | 1200 | LOW | Contract §13 config.json example still shows workerTimeoutMs: 3600000 (old default). BUG-8 |
