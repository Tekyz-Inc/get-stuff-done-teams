# Neo4j Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Data Modeling

```
MANDATORY:
  ├── Nodes represent entities (nouns): (:User), (:Product), (:Order)
  ├── Relationships represent verbs: -[:PURCHASED]->. -[:FOLLOWS]->
  ├── Node labels: PascalCase singular (User, BusinessType — not users)
  ├── Relationship types: UPPER_SNAKE_CASE (PURCHASED, WORKS_AT, BELONGS_TO)
  ├── Properties: camelCase (firstName, createdAt)
  ├── Store properties on the node or relationship that "owns" them
  ├── Relationships ALWAYS have a direction — even if queried bidirectionally
  └── NEVER use relationships as nodes (reify only when the relationship needs its own relationships)
```

**GOOD**
```cypher
(:User {id: "u-123", name: "Jane", email: "jane@example.com"})
  -[:PURCHASED {purchasedAt: datetime(), amount: 29.99}]->
(:Product {id: "p-456", name: "Widget", category: "Tools"})
```

---

## 2. Cypher Query Patterns

```
MANDATORY:
  ├── Use parameterized queries — NEVER string concatenation
  ├── Use MERGE for upserts — CREATE for guaranteed-new, MATCH for existing
  ├── Always LIMIT results on user-facing queries
  ├── Use OPTIONAL MATCH when the relationship may not exist
  ├── Use WITH to chain query stages — improves readability and performance
  ├── Prefer pattern comprehension over COLLECT + UNWIND for subqueries
  └── Always specify relationship direction in MATCH patterns
```

**BAD**
```cypher
MATCH (u:User) WHERE u.name = '${name}' RETURN u  // injection risk!
MATCH (u:User)--(p:Product) RETURN u, p            // no direction, no limit
```

**GOOD**
```cypher
MATCH (u:User {id: $userId})-[:PURCHASED]->(p:Product)
RETURN u.name, p.name, p.category
ORDER BY p.name
LIMIT 50
```

---

## 3. Indexing and Constraints

```
MANDATORY:
  ├── Unique constraint on all ID properties: CREATE CONSTRAINT FOR (u:User) REQUIRE u.id IS UNIQUE
  ├── Index properties used in WHERE and MATCH lookups
  ├── Composite indexes for multi-property lookups
  ├── Full-text indexes for search fields (name, description)
  ├── Use EXPLAIN and PROFILE to verify query plans use indexes
  └── NEVER rely on full node scans for lookups
```

**GOOD**
```cypher
// Unique constraint (also creates an index)
CREATE CONSTRAINT user_id_unique FOR (u:User) REQUIRE u.id IS UNIQUE;

// Property index for common lookups
CREATE INDEX user_email_idx FOR (u:User) ON (u.email);

// Composite index
CREATE INDEX order_status_date FOR (o:Order) ON (o.status, o.createdAt);

// Full-text index for search
CREATE FULLTEXT INDEX user_search FOR (u:User) ON EACH [u.name, u.email];
```

---

## 4. Transaction Management

```
MANDATORY:
  ├── Use explicit transactions for multi-statement operations
  ├── Keep transactions short — don't hold locks while doing external I/O
  ├── Read transactions for queries: session.executeRead()
  ├── Write transactions for mutations: session.executeWrite()
  ├── Handle transient errors with retry (the driver retries automatically in managed transactions)
  └── Always close sessions after use
```

**GOOD**
```typescript
const session = driver.session();
try {
  const result = await session.executeRead(async (tx) => {
    const res = await tx.run(
      'MATCH (u:User {id: $userId})-[:PURCHASED]->(p:Product) RETURN p',
      { userId }
    );
    return res.records.map(r => r.get('p').properties);
  });
  return result;
} finally {
  await session.close();
}
```

---

## 5. Driver Configuration

```
MANDATORY:
  ├── Create driver once at startup — reuse across requests
  ├── Set maxConnectionPoolSize based on workload (default 100 is usually fine)
  ├── Set connectionAcquisitionTimeout (default 60s — lower for web apps)
  ├── Use bolt:// for direct, neo4j:// for routing (cluster)
  ├── Verify connectivity at startup: driver.verifyConnectivity()
  └── Close driver on application shutdown: driver.close()
```

**GOOD**
```typescript
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!),
  {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 10000,
  }
);

await driver.verifyConnectivity();

// On shutdown:
process.on('SIGTERM', () => driver.close());
```

---

## 6. Performance

```
MANDATORY:
  ├── PROFILE queries during development to check plan and db hits
  ├── Use indexes — full node scans are O(n) and kill performance
  ├── Avoid variable-length paths without upper bound: -[:FOLLOWS*1..5]-> not -[:FOLLOWS*]->
  ├── Use LIMIT early in the query — not just at the end
  ├── Batch large writes (1000-5000 nodes per transaction)
  └── Use APOC for batch operations when available
```

**BAD** — unbounded variable-length path:
```cypher
MATCH (u:User)-[:FOLLOWS*]->(f:User) RETURN f  // scans entire graph!
```

**GOOD**
```cypher
MATCH (u:User {id: $userId})-[:FOLLOWS*1..3]->(f:User)
RETURN DISTINCT f.id, f.name
LIMIT 100
```

---

## 7. APOC Patterns

```
WHEN APOC IS AVAILABLE:
  ├── apoc.periodic.iterate for large batch operations
  ├── apoc.merge.node for conditional upserts with labels
  ├── apoc.path.expandConfig for complex traversals with filters
  ├── apoc.export.json for data dumps
  └── Check APOC version compatibility with your Neo4j version
```

---

## 8. Anti-Patterns

```
NEVER:
  ├── String concatenation in Cypher — use parameters ($param)
  ├── Unbounded queries without LIMIT
  ├── Variable-length paths without upper bound (-[:REL*]->)
  ├── Missing indexes on lookup properties
  ├── Creating a new driver per request — reuse the driver
  ├── Storing large blobs in node properties — use external storage
  ├── Dense connected nodes (supernode > 100K relationships) without optimization
  └── Using nodes where relationships should be used (and vice versa)
```

---

## Neo4j Verification Checklist

- [ ] Parameterized queries only — no string concatenation
- [ ] Unique constraints on all ID properties
- [ ] Indexes on all WHERE/MATCH lookup properties
- [ ] All queries have LIMIT
- [ ] Variable-length paths have upper bounds
- [ ] Explicit read/write transactions
- [ ] Driver created once and reused
- [ ] Sessions closed after use
- [ ] PROFILE run on complex queries
- [ ] Node labels PascalCase, relationship types UPPER_SNAKE_CASE
