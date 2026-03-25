# Playwright Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Functional Tests Only — No Layout Tests

```
MANDATORY:
  ├── Every assertion must verify BEHAVIOR — not element existence
  ├── A test that passes on an empty HTML page with matching IDs is NOT a test
  ├── After every user action, assert the OUTCOME (data changed, content loaded, state updated)
  ├── NEVER assert only isVisible, toBeAttached, toBeEnabled without a behavioral follow-up
  └── If a test has no assertion after a click/submit/navigation, it is incomplete
```

**BAD** — layout test (passes even if everything is broken):
```typescript
test('user list page', async ({ page }) => {
  await page.goto('/users');
  await expect(page.locator('#user-table')).toBeVisible();
  await expect(page.locator('.user-row')).toHaveCount(5);
});
```

**GOOD** — functional test (fails if the feature is broken):
```typescript
test('user list loads and displays real user data', async ({ page }) => {
  await page.goto('/users');
  await expect(page.locator('.user-row').first()).toContainText('jane@example.com');
  await expect(page.locator('[data-testid="user-count"]')).toHaveText('5 users');
});
```

---

## 2. Test Coverage Depth — Permutations and Combinations

```
MANDATORY — every feature MUST be tested across these dimensions:

  ├── HAPPY PATH: Standard successful flow end-to-end
  ├── VALIDATION: Every form field with invalid, empty, boundary, and valid input
  ├── ERROR STATES: Network failure, server error (500), not found (404), timeout
  ├── EMPTY STATES: No data, empty lists, first-time user with zero records
  ├── EDGE CASES: Boundary values, special characters, max-length input, Unicode
  ├── PERMISSIONS: Unauthorized access, role-based visibility, disabled actions
  ├── STATE TRANSITIONS: Every state a record can be in, and transitions between them
  └── CONCURRENT: Actions while loading, double-submit, rapid navigation
```

### Coverage Matrix — Build One Per Feature

For any feature with N inputs or states, build a coverage matrix:

**Example: User creation form (3 fields, 2 roles, invite toggle)**

| Test | Name | Email | Role | Invite | Expected |
|------|------|-------|------|--------|----------|
| Happy path | "Jane" | jane@x.com | Admin | on | Created + invite sent |
| Happy path (no invite) | "Jane" | jane@x.com | Viewer | off | Created, no invite |
| Empty name | "" | jane@x.com | Admin | on | Validation error on name |
| Empty email | "Jane" | "" | Admin | on | Validation error on email |
| Invalid email | "Jane" | "notanemail" | Admin | on | Validation error on email |
| Duplicate email | "Jane" | existing@x.com | Admin | on | 409 conflict error shown |
| Name at max length | "A"×100 | jane@x.com | Admin | on | Created (boundary) |
| Name exceeds max | "A"×101 | jane@x.com | Admin | on | Validation error |
| Special chars in name | "O'Brien-José" | jane@x.com | Admin | on | Created (Unicode safe) |
| XSS in name | `<script>` | jane@x.com | Admin | on | Sanitized, no execution |
| Each role option | "Jane" | jane@x.com | {each role} | on | Correct role assigned |
| Server error | "Jane" | jane@x.com | Admin | on | Error message, form preserved |
| Network offline | "Jane" | jane@x.com | Admin | on | Offline indicator, retry option |
| Double submit | "Jane" | jane@x.com | Admin | on | Only one user created |
| Unauthorized user | — | — | — | — | Redirected or 403 shown |

```
MINIMUM COVERAGE PER FEATURE:
  ├── 1 happy path per valid combination that produces different outcomes
  ├── 1 validation test per field per validation rule
  ├── 1 test per error type (400, 401, 403, 404, 409, 500, network)
  ├── 1 empty state test
  ├── 1 boundary test per field with limits (min, max, exact boundary)
  ├── 1 test per role/permission that affects visibility or access
  ├── 1 test per state transition in the feature's state machine
  └── 1 concurrent/race condition test per form submission
```

---

## 3. State Transition Testing

For features with multiple states (orders, subscriptions, tickets, etc.), test EVERY valid transition:

```
MANDATORY:
  ├── Map the state machine: identify all states and valid transitions
  ├── Test each transition: action + assertion that new state is correct
  ├── Test invalid transitions: verify they're rejected or unavailable
  └── Test the full lifecycle: create → intermediate states → terminal state
```

