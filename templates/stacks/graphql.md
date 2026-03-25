# GraphQL Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Schema Design

```
MANDATORY:
  ├── Schema-first design — define the schema, then implement resolvers
  ├── Use PascalCase for types: User, OrderItem
  ├── Use camelCase for fields: firstName, createdAt
  ├── Use UPPER_SNAKE_CASE for enum values: ACTIVE, PENDING_REVIEW
  ├── Input types for mutations: CreateUserInput, UpdateOrderInput
  ├── Every mutation returns the affected type (not just Boolean)
  └── Add descriptions to all types and fields — they power documentation
```

**GOOD**
```graphql
"""A registered user in the system."""
type User {
  id: ID!
  """User's display name."""
  displayName: String!
  email: String!
  role: UserRole!
  orders(first: Int = 20, after: String): OrderConnection!
  createdAt: DateTime!
}

enum UserRole {
  ADMIN
  MEMBER
  VIEWER
}

input CreateUserInput {
  displayName: String!
  email: String!
  role: UserRole = MEMBER
}
```

---

## 2. Query Design

```
MANDATORY:
  ├── Singular for single resource: user(id: ID!): User
  ├── Plural for collections: users(first: Int, after: String, filter: UserFilter): UserConnection!
  ├── Use connection pattern (Relay) for paginated lists
  ├── Accept filter input types — not individual filter args
  ├── NEVER return unbounded lists — always require pagination args
  └── Nullable return for single lookups (user may not exist)
```

**GOOD**
```graphql
type Query {
  user(id: ID!): User
  users(first: Int = 20, after: String, filter: UserFilter): UserConnection!
}

input UserFilter {
  role: UserRole
  isActive: Boolean
  search: String
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}
```

---

## 3. Mutation Design

```
MANDATORY:
  ├── Verb-first naming: createUser, updateOrder, deleteComment
  ├── Accept a single input argument: createUser(input: CreateUserInput!): User!
  ├── Return the mutated object — not Boolean or generic status
  ├── Use union types for error handling (preferred) or throw errors
  ├── Validate inputs in resolvers — schema types are not sufficient
  └── Mutations must be idempotent where possible
```

**GOOD**
```graphql
type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): DeleteUserPayload!
}

type CreateUserPayload {
  user: User
  errors: [ValidationError!]
}

type ValidationError {
  field: String!
  message: String!
}
```

---

## 4. Resolver Patterns

```
MANDATORY:
  ├── Thin resolvers — delegate to service/data layer, don't put business logic in resolvers
  ├── Use DataLoader for N+1 prevention — batch and cache database lookups
  ├── Auth checks in resolvers or middleware — not in the service layer
  ├── Return null for not-found, throw for unauthorized/forbidden
  └── Log errors with context (query name, variables, user ID)
```

**GOOD**
```typescript
const resolvers = {
  Query: {
    user: async (_, { id }, { dataSources, user }) => {
      if (!user) throw new AuthenticationError('Must be logged in');
      return dataSources.userService.getById(id);
    },
  },
  User: {
    orders: (parent, args, { dataSources }) =>
      dataSources.orderLoader.load({ userId: parent.id, ...args }),
  },
};
```

---

## 5. N+1 Prevention — DataLoader

```
MANDATORY:
  ├── Use DataLoader for any field that resolves per-item in a list
  ├── Create loaders per request (new instance in context factory)
  ├── Batch function receives array of keys, returns array of results in same order
  └── Cache is request-scoped — not shared between requests
```

**GOOD**
```typescript
const userLoader = new DataLoader<string, User>(async (ids) => {
  const users = await db.query('SELECT * FROM users WHERE id = ANY($1)', [ids]);
  const userMap = new Map(users.map(u => [u.id, u]));
  return ids.map(id => userMap.get(id) ?? new Error(`User ${id} not found`));
});
```

---

## 6. Client-Side Patterns

```
MANDATORY:
  ├── Co-locate queries with components — query file next to the component
  ├── Use fragments for shared field selections
  ├── Name all operations: query GetUser, mutation CreateOrder
  ├── Use generated types (graphql-codegen) — NEVER manually type query results
  ├── Handle loading, error, and empty states for every query
  └── Cache update after mutations: refetch or update cache directly
```

---

## 7. Anti-Patterns

```
NEVER:
  ├── Unbounded list queries without pagination
  ├── Business logic in resolvers — delegate to services
  ├── N+1 queries — use DataLoader
  ├── Anonymous operations (unnamed queries/mutations)
  ├── Deeply nested queries without depth limiting
  ├── Returning Boolean from mutations — return the affected type
  ├── Over-fetching: requesting all fields when you need two
  └── Manually typing query results — use codegen
```

---

## GraphQL Verification Checklist

- [ ] Schema-first with descriptions on all types/fields
- [ ] Connection pattern for paginated lists
- [ ] All mutations return affected type (not Boolean)
- [ ] DataLoader used for N+1 prevention
- [ ] Input validation in resolvers
- [ ] Auth checks in resolvers or middleware
- [ ] Operations named (query GetUser, not anonymous)
- [ ] Generated types via codegen
- [ ] Loading, error, empty states handled client-side
- [ ] Query depth limiting configured
