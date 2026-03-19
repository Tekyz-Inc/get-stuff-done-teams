# Tasks: cgc-provider

## Task 1: Create graph-cgc.js with health detection
- Create `bin/graph-cgc.js`
- Implement `checkCgcHealth()` — attempt MCP handshake or HTTP health check
- 2-second timeout — mark unavailable on timeout
- Cache health result for session lifetime
- Lazy check (first query triggers it, not module load)
- Status: pending

## Task 2: Implement MCP query translation
- Implement `cgcQuery(tool, params)` — translate graph-abstraction query types to CGC MCP tool calls
- Map: `getTransitiveCallers` → CGC search_codebase
- Map: `findDuplicates` → CGC find_similar
- Map: `findCircularDeps` → CGC get_dependencies
- 10-second timeout per query — fall back to native on timeout
- Status: pending

## Task 3: Implement result enrichment and provider registration
- Normalize CGC results to match graph-query-contract Entity shape
- Enrich with GSD-T overlay data from graph-storage
- Register as priority 1 provider with graph-abstraction
- Export provider object
- Status: pending

## Task 4: Write tests for cgc-provider
- Create `test/graph-cgc.test.js`
- Test health detection (available, unavailable, timeout)
- Test query translation (correct MCP tool calls)
- Test result normalization (CGC format → Entity shape)
- Test enrichment (overlay data merged)
- Test timeout handling (falls back gracefully)
- Mock CGC MCP server for tests
- Status: pending
