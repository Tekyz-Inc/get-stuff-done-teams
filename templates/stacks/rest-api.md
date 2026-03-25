# REST API Design Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. URL Design

```
MANDATORY:
  ├── Nouns, not verbs: /users, /orders — NEVER /getUsers, /createOrder
  ├── Plural collection names: /users, /products, /orders
  ├── Nested resources for relationships: /users/{id}/orders
  ├── Max 2 levels of nesting — flatten beyond that
  ├── Kebab-case for multi-word paths: /order-items — not /orderItems or /order_items
  ├── API version in URL path: /api/v1/users — not in headers
  └── NEVER expose internal IDs or database structure in URLs
```

**BAD** — `/api/getUserById?id=123`, `/api/v1/order_items`

**GOOD** — `/api/v1/users/123`, `/api/v1/order-items`

---

## 2. HTTP Methods

```
MANDATORY:
  ├── GET: Read (no side effects, cacheable)
  ├── POST: Create new resource (returns 201 + Location header)
  ├── PUT: Full replace of a resource
  ├── PATCH: Partial update of a resource
  ├── DELETE: Remove a resource (returns 204 or 200)
  ├── GET must NEVER modify data
  └── POST is not a catch-all — use the correct method
```

---

## 3. Response Format

```
MANDATORY — consistent envelope for all responses:
  ├── Success: { "data": {...} } or { "data": [...] }
  ├── Collection: { "data": [...], "meta": { "total": N, "page": 1, "pageSize": 20 } }
  ├── Error: { "error": { "code": "NOT_FOUND", "message": "User not found" } }
  ├── Use camelCase for JSON keys — matches JavaScript conventions
  ├── Include timestamps as ISO 8601 strings with timezone (2026-03-25T10:00:00Z)
  └── Null fields: include with null value — don't omit the key
```

**GOOD**
```json
{
  "data": {
    "id": "abc-123",
    "email": "user@example.com",
    "displayName": "Jane Doe",
    "createdAt": "2026-03-25T10:00:00Z",
    "avatar": null
  }
}
```

---

## 4. Pagination

```
MANDATORY for all list endpoints:
  ├── Offset-based: ?page=1&pageSize=20 (simple, good for UI pages)
  ├── Cursor-based: ?cursor=abc&limit=20 (better for large/realtime datasets)
  ├── Default pageSize: 20, max pageSize: 100
  ├── Include pagination metadata in response: total, page, pageSize, hasMore
  ├── NEVER return unbounded lists — always paginate or limit
  └── Support sorting: ?sort=createdAt&order=desc
```

**GOOD**
```json
{
  "data": [...],
  "meta": {
    "total": 342,
    "page": 2,
    "pageSize": 20,
    "hasMore": true
  }
}
```

---

## 5. Error Responses

```
MANDATORY:
  ├── Use standard HTTP status codes correctly (see table below)
  ├── Error body includes: code (machine-readable), message (human-readable)
  ├── Validation errors include field-level details
  ├── NEVER expose stack traces, SQL errors, or internal paths to clients
  └── Log the full error server-side — return a safe summary to the client
```

| Status | Meaning | When to use |
|--------|---------|------------|
| 200 | OK | Successful GET, PUT, PATCH, DELETE |
| 201 | Created | Successful POST (include Location header) |
| 204 | No Content | Successful DELETE with no response body |
| 400 | Bad Request | Invalid input, malformed JSON, validation error |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource, optimistic lock failure |
| 422 | Unprocessable Entity | Valid JSON but semantic errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server failure |

**Validation error example:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "field": "email", "message": "Must be a valid email address" },
      { "field": "name", "message": "Must be at least 2 characters" }
    ]
  }
}
```

---

## 6. Filtering and Search

```
MANDATORY:
  ├── Filter via query params: ?status=active&role=admin
  ├── Search via query param: ?search=jane (server decides which fields to search)
  ├── Date ranges: ?createdAfter=2026-01-01&createdBefore=2026-03-01
  ├── Multiple values: ?status=active,pending (comma-separated)
  ├── NEVER accept raw SQL or query expressions from the client
  └── Validate and whitelist all filter parameters
```

---

## 7. Versioning

```
MANDATORY:
  ├── Version in URL path: /api/v1/, /api/v2/
  ├── Bump major version only for breaking changes
  ├── Support previous version for a deprecation period (minimum 3 months)
  ├── Document breaking changes in a changelog
  └── New fields are NOT breaking changes — clients should ignore unknown fields
```

---

## 8. Rate Limiting

```
MANDATORY for public APIs:
  ├── Implement rate limiting per client/API key
  ├── Return 429 with Retry-After header
  ├── Include rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  └── Different limits per tier (free vs paid) if applicable
```

---

## 9. Anti-Patterns

```
NEVER:
  ├── Verbs in URLs (/getUser, /deleteOrder)
  ├── GET requests that modify data
  ├── Exposing internal errors, stack traces, or SQL to clients
  ├── Unbounded list responses without pagination
  ├── Inconsistent response shapes between endpoints
  ├── Accepting raw query expressions from clients
  ├── Breaking changes without version bump
  └── 200 OK with error body — use proper status codes
```

---

## REST API Verification Checklist

- [ ] URLs use nouns, plural, kebab-case
- [ ] Correct HTTP methods (GET reads, POST creates, etc.)
- [ ] Consistent response envelope (data, error, meta)
- [ ] All list endpoints paginated with metadata
- [ ] Error responses include code + message, no internals exposed
- [ ] Validation errors include field-level details
- [ ] API versioned in URL path
- [ ] Rate limiting with proper headers (if public)
- [ ] Timestamps in ISO 8601 with timezone
- [ ] Filtering via whitelisted query params only
