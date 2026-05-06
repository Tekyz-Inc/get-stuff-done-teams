# Tasks: m47-d2-server-helpers

## Summary
Two additive changes to `scripts/gsd-t-dashboard-server.js`: (1) replace the hardcoded `status: "active"` literal in `listInSessionTranscripts` with a 30s-window mtime-based derivation (`active` if `Date.now() - mtimeMs < 30_000`, else `completed`), exposed through `handleTranscriptsList`; (2) add `GET /api/main-session` returning the most-recently-modified `in-session-*.ndjson` (path-traversal-guarded). Bumps `dashboard-server-contract.md` to v1.3.0 and adds regression tests to `test/dashboard-server.test.js`.

## Tasks

### Task 1: Derive `status` field from mtime (30s window)
- **Files**: `scripts/gsd-t-dashboard-server.js`
- **Contract refs**: `dashboard-server-contract.md` v1.3.0 — § In-Session Entry Status Field
- **Dependencies**: NONE
- **Acceptance criteria**:
  - `listInSessionTranscripts(projectDir)` returns each entry with `status: 'active' | 'completed'`
  - Status is derived per-entry: `Date.now() - stat.mtimeMs < 30_000` → `'active'`, else `'completed'` (no longer the hardcoded `"active"` literal at line 203)
  - Existing `mtimeMs` already accessible via `stat`; no new stat calls
  - All other fields on the returned entry shape are unchanged (`spawnId`, `command`, `startedAt`, `lastUpdatedAt`, `kind`)
  - `handleTranscriptsList` propagates the field to the merged JSON response (no extra work — `Array.concat` already does this via the inSession entries it adds)
  - The 7 existing viewer-route/HTML tests continue to pass — no field renamed, no field removed

### Task 2: Add `GET /api/main-session` endpoint
- **Files**: `scripts/gsd-t-dashboard-server.js`
- **Contract refs**: `dashboard-server-contract.md` v1.3.0 — § GET /api/main-session
- **Dependencies**: NONE (decoupled from Task 1 — different code path; share the `transcriptsDir` helper and `isValidSpawnId` guard, but do not need each other to compile)
- **Acceptance criteria**:
  - New helper `handleMainSession(req, res, projectDir)` exported from the module
  - Helper scans `transcriptsDir(projectDir)` for files matching `^in-session-(.+)\.ndjson$`
  - For each candidate, derives `spawnId = filename.slice(0, -'.ndjson'.length)` and skips if `!isValidSpawnId(spawnId)` (path-traversal guard reuse)
  - Returns the entry with the highest `stat.mtimeMs` as JSON: `{ filename, sessionId, mtimeMs }` where `sessionId = filename.slice('in-session-'.length, -'.ndjson'.length)`
  - Empty state: returns `{ filename: null, sessionId: null, mtimeMs: null }` with HTTP 200 when no `in-session-*.ndjson` exists
  - No caching: response sets `Cache-Control: no-store` (per contract — viewer hits this on every page load)
  - Route wired in the request dispatcher around the existing `if (url === "/transcripts") …` block (sibling, not nested)
  - `handleMainSession` is added to `module.exports`

### Task 3: Bump contract version + document semantics
- **Files**: `.gsd-t/contracts/dashboard-server-contract.md`
- **Contract refs**: self
- **Dependencies**: NONE — contract was already drafted to v1.3.0 during partition. Verify documentation matches the implemented derivation/endpoint shape and tighten if drift is found between docs and code.
- **Acceptance criteria**:
  - Version line reads `**Version**: 1.3.0`
  - § GET /api/main-session documents response shape, empty state, no-cache header
  - § In-Session Entry Status Field documents the 30s window, the `'active' | 'completed'` enum, and the deliberate non-goals (`success` / `failed` / `killed` out of scope)
  - Module Exports section lists `handleMainSession` and notes that `listInSessionTranscripts` returns entries with `status`
  - No removed sections (additive change only)

### Task 4: Regression tests for `status` field derivation
- **Files**: `test/dashboard-server.test.js`
- **Contract refs**: `dashboard-server-contract.md` v1.3.0
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - New describe block `listInSessionTranscripts — status field (M47 D2)` appended to the file (existing `describe("listInSessionTranscripts — filesystem fallback ...")` block stays intact)
  - Test: file with mtime "now" → `status === 'active'`
  - Test: file with mtime older than 30s (use `fs.utimesSync` to backdate) → `status === 'completed'`
  - Test: boundary at exactly 30s — accept `active` OR `completed` (boundary semantics intentionally fuzzy, but must be one of the two)
  - Test: `handleTranscriptsList` JSON response includes `status` on the in-session entries it merges in
  - All 7 existing viewer-route/HTML tests continue to pass

### Task 5: Regression tests for `/api/main-session`
- **Files**: `test/dashboard-server.test.js`
- **Contract refs**: `dashboard-server-contract.md` v1.3.0
- **Dependencies**: Requires Task 2 (within domain)
- **Acceptance criteria**:
  - New describe block `GET /api/main-session (M47 D2)` appended after Task 4's block
  - Test: empty `transcripts/` directory → `{ filename: null, sessionId: null, mtimeMs: null }` with HTTP 200
  - Test: single `in-session-abc.ndjson` → returns that file with `sessionId === 'abc'` and `mtimeMs` matching `fs.statSync`
  - Test: two files, second written later (`fs.utimesSync` to bump mtime) → returns the newer file
  - Test: malformed filename (e.g., `in-session-bad name.ndjson` with a space) is filtered out by `isValidSpawnId` and never returned
  - Test: response includes `Cache-Control: no-store` header
  - All previous tests (Tasks 4 + existing 7) still pass

## Execution Estimate
- Total tasks: 5
- Independent tasks (no blockers): 3 (Tasks 1, 2, 3)
- Blocked tasks (within domain): 2 (Tasks 4, 5 — wait on 1, 2)
- Cross-domain blocked: 0
- Estimated checkpoints: 1 (D2 publishes both `status` field + `/api/main-session` → unblocks D1 consumption tasks)
