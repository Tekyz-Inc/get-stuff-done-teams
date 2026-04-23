# M45 Partition — Conversation-Stream Observability

**Status**: PARTITIONED
**Date**: 2026-04-23
**Target version**: 3.18.14
**Domains**: 2 (D1 viewer-route-fix · D2 in-session-conversation-capture)
**Waves**: 2 (Wave 1 — D1 alone, Wave 2 — D2 alone) *OR* single parallel wave (see Wave Plan below)
**Rationale source**: M45 scope 2026-04-23 (see `.gsd-t/progress.md` M45 "Current Milestone" block).

## Theme

Make the orchestrator session's conversational turns visible in the visualizer transcript stream alongside spawned-agent transcripts. The `/transcripts` route is also promoted to serve the real viewer (left rail + main + right spawn-plan panel) so that empty-state UX matches what the user already expects.

This is a deliberately small milestone — two file-disjoint domains designed as a concrete test fixture for M44 parallelism (both file-disjoint, both provably under M44 D6 economics gates).

## Domains

### D1 — m45-d1-viewer-route-fix

**Responsibility**: Revert the v3.18.13 standalone `renderTranscriptsHtml` index at `GET /transcripts` — serve `gsd-t-transcript.html` (the same viewer used by `/transcript/:id`) with an empty/sentinel spawn-id placeholder so the viewer renders its left rail with all known spawns and no specific selection. The viewer's existing empty-state handling applies when the spawn list is empty.

**Files owned**:
- `scripts/gsd-t-dashboard-server.js` (`handleTranscriptsList` content negotiation block — text/html branch)
- `test/transcripts-html-page.test.js` (refactor assertions for new contract)
- *new, optional*: `test/m45-d1-transcripts-route-viewer.test.js` (positive test that `/transcripts` serves the viewer with empty spawn-id)

**Leaves alone** (no edits):
- `scripts/gsd-t-transcript.html` — D1 does not touch; the viewer's left-rail empty-state handling is already correct. D2 will edit this file to distinguish "💬 conversation" entries from "▶ spawn" entries.
- `bin/*` — no CLI changes.

**Success criteria**:
- `GET /transcripts` with `Accept: text/html` returns the content of `gsd-t-transcript.html` with `__SPAWN_ID__` substituted to an empty string (or a sentinel like `null`) that the viewer's hash/left-rail logic handles without crashing.
- `GET /transcripts` with `Accept: application/json` or `*/*` continues to return `{ spawns: [...] }` (back-compat for dashboard JS).
- `test/transcripts-html-page.test.js` updated so HTML assertions target the viewer's stable DOM hooks (e.g., `data-spawn-id` attr, left-rail container id) instead of the retired standalone list.

### D2 — m45-d2-in-session-conversation-capture

**Responsibility**: Capture the orchestrator session's conversational turns into a transcript NDJSON that the viewer's left rail lists alongside spawn entries. Wire a SessionStart / UserPromptSubmit / Stop / PostToolUse hook. Extend the viewer left rail to distinguish in-session entries from spawn entries. Extend the compact-detector so mid-conversation compactions are written to the active in-session NDJSON when no spawn NDJSON is the most-recently-modified target.

**Files owned**:
- `scripts/hooks/gsd-t-conversation-capture.js` *(new — hook script)*
- `scripts/gsd-t-compact-detector.js` *(additive — fallback target selection)*
- `scripts/gsd-t-transcript.html` *(additive — left-rail labeling, session-type badge)*
- `templates/CLAUDE-global.md` *(additive — settings.json hook block documentation)*
- `test/m45-d2-conversation-capture.test.js` *(new)*
- `test/m45-d2-compact-detector-in-session-fallback.test.js` *(new)*
- `test/m45-d2-transcript-left-rail-in-session.test.js` *(new)*
- `.gsd-t/contracts/conversation-capture-contract.md` *(new v1.0.0 — frame schema, file naming, hook entry points)*

