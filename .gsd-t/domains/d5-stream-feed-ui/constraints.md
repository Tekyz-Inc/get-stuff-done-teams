# Constraints: d5-stream-feed-ui

## Must Follow
- Single HTML file + optional single CSS file. No build step. No bundler. No npm.
- Vanilla JS only. No React, Vue, Svelte, or any framework. The page must load offline if D4 is reachable.
- Markdown rendering: use a single small inline function (the existing dashboard does this already — reuse). No external markdown library import.
- Fail-soft: malformed frame must not break the feed. Log to console, skip, continue rendering subsequent frames.
- Dark-mode default, matches claude.ai aesthetic at a glance (the user called this out specifically).
- Mobile: not required. Operator tool, desktop assumed.

## Must Not
- Load any script or stylesheet from a CDN. Local only.
- Call any API beyond the D4 websocket.
- Persist anything to localStorage beyond UI preferences (which filters are selected, scrolled position). Frame history lives in D4's JSONL, not the browser.
- Store Claude tokens, API keys, or any secret.
- Auto-open in a browser on orchestrator start. Operator opens it manually.

## Gate Semantics
- D5 does NOT execute until D0 speed-benchmark returns PASS. D0 FAIL → D5 deferred.

## Must Read Before Using
- `scripts/gsd-t-agent-dashboard.html` (existing 1043-LOC untracked) — potential reuse.
- `.gsd-t/contracts/stream-json-sink-contract.md` — the frame schema it renders.

## Dependencies
- Depends on: D4 (data source).
- Depended on by: nothing (terminal UI domain).
