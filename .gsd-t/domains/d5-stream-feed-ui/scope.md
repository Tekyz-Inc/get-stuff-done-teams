# Domain: d5-stream-feed-ui

## Responsibility
A single HTML file + embedded JS that connects to D4's websocket and renders incoming stream-json frames as a claude.ai-style continuous feed: assistant message blocks, collapsible tool calls, task-boundary banners, scrollback. Zero Claude token cost.

## Owned Files/Directories
- `scripts/gsd-t-stream-feed.html` — the UI (promoted from or rewritten against `scripts/gsd-t-agent-dashboard.html`, existing 1043 LOC untracked)
- `scripts/gsd-t-stream-feed.css` — if styling extracted from HTML for size
- `test/m40-stream-feed-ui.test.js` — smoke test via node fetch of the served HTML, assert key elements present; no browser automation (Playwright is for product UIs, this is an operator tool)

## NOT Owned (do not modify)
- `scripts/gsd-t-stream-feed-server.js` (D4)
- `scripts/gsd-t-dashboard*` (M35 metrics dashboard — different port, different purpose, DO NOT MERGE)
- `scripts/gsd-t-design-review*` (different feature)

## Feature Set
1. **Assistant blocks**: render `type: "assistant"` frames as message cards, markdown rendered client-side (no server-side rendering to keep server dumb).
2. **Tool call blocks**: render `type: "tool_use"` and `type: "tool_result"` frames as collapsible cards (collapsed by default, click to expand). Show tool name, duration, truncated input/output preview.
3. **Task-boundary banners**: `type: "task-boundary"` frames → horizontal banner with task-id, wave-id, state (running/done/failed). Failed banners are red.
4. **Scrollback**: on connect, replay today's JSONL from D4; user can scroll back through prior frames.
5. **Filter**: filter by taskId, domain, wave (client-side only — no server round-trip).
6. **Auto-scroll**: follow live feed unless user has scrolled up; show "jump to live" button when scrolled away.

## Existing Code Disposition
- `scripts/gsd-t-agent-dashboard.html` (untracked, 1043 LOC): **INSPECT** first. If its renderer covers the above 6 features and targets the same schema, promote. Otherwise, salvage CSS/layout and rewrite the JS data-binding layer.
