# Prisma Standards (When Prisma Detected)

These rules are MANDATORY. Violations fail the task. No exceptions.
Applies when `prisma` or `@prisma/client` is in `package.json` or `schema.prisma` exists.

---

## 1. Schema Design

```
MANDATORY:
  ├── One schema.prisma file — NEVER split across multiple files (use comments to section)
  ├── Use @id with autoincrement() or uuid() — NEVER application-generated IDs
  ├── Every model has createdAt DateTime @default(now()) and updatedAt DateTime @updatedAt
  ├── Use @map and @@map for snake_case DB column/table names with camelCase Prisma models
  ├── Define explicit relation names when a model has multiple relations to the same table
  ├── Use enums for fixed sets — NEVER string fields with implicit allowed values
  └── Add @@index on fields used in WHERE, ORDER BY, or JOIN conditions
```

**GOOD**
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  role      UserRole @default(MEMBER)
  posts     Post[]   @relation("AuthoredPosts")
  reviews   Post[]   @relation("ReviewedPosts")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("users")
  @@index([email])
  @@index([role])
}

enum UserRole {
  ADMIN
  MEMBER
  VIEWER
}
```

**BAD**
```prisma
model User {
  id   Int    @id @default(autoincrement())
  role String // Should be enum
  // Missing createdAt, updatedAt, indexes
}
```

---

## 2. Client Setup

```
MANDATORY:
  ├── Create a singleton PrismaClient — NEVER instantiate per-request
  ├── In development (hot reload): cache on globalThis to avoid connection pool exhaustion
  ├── Configure connection pool: pool size matches expected concurrency
  ├── Handle shutdown: disconnect on SIGTERM/SIGINT
  ├── Enable query logging in development, disable in production
  └── NEVER import PrismaClient in multiple files and instantiate — use a shared module
```

**GOOD**
```typescript
// lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**BAD** — new client per file:
```typescript
// users.ts
const prisma = new PrismaClient();  // New instance — pool leak

// orders.ts
const prisma = new PrismaClient();  // Another instance — another pool
```

---

## 3. Queries — Avoiding N+1

```
MANDATORY:
  ├── Use include for related data you KNOW you need — eager load in one query
  ├── Use select to fetch only needed fields — NEVER fetch entire rows when you need 2 fields
  ├── NEVER loop over results and query related data inside the loop (N+1)
  ├── Use _count for counting relations without loading them
  ├── For complex aggregations, use groupBy or raw SQL — don't aggregate in JavaScript
  └── Prefer findMany with where over multiple findUnique calls
```

**GOOD**
```typescript
// One query with related data
const users = await prisma.user.findMany({
  where: { role: "ADMIN" },
  select: {
    id: true,
    name: true,
    email: true,
    _count: { select: { posts: true } },
    posts: {
      select: { title: true, status: true },
      where: { status: "PUBLISHED" },
      take: 5,
      orderBy: { createdAt: "desc" },
    },
  },
});
```

**BAD** — N+1:
```typescript
const users = await prisma.user.findMany();
for (const user of users) {
  const posts = await prisma.post.findMany({ where: { authorId: user.id } });  // N+1!
}
```

---

## 4. Mutations & Transactions

```
MANDATORY:
  ├── Use prisma.$transaction() for operations that must succeed or fail together
  ├── Prefer interactive transactions (callback) over sequential transactions (array)
  ├── Set transaction timeout for long operations: $transaction(fn, { timeout: 10000 })
  ├── Use upsert for create-or-update — NEVER check-then-create (race condition)
  ├── Use createMany for bulk inserts — NEVER loop over create()
  ├── Optimistic concurrency: use @updatedAt or a version field to detect conflicts
  └── NEVER mix transactional and non-transactional operations for related data
```

**GOOD**
```typescript
// Interactive transaction — all or nothing
const result = await prisma.$transaction(async (tx) => {
  const order = await tx.order.create({
    data: { userId, total, status: "PENDING" },
  });
  await tx.orderItem.createMany({
    data: items.map(item => ({ orderId: order.id, ...item })),
  });
  await tx.inventory.updateMany({
    where: { productId: { in: items.map(i => i.productId) } },
    data: { quantity: { decrement: 1 } },
  });
  return order;
});
```

**BAD** — no transaction for related operations:
```typescript
const order = await prisma.order.create({ data: { userId, total } });
// If this fails, we have an order with no items!
await prisma.orderItem.createMany({ data: items.map(i => ({ orderId: order.id, ...i })) });
```

---

## 5. Migrations

```
MANDATORY:
  ├── Use prisma migrate dev for development — creates migration files from schema changes
  ├── Use prisma migrate deploy for production — applies existing migration files
  ├── NEVER use prisma db push in production — it doesn't create migration files
  ├── Review generated SQL before applying — Prisma may make unexpected decisions
  ├── Name migrations descriptively: npx prisma migrate dev --name add_user_role_column
  ├── Commit migration files to git — they are source code
  ├── For data migrations: create a separate script, don't put data changes in schema migrations
  └── NEVER delete or modify applied migration files — create new migrations instead
```

**Migration workflow:**
```
1. Edit schema.prisma
2. Run: npx prisma migrate dev --name descriptive_name
3. Review generated SQL in prisma/migrations/{timestamp}_{name}/migration.sql
4. Run: npx prisma generate (regenerate client types)
5. Commit schema.prisma + migration files + updated @prisma/client
```

---

## 6. Seeding

