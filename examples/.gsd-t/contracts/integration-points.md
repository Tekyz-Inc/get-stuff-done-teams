# Integration Points — Example

## Dependency Graph

### Independent (can start immediately)
- data-layer: Tasks 1-3 (schema, models, migrations)
- auth: Tasks 1-2 (JWT utils, password hashing)
- ui: Tasks 1-2 (layout, login form component)

### First Checkpoint
- **GATE**: data-layer Task 3 (migrations applied) must complete
- **UNLOCKS**: auth Task 3 (user lookup service)
- **VERIFY**: Lead confirms schema matches schema-contract.md

### Second Checkpoint
- **GATE**: auth Task 4 (auth middleware complete) must complete
- **UNLOCKS**: ui Task 4 (protected routes)
- **VERIFY**: Lead confirms auth endpoints match api-contract.md

## Execution Order (for solo mode)
1. data-layer Tasks 1-3
2. auth Tasks 1-2 (parallel-safe with data-layer)
3. CHECKPOINT: verify schema contract
4. auth Tasks 3-4
5. ui Tasks 1-3 (parallel-safe with auth 3-4)
6. CHECKPOINT: verify api contract
7. ui Tasks 4-5
8. INTEGRATION: wire everything together
