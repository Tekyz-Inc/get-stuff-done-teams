# M36 — Cross-Platform Unattended Supervisor Loop

**Version**: 2.77.0
**Completed**: 2026-04-15
**Tag**: v2.77.0

## Deliverables

- `bin/gsd-t-unattended.js` — detached OS-process supervisor (1259 lines), relay of fresh `claude -p` workers running the active milestone to completion over 24h+
- `bin/gsd-t-unattended-safety.js` — gutter detection, blocker sentinels, iteration/wall-clock caps
- `bin/gsd-t-unattended-platform.js` — macOS/Linux/Windows spawn + sleep-prevention + notify matrix
- `bin/handoff-lock.js` — parent/child race guard for headless-auto-spawn
- `commands/gsd-t-unattended.md` — launch command with ScheduleWakeup(270s) watch loop
- `commands/gsd-t-unattended-watch.md` — stateless watch-tick command
- `commands/gsd-t-unattended-stop.md` — stop sentinel helper
- `commands/gsd-t-resume.md` — Step 0 Auto-Reattach + Step 0.2 Handoff Lock Wait
- `commands/gsd-t-wave.md` — final "Run /clear" STOP removed
- `.claude/settings.json` — project-shared SessionStart auto-resume hook
- `docs/unattended-windows-caveats.md` — known sleep-prevention limitation
- Contract: `unattended-supervisor-contract.md` v1.0.0

## Tests

- 1146 → 1226 (+80 net)
- Supervisor: 42, safety: 18, platform: 14, handoff-lock: 16, headless-auto-spawn: +9, command-files-stop-message-audit: +1
- Command count: 60 → 61 (55 gsd-t → 56), filesystem test bumped

## Requirements

REQ-079 through REQ-087 (9 new requirements) — all complete.

## Phase 0 (pre-partition)

- Spikes A, B, D passed end-to-end
- P0 fix: `bin/gsd-t.js buildHeadlessCmd()` drops `/user:` prefix (was silently breaking M35's autoSpawnHeadless)

## Waves

- Wave 1: supervisor-core foundation + safety/platform scaffolding
- Wave 2: hook-point wiring (4 hook points) + handoff-lock integration
- Wave 3: 3 parallel tasks (launch command + resume auto-reattach + stop-message sweep)
- Wave 4: atomic doc ripple (10 files) + v2.77.0 bump

## Outstanding

- Windows sleep-prevention — documented in `docs/unattended-windows-caveats.md` (v2 future work)
- Multi-milestone autonomous execution — v1 targets one milestone at a time
- Cloud-hosted supervisor orchestration — future milestone