**Example: Order lifecycle**
```typescript
test.describe('Order state transitions', () => {
  test('new order starts as pending', async ({ page }) => {
    await createOrder(page, testData.validOrder);
    await expect(page.locator('[data-testid="order-status"]')).toHaveText('Pending');
  });

  test('pending → confirmed on payment', async ({ page }) => {
    const order = await createPendingOrder(page);
    await page.click('[data-testid="confirm-payment"]');
    await expect(page.locator('[data-testid="order-status"]')).toHaveText('Confirmed');
  });

  test('confirmed → shipped on dispatch', async ({ page }) => {
    const order = await createConfirmedOrder(page);
    await page.click('[data-testid="mark-shipped"]');
    await expect(page.locator('[data-testid="order-status"]')).toHaveText('Shipped');
    await expect(page.locator('[data-testid="tracking-number"]')).not.toBeEmpty();
  });

  test('pending → cancelled is allowed', async ({ page }) => {
    const order = await createPendingOrder(page);
    await page.click('[data-testid="cancel-order"]');
    await expect(page.locator('[data-testid="order-status"]')).toHaveText('Cancelled');
  });

  test('shipped → cancelled is NOT allowed', async ({ page }) => {
    const order = await createShippedOrder(page);
    await expect(page.locator('[data-testid="cancel-order"]')).toBeDisabled();
  });
});
```

---

## 4. Selectors — Resilient and Maintainable

```
MANDATORY:
  ├── Prefer user-facing selectors: getByRole, getByLabel, getByText, getByPlaceholder
  ├── Use data-testid for elements with no accessible role or visible text
  ├── NEVER use CSS class selectors (.btn-primary) — they break on styling changes
  ├── NEVER use DOM structure selectors (div > span:nth-child(2)) — they break on layout changes
  ├── NEVER use auto-generated IDs or dynamic class names
  └── Combine selectors for precision: page.getByRole('button', { name: 'Submit' })
```

**BAD**
```typescript
await page.click('.btn.btn-primary.submit-form');
await page.locator('div.user-list > div:nth-child(3) > span').click();
```

**GOOD**
```typescript
await page.getByRole('button', { name: 'Submit' }).click();
await page.getByLabel('Email').fill('jane@example.com');
await page.locator('[data-testid="user-row-jane"]').click();
```

---

## 5. Waiting and Assertions

```
MANDATORY:
  ├── Use Playwright auto-waiting — NEVER add manual sleep/setTimeout
  ├── Assert on network completion for data-dependent tests: page.waitForResponse
  ├── Use toHaveText, toContainText for content verification — not just toBeVisible
  ├── Use web-first assertions (expect with auto-retry) — not page.evaluate checks
  ├── Set assertion timeout for slow operations: expect(...).toHaveText('...', { timeout: 10000 })
  └── Wait for navigation after clicks that change pages: page.waitForURL
```

**BAD**
```typescript
await page.click('#submit');
await page.waitForTimeout(3000);  // arbitrary sleep!
const text = await page.locator('#result').innerText();
expect(text).toBe('Success');  // not auto-retrying
```

**GOOD**
```typescript
await page.click('#submit');
await page.waitForResponse(resp => resp.url().includes('/api/users') && resp.status() === 201);
await expect(page.locator('[data-testid="result"]')).toHaveText('User created successfully');
```

---

## 6. Page Object Model

```
MANDATORY for projects with 10+ tests:
  ├── One page object per page or major component
  ├── Page objects encapsulate selectors and actions — tests read like user stories
  ├── Methods return data or other page objects (for navigation)
  ├── NEVER put assertions in page objects — assertions belong in tests
  └── Page objects live in a tests/pages/ or tests/pom/ directory
```

**GOOD**
```typescript
// tests/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }

  emailError() {
    return this.page.locator('[data-testid="email-error"]');
  }

  passwordError() {
    return this.page.locator('[data-testid="password-error"]');
  }
}

// tests/login.spec.ts
test('successful login redirects to dashboard', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('jane@example.com', 'validpassword');
  await expect(page).toHaveURL('/dashboard');
  await expect(page.getByText('Welcome, Jane')).toBeVisible();
});

test('invalid email shows validation error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login('notanemail', 'password');
  await expect(loginPage.emailError()).toHaveText('Enter a valid email address');
});
```

---

## 7. API Mocking and Network Control

```
MANDATORY for isolated, deterministic tests:
  ├── Use page.route() to mock API responses — control what the UI receives
  ├── Mock error responses to test error handling: route.fulfill({ status: 500 })
  ├── Mock empty responses to test empty states
  ├── Mock slow responses to test loading states: route.fulfill with delay
  ├── Use page.waitForResponse to verify the app made the expected API call
  └── For integration tests against real API: use a test/seed database, not mocks
```

