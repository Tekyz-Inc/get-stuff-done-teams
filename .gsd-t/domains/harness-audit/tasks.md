# Domain: harness-audit — Tasks

## Task 1: Create component registry module (bin/component-registry.js)
**Files**: `bin/component-registry.js`
**Scope**: Implement CRUD operations for component-registry.jsonl — getComponents(), getComponent(id), registerComponent(), updateStatus(), getFlaggedComponents(), recordImpact(), getImpactHistory(), seedRegistry(). JSONL read/write using Node.js built-ins only. seedRegistry() should auto-populate all known GSD-T enforcement components (Red Team, QA, stack rules, doc-ripple, E2E enforcement, pre-commit gate, observability logging).
**Contract**: harness-audit-contract.md (component registry schema + cost/benefit ledger schema)
**Tests**: Unit tests in test/component-registry.test.js

## Task 2: Create audit command (commands/gsd-t-audit.md)
**Files**: `commands/gsd-t-audit.md`
**Scope**: New GSD-T command file. Supports --component=<id>, --shadow, --report-only flags. In report-only mode: reads component-impact.jsonl and displays cost/benefit summary. In audit mode: disables target component for a test run and compares outcomes. Shadow mode: runs component but logs results without enforcing. Writes audit-report.md.
**Contract**: harness-audit-contract.md (audit command interface)
**Depends on**: Task 1 (needs component-registry.js)

## Task 3: Write unit tests for component registry
**Files**: `test/component-registry.test.js`
**Scope**: Test all exported functions: CRUD operations on registry, impact recording, flagging logic (consecutive_negative >= 3), seed registry produces expected components. Use tmp directories for test isolation.
**Contract**: harness-audit-contract.md
**Depends on**: Task 1
