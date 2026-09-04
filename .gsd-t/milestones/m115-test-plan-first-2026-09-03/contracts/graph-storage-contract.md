# Graph Storage Contract

## Version: 1.0.0
## Date: 2026-03-18
## Domains: graph-storage (implements), native-indexer (writes), cgc-provider (reads), graph-abstraction (reads)

## Storage Location

All graph data stored in `.gsd-t/graph/` directory. This directory is git-ignored.

## File Format

All files are JSON. UTF-8 encoded. Pretty-printed for debuggability.

### index.json — Entity Registry
```json
{
  "entities": [
    {
      "id": "bin/gsd-t.js:42:doInstall",
      "name": "doInstall",
      "type": "function",
      "file": "bin/gsd-t.js",
      "line": 42,
      "domain": "cli-integration",
      "exported": true
    }
  ]
}
```

### calls.json — Call Relationships
```json
{
  "edges": [
    { "caller": "entity-id-1", "callee": "entity-id-2", "line": 55 }
  ]
}
```

### imports.json — Import Relationships
```json
{
  "edges": [
    { "source": "bin/gsd-t.js", "target": "bin/graph-store.js", "names": ["readGraph", "writeGraph"], "line": 3 }
  ]
}
```

### contracts.json — Entity → Contract Mapping
```json
{
  "mappings": [
    { "entity": "entity-id", "contract": "graph-query-contract.md", "section": "query types" }
  ]
}
```

### requirements.json — Entity → Requirement Mapping
```json
{
  "mappings": [
    { "entity": "entity-id", "requirement": "REQ-031" }
  ]
}
```

### tests.json — Entity → Test Mapping
```json
{
  "mappings": [
    { "entity": "entity-id", "testFile": "test/graph.test.js", "testName": "doInstall returns success" }
  ]
}
```

### surfaces.json — Entity → Consumer Surface Mapping
```json
{
  "mappings": [
    { "entity": "entity-id", "surfaces": ["cli", "commands"] }
  ]
}
```

### meta.json — Index Metadata
```json
{
  "lastIndexed": "2026-03-18T10:30:00Z",
  "provider": "native",
  "entityCount": 142,
  "relationshipCount": 387,
  "duration": 1234,
  "fileHashes": {
    "bin/gsd-t.js": "abc123...",
    "bin/graph-store.js": "def456..."
  }
}
```

## Interface

```javascript
// Read operations
readIndex()            → { entities: Entity[] }
readCalls()            → { edges: CallEdge[] }
readImports()          → { edges: ImportEdge[] }
readContracts()        → { mappings: ContractMapping[] }
readRequirements()     → { mappings: RequirementMapping[] }
readTests()            → { mappings: TestMapping[] }
readSurfaces()         → { mappings: SurfaceMapping[] }
readMeta()             → MetaData | null

// Write operations
writeIndex(data)       → void
writeCalls(data)       → void
writeImports(data)     → void
writeContracts(data)   → void
writeRequirements(data)→ void
writeTests(data)       → void
writeSurfaces(data)    → void
writeMeta(data)        → void

// Utility
isStale(sourceFiles)   → { stale: boolean, changedFiles: string[] }
clear()                → void
getGraphDir()          → string
```

## Rules

1. All read operations MUST return empty structure (not throw) if file missing
2. All write operations MUST create `.gsd-t/graph/` directory if missing
3. `isStale()` MUST compare file content hashes, not modification times
4. `clear()` MUST remove all graph files but preserve the directory
5. File hashes use Node.js crypto `createHash('md5')` — fast, not security-critical
6. JSON is pretty-printed (`JSON.stringify(data, null, 2)`) for debuggability
7. Max file size: no limit (but warn if > 10MB in meta)

## Breaking Change Policy
Changes to JSON structure require version bump. Old-format files trigger re-index on read.
