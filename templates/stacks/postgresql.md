# PostgreSQL Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Naming Conventions

```
MANDATORY:
  ├── Tables: snake_case, plural (users, order_items)
  ├── Columns: snake_case, singular (first_name, created_at)
  ├── Primary keys: id (UUID preferred over serial for distributed systems)
  ├── Foreign keys: {referenced_table_singular}_id (user_id, order_id)
  ├── Indexes: idx_{table}_{columns} (idx_users_email)
  ├── Constraints: {type}_{table}_{columns} (uq_users_email, fk_orders_user_id)
  ├── Enums: snake_case singular (user_role, order_status)
  └── Boolean columns: is_ or has_ prefix (is_active, has_verified_email)
```

---

## 2. Schema Design

```
MANDATORY:
  ├── Every table has: id (PK), created_at (timestamptz DEFAULT now()), updated_at
  ├── Use timestamptz — NEVER timestamp without time zone
  ├── Use UUID for primary keys in distributed or API-exposed systems
  ├── Use appropriate types: text (not varchar), numeric (not float for money)
  ├── Add NOT NULL constraints by default — allow NULL only with explicit reason
  ├── Foreign keys with ON DELETE policy (CASCADE, SET NULL, or RESTRICT — choose deliberately)
  └── NEVER store JSON when a proper relational schema exists — use jsonb only for truly unstructured data
```

**GOOD**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_email UNIQUE (email)
);
```

---

## 3. Migrations

```
MANDATORY:
  ├── One migration per change — never combine unrelated schema changes
  ├── Migrations are forward-only in production — NEVER edit a deployed migration
  ├── Name format: {timestamp}_{description}.sql (20260325_add_users_table.sql)
  ├── Every migration must be reversible — include a down/rollback section
  ├── Test migrations on a copy of production data before deploying
  └── NEVER use DROP COLUMN or DROP TABLE without user approval (Destructive Action Guard)
```

---

## 4. Indexing

```
MANDATORY:
  ├── Index every foreign key column
  ├── Index columns used in WHERE, JOIN, and ORDER BY
  ├── Use partial indexes for common filter patterns: WHERE is_active = true
  ├── Use composite indexes in query column order (leftmost prefix rule)
  ├── GIN indexes for jsonb, array, and full-text search columns
  ├── NEVER create indexes speculatively — profile queries first (EXPLAIN ANALYZE)
  └── Monitor unused indexes and remove them
```

**GOOD**
```sql
-- Foreign key index
CREATE INDEX idx_orders_user_id ON orders (user_id);

-- Composite for common query pattern
CREATE INDEX idx_orders_user_status ON orders (user_id, status);

-- Partial index — only active users
CREATE INDEX idx_users_active_email ON users (email) WHERE is_active = true;

-- GIN for jsonb queries
CREATE INDEX idx_products_metadata ON products USING GIN (metadata);
```

---

## 5. Query Patterns

```
MANDATORY:
  ├── Use parameterized queries — NEVER string concatenation for SQL
  ├── SELECT only the columns you need — NEVER SELECT *
  ├── Use LIMIT on all user-facing queries — prevent unbounded result sets
  ├── Use EXISTS instead of COUNT(*) > 0 for existence checks
  ├── Use CTEs (WITH) for readability — but not for performance (CTEs can be optimization fences)
  ├── Prefer JOIN over subquery where equivalent
  └── Always include ORDER BY when results must be deterministic
```

**BAD**
```sql
SELECT * FROM users WHERE name LIKE '%' || $1 || '%';
SELECT COUNT(*) FROM orders WHERE user_id = $1;  -- just to check existence
```

**GOOD**
```sql
SELECT id, email, display_name FROM users WHERE name ILIKE '%' || $1 || '%' LIMIT 50;
SELECT EXISTS(SELECT 1 FROM orders WHERE user_id = $1);
```

---

## 6. Connection Management

```
MANDATORY:
  ├── Use connection pooling (PgBouncer, or built-in pool in your ORM/driver)
  ├── Set pool size based on workload — not unlimited
  ├── Close/release connections after use — never leak
  ├── Set statement_timeout on application connections (e.g., 30s)
  ├── Use read replicas for heavy read workloads
  └── Serverless: use Supabase connection pooler or PgBouncer — not direct connections
```

---

## 7. Transactions

```
MANDATORY:
  ├── Wrap multi-statement operations in transactions
  ├── Keep transactions short — don't hold locks while doing I/O
  ├── Use appropriate isolation level (READ COMMITTED is default — sufficient for most cases)
  ├── Handle deadlocks with retry logic (up to 3 retries)
  └── NEVER leave transactions open — always COMMIT or ROLLBACK
```

---

## 8. Graph-in-SQL Patterns

When implementing graph structures in PostgreSQL (adjacency lists, knowledge graphs, hierarchies):

```
PATTERNS:
  ├── Node tables: one table per entity type with UUID primary keys
  ├── Edge tables (junction): {source}_id + {target}_id + metadata columns
  │     Add relevance_score, weight, or edge_count for weighted graphs
  ├── Hierarchies: parent_id self-referencing FK + recursive CTE for traversal
  ├── Index both sides of every edge table FK
  ├── Stable seed UUIDs for reproducible deploys (deterministic UUID format)
  └── In-memory cache (LRU, 5-min TTL) for frequently traversed paths
```

**Hierarchy traversal — recursive CTE:**
```sql
WITH RECURSIVE ancestors AS (
  SELECT id, name, parent_id, 0 AS depth
  FROM graph_business_types
  WHERE id = $1
  UNION ALL
  SELECT t.id, t.name, t.parent_id, a.depth + 1
  FROM graph_business_types t
  JOIN ancestors a ON t.id = a.parent_id
)
SELECT * FROM ancestors ORDER BY depth;
```

**Weighted edge query:**
```sql
SELECT w.id, w.name, e.relevance_score
FROM graph_edges_bt_workflow e
JOIN graph_workflows w ON w.id = e.workflow_id
WHERE e.business_type_id = $1
ORDER BY e.relevance_score DESC
LIMIT 8;
```

**Rules:**
- Index edge tables on both FK columns
- Use ON DELETE CASCADE for edges when the node is deleted
- Consider materialized views for expensive multi-hop traversals
- For deep graphs (5+ hops), evaluate whether Neo4j is more appropriate

---

## 9. Anti-Patterns

```
NEVER:
  ├── SELECT * in application queries
  ├── String concatenation for SQL — parameterized queries only
  ├── Unbounded queries without LIMIT
  ├── timestamp without time zone — always timestamptz
  ├── float/double for money — use numeric or integer (cents)
  ├── Storing structured relational data in jsonb
  ├── Missing indexes on foreign keys
  ├── Long-running transactions holding locks
  └── Direct connections from serverless without pooling
```

---

## PostgreSQL Verification Checklist

- [ ] Naming follows conventions (snake_case, plural tables, singular columns)
- [ ] Every table has id, created_at, updated_at
- [ ] timestamptz used — not timestamp
- [ ] All foreign keys indexed
- [ ] Parameterized queries only — no string concatenation
- [ ] All user-facing queries have LIMIT
- [ ] Connection pooling configured
- [ ] Migrations are forward-only and reversible
- [ ] No SELECT * in application code
- [ ] Graph edges indexed on both FK columns (if applicable)
