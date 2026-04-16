# Graph Indexer Contract

## Version: 1.0.0
## Date: 2026-03-18
## Domains: native-indexer (implements), graph-abstraction (consumes via provider interface)

## Interface

```javascript
// Main entry point — index a project
indexProject(projectRoot, options)  → IndexResult

// Options
{
  force: boolean,       // re-index even if not stale (default: false)
  languages: string[],  // ['js', 'ts', 'py'] (default: auto-detect)
  exclude: string[]     // glob patterns to skip (default: ['node_modules', '.git', 'dist', 'build'])
}

// IndexResult
{
  success: boolean,
  entityCount: number,
  relationshipCount: number,
  duration: number,        // ms
  errors: string[],        // non-fatal parse errors
  filesProcessed: number,
  filesSkipped: number
}
```

## Provider Interface

The native indexer implements the graph-abstraction provider interface:

```javascript
// Provider registration
{
  name: 'native',
  priority: 2,        // CGC=1 (highest), native=2, grep=3
  available: () => boolean,  // true if index exists and not stale
  query: (type, params) => Result
}
```

## Parsing Rules

### JavaScript / TypeScript
- **Functions**: `function name(`, `const name = (`, `const name = function(`, `name(` in class body
- **Classes**: `class Name`, `class Name extends`
- **Imports**: `import { x } from`, `import x from`, `const x = require(`
- **Exports**: `module.exports`, `export function`, `export class`, `export default`, `export { x }`
- **Calls**: `name(` where `name` matches a known entity

### Python
- **Functions**: `def name(`
- **Classes**: `class Name:`, `class Name(`
- **Imports**: `import x`, `from x import y`
- **Calls**: `name(` where `name` matches a known entity

## GSD-T Overlay Rules

After parsing entities and relationships, the indexer enriches with GSD-T context:

1. **Domain mapping**: Match entity file path against `.gsd-t/domains/*/scope.md` owned files
2. **Contract mapping**: Search `.gsd-t/contracts/*.md` for entity name references
3. **Requirement mapping**: Search `docs/requirements.md` for entity name or file references
4. **Test mapping**: Match entity names against test file names (e.g., `foo.js` → `test/foo.test.js`) + scan test file imports
5. **Surface mapping**: Detect consumer surfaces from directory structure (web/, mobile/, cli/, etc.) or from shared-services-contract.md
6. **Debt mapping**: Search `.gsd-t/techdebt.md` for entity name or file references

## Rules

1. Parser MUST handle syntax errors gracefully — skip unparseable files, log error, continue
2. Parser MUST NOT use external dependencies (no Tree-sitter, no babel, no acorn)
3. Regex patterns MUST handle common variations (arrow functions, async, generators)
4. Incremental: only re-parse files whose content hash changed since last index
5. Entity IDs MUST be deterministic: `{relative_path}:{line}:{name}`
6. Call detection is best-effort — regex can't resolve all dynamic calls
7. All file operations use synchronous API (consistent with GSD-T convention)

## Breaking Change Policy
Parser output format changes require contract version bump and graph-storage format update.