```
MANDATORY:
  ├── Create prisma/seed.ts (or .js) for development seed data
  ├── Seed script must be idempotent — safe to run multiple times (use upsert)
  ├── Configure in package.json: "prisma": { "seed": "tsx prisma/seed.ts" }
  ├── Use realistic data — not "test123" or "foo bar"
  ├── Seed essential reference data (roles, categories, settings) separately from test data
  └── NEVER seed production databases with test data
```

**GOOD**
```typescript
// prisma/seed.ts
import { prisma } from "../lib/prisma";

async function main() {
  // Reference data — always upsert
  for (const role of ["ADMIN", "MEMBER", "VIEWER"]) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role, description: `${role} role` },
    });
  }

  // Dev-only test data
  if (process.env.NODE_ENV !== "production") {
    await prisma.user.upsert({
      where: { email: "admin@example.com" },
      update: {},
      create: { email: "admin@example.com", name: "Admin User", role: "ADMIN" },
    });
  }
}

main().finally(() => prisma.$disconnect());
```

---

## 7. Type Safety

```
MANDATORY:
  ├── Run prisma generate after every schema change — keeps types in sync
  ├── Use Prisma's generated types: Prisma.UserCreateInput, Prisma.UserWhereInput
  ├── For service layer types, derive from Prisma types — don't duplicate
  ├── Use Prisma.UserGetPayload<{ include: { posts: true } }> for included relation types
  ├── Return typed results from data access functions — not any or unknown
  └── NEVER cast Prisma results to manually-defined types — they'll drift out of sync
```

**GOOD**
```typescript
import { Prisma, User } from "@prisma/client";

// Derive types from Prisma
type UserWithPosts = Prisma.UserGetPayload<{
  include: { posts: { select: { id: true; title: true } } };
}>;

async function getUserWithPosts(id: string): Promise<UserWithPosts | null> {
  return prisma.user.findUnique({
    where: { id },
    include: { posts: { select: { id: true, title: true } } },
  });
}
```

---

## 8. Middleware & Extensions

```
MANDATORY:
  ├── Use Prisma Client Extensions (v4.16+) over middleware — better performance and types
  ├── Use extensions for: soft delete, audit logging, computed fields
  ├── Middleware runs on EVERY query — keep it fast, avoid I/O in middleware
  ├── Log slow queries: middleware that measures timing and alerts above threshold
  ├── Soft delete: use an extension that adds deletedAt and filters automatically
  └── NEVER put business logic in Prisma middleware — use service layer
```

**GOOD** — soft delete extension:
```typescript
const prisma = new PrismaClient().$extends({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        args.where = { ...args.where, deletedAt: null };
        return query(args);
      },
      async delete({ model, args, query }) {
        return prisma[model].update({
          ...args,
          data: { deletedAt: new Date() },
        });
      },
    },
  },
});
```

---

## 9. Testing

```
MANDATORY:
  ├── Use a separate test database — NEVER run tests against dev or production
  ├── Set DATABASE_URL in test env to a test-specific database
  ├── Reset database between test suites: prisma migrate reset --force (test only)
  ├── Use transactions for test isolation: start transaction → test → rollback
  ├── For unit tests: mock PrismaClient methods (vitest.mock or jest.mock)
  ├── For integration tests: use real database with test data
  └── NEVER use prisma db push in tests — use migrate for consistency
```

**GOOD** — test isolation with transactions:
```typescript
import { prisma } from "../lib/prisma";

beforeEach(async () => {
  // Clean tables in correct order (respect foreign keys)
  await prisma.$transaction([
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

---

## 10. Performance

```
MANDATORY:
  ├── Use select to limit columns — NEVER fetch * when you need 2 fields
  ├── Add @@index for fields in WHERE clauses — especially on foreign keys
  ├── Use cursor-based pagination for large datasets — not skip/take with high offsets
  ├── Batch operations: createMany, updateMany, deleteMany — not loops
  ├── Monitor query performance: enable logging, track slow queries
  ├── For read-heavy: consider Prisma Accelerate or read replicas
  └── NEVER use findMany without pagination or a limit on user-facing endpoints
```

**GOOD** — cursor-based pagination:
```typescript
async function getUsers(cursor?: string, take: number = 20) {
  return prisma.user.findMany({
    take: take + 1,  // Fetch one extra to detect hasMore
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, createdAt: true },
  });
}
```

---

## Anti-Patterns

```
NEVER:
  ├── New PrismaClient() per request — use singleton
  ├── N+1 queries: loop with findUnique/findFirst inside — use include/select
  ├── prisma db push in production — use prisma migrate deploy
  ├── Delete or modify applied migration files — create new migrations
  ├── Skip $transaction for related writes — data will be inconsistent
  ├── check-then-create without upsert — race condition
  ├── Manually defined types that duplicate Prisma generated types
  ├── findMany without limit/pagination on user endpoints
  ├── Business logic in Prisma middleware — use service layer
  ├── Tests against dev/production database — use separate test DB
  └── Skip prisma generate after schema changes — types will be stale
```

---

## Prisma Verification Checklist

- [ ] Singleton PrismaClient with dev hot-reload guard
- [ ] All models have id, createdAt, updatedAt
- [ ] Enums for fixed value sets, @@index on query fields
- [ ] snake_case DB names via @map/@@map, camelCase in Prisma
- [ ] include/select for related data — no N+1 loops
- [ ] $transaction for multi-model mutations
- [ ] Migrations committed to git, descriptively named
- [ ] Seed script is idempotent (upsert)
- [ ] Types derived from Prisma, not manually duplicated
- [ ] Test database separate, reset between suites
- [ ] Cursor-based pagination on list endpoints
