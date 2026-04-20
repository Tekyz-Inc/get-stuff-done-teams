# Tasks: d5-stream-feed-ui

## Summary
Single-file dark-mode HTML+JS watcher UI. Connects to D4 ws feed, renders claude.ai-style continuous stream (assistant cards, collapsible tool calls, task-boundary banners). No framework, no build, no cloud.

## Tasks

### Task 1: Inspect existing agent-dashboard UI, decide promote vs rewrite
- **Files**: `scripts/gsd-t-agent-dashboard.html` (EXISTING, untracked — inspect only), `.gsd-t/progress.md` (Decision Log entry)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`, `.gsd-t/contracts/design-brief.md` (if exists — for visual conventions)
- **Dependencies**: BLOCKED BY d4-stream-feed-server Task 2 (contract stability; UI targets the exact ws schema)
- **Wave**: 3
- **Acceptance criteria**:
  - Read the existing 1043-LOC file end-to-end
  - Inventory the 6 required features (assistant blocks, collapsible tool blocks, task-boundary banners, scrollback/replay, filter, auto-scroll + jump-to-live)
  - Write a Decision Log entry: `[d5-existing-code-disposition] PROMOTE | SALVAGE-CSS | REWRITE — rationale: ...`
  - If PROMOTE: rename to `scripts/gsd-t-stream-feed.html`, adjust ws URL + schema bindings to match D4 contract
  - If SALVAGE-CSS: keep layout/styles, rewrite data-binding in Task 2
  - If REWRITE: Task 2 writes fresh

### Task 2: Render loop — assistant + tool_use + tool_result blocks
- **Files**: `scripts/gsd-t-stream-feed.html` (NEW or MODIFIED)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Task 1
- **Wave**: 3
- **Acceptance criteria**:
  - Connects to `ws://127.0.0.1:7842/feed` on load; reconnects on disconnect with 1s backoff
  - Renders `{type: "assistant"}` frames as message cards with inline markdown rendering (hand-rolled, no lib)
  - Renders `{type: "tool_use"}` + matched `{type: "tool_result"}` as a collapsible card (collapsed by default); shows tool name, duration (computed from ts delta), truncated input/output preview
  - Malformed frame → console.warn, skip, continue
  - Dark mode matches claude.ai conventions (neutral dark bg, light text, muted code blocks)
  - Manually verified in a real browser by loading against a recorded JSONL fixture

### Task 3: Task-boundary + wave-boundary banners
- **Files**: `scripts/gsd-t-stream-feed.html` (MODIFY)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`, `.gsd-t/contracts/wave-join-contract.md`
- **Dependencies**: Requires Task 2
- **Wave**: 3
- **Acceptance criteria**:
  - Renders `{type: "task-boundary"}` as horizontal banner with taskId, domain, wave, state (green=running, grey=done, red=failed)
  - Renders `{type: "wave-boundary"}` as wider/prominent banner with wave number + duration
  - Banners are navigable — clicking a task-boundary scrolls the feed to that task's first frame
  - Verified against a fixture JSONL with 2 waves × 3 tasks

### Task 4: Scrollback + replay + filter + auto-scroll
- **Files**: `scripts/gsd-t-stream-feed.html` (MODIFY)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md`
- **Dependencies**: Requires Task 3
- **Wave**: 3
- **Acceptance criteria**:
  - On connect, sends `?from=0` to receive today's full replay, then live
  - User scroll up → auto-scroll pauses, floating "Jump to live" button appears
  - Jump to live → resume auto-scroll + scroll to bottom
  - Filter panel: checkboxes per taskId / domain / wave — client-side filter only, no server round-trip
  - Selected filters persist to `localStorage` (only UI prefs — no frame data)
  - Verified against a fixture JSONL with >200 frames

### Task 5: Smoke test — render output verification
- **Files**: `test/m40-stream-feed-ui.test.js` (NEW)
- **Contract refs**: N/A
- **Dependencies**: Requires Task 4
- **Wave**: 3
- **Acceptance criteria**:
  - Node test fetches the served HTML; asserts presence of required elements (feed container, filter panel, jump-to-live button, ws connect script)
  - Asserts no external CDN references (grep HTML for `://` not pointing to localhost)
  - Asserts file size under 150 KB (operator tool, not a bundled app)
  - No headless browser required — pure DOM-string inspection with a minimal regex/parse pass

### Task 6: Token-usage panel in the feed UI
- **Files**: `scripts/gsd-t-stream-feed.html` (MODIFY)
- **Contract refs**: `.gsd-t/contracts/stream-json-sink-contract.md` (§"Usage field propagation" — from D4-T6)
- **Dependencies**: Requires Task 4, BLOCKED BY d4-stream-feed-server Task 6 (aggregator schema must be stable first)
- **Wave**: 3
- **Acceptance criteria**:
  - Task-boundary banners now show `$X.XX · N in / N out / N cache-read tokens` inline next to the task id (when `{type:"result"}` frame has arrived for that task)
  - Wave-boundary banners show wave total: `wave N done — $X.XX · N tokens`
  - Corner status bar (fixed top-right) shows running total for the current run: `$X.XX · N tokens · M spawns`
  - Numbers formatted humanized (`1.2K`, `4.1M`), cost to 2 decimals
  - If a task's result frame has no `usage` field, panel shows `—` (not `$0.00`) to distinguish missing-data from zero-cost
  - Uses only data already in the ws feed — no new endpoints, no separate fetch
  - Verified against a recorded JSONL fixture that includes full M40-bench in-session run output (which carries a real `{type:"result"}` envelope with cost + usage)

## Execution Estimate
- Total tasks: 6
- Independent tasks (no blockers): 0 (all gated on D0 PASS + D4 Task 2)
- Blocked tasks (waiting on other domains): 2 (Task 1 on D4 Task 2, Task 6 on D4 Task 6)
- Blocked tasks (within domain): 4
- Estimated checkpoints: 1 (inspect-decide in Task 1)
