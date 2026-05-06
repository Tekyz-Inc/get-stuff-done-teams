# Tasks: m47-d1-viewer-redesign

## Summary
Rewrite `scripts/gsd-t-transcript.html` (the viewer that ships via `gsd-t install` per `bin/gsd-t.js::UTILITY_SCRIPTS`) into a dual-pane focused layout: top pane streams the main in-session conversation (zero clicks), bottom pane streams the user-selected spawn. Left rail splits into Main Session / Live Spawns / Completed sections (capped 100, status-badged). sessionStorage persists selection + splitter position + completed-toggle state. Right rail (Spawn Plan / Parallelism / Tool Cost) preserved under a collapsible toggle. Back-compat surfaces preserved: `data-spawn-id="__SPAWN_ID__"` substitution still works for `/transcript/:spawnId` bookmarks (those land in the bottom pane pre-selected, top pane shows main session as usual).

> **Note on `templates/gsd-t-transcript.html`**: The domain scope mentions a templates copy in lockstep, but inspection of the repo shows `bin/gsd-t.js::UTILITY_SCRIPTS` (line 1079) installs from `scripts/gsd-t-transcript.html` directly — no `templates/gsd-t-transcript.html` exists. This domain treats `scripts/gsd-t-transcript.html` as the **single source of truth**. Do NOT create a `templates/` copy unless `bin/gsd-t.js` is changed to install from there (which would belong to a different domain — out of scope for M47).

## Tasks

### Task 1: Read existing viewer + dashboard server contract end-to-end
- **Files**: read-only — `scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js` (`listInSessionTranscripts`, `handleTranscriptsList`, `isValidSpawnId`, transcriptsDir), `.gsd-t/contracts/dashboard-server-contract.md` v1.3.0, `.gsd-t/contracts/conversation-capture-contract.md` v1.0.0
- **Contract refs**: dashboard-server-contract.md, conversation-capture-contract.md, m47-integration-points.md
- **Dependencies**: NONE (must precede any code changes — black-box read per constraints.md)
- **Acceptance criteria**:
  - Confirmed: header layout, current grid (`280px 1fr 320px`), `#tree` rail, `#stream` main, `#spawn-plan-panel` right rail, auto-follow checkbox, `pollSpawns()` fetches `/transcripts`, `connect(initialId)` opens `/transcript/:id/stream` SSE
  - Confirmed: in-session entries are detected client-side via `spawnId.startsWith('in-session-')` and rendered with `💬 conversation` badge
  - Confirmed: `data-spawn-id="__SPAWN_ID__"` is the only server-side placeholder; substitution happens in `handleTranscriptPage` and the empty-id fallback in `handleTranscriptsList` (HTML branch)
  - Confirmed: D2 will publish `GET /api/main-session` and `status: 'active' | 'completed'` on `/transcripts` in-session entries (per m47-integration-points.md)
  - Output: this task's "result" is a brief inline note in the execute log — no file edits

