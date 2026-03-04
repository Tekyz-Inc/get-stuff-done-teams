# Domain: server

## Responsibility
Build the zero-dependency Node.js SSE server that tails `.gsd-t/events/*.jsonl` files and streams structured events to browser clients. Also serves `gsd-t-dashboard.html` as a static file.

## Owned Files/Directories
- `scripts/gsd-t-dashboard-server.js` — new SSE server (create)
- `test/dashboard-server.test.js` — new tests for server module exports (create)

## NOT Owned (do not modify)
- `scripts/gsd-t-dashboard.html` — owned by dashboard domain
- `commands/gsd-t-visualize.md` — owned by command domain
- `bin/gsd-t.js` — owned by command domain
- All reference files (README.md, GSD-T-README.md, etc.) — owned by command domain
- All existing scripts (gsd-t-heartbeat.js, gsd-t-tools.js, etc.)
