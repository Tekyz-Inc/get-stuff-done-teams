# Shared Services Contract
**Project**: {Project Name}
**Milestone**: {Milestone Name}
**Updated**: {Date}

This contract documents backend functions and operations shared across multiple consumer surfaces.
All surfaces that need a shared operation MUST call it through the `shared-core` domain —
never implement a duplicate.

---

## Consumer Surfaces

| Surface      | Type           | Adapter Domain      |
|--------------|----------------|---------------------|
| {Web App}    | web            | {web-api domain}    |
| {Mobile App} | mobile         | {mobile-api domain} |
| {CLI}        | cli            | {cli domain}        |

---

## Shared Operations

| Operation        | Description                          | Owner Domain  | Consumers               |
|------------------|--------------------------------------|---------------|-------------------------|
| {operation-name} | {what it does}                       | shared-core   | web-api, mobile-api     |
| {operation-name} | {what it does}                       | shared-core   | web-api, cli            |

### Function Signatures

```
{operationName}(params: {ParamType}): {ReturnType}
  - {param}: {description}
  - Returns: {description}
  - Errors: {error conditions}
```

---

## SharedCore Domain Boundaries

**shared-core owns:**
- Business logic for all shared operations above
- Data access for shared operations
- Input validation for shared operations

**shared-core does NOT own:**
- HTTP route handlers (owned by surface-specific adapter domains)
- Surface-specific response formatting
- Auth/session handling (owned by auth domain)

---

## Violation Rule

If a surface-specific domain implements an operation that matches a shared operation above,
that is a **contract violation**. The implementation must be moved to shared-core.

Flag during: `gsd-t-impact` (New Consumer Analysis), `gsd-t-plan` (Duplicate Operation Scan),
and `gsd-t-verify` (contract compliance check).