**GOOD**
```typescript
test('shows error message on server failure', async ({ page }) => {
  await page.route('**/api/users', route =>
    route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal error' }) })
  );
  await page.goto('/users');
  await expect(page.getByText('Failed to load users')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('shows empty state when no users exist', async ({ page }) => {
  await page.route('**/api/users', route =>
    route.fulfill({ status: 200, body: JSON.stringify({ data: [], meta: { total: 0 } }) })
  );
  await page.goto('/users');
  await expect(page.getByText('No users found')).toBeVisible();
});

test('shows loading skeleton while fetching', async ({ page }) => {
  await page.route('**/api/users', async route => {
    await new Promise(r => setTimeout(r, 2000));
    await route.fulfill({ status: 200, body: JSON.stringify({ data: testUsers }) });
  });
  await page.goto('/users');
  await expect(page.locator('[data-testid="loading-skeleton"]')).toBeVisible();
  await expect(page.locator('.user-row').first()).toContainText('jane@example.com');
});
```

---

## 8. Test Organization

```
MANDATORY:
  ├── One spec file per feature or page: login.spec.ts, user-management.spec.ts
  ├── Group related tests with test.describe
  ├── Use test.beforeEach for common setup (navigation, auth, seeding)
  ├── Use test fixtures for reusable authenticated state
  ├── Tag tests for selective runs: test('...', { tag: '@smoke' }, ...)
  └── Keep individual tests independent — no test should depend on another's state
```

**GOOD**
```typescript
test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users');
  });

  test.describe('List View', () => {
    test('displays paginated user list', ...);
    test('filters by role', ...);
    test('searches by name or email', ...);
    test('shows empty state when filter matches nothing', ...);
  });

  test.describe('Create User', () => {
    test('creates user with valid data', ...);
    test('shows validation errors for each invalid field', ...);
    test('handles duplicate email conflict', ...);
    test('handles server error gracefully', ...);
    test('prevents double submission', ...);
  });

  test.describe('Edit User', () => {
    test('pre-fills form with existing data', ...);
    test('saves changes and shows confirmation', ...);
    test('handles concurrent edit conflict', ...);
  });

  test.describe('Delete User', () => {
    test('confirms before deleting', ...);
    test('shows success after deletion', ...);
    test('handles deletion of already-deleted user', ...);
  });
});
```

---

## 9. Test Data Management

```
MANDATORY:
  ├── Use factories or fixtures for test data — NEVER hardcode in test bodies
  ├── Each test creates its own data — no shared mutable state between tests
  ├── Use realistic data (not "test123") — catches encoding, truncation, display issues
  ├── Include edge case data in fixtures: Unicode, long strings, special chars, empty strings
  ├── Clean up test data after each test (or use isolated test databases)
  └── Store reusable test data in tests/fixtures/ directory
```

**GOOD**
```typescript
// tests/fixtures/users.ts
export const testUsers = {
  standard: { name: 'Jane Doe', email: 'jane@example.com', role: 'member' },
  admin: { name: 'Admin User', email: 'admin@example.com', role: 'admin' },
  unicode: { name: "José O'Brien-García", email: 'jose@example.com', role: 'member' },
  longName: { name: 'A'.repeat(100), email: 'long@example.com', role: 'member' },
  specialChars: { name: 'Test <script>alert(1)</script>', email: 'xss@example.com', role: 'member' },
};
```

---

## 10. Combinatorial Testing Strategy

For features with multiple interacting inputs, use pairwise/combinatorial coverage:

```
MANDATORY for forms with 3+ independent inputs:
  ├── Identify all inputs and their valid values
  ├── Test all single-field validations independently
  ├── Use pairwise combinations for multi-field interactions (not full cartesian product)
  ├── Always test the extreme corners: all-empty, all-max, all-invalid
  └── Add specific combinations for known business rules
```

**Example: Search with 3 filters (status, role, date range)**

Instead of testing all 4×3×5 = 60 combinations, use pairwise:

```typescript
const filterCombinations = [
  // Pairwise covers all 2-way interactions with fewer tests
  { status: 'active', role: 'admin', dateRange: 'last7days' },
  { status: 'active', role: 'viewer', dateRange: 'last30days' },
  { status: 'active', role: 'member', dateRange: 'allTime' },
  { status: 'inactive', role: 'admin', dateRange: 'last30days' },
  { status: 'inactive', role: 'viewer', dateRange: 'allTime' },
  { status: 'inactive', role: 'member', dateRange: 'last7days' },
  { status: 'all', role: 'admin', dateRange: 'allTime' },
  { status: 'all', role: 'viewer', dateRange: 'last7days' },
  { status: 'all', role: 'member', dateRange: 'last30days' },
  // Extremes
  { status: 'all', role: undefined, dateRange: undefined },  // no filters
];

for (const combo of filterCombinations) {
  test(`filters: status=${combo.status}, role=${combo.role}, date=${combo.dateRange}`, async ({ page }) => {
    await applyFilters(page, combo);
    const results = await getVisibleResults(page);
    // Assert each result matches ALL active filters
    for (const result of results) {
      if (combo.status !== 'all') expect(result.status).toBe(combo.status);
      if (combo.role) expect(result.role).toBe(combo.role);
      if (combo.dateRange) expect(isInDateRange(result.date, combo.dateRange)).toBe(true);
    }
  });
}
```

