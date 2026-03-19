# Tasks: graph-storage

## Task 1: Create graph-store.js with read/write operations
- Create `bin/graph-store.js`
- Implement `getGraphDir(projectRoot)` — resolves `.gsd-t/graph/` path
- Implement `readIndex()`, `readCalls()`, `readImports()`, `readContracts()`, `readRequirements()`, `readTests()`, `readSurfaces()`, `readMeta()`
- Each returns parsed JSON or empty structure if file missing
- Implement `writeIndex(data)`, `writeCalls(data)`, `writeImports(data)`, `writeContracts(data)`, `writeRequirements(data)`, `writeTests(data)`, `writeSurfaces(data)`, `writeMeta(data)`
- Auto-create `.gsd-t/graph/` directory on write if missing
- Status: pending

## Task 2: Implement staleness detection
- Implement `isStale(sourceFiles)` — compare file content hashes against `meta.json.fileHashes`
- Use `crypto.createHash('md5')` for fast hashing
- Return `{ stale: boolean, changedFiles: string[] }`
- Handle missing meta.json as "everything is stale"
- Status: pending

## Task 3: Implement clear and utility functions
- Implement `clear()` — remove all JSON files in `.gsd-t/graph/`, preserve directory
- Add file size warning in meta (warn if > 10MB)
- Export all functions via module.exports
- Status: pending

## Task 4: Write tests for graph-store
- Create `test/graph-store.test.js`
- Test all read operations (missing file, empty file, valid file)
- Test all write operations (create dir, write data, read back)
- Test staleness detection (fresh, stale, missing meta)
- Test clear operation
- Status: pending