### Task 2: Restructure HTML + CSS into split-pane scaffolding (no logic changes)
- **Files**: `scripts/gsd-t-transcript.html`
- **Contract refs**: m47-integration-points.md (back-compat surfaces preserved)
- **Dependencies**: Requires Task 1 (within domain)
- **Acceptance criteria**:
  - `<body data-spawn-id="__SPAWN_ID__">` placeholder preserved verbatim — server-side substitution still works
  - Center pane reorganized: parent `<main>` becomes a vertical flex container with two children — `<section id="main-stream">` (top) and `<section id="spawn-stream">` (bottom), separated by a draggable `<div class="splitter" role="separator" tabindex="0" aria-orientation="horizontal">` handle
  - Splitter is keyboard-accessible: `Tab` focuses, `ArrowUp`/`ArrowDown` nudge ±5%, `Home`/`End` snap to 20%/80%
  - Existing `#stream` element kept (now mounted inside `#spawn-stream`) — no broken selectors in legacy renderer code
  - Top pane has its own scrollable container `#main-stream` styled identically to `#spawn-stream` (shared `.frame` rules apply)
  - Right rail (`#spawn-plan-panel`) wrapped in `<aside class="spawn-panel" data-collapsed="false">` with a small toggle button in its header that flips `data-collapsed` and CSS hides the body when `[data-collapsed="true"]`
  - sessionStorage key `gsd-t.viewer.splitterPct` persists splitter position (0–100, default 50); restored on load via `getItem` + clamp
  - sessionStorage key `gsd-t.viewer.rightRailCollapsed` persists right-rail collapsed flag (default false)
  - All existing 7 viewer-route/HTML tests continue to pass (per scope: append assertions, don't break existing ones)

### Task 3: Restructure left rail into 3 sections (Main Session / Live / Completed)
- **Files**: `scripts/gsd-t-transcript.html`
- **Contract refs**: m47-integration-points.md (D1 must NOT compute status itself)
- **Dependencies**: Requires Task 2 (within domain). Pre-render markup with empty placeholders — bucketing logic lands in Task 5 once D2 publishes `status`.
- **Acceptance criteria**:
  - Left rail markup contains 3 distinct sections, in this order:
    - `<section class="rail-main" data-rail-section="main">` — header: "★ Main Session"; body: empty placeholder
    - `<section class="rail-live" data-rail-section="live">` — header: "Live Spawns"; body: empty placeholder
    - `<section class="rail-completed" data-rail-section="completed" data-expanded="true">` — header: "Completed" with a chevron toggle button; body: empty placeholder
  - Existing `#tree` div kept as the legacy mount point but moved INTO `<section class="rail-live">` body (so the existing `renderTree` continues to work as a no-op fallback while Task 5 bucketing rolls out)
  - Completed section toggle: clicking the chevron flips `data-expanded` between `true` and `false`; CSS hides the body when `false`
  - sessionStorage key `gsd-t.viewer.completedExpanded` persists toggle state (default true)
  - Tool Cost panel and existing right-rail panels untouched
  - Test added in `test/dashboard-server.test.js` (append-only): GET `/transcript/test-spawn` returns HTML containing `data-rail-section="main"`, `data-rail-section="live"`, and `data-rail-section="completed"` markers (sanity check on the pre-rendered markup)

### Task 4: Wire dual SSE contexts (top pane = main session, bottom pane = selected spawn)
- **Files**: `scripts/gsd-t-transcript.html`
- **Contract refs**: dashboard-server-contract.md (`/api/main-session`, `/transcript/:spawnId/stream`), m47-integration-points.md (top-pane default-load checkpoint)
- **Dependencies**: Requires Task 2 (within domain) AND BLOCKED BY m47-d2-server-helpers Task 2 (`/api/main-session` must be live for this task to fetch a real result; before that, scaffold around `null` returns)
- **Acceptance criteria**:
  - On page load (`DOMContentLoaded`):
    1. If `data-spawn-id` is non-empty → bottom pane connects to `/transcript/:id/stream` (existing flow — preserves bookmarks landing in the bottom pane pre-selected)
    2. If `data-spawn-id` is empty AND sessionStorage has `gsd-t.viewer.selectedSpawnId` → bottom pane connects to that
    3. Otherwise bottom pane shows an "Click any spawn to focus it here" empty state
  - Always (parallel to bottom pane resolution): fetch `/api/main-session`; if `filename !== null` → top pane connects to `/transcript/:sessionId/stream` where `sessionId = "in-session-" + body.sessionId` (the existing per-spawn SSE route already serves `in-session-*.ndjson` because `transcripts/{spawnId}.ndjson` resolves to the in-session file when spawnId starts with `in-session-`)
  - Top-pane connection succeeds within 3s of page load (success criterion 1) — measure inline via `performance.now()` deltas in a debug log only; no UI-visible timing
  - Frame renderer is reused: a single `appendFrame(target, frame)` function takes a parent container; existing `renderUserMessage` / `renderAssistantText` / `renderToolUse` / etc. are refactored to take a `targetEl` argument so both panes can render with the same code
  - Empty-state for top pane (`/api/main-session` returns `{ filename: null, ... }`) shows "No in-session conversation captured yet" — no error
  - Existing per-frame timestamp pill and `.frame.*` CSS classes apply to both panes unchanged

### Task 5: Bucket spawns into rail sections + render status badges
- **Files**: `scripts/gsd-t-transcript.html`
- **Contract refs**: m47-integration-points.md (D1 consumes `status` field from D2; never compute itself)
- **Dependencies**: Requires Task 3 (within domain) AND BLOCKED BY m47-d2-server-helpers Task 1 (`status` field must be on the JSON payload)
- **Acceptance criteria**:
  - `pollSpawns()` (existing 3s poll on `/transcripts`) is extended to bucket entries:
    - `spawn.spawnId.startsWith('in-session-')` AND most-recently-modified ranking position 0 → "Main Session" section (★)
    - `spawn.status === 'active'` → "Live Spawns" section
    - `spawn.status === 'completed'` (or any non-`active` value) → "Completed" section
  - Completed section is **capped at 100 entries** newest-first (`startedAt` desc); older entries dropped silently from the rail
  - Status badges rendered on completed entries: `success` (green dot), `failed` (red), `killed` (gray). Until D2's status-source produces these values, all completed entries get a neutral `completed` (gray) badge — code branches on `spawn.status` so future D2 upgrades light up automatically without a viewer change
  - Live → Completed transition is reactive: when a spawn's `status` flips between polls, it moves sections without a full reload (DOM diff via `data-spawn-id` lookups)
  - Focus persistence: if the currently-selected spawn (in bottom pane) transitions Live → Completed, it stays selected — no auto-revert (success criterion 3)
  - Clicking a rail entry: writes `gsd-t.viewer.selectedSpawnId` to sessionStorage, then loads the spawn into the bottom pane within 1s (success criterion 2)
  - Auto-follow remains a checkbox toggle in the header; default ON; localStorage `gsdt.autoFollow` honored as before; auto-follow ONLY affects bottom pane
  - Test added in `test/dashboard-server.test.js` (append-only): asserts the rendered HTML response contains the `data-rail-section` markers AND a `<style>` rule for `.rail-completed[data-expanded="false"] .rail-body { display: none; }` (or equivalent) — pre-flight check that the toggle CSS is present

### Task 6: Splitter drag handling + sessionStorage persistence
- **Files**: `scripts/gsd-t-transcript.html`
- **Contract refs**: m47 success criterion (splitter persists, keyboard-accessible)
- **Dependencies**: Requires Task 2 (within domain) — markup exists; this wires behavior
- **Acceptance criteria**:
  - Mouse: `mousedown` on splitter → captures pointer → `mousemove` updates `--main-pane-pct` CSS var (clamped 10–90) → `mouseup` releases + writes pct to `gsd-t.viewer.splitterPct`
  - Keyboard: `ArrowUp` / `ArrowDown` while splitter focused → ±5% (clamped 10–90), persisted on each keypress
  - Page load: read `gsd-t.viewer.splitterPct` (default 50), clamp 10–90, apply to `--main-pane-pct`
  - Splitter visual hover state (cursor: row-resize, optional accent-color border on focus)
  - No layout shift on initial paint — apply CSS var **before** first content render

### Task 7: E2E + integration tests for the new viewer
- **Files**: `test/dashboard-server.test.js` (append-only)
- **Contract refs**: dashboard-server-contract.md, m47-integration-points.md
- **Dependencies**: Requires Tasks 2, 3, 4, 5, 6 (all D1 implementation tasks) — append at the end
- **Acceptance criteria**:
  - Test: GET `/transcript/some-spawn` returns HTML with all M47 structural markers (`data-rail-section="main"`, `="live"`, `="completed"`, splitter `role="separator"`, `id="main-stream"`, `id="spawn-stream"`, `data-spawn-id="some-spawn"`)
  - Test: GET `/transcripts` (HTML branch via `Accept: text/html`) returns the same viewer with `data-spawn-id=""` (empty) — confirms back-compat shim still works
  - Test: existing 7 viewer-route/HTML tests continue to pass (this is the regression fence)
  - Test: each new sessionStorage key (`gsd-t.viewer.selectedSpawnId`, `gsd-t.viewer.splitterPct`, `gsd-t.viewer.completedExpanded`, `gsd-t.viewer.rightRailCollapsed`) appears in the HTML source string (sanity check that the wiring code emits the keys)
  - Suite total: prior baseline 2047/2047 passes + new M47 tests (D1 + D2 net add) — success criterion 5

## Execution Estimate
- Total tasks: 7
- Independent tasks (no blockers): 1 (Task 1 — read-only)
- Within-domain blocked: 4 (Tasks 2, 3, 6 wait on 1; Task 7 waits on 2-6)
- Cross-domain blocked: 2 (Task 4 waits on D2 Task 2; Task 5 waits on D2 Task 1)
- Estimated checkpoints: 1 (D2 publishes status + /api/main-session — unblocks D1 Tasks 4 & 5)