---

## 11. Multi-Step Workflow Testing

```
MANDATORY for multi-page or multi-step features:
  ├── Test the complete end-to-end flow: start → each step → completion → verification
  ├── Test backward navigation: step 3 → step 2 → step 3 (data preserved?)
  ├── Test abandonment: start flow → navigate away → return (state preserved or reset?)
  ├── Test each step's validation independently
  ├── Test the flow with pre-filled data (edit mode vs create mode)
  └── Verify the final result by reading it back (not just checking the success message)
```

**GOOD**
```typescript
test('complete checkout flow end-to-end', async ({ page }) => {
  // Step 1: Add to cart
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add Widget to cart' }).click();
  await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');

  // Step 2: Cart review
  await page.goto('/cart');
  await expect(page.getByText('Widget')).toBeVisible();
  await page.getByRole('button', { name: 'Checkout' }).click();

  // Step 3: Shipping
  await page.getByLabel('Address').fill('123 Main St');
  await page.getByLabel('City').fill('Springfield');
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  // Step 4: Payment
  await page.getByLabel('Card number').fill('4242424242424242');
  await page.getByRole('button', { name: 'Place order' }).click();

  // Verify: Check the confirmation AND read back the order
  await expect(page).toHaveURL(/\/orders\/[a-z0-9-]+/);
  await expect(page.getByText('Order confirmed')).toBeVisible();
  await expect(page.getByText('Widget')).toBeVisible();
  await expect(page.getByText('123 Main St')).toBeVisible();
});

test('checkout preserves data on backward navigation', async ({ page }) => {
  // Fill shipping, go to payment, go BACK to shipping
  // Assert: shipping fields still populated
});
```

---

## 12. Cross-Browser and Responsive Testing

```
RECOMMENDED:
  ├── Configure projects in playwright.config for chromium, firefox, webkit
  ├── Add mobile viewport project for responsive testing
  ├── Run cross-browser in CI — chromium-only acceptable for local dev
  ├── Test touch interactions on mobile viewports (tap, swipe)
  └── Verify responsive breakpoints: mobile (375px), tablet (768px), desktop (1280px)
```

**GOOD** — playwright.config.ts:
```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
],
```

---

## 13. Anti-Patterns

```
NEVER:
  ├── Layout-only assertions (isVisible, toBeAttached without behavioral follow-up)
  ├── waitForTimeout / manual sleep — use auto-waiting and waitForResponse
  ├── CSS class selectors (.btn-primary) — use role, label, testid
  ├── DOM structure selectors (div > span:nth-child) — breaks on any layout change
  ├── Tests that depend on other tests' state — each test is independent
  ├── Assertions in page objects — page objects encapsulate actions, tests assert
  ├── Hardcoded test data in test bodies — use fixtures
  ├── Skipping error/empty/loading state tests — they catch real bugs
  ├── Testing only the happy path — most bugs live in edge cases
  ├── Full cartesian product when pairwise suffices — wastes CI time
  └── console.log for debugging — use Playwright trace viewer and screenshots
```

---

## Playwright Verification Checklist

- [ ] Every assertion verifies behavior — not just element existence
- [ ] Coverage matrix built per feature (happy, validation, error, empty, edge, permissions, state transitions)
- [ ] All form fields tested: valid, invalid, empty, boundary, special chars
- [ ] Error states tested: 400, 401, 403, 404, 500, network failure
- [ ] Empty states tested: zero records, no search results
- [ ] State transitions tested: every valid + invalid transition
- [ ] Multi-step flows tested end-to-end with back-navigation
- [ ] Pairwise combinations for multi-input features
- [ ] Double-submit / concurrent action protection tested
- [ ] Selectors use role, label, testid — no CSS classes or DOM structure
- [ ] No manual waits — auto-waiting and waitForResponse only
- [ ] Page Object Model used (if 10+ tests)
- [ ] Test data in fixtures — not hardcoded
- [ ] Each test is independent — no shared mutable state
- [ ] API mocked for error/empty/loading scenarios
