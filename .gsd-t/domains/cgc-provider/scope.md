# Domain: cgc-provider

## Purpose
MCP client that connects to a running CodeGraphContext MCP server. Translates graph-abstraction queries into CGC MCP tool calls. Enriches CGC results with GSD-T overlay data.

## Owned Files
- `bin/graph-cgc.js` (NEW) — MCP client + query translation + health detection + overlay enrichment

## Dependencies
- Consumes: graph-storage (reads overlay data for enrichment)
- Consumed by: graph-abstraction (as a provider)

## Constraints
- Zero external dependencies — uses Node.js built-in http/https for MCP communication
- Must auto-detect CGC server availability (health check)
- Must handle CGC server being unavailable gracefully (returns null, triggers fallback)
- Must not block startup — health check is lazy (first query triggers it)
- CGC server is an external optional dependency, not bundled
