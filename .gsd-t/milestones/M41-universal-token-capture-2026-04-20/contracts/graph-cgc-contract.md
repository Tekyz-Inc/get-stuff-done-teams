# Graph CGC Provider Contract

## Version: 1.0.0
## Date: 2026-03-18
## Domains: cgc-provider (implements), graph-abstraction (consumes via provider interface)

## Interface

### Provider Registration

```javascript
{
  name: 'cgc',
  priority: 1,              // highest priority — used when available
  available: () => boolean, // true if CGC MCP server responds to health check
  query: (type, params) => Result
}
```

### Health Detection

```javascript
checkCgcHealth()  → { available: boolean, version: string|null, capabilities: string[] }
```

- Check CGC MCP server via stdio or HTTP transport
- Cache result for session lifetime (don't re-check every query)
- Timeout: 2 seconds — if no response, mark unavailable
- Never block on health check — return unavailable on timeout

### CGC-Enhanced Query Types

These query types leverage CGC's Tree-sitter parsing for deeper analysis than native regex can provide:

| Query Type | Native Capability | CGC Enhancement |
|---|---|---|
| `getTransitiveCallers` | 1-level only | N-level with type flow |
| `getTransitiveCallees` | 1-level only | N-level with type flow |
| `findDuplicates` | Name-based only | AST structure comparison |
| `findCircularDeps` | Import-level | Call-level cycles |

### MCP Communication

```javascript
// CGC MCP tool calls (translated from graph-abstraction query types)
cgcQuery('search_codebase', { query: 'callers of functionName' })
cgcQuery('get_dependencies', { file: 'path/to/file.js' })
cgcQuery('find_similar', { function: 'functionName', threshold: 0.8 })
```

### Result Enrichment

CGC returns raw code entities. The provider enriches them with GSD-T overlay:

```
CGC result → read overlay from graph-storage → merge domain/contract/requirement/test/debt → return enriched Entity
```

## Rules

1. CGC unavailability MUST NOT cause errors — return null to trigger fallback
2. MCP communication uses Node.js built-in http/https — no external deps
3. CGC results MUST be normalized to match graph-query-contract Entity shape
4. Overlay enrichment uses graph-storage read operations (reads existing overlay data)
5. If CGC returns data the native indexer doesn't have, store it in graph-storage for future use
6. Timeout per query: 10 seconds — if CGC is slow, fall back to native for that query
7. Never start or install CGC — it's an external optional dependency

## Breaking Change Policy
CGC MCP protocol changes require adapter updates in this provider only. Graph-abstraction and commands are unaffected.
