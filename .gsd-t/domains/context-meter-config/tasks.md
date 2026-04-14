# Tasks: context-meter-config

## Summary

Defines the Context Meter configuration schema, ships a default config template, and provides a validated CommonJS loader. Unblocks all downstream M34 domains by fixing the config + state file formats first (CP1).

## Tasks

### Task 1: Write context-meter-contract.md (schema + state file format)
- **Files**: `.gsd-t/contracts/context-meter-contract.md` (already drafted during partition — this task polishes + finalizes it)
- **Contract refs**: `context-meter-contract.md` itself (this IS the contract); related: `token-budget-contract.md` (for threshold-band alignment)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - Contract v1.0.0 is ACTIVE (drop DRAFT status) and contains: config schema (8 fields with defaults), state file schema (8 fields), hook I/O shape, count_tokens API usage, threshold mapping, rules, breaking-change policy
  - Every field in the schema has a type, default, validation rule, and one-line meaning
  - State file format is identical to what `bin/token-budget.js` will read in token-budget-replacement Task 3
  - No reference to `CLAUDE_CONTEXT_TOKENS_USED` or `CLAUDE_CONTEXT_TOKENS_MAX` anywhere (they never worked)
  - Contract explicitly states: API key is NEVER stored in config or state — only the env var name
  - Finalization commit message: "docs(m34): finalize context-meter-contract v1.0.0"
  - **CP1 is satisfied** by this task's completion → unblocks context-meter-hook Task 1 and token-budget-replacement Task 1

### Task 2: Create templates/context-meter-config.json (default config)
- **Files**: `templates/context-meter-config.json` (new)
- **Contract refs**: `context-meter-contract.md` — config schema
- **Dependencies**: Requires Task 1 (contract finalized)
- **Acceptance criteria**:
  - File contains the default config exactly as shown in the contract's "Schema (v1)" block
  - Valid JSON (parses with `JSON.parse` on read)
  - Includes `version: 1`, `thresholdPct: 75`, `modelWindowSize: 200000`, `checkFrequency: 5`, `apiKeyEnvVar: "ANTHROPIC_API_KEY"`, `statePath: ".gsd-t/.context-meter-state.json"`, `logPath: ".gsd-t/context-meter.log"`, `timeoutMs: 2000`
  - Contains NO actual API key (validator will reject the template if it does)

### Task 3: Implement bin/context-meter-config.cjs loader
- **Files**: `bin/context-meter-config.cjs` (new)
- **Contract refs**: `context-meter-contract.md` — loader API + validation rules
- **Dependencies**: Requires Task 1 (contract), Task 2 (template to fall back to)
- **Acceptance criteria**:
  - Exports `loadConfig(projectRoot = process.cwd())` returning the parsed + validated config object
  - Missing `.gsd-t/context-meter-config.json` → returns defaults silently (no throw)
  - Present file with partial fields → merges over defaults
  - Invalid field type or out-of-range value → throws with a clear message naming the field
  - Unknown `version` (≠ 1) → throws with a migration pointer
  - API-key-leak detection: rejects any field name matching `/api.?key/i` (except exactly `apiKeyEnvVar`) and any string value longer than 100 chars matching `/^[a-zA-Z0-9_-]{64,}$/`
  - Uses only Node.js built-ins (`fs`, `path`) — zero external deps
  - CommonJS so it runs in ESM projects (same precedent as `bin/task-counter.cjs` being retired)

### Task 4: Unit tests for context-meter-config.cjs
- **Files**: `bin/context-meter-config.test.cjs` (new)
- **Contract refs**: `context-meter-contract.md` — validation rules to test
- **Dependencies**: Requires Task 3 (the loader to test)
- **Acceptance criteria**:
  - Test: missing config file → returns defaults
  - Test: valid full config → returns exact values
  - Test: partial config → missing fields filled with defaults
  - Test: `thresholdPct` out of range (0, 100, -5, 150) → throws
  - Test: `modelWindowSize <= 0` → throws
  - Test: `checkFrequency < 1` → throws
  - Test: empty `apiKeyEnvVar` → throws
  - Test: unknown version → throws with migration pointer
  - Test: config containing an `apiKey` field → rejected as leak
  - Test: config containing a 64-char hex string value → rejected as leak
  - Uses `node --test` runner (matches existing test infra per `package.json` scripts)
  - All tests pass when run via `npm test`
