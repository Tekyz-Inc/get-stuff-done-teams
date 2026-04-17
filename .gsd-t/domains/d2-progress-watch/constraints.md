# Constraints: d2-progress-watch

## Must Follow

- Zero external dependencies — Node.js built-ins only (`fs`, `path`, `process`). Consistent with the framework's zero-runtime-dep invariant.
- `.gsd-t/.watch-state/{agent_id}.json` state-file schema is the single source of truth — watcher rebuilds the tree solely from these files (no cross-process state, no shared memory).
- Tree reconstruction uses `parent_agent_id` lineage — each state file declares its own id and its parent's id; the root is the agent with no parent.
- Render format: task-list tree with ✅ (done) / 🔄 (in progress) / ⬜ (pending) markers. Collapse outer levels, expand at the current inner level.
- Existing `--watch` banner is preserved INTACT. Task list appends BELOW the banner.
- State-writer CLI (`scripts/gsd-t-watch-state.js`) interface is stable and documented in `watch-progress-contract.md` — shims in command files call this CLI, not the tree builder directly.
- Shims in the ~17 workflow command files are ADDITIVE (bash one-liners at the start of each numbered Step) — no rewriting of existing Step bodies.
- `.gsd-t/.watch-state/` is gitignored (runtime state, never committed).
- Stale state files (agents that crashed or exited without `done`) are handled gracefully — the renderer must tolerate partial trees and surface them as 🔄 rather than crashing.
- Tests exercise real file I/O against `.gsd-t/.watch-state/` (tmp dir per test) — no mocks of the file system.
- Functions under 30 lines; files under 200 lines (CLAUDE.md default).

## Must Not

- Do NOT touch `bin/gsd-t-unattended.cjs::_spawnWorker` prompt text (owned by D3).
- Do NOT touch the worker timeout constant or the supervisor main relay loop (owned by D4).
- Do NOT touch `unattended-supervisor-contract.md` (D3 and D4 own sections there; D2 owns its own contract file).
- Do NOT modify non-workflow command files (help, status, metrics, setup, backlog-*, optimization-*, etc.).
- Do NOT replace or restructure the existing `--watch` banner — append below it only.
- Do NOT add external npm runtime dependencies to the installer.
- Do NOT inline the state-writer logic into command files — command shims call the CLI.

## Must Read Before Using

- `bin/gsd-t-unattended.cjs` watch printer section — existing `--watch` banner output that the renderer appends below.
- `bin/unattended-watch-format.cjs` — existing watch formatter; understand its output contract before appending.
- `bin/headless-auto-spawn.cjs` `autoSpawnHeadless` watch fallback — its banner format.
- `.gsd-t/contracts/unattended-event-stream-contract.md` — existing event schema, so watch-state model stays disjoint from event stream (they are separate surfaces; state file drives watch, JSONL drives archival).
- `.gsd-t/contracts/headless-default-contract.md` — headless spawn invariants the watch tree must reflect.
- A sample numbered-Step command file (e.g., `commands/gsd-t-execute.md`) — to understand where shim bash lines should be inserted.

## Dependencies

- Depends on: nothing (D2 is self-contained — it introduces the state-writer CLI + tree builder + shims independently).
- Depended on by: nothing inside M39. D3 and D4 tests MAY optionally exercise the state-writer CLI for their own coverage, but they are not required to; D3/D4 can land without any D2 integration.
- External touch-points: the ~17 workflow command files (shims) and 3 watch-printer call sites (render integration). All additive.
