# Tasks: m54-d1-server-and-detector

## Summary

Build the live-activity detector module + 3 dashboard endpoints + global-bin install entry + STABLE contract. Skeleton only at partition time; tasks fully populated during the PLAN phase. The shape below is locked from the M54 DEFINE — 5 tasks in a sequential chain, file ownership 1:1 with `scope.md`.

## Tasks

### Task 1: `bin/live-activity-report.cjs` detector module
- **Files**:
  - `bin/live-activity-report.cjs` (new)
  - `test/m54-d1-live-activity-report.test.js` (new)
- **Contract refs**: `live-activity-contract.md` § kinds catalogue, § dedup, § liveness, § silent-fail
- **Dependencies**: NONE
- **Acceptance criteria** (deferred to PLAN — locked at partition):
  - Detects all 4 kinds (`bash`, `monitor`, `tool`, `spawn`).
  - Dedupes by `tool_use_id` (preferred) then `(kind, label, startedAt)` tuple.
  - Three liveness falsifiers in priority order.
  - Silent-fail on malformed/missing inputs.
  - ~10-case unit test suite.

### Task 2: `/api/live-activity` handler + route + 5s cache
- **Files**:
  - `scripts/gsd-t-dashboard-server.js` (additive — new `handleLiveActivity` + 1 route line)
  - `test/m54-d1-dashboard-handlers.test.js` (new — start of file)
- **Contract refs**: `live-activity-contract.md` § endpoints
- **Dependencies**: T1
- **Acceptance criteria** (deferred to PLAN):
  - 200 envelope, `Cache-Control: no-store`, schema-versioned.
  - 5s response cache (1 detector call per 5s window, regardless of request count).
  - 500 only on contract regression.

### Task 3: `/api/live-activity/<id>/tail` + `/api/live-activity/<id>/stream` handlers + routes
- **Files**:
  - `scripts/gsd-t-dashboard-server.js` (additive — `handleLiveActivityTail` + `handleLiveActivityStream` + 2 route lines)
  - `test/m54-d1-dashboard-handlers.test.js` (additive)
- **Contract refs**: `live-activity-contract.md` § endpoints, § path-traversal defense
- **Dependencies**: T2
- **Acceptance criteria** (deferred to PLAN):
  - Tail returns last ~64 KB (bash) or last 200 lines (monitor) per id.
  - SSE stream incrementally follows file growth.
  - `<id>` path-traversal rejection (400) for `..`, `/`, `\`, NUL.
  - Per-id 5s cache on tail; stream uncached.

### Task 4: `bin/gsd-t.js` `GLOBAL_BIN_TOOLS` array entry + module install verification
- **Files**:
  - `bin/gsd-t.js` (1-line edit — append `"live-activity-report.cjs"` to `GLOBAL_BIN_TOOLS`)
- **Contract refs**: `live-activity-contract.md` § install location
- **Dependencies**: T1 (module file must exist before the install machinery copies it)
- **Acceptance criteria** (deferred to PLAN):
  - `GLOBAL_BIN_TOOLS` array contains `"live-activity-report.cjs"`.
  - `gsd-t install` populates `~/.claude/bin/live-activity-report.cjs` (verified by hot-patch + manual run).
  - `gsd-t doctor --check-global-bin` reports `OK` post-install.
  - Zero new wiring code (existing `installGlobalBinTools()` handles it).

### Task 5: `.gsd-t/contracts/live-activity-contract.md` flip to STABLE + Checkpoint 1 publication
- **Files**:
  - `.gsd-t/contracts/live-activity-contract.md` (edit — v0.1.0 PROPOSED → v1.0.0 STABLE)
  - `.gsd-t/contracts/m54-integration-points.md` (edit — Checkpoint 1 PROPOSED → PUBLISHED)
  - `docs/architecture.md` (edit — finalise endpoint signatures + install path in the existing § Live Activity Observability subsection)
- **Contract refs**: `m54-integration-points.md` Checkpoint 1
- **Dependencies**: T1, T2, T3, T4
- **Acceptance criteria** (deferred to PLAN):
  - Contract status PROPOSED → STABLE; version 0.1.0 → 1.0.0.
  - All schema fields, endpoint signatures, dedup rules, falsifier order match implementation 1:1.
  - REQ-M54-D1-06 in `docs/requirements.md` flips planned → done.
  - Checkpoint 1 in `m54-integration-points.md` flips PROPOSED → PUBLISHED with timestamp.
  - Architecture doc section finalised with endpoint signatures + `~/.claude/bin/` install path.

## Execution Estimate

- Total tasks: 5
- Independent tasks (no blockers): 1 (Task 1)
- Blocked tasks (waiting on other tasks within domain): 4 (Tasks 2–5 form a sequential chain)
- Estimated checkpoints: 1 (Checkpoint 1 — `m54-integration-points.md`, after Task 5)
