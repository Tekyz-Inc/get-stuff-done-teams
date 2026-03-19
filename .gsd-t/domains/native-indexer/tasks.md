# Tasks: native-indexer

## Task 1: Create graph-parsers.js with JS/TS parser
- Create `bin/graph-parsers.js`
- Implement `parseJavaScript(content, filePath)` — regex-based extraction of:
  - Function declarations (`function name(`, `const name = (`, `const name = function(`, async variants)
  - Class declarations (`class Name`, `class Name extends`)
  - Method declarations (inside class bodies)
  - Import statements (`import { x } from`, `import x from`, `const x = require(`)
  - Export statements (`module.exports`, `export function`, `export class`, `export default`)
  - Call sites (`name(` where name matches known pattern)
- Return `{ entities: Entity[], imports: Import[], calls: CallEdge[] }`
- Handle parse errors gracefully (skip unparseable sections, continue)
- Status: pending

## Task 2: Add Python parser
- Implement `parsePython(content, filePath)` in `bin/graph-parsers.js`
- Extract: `def name(`, `class Name:`, `class Name(`, `import x`, `from x import y`
- Call detection: `name(` patterns
- Return same shape as JS parser
- Status: pending

## Task 3: Create graph-indexer.js main entry point
- Create `bin/graph-indexer.js`
- Implement `indexProject(projectRoot, options)`
- Auto-detect languages from file extensions
- Walk project files (exclude node_modules, .git, dist, build)
- Call appropriate parser per file
- Aggregate entities, imports, calls across all files
- Write results to graph-storage
- Implement incremental indexing (check staleness, only re-parse changed files)
- Return IndexResult shape per contract
- Status: pending

## Task 4: Create graph-overlay.js for GSD-T context mapping
- Create `bin/graph-overlay.js`
- Implement `buildOverlay(projectRoot, entities)`
- Domain mapping: match entity file paths against `.gsd-t/domains/*/scope.md` owned files
- Contract mapping: search `.gsd-t/contracts/*.md` for entity name references
- Requirement mapping: search `docs/requirements.md` for entity name/file references
- Test mapping: match entity names to test files by naming convention + import scan
- Debt mapping: search `.gsd-t/techdebt.md` for entity name/file references
- Surface mapping: detect consumer surfaces from directory structure
- Write overlay data to graph-storage (contracts.json, requirements.json, tests.json, surfaces.json)
- Status: pending

## Task 5: Write tests for native-indexer
- Create `test/graph-indexer.test.js`
- Test JS parser (functions, classes, imports, exports, calls)
- Test TS parser (same patterns + type annotations)
- Test Python parser (functions, classes, imports)
- Test indexProject (full project index, incremental, error handling)
- Test overlay builder (domain mapping, contract mapping)
- Status: pending
