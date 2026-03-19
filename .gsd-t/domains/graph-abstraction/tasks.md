# Tasks: graph-abstraction

## Task 1: Create graph-query.js with provider registry
- Create `bin/graph-query.js`
- Implement provider registry: `registerProvider(provider)`, `getProviders()`
- Provider shape: `{ name, priority, available: () => boolean, query: (type, params) => Result }`
- Implement provider selection: try providers in priority order (1=CGC, 2=native, 3=grep)
- Cache provider selection per session (not per query)
- Status: pending

## Task 2: Implement query routing
- Implement `query(type, params)` — the single entry point
- Route to best available provider
- Auto-trigger reindex if graph is stale
- Handle provider errors gracefully (fall back to next provider)
- Implement all 21 query types from graph-query-contract
- For grep fallback: implement basic grep-based versions of critical queries (getCallers, getCallees, getImports)
- Status: pending

## Task 3: Register native and grep providers
- Register native-indexer as priority 2 provider
- Implement grep fallback provider (priority 3):
  - `getCallers` → `grep -r "import.*{name}" --include="*.{js,ts,py}"`
  - `getCallees` → parse imports from the entity's file
  - `getImports/getImporters` → grep for import statements
  - Other queries return null (not available via grep)
- Export `query()` as the public API
- Status: pending

## Task 4: Write tests for graph-query
- Create `test/graph-query.test.js`
- Test provider registration and selection
- Test fallback chain (CGC unavailable → native → grep)
- Test auto-reindex on stale
- Test query routing for all query types
- Test error handling (provider throws → fallback)
- Status: pending
