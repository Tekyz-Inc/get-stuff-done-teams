# Graph Query Contract

## Version: 1.0.0
## Date: 2026-03-18
## Domains: graph-abstraction (implements), all graph-aware commands (consume)

## Interface

### query(type, params) → Result

The single entry point for all graph queries. Returns results from the best available provider.

### Query Types

```javascript
// Entity queries
query('getEntity', { name, file })           → Entity | null
query('getEntities', { file })               → Entity[]
query('getEntitiesByDomain', { domain })      → Entity[]

// Relationship queries
query('getCallers', { entity })              → Entity[]
query('getCallees', { entity })              → Entity[]
query('getTransitiveCallers', { entity, depth }) → Entity[]  // CGC-enhanced
query('getTransitiveCallees', { entity, depth }) → Entity[]  // CGC-enhanced
query('getImports', { file })                → Import[]
query('getImporters', { file })              → Import[]

// GSD-T context queries
query('getDomainOwner', { entity })          → string | null
query('getContractFor', { entity })          → string | null
query('getRequirementFor', { entity })       → string | null
query('getTestsFor', { entity })             → TestMapping[]
query('getDebtFor', { entity })              → DebtItem[]
query('getSurfaceConsumers', { entity })     → string[]

// Analysis queries
query('findDuplicates', { threshold })       → DuplicatePair[]  // CGC-enhanced (AST)
query('findDeadCode', {})                    → Entity[]
query('findCircularDeps', {})                → Cycle[]
query('getDomainBoundaryViolations', {})     → Violation[]

// Meta queries
query('getProvider', {})                     → 'cgc' | 'native' | 'grep'
query('getIndexStatus', {})                  → IndexStatus
query('reindex', { force })                  → IndexResult
```

### Data Shapes

```javascript
// Entity — a function, class, or module
{
  id: string,          // unique identifier (file:line:name)
  name: string,        // function/class name
  type: 'function' | 'class' | 'method' | 'module',
  file: string,        // relative file path
  line: number,        // line number
  domain: string|null, // GSD-T domain name (from overlay)
  exported: boolean    // whether exported/public
}

// Import — an import relationship
{
  source: string,      // importing file
  target: string,      // imported file/module
  names: string[],     // imported names
  line: number
}

// TestMapping — entity-to-test relationship
{
  entity: string,      // entity id
  testFile: string,    // test file path
  testName: string     // test function/describe name
}

// DebtItem — tech debt reference
{
  id: string,          // TD-XXX
  severity: string,    // HIGH|MEDIUM|LOW
  description: string
}

// DuplicatePair — two structurally similar entities
{
  entityA: Entity,
  entityB: Entity,
  similarity: number   // 0.0-1.0
}

// Cycle — circular dependency
{
  path: string[],      // file paths forming the cycle
  entities: Entity[]   // entities involved
}

// Violation — domain boundary violation
{
  entity: Entity,      // the entity that violates
  ownerDomain: string, // domain that owns the entity
  accessedBy: Entity,  // entity that accesses it
  accessorDomain: string // domain of the accessor
}

// IndexStatus
{
  provider: 'cgc' | 'native' | 'grep',
  indexed: boolean,
  entityCount: number,
  lastIndexed: string|null,  // ISO timestamp
  stale: boolean,
  stalePaths: string[]       // files changed since last index
}

// IndexResult
{
  success: boolean,
  entityCount: number,
  relationshipCount: number,
  duration: number,    // ms
  errors: string[]
}
```

## Rules

1. `query()` MUST return `null` or empty array (not throw) when provider has no data
2. `query()` MUST auto-trigger reindex if graph is stale (meta.json check)
3. `query()` MUST try providers in order: CGC → native → grep
4. Provider selection is cached per session (not per query)
5. CGC-enhanced queries (transitive, duplicates) MUST fall back to native with reduced capability, not fail
6. All file paths in results MUST be relative to project root
7. Entity IDs MUST be deterministic (same input → same ID)

## Breaking Change Policy

Changes to query types, data shapes, or return semantics require:
1. Version bump in this contract
2. Update all consuming commands (M21)
3. Backward-compatible fallback for 1 version
