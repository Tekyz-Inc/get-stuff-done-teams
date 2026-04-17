# Watch-Progress Contract

**Version**: 1.0.0 (stub — full body written during D2 execute)
**Status**: STUB (partition-only scaffold)
**Owner**: D2 (`d2-progress-watch`)
**Consumers**:
- `bin/gsd-t-unattended.cjs` watch printer
- `bin/unattended-watch-format.cjs`
- `bin/headless-auto-spawn.cjs` `autoSpawnHeadless` watch fallback
- Any future `--watch` surface added to GSD-T

## Purpose

Defines the universal task-list progress view rendered under every `--watch` output. State-file-driven (`.gsd-t/.watch-state/{agent_id}.json`), tree-reconstructed via `parent_agent_id` lineage, rendered with ✅ / 🔄 / ⬜ markers below the existing `--watch` banner (banner preserved intact).

## Scope (to be fully specified during execute)

The full contract will define:

1. **State-file schema** — fields, types, required vs optional, atomic write semantics, stale-file tolerance.
2. **State-writer CLI interface** — `scripts/gsd-t-watch-state.js start|advance|done --agent-id X --parent-id Y --command Z --step N --step-label "..."`; exit codes; idempotency guarantees.
3. **Tree reconstruction algorithm** — root detection (no parent), child linking, collapsed-vs-expanded rendering rules, handling of orphan state files.
4. **Render format** — exact ✅ / 🔄 / ⬜ marker usage, indentation, the append-below-banner contract, banner preservation guarantee.
5. **Integration contract for `--watch` callers** — where to call the renderer, how to compose with the existing banner, error handling when `.gsd-t/.watch-state/` is missing or empty.
6. **Shim invocation pattern** — the exact bash one-liner shape that workflow command files insert at the top of each numbered Step.
7. **Interaction with event stream** — disjoint from `unattended-event-stream-contract.md` (state file drives live watch; JSONL drives archival). No schema overlap.

## TBD During Execute

The full body of this contract is written during D2 execute — NOT during partition. This stub exists so D3 and D4 can reference a stable contract file path and so the partition artifact set is complete.

## Related Contracts

- `.gsd-t/contracts/unattended-event-stream-contract.md` — archival event stream (disjoint surface).
- `.gsd-t/contracts/unattended-supervisor-contract.md` — supervisor/worker protocol (the watch printer is one of several consumers).
- `.gsd-t/contracts/headless-default-contract.md` — headless spawn invariants the watch tree reflects.
