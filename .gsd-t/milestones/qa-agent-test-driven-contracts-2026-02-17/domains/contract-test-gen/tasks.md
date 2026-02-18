# Tasks: contract-test-gen

## Task 1: Define API contract → test mapping rules
**Status**: pending
Define how API contract markdown (endpoints, request/response shapes, error codes) maps to executable Playwright/test code. Include:
- Route testing (correct HTTP method + path)
- Request body shape validation
- Response shape validation (status code + body structure)
- Error case testing (each documented error code)
- Auth requirement testing (if documented)
Output: A section in the QA agent spec describing the mapping rules with examples.

## Task 2: Define schema contract → test mapping rules
**Status**: pending
Define how schema contract markdown (tables, columns, types, constraints) maps to test assertions. Include:
- Table existence checks
- Column type validation
- Constraint validation (unique, not null, FK)
- Index existence checks
Output: A section in the QA agent spec describing the mapping rules with examples.

## Task 3: Define component contract → test mapping rules
**Status**: pending
Define how component contract markdown (props, events, slots) maps to Playwright component tests. Include:
- Component renders with required props
- Event handlers fire correctly
- Error states render appropriately
- Prop type validation (wrong types handled gracefully)
Output: A section in the QA agent spec describing the mapping rules with examples.