**Leaves alone** (no edits):
- `scripts/gsd-t-dashboard-server.js` — D1 owns. The route changes for D1 are self-contained; D2 does not need a server-side route change (the viewer polls `/api/spawns-index` which already lists NDJSONs on disk; D2's new `in-session-{sessionId}.ndjson` files will appear naturally if the viewer is taught to also list them — see D2-T3 for the index wiring path).
- `test/transcripts-html-page.test.js` — D1 owns.

**Frame schema** (one-liner, full detail in `conversation-capture-contract.md`):
```json
{"type": "user_turn"|"assistant_turn"|"tool_use"|"compact_marker", "ts": "...", "session_id": "...", "content": "...", "message_id": "..."}
```

**Success criteria**:
- A new orchestrator session appends `user_turn` + `assistant_turn` frames to `.gsd-t/transcripts/in-session-{sessionId}.ndjson` for every human↔Claude exchange.
- The viewer's left rail lists these files with the label `💬 conversation` (distinct from `▶ spawn`).
- A simulated `/compact` event during an in-session conversation lands `compact_marker` in the active in-session NDJSON, not a random spawn NDJSON.
- All 3 new test files pass; existing 1914 suite stays green.

## Shared Files & Conflict Map

| File | Owner | Notes |
|------|-------|-------|
| `scripts/gsd-t-dashboard-server.js` | **D1 only** | `/transcripts` route change. D2 does not touch. |
| `scripts/gsd-t-transcript.html` | **D2 only** | Left-rail labeling for in-session vs spawn entries. D1 does not touch (viewer's empty-state already works). |
| `scripts/gsd-t-compact-detector.js` | **D2 only** | Fallback target-selection when no spawn ndjson is most-recently-modified. |
| `scripts/hooks/gsd-t-conversation-capture.js` | **D2 only** *(new)* | New hook. |
| `templates/CLAUDE-global.md` | **D2 only** | Settings.json hook block wiring. |
| `test/transcripts-html-page.test.js` | **D1 only** | Refactored assertions. |
| `test/m45-d1-*.test.js` | **D1 only** *(new)* | |
| `test/m45-d2-*.test.js` | **D2 only** *(new)* | |
| `.gsd-t/contracts/conversation-capture-contract.md` | **D2 only** *(new)* | |

**File-disjointness**: Confirmed. D1 touches 1 prod file + 1 test; D2 touches 4 prod files + 3 tests + 1 contract. Zero shared write targets.

## Wave Plan

**Preferred — Single parallel wave** (tests M44 D5 file-disjointness prover + D6 economics gate):

| Wave | Domain | Parallel-safe? | Depends on |
|------|--------|----------------|-----------|
| 1 | D1 viewer-route-fix | Yes — file-disjoint from D2 | — |
| 1 | D2 in-session-conversation-capture | Yes — file-disjoint from D1 | — |

D2 has zero hard dep on D1: the hook + capture + viewer-left-rail work runs independently. D2's left-rail entries will show up regardless of D1's route change, because the viewer is reached via `/transcript/:id` as well as (post-D1) `/transcripts`.

**Fallback — Sequential** (if M44 parallelism isn't ready to dispatch):
1. D1 lands first (smaller scope).
2. D2 lands second.

## Integration Points

**Post-Wave-1** (before `/gsd-t-verify`):
- End-to-end smoke: start the dashboard, run a short orchestrator conversation, open `/transcripts`, confirm the in-session entry appears in the left rail with the `💬 conversation` label. Click it — the viewer's main pane shows the captured user/assistant turns in order.
- Simulate a `/compact` via a synthetic event emitter in a test and assert the `compact_marker` appears in the active in-session NDJSON, not in an unrelated spawn file.

## Skipped Partition Steps (with rationale)

- **Step 1.5 Assumption Audit**: No external project references. Only framework-internal references — Claude Code hook events (SessionStart, UserPromptSubmit, Stop, PostToolUse) carry `USE` disposition; they're part of the hook contract Claude Code already publishes.
- **Step 1.6 Consumer Surface**: N/A (GSD-T is a framework package; the consumer surface is the transcript viewer HTML, which is internal).
- **Step 3.5 / 3.6 Design Brief / Contract**: N/A (UI change is a one-icon badge + route swap — no new surface).

## Execution Order (supervisor / solo)

1. **Wave 1** — D1 + D2 in parallel (file-disjoint, safe per shared-files map above). Under M44 parallelism: spawn 2 subagents, one per domain, each receives its domain scope + tasks + relevant contracts.
2. **Wave 1 gate** — both domains' test suites pass + manual smoke per Integration Points.
3. `/gsd-t-integrate` (trivial — no cross-domain wiring) → `/gsd-t-verify` → auto-invokes `/gsd-t-complete-milestone` → tag v3.18.14.
4. `npm publish` → `/gsd-t-version-update-all`.

## Known Blockers

None. All prerequisite infrastructure landed:
- Viewer (`scripts/gsd-t-transcript.html`, M42 + M44 D8) ready.
- Compact detector (`scripts/gsd-t-compact-detector.js`, M44 Q2a/Q2b) ready — D2 extends its target-selection logic.
- Claude Code hook events documented and used elsewhere in the codebase (`scripts/hooks/gsd-t-in-session-usage-hook.js`) — D2 follows the same pattern.
