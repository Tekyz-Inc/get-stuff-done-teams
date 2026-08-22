# Comparison Standards (Universal)

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 0. Clean The Value Where It Enters (trim first, then case)

**Every value arriving from outside the program is trimmed at the point it enters — and
case-normalised there too when it names something in the business.** Not at the comparison, and
not at the save. At the doorway.

A trailing space survives everything. It reaches the comparison (which answers "no match"), and
it reaches the database (where it outlives the code fix, breaking every later comparison
including correct ones). Cleaning at the entry point covers both, and there are a handful of
entry points against hundreds of uses.

```ts
// GOOD — cleaned once, where it arrives
const email  = (req.body.email  ?? '').trim().toLowerCase();
const status = (req.query.status ?? '').trim().toLowerCase();
const note   = (req.body.note   ?? '').trim();          // free text: trimming is fine,
                                                        // never lowercased

// BAD — a real defect, found by the boundary check in a live project:
const email = req.body.email?.trim();   // trimmed, never lowercased.
// David@x.com and david@x.com become two different accounts.
```

**Trim always — no exceptions by kind, passwords included.** A leading or trailing space is never
something a person meant to type; it is paste damage. Storing a password untrimmed locks them out
when they later type it normally. The ONLY values that keep their spaces are free text a person
wrote on purpose: a note, a description, a message body.

**Lowercase only business values** — never a password, token, signature, hash, encoded value, file
path, URL, object key, or environment-variable name (see §2). Case-sensitive means *do not change
the casing*; it never means *do not trim*.

**Enforced mechanically** by `gsd-t boundary-normalize` in the verify gate: FAIL-CLOSED on files
a run touched. A value that genuinely must stay raw says so at the entry point itself —
`// gsd-t-allow-raw: <reason>` — never in a separate list of exceptions somewhere else.

---

## 1. Domain String Comparisons Are Case-Insensitive by Default

**Comparing a domain string VALUE against a literal is case-insensitive unless the user has
specifically directed otherwise.**

A domain value is a string that names something in the business world: a status, a filter, a tab, a
mode, a role, a category, a user-entered value, an email address. These cross system boundaries —
database, API, URL, form input, config — and each boundary is free to change the casing. A literal
comparison silently returns `false` and the feature just quietly does nothing.

```
CASE-INSENSITIVE (domain value vs literal):
  ├── Statuses, filters, tabs, modes, view names
  ├── Roles, categories, types, enum-ish values
  ├── Email addresses (the local part is technically case-sensitive per spec,
  │     but no real mail provider treats it that way — compare lowercased)
  ├── User-entered text being matched against known values
  └── Query-string and route params carrying any of the above
```

**GOOD**
```ts
filter.toLowerCase() !== 'invoiced'
status.toLowerCase() === 'pending'
user.email.toLowerCase() === input.email.toLowerCase()
row.category?.toLowerCase() === selected.toLowerCase()
```

**BAD** — a real bug, shipped:
```ts
// TILE_FILTERS maps the Invoiced tile to lowercase 'invoiced'.
// This compares against 'Invoiced'. It never matched. The "+ Add Order" button
// appeared on a tab where hand-adding an order is impossible, and the widening
// branch below pulled in orders that made an unrelated button appear too —
// two visible defects, one casing mismatch.
onAddOrder={view === 'orders' && filter !== 'Invoiced' ? handleAdd : undefined}
```

Guard against null/undefined when lowercasing a value that may be absent:
```ts
(filter || '').toLowerCase() !== 'invoiced'   // or filter?.toLowerCase()
```

---

## 2. Identifiers, Secrets, and Encoded Values Stay Case-Sensitive

Case-insensitivity is a **default for domain values, not a blanket rule**. Applying it to the
following is a defect — and for the first group, a security defect:

```
ALWAYS CASE-SENSITIVE:
  ├── Passwords, tokens, API keys, session IDs, signatures, hashes
  │     (case-insensitive matching here weakens the secret — a real vulnerability)
  ├── Encoded values: base64, JWTs, hex digests, cuid/uuid-as-string, git SHAs
  │     (case IS data — aB and Ab are different values)
  ├── File paths and filenames on Linux (Makefile ≠ makefile — different files)
  ├── Object and property keys (obj.userId ≠ obj.userid — different properties)
  ├── DOM/JSX tag names, prop names, CSS custom properties
  ├── Environment variable NAMES, git branch names, DNS record values
  └── Anything compared for cryptographic equality
```

**BAD** — a security defect:
```ts
if (providedToken.toLowerCase() === storedToken.toLowerCase()) grantAccess();
```

**GOOD**
```ts
if (providedToken === storedToken) grantAccess();  // exact, case-sensitive
```

---

## 3. Database Comparisons

The same split applies in SQL. A domain-value comparison is case-insensitive; an identifier or
token comparison is exact.

```sql
-- GOOD — domain value, case-insensitive
WHERE lower(status) = 'pending'
WHERE lower(email) = lower($1)

-- GOOD — citext column, or a functional index to keep it fast
CREATE INDEX idx_orders_status_lower ON orders (lower(status));

-- GOOD — identifier, exact
WHERE public_id = $1
WHERE api_key_hash = $1

-- BAD — domain value compared exactly; breaks when casing drifts
WHERE status = 'Pending'
```

Note: `lower(col) = ...` cannot use a plain index on `col`. Add a functional index on
`lower(col)`, or use a case-insensitive column type, when the column is queried at volume.

---

## 4. Prefer a Shared Constant Over Any String Literal

Case-insensitivity is the safety net. The structural fix is that a fixed set of values exists in
**one** place and every comparison references it — then a mismatch is caught by the compiler
instead of by a user.

```ts
// The bug above cannot occur when both sites reference the same constant:
export const ORDER_FILTER = { ORDERS: 'orders', INVOICED: 'invoiced' } as const;
```

Use both mechanisms. The shared constant catches typos and casing at build time; case-insensitive
comparison catches the same class of bug at the boundaries a constant can't reach — data arriving
from a database, an API response, a URL, or a user.

See `typescript.md` §6 for the typed form, and `postgresql.md`/`prisma.md` for database enums.

---

## Comparison Verification Checklist

- [ ] Every domain-value comparison (status/filter/tab/role/category/email) is case-insensitive
- [ ] No `.toLowerCase()` applied to a token, hash, signature, key, or encoded value
- [ ] Lowercasing guards against null/undefined (`(x || '').toLowerCase()`)
- [ ] Fixed value sets are declared once and referenced — not retyped as literals
- [ ] SQL domain-value filters use `lower()` (with a functional index if queried at volume)
- [ ] File paths, object keys, and env-var names compared exactly
