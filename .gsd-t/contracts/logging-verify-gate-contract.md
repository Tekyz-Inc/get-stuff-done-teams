# Logging Verify-Gate Contract

**Version:** 1.0.0 DRAFT (M100 partition)
**Owner:** d3-verify-envelope-gate
**Consumers:** `bin/gsd-t-verify-gate.cjs` (registration), d5-defaults-migration-pilot (the pilot must pass this gate).
**Milestone:** M100 — Universal Trace + Audit Logging (framework defaults).

---

## Purpose

Fixes the **predicate module** that `gsd-t-verify` runs to enforce BOTH logging envelopes over PER-PROJECT-VARYING schemas. The predicate lives in a standalone module (`bin/gsd-t-logging-envelope-check.cjs`) so the ONLY touch to `bin/gsd-t-verify-gate.cjs` is one registration edit owned solely by d3.

## The predicate: what d3 produces

`bin/gsd-t-logging-envelope-check.cjs` exposes **BOTH** exports (pre-mortem F3 — d2/d4 consume the per-record form; the gate registers the per-project form):

```
// PER-RECORD (consumed by d2 trace + d4 audit killing tests):
checkEnvelope(record, { stream: "trace" | "audit" }) -> {
  ok: boolean,
  failures: Array<{ rule, stream, detail }>   // [] when ok
}

// PER-PROJECT (registered into the verify gate); DEFINED IN TERMS OF checkEnvelope:
checkLoggingEnvelopes({ projectDir }) -> {
  ok: boolean,
  failures: Array<{ rule, stream, detail }>   // [] when ok
}
```

### Presence-vs-null rule (pre-mortem F2 — CRITICAL — never truthiness)

A required field may be PRESENT with a `null` VALUE — this is LEGAL and must PASS. Only an ABSENT key fails. The predicate tests key-presence and value-type as TWO separate operations; it NEVER uses truthiness (`if (!record.before)`) to detect absence.

- Audit `before:null` (a create) and `after:null` (a delete) → the KEY is present, value null → **PASS**.
- Trace `decision:null` (a non-decision observation) → key present, value null → **PASS**.
- The `before` / `decision` KEY entirely OMITTED → **FAIL** (`*-envelope-structural`).
- Presence test = `Object.prototype.hasOwnProperty.call(record, key)` / `key in record`; type test = accepts the field's documented type OR `null` for the nullable required fields (`before`/`after`/`decision`).

## Enforced checks (STRUCTURAL — never hardcode a category/action)

| Check | Stream | Rule |
|-------|--------|------|
| Required trace fields present + typed (`ts`/`category`/`decision`/`detail`; optional typed `key`/`status`/`data`) | trace | `trace-envelope-structural` |
| Required audit fields present + typed (`ts`/`actor`/`action`/`target`/`before`/`after`/`context`) | audit | `audit-envelope-structural` |
| PII bar — reject email/phone/postal-address-shaped field anywhere incl. `data` | trace | `trace-pii-barred` |
| Append-only / immutability DECLARED (no update/delete path in normal operation) | audit | `audit-append-only-immutable` |
| Retention configurable / not hardcoded | audit | `audit-retention-configurable` |
| Audit-default-except-opt-out (no audit + no opt-out record → FAIL; valid opt-out → PASS) | audit | `audit-default-except-optout` |
| No-collapse — a record MUST NOT carry the TOP-LEVEL marker set of BOTH streams | both | `no-collapse` |

### No-collapse detector — EXACT rule (pre-mortem F1 — CRITICAL)

The detector keys on a record's **TOP-LEVEL marker set**, NOT a key-name scan of the free-form `context`/`data` payload:

- **Trace top-level markers:** the record has a top-level `decision` key AND a top-level `category` key (trace shape) and NO top-level `before`/`after`/`actor`/`action`.
- **Audit top-level markers:** the record has top-level `before` AND `after` AND `actor` AND `action` keys (audit shape) and NO top-level `category`/`decision`/`detail`.
- **COLLAPSED (→ FAIL):** a record carrying BOTH marker sets at the TOP level — e.g. a trace-shaped record (`category`+`decision`) that ALSO has top-level `before`/`after` state-change fields.
- **MUST PASS (not collapse):** a legitimate audit record whose free-form `context` object happens to contain a nested key literally named `decision` or `before` — because the scan is TOP-LEVEL-marker-set, never a substring/key-name scan of `context`. Likewise a valid trace record with `decision:null` and no before/after.
- d2 (trace emitter), d4 (audit emitter), and d3 (predicate) MUST all build to THIS rule so the seam agrees.

- **Never hardcode a category/action value** — a novel `category`/`action` PASSES (`feedback_coverage_check_structural_not_substring`). The gate checks presence + type + stream boundary, structurally, parsing shape as shape, never `text.includes(value)`.

## Registration boundary

- d3 is the SOLE editor of `bin/gsd-t-verify-gate.cjs` for M100 — exactly one line registering `checkLoggingEnvelopes` into the gate's check list.
- The gate runs FAIL-CLOSED on any failure per the envelope contracts' Enforcement sections.

## Consumed contracts

- [`trace-logging-contract.md`](trace-logging-contract.md) §Required trace-entry envelope + §PII bar + §Enforcement.
- [`audit-logging-contract.md`](audit-logging-contract.md) §Required audit-entry envelope + §Append-only + §Retention + §Default+opt-out + §Enforcement.
