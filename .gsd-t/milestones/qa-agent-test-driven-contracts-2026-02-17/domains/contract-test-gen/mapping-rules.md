# Contract → Test Mapping Rules

## 1. API Contract → Test Mapping

For each endpoint in `api-contract.md`, generate a Playwright API test:

### Mapping Rules:
- Each `## METHOD /path` heading → one `test.describe` block
- `Request:` field → test sends this payload
- `Response {code}:` field → `expect(response.status()).toBe({code})` + shape validation
- `Errors:` field → one test per error code with the trigger condition
- `Auth:` field → test with and without auth header

### Generated Skeleton Pattern:
```typescript
import { test, expect } from '@playwright/test';

test.describe('POST /api/users', () => {
  test('creates user with valid data — returns 201 with expected shape', async ({ request }) => {
    const response = await request.post('/api/users', {
      data: { /* from Request: field */ }
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    // Assert each field from Response 201: definition
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('email');
    expect(body).toHaveProperty('created_at');
  });

  test('rejects invalid data — returns 400 with error shape', async ({ request }) => {
    const response = await request.post('/api/users', {
      data: { /* invalid payload */ }
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    // From Errors: field
  });

  test('requires authentication', async ({ request }) => {
    // Only if Auth: field is present
    const response = await request.post('/api/users', {
      data: { /* valid payload */ }
    });
    // Without auth header → expect 401
    expect(response.status()).toBe(401);
  });
});
```

### Edge Cases to Auto-Generate:
- Empty request body → expect 400
- Missing required fields (one test per required field) → expect 400
- Wrong HTTP method → expect 405 (if documented)

---

## 2. Schema Contract → Test Mapping

For each table in `schema-contract.md`, generate database validation tests:

### Mapping Rules:
- Each `## Table` heading → one `test.describe` block
- Each column row → type and constraint assertions
- `unique` constraint → test duplicate insertion fails
- `not null` constraint → test null insertion fails
- `FK` constraint → test referential integrity

### Generated Skeleton Pattern:
```typescript
import { test, expect } from '@playwright/test';

test.describe('Schema: Users Table', () => {
  test('table exists with expected columns', async ({ request }) => {
    // Query information_schema or use ORM introspection
    // Assert columns: id (uuid, PK), email (varchar, unique, not null), ...
  });

  test('rejects duplicate email (unique constraint)', async ({ request }) => {
    // Insert user, then insert another with same email
    // Expect constraint violation
  });

  test('rejects null email (not null constraint)', async ({ request }) => {
    // Insert user with null email
    // Expect constraint violation
  });
});
```

### Note:
Schema tests are often validated indirectly through API tests. The QA agent should prefer API-level testing when possible, falling back to direct DB assertions only when the API doesn't exercise a specific constraint.

---

## 3. Component Contract → Test Mapping

For each component in `component-contract.md`, generate Playwright component/E2E tests:

### Mapping Rules:
- Each `## ComponentName` heading → one `test.describe` block
- `Props:` field → test renders with required props, test prop types
- `Events:` field → test event handlers fire
- API calls referenced → verify the component makes the correct API call

### Generated Skeleton Pattern:
```typescript
import { test, expect } from '@playwright/test';

test.describe('LoginForm Component', () => {
  test('renders with required props', async ({ page }) => {
    // Navigate to page containing LoginForm
    // Assert form elements are visible
    await expect(page.getByRole('form')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('calls onSuccess on valid login', async ({ page }) => {
    // Fill form with valid credentials
    // Submit
    // Assert redirect/callback (from Events: onSuccess)
  });

  test('calls onError on invalid login', async ({ page }) => {
    // Fill form with invalid credentials
    // Submit
    // Assert error display (from Events: onError)
  });

  test('validates required fields before submit', async ({ page }) => {
    // Submit empty form
    // Assert validation errors shown
  });
});
```

### Edge Cases to Auto-Generate:
- Empty form submission
- Partial form submission (each required field missing)
- Network error handling (if API calls are documented)

---

## Test File Naming Convention

Contract test files are placed in the project's test directory with a `contract-` prefix:
- `api-contract.md` → `contract-api.spec.ts`
- `schema-contract.md` → `contract-schema.spec.ts`
- `component-contract.md` → `contract-components.spec.ts`

This distinguishes contract tests (spec-driven, auto-generated) from implementation tests (developer-written, edge-case-focused).

## Contract Test Markers

All generated tests include a comment marker for identification:
```typescript
// @contract-test — auto-generated from .gsd-t/contracts/api-contract.md
// Do not modify directly — update the contract, then regenerate
```
