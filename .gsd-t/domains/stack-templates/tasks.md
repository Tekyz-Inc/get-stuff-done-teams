# Tasks: stack-templates

## Summary
Create 3 stack-specific best practice template files (react.md, typescript.md, node-api.md) that the detection engine will inject into subagent prompts. Each file follows the structure established by `_security.md`.

## Tasks

### Task 1: Create react.md
- **Files**: `templates/stacks/react.md`
- **Contract refs**: stack-rules-contract.md (Template Structure section)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - File starts with `# React Standards` and includes mandatory framing
  - Covers: React Query for server state, hooks rules, component design (Container/Presenter, 150-line limit), props (interfaces, destructuring), key prop rules, memoization guidelines, lazy loading, a11y (ARIA, keyboard nav), anti-patterns (useEffect fetching, prop drilling, index keys, conditional hooks, state mutation)
  - Content derived from Gayathri's best practices document
  - Security items (XSS, dangerouslySetInnerHTML) reference `_security.md` instead of duplicating
  - Under 200 lines
  - Ends with verification checklist

### Task 2: Create typescript.md
- **Files**: `templates/stacks/typescript.md`
- **Contract refs**: stack-rules-contract.md (Template Structure section)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - File starts with `# TypeScript Standards` and includes mandatory framing
  - Covers: strict mode (no `any`, no `object`, no implicit any), interface vs type usage, generic components, Zod schema-driven validation, import ordering, naming conventions (PascalCase components, `use` prefix hooks, `handle`/`on` event naming, boolean `is`/`has`/`can` prefix)
  - Under 200 lines
  - Ends with verification checklist

### Task 3: Create node-api.md
- **Files**: `templates/stacks/node-api.md`
- **Contract refs**: stack-rules-contract.md (Template Structure section)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - File starts with `# Node.js API Standards` and includes mandatory framing
  - Covers: service layer pattern (HTTP knowledge only in services), error handling (global error handler, structured responses, no stack traces in production), middleware patterns, request validation (Zod/Joi schemas), response formatting, environment config (.env patterns, never secrets in client code), logging (structured, no PII), graceful shutdown
  - Security items (SQL injection, auth tokens, CORS) reference `_security.md` instead of duplicating
  - Under 200 lines
  - Ends with verification checklist

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 3 (all parallel-safe)
- Blocked tasks (waiting on other domains): 0
- Estimated checkpoints: 0
