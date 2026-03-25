# Node.js API Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Service Layer Pattern

HTTP knowledge belongs in services only. Controllers are thin delegators.

```
MANDATORY:
  ├── Controllers: validate input, call service, return response — nothing else
  ├── Services: all business logic, data access, external HTTP calls
  └── Never import axios/fetch in controllers, hooks, or UI components
```

**BAD:** `router.get('/users/:id', async (req, res) => { const r = await axios.get(...); res.json(r.data); })`

**GOOD:**
```js
// controller — delegates only
router.get('/users/:id', async (req, res, next) => {
  try { res.json({ data: await userService.getById(req.params.id) }); }
  catch (err) { next(err); }
});
```

---

## 2. Request Validation

Every endpoint must validate input. Reject unexpected fields.

```
MANDATORY:
  ├── Validate bodies, path params, and query strings with Zod or Joi schemas
  ├── Use .strict() (Zod) or .unknown(false) (Joi) — reject extra fields
  └── Return 400 with structured error before business logic runs
```

**BAD:** `await orderService.create(req.body)` — raw unvalidated input

**GOOD:**
```js
const schema = z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1) }).strict();
router.post('/orders', validate(schema), async (req, res, next) => { ... });
```

---

## 3. Response Formatting

All endpoints return a consistent shape.

```
Success: { data: T, meta?: { page, total } }
Error:   { error: { code: string, message: string } }
Never return raw objects, arrays, or strings at the top level.
```

---

## 4. Error Handling

```
MANDATORY:
  ├── Register a global error handler middleware as the last app.use()
  ├── All route handlers call next(err) on caught errors — never swallow
  ├── No empty catch blocks — log at minimum, then re-throw or next(err)
  ├── Log full error server-side; return sanitized response to client
  └── Never include stack traces in production responses
```

**Global error handler:**
```js
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path });
  const status = err.statusCode ?? 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error' : err.message;
  res.status(status).json({ error: { code: err.code ?? 'ERR_INTERNAL', message } });
});
```

---

## 5. Middleware Order

Register in this exact order:

```
1. Security headers (helmet)
2. CORS — see _security.md
3. Body parser (express.json with size limit)
4. Request/correlation ID
5. Auth middleware — see _security.md
6. Rate limiting — see _security.md
7. Route-level validation
8. Route handlers
9. 404 handler
10. Global error handler (last)
```

---

## 6. Environment Config

```
MANDATORY:
  ├── All config from environment variables — no hardcoded values
  ├── Never commit .env files with real values
  ├── Client-side vars: VITE_ or NEXT_PUBLIC_ prefix only
  ├── Never expose server secrets (DB_PASSWORD, API_KEY) to client bundles
  └── Validate required env vars on startup — fail fast if missing
```

**BAD:** `new Pool({ password: 'hardcoded123' })`

**GOOD:**
```js
['DATABASE_URL', 'JWT_SECRET'].forEach(k => {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
});
```

---

## 7. Structured Logging

```
MANDATORY:
  ├── Use structured JSON logging (pino or winston with json transport)
  ├── Never log PII — redact email, name, phone, tokens before logging
  ├── Include request ID on every log line for traceability
  └── No console.log in production paths
```

**BAD:** `console.log('User:', user)` — leaks PII

**GOOD:** `logger.info({ userId: user.id, action: 'login' }, 'User authenticated')`

---

## 8. Health Check Endpoint

```js
app.get('/health', (req, res) =>
  res.json({ status: 'ok', uptime: process.uptime() }));
// /health/ready — also checks DB/dependency reachability
```

---

## 9. Graceful Shutdown

```
MANDATORY:
  ├── Handle SIGTERM and SIGINT
  ├── Stop accepting new connections immediately
  ├── Drain in-flight requests (10s timeout)
  └── Close DB pools before exiting
```

```js
const shutdown = async () => {
  server.close(async () => { await db.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

---

## 10. Security Cross-References

These topics are covered in `_security.md` — do not duplicate here:
SQL injection, auth token storage, CORS, Content Security Policy, rate limiting, input sanitization.

---

## Verification Checklist

- [ ] Route handlers delegate all logic to services — no business logic in controllers
- [ ] Every endpoint has a Zod/Joi schema with strict mode (no extra fields allowed)
- [ ] All responses use `{ data }` or `{ error: { code, message } }` shape
- [ ] Global error handler registered last — no route handles errors via `res.json` directly
- [ ] No stack traces in production responses
- [ ] No silent catch blocks — all errors are logged or re-thrown
- [ ] All config from env vars — no hardcoded secrets or connection strings
- [ ] Structured JSON logging in use — no `console.log` in production paths
- [ ] No PII in log output
- [ ] `/health` endpoint returns 200 with status payload
- [ ] SIGTERM/SIGINT handlers registered with connection draining
- [ ] Security concerns (SQL injection, CORS, tokens) deferred to `_security.md`
