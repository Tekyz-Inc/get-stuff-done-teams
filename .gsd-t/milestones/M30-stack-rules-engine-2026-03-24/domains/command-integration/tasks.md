# Tasks: command-integration

## Summary
Add stack detection + prompt injection to all 5 subagent-spawning commands, update QA prompts for stack rule compliance validation, write tests, and update reference documentation.

## Tasks

### Task 1: Wire stack detection into execute and quick commands
- **Files**: `commands/gsd-t-execute.md`, `commands/gsd-t-quick.md`
- **Contract refs**: stack-rules-contract.md (Detection Logic, Prompt Injection Format, Commands table)
- **Dependencies**: BLOCKED by stack-templates (all 3 tasks — templates must exist)
- **Acceptance criteria**:
  - `gsd-t-execute.md` Step 3 task subagent prompt includes Stack Rules Detection block (Bash detection + prompt injection) per contract
  - `gsd-t-execute.md` Step 2 QA subagent prompt includes stack rule compliance validation line per contract
  - `gsd-t-quick.md` Step 0 subagent spawn prompt includes Stack Rules Detection block per contract
  - Detection block is identical in both files (copy-paste consistency)
  - Detection is resilient: skips silently if templates/stacks/ doesn't exist or no matches found

### Task 2: Wire stack detection into integrate, wave, and debug commands
- **Files**: `commands/gsd-t-integrate.md`, `commands/gsd-t-wave.md`, `commands/gsd-t-debug.md`
- **Contract refs**: stack-rules-contract.md (Detection Logic, Prompt Injection Format, Commands table)
- **Dependencies**: BLOCKED by stack-templates (all 3 tasks — templates must exist)
- **Acceptance criteria**:
  - `gsd-t-integrate.md` integration subagent prompt includes Stack Rules Detection block per contract
  - `gsd-t-wave.md` Phase Agent Spawn Pattern includes Stack Rules Detection block per contract
  - `gsd-t-debug.md` Step 0 subagent spawn prompt includes Stack Rules Detection block per contract
  - Detection block is identical across all 3 files and matches Task 1's block exactly
  - Detection is resilient: skips silently if templates/stacks/ doesn't exist or no matches found

### Task 3: Write tests for stack detection logic
- **Files**: `test/stack-rules.test.js`
- **Contract refs**: stack-rules-contract.md (Detection Sources table, Template File Convention, Resilience Rules)
- **Dependencies**: Requires Task 1 (detection pattern must be defined)
- **Acceptance criteria**:
  - Tests validate detection from package.json (react, typescript, express, fastify, hono, koa)
  - Tests validate detection from tsconfig.json presence
  - Tests validate detection from requirements.txt, pyproject.toml, go.mod, Cargo.toml
  - Tests validate universal template injection (_security.md always included)
  - Tests validate resilience: missing templates/stacks/ dir, empty dir, malformed package.json
  - Tests validate template file structure (starts with `# {Name} Standards`, includes mandatory framing)
  - All tests pass

### Task 4: Update reference documentation
- **Files**: `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md`
- **Contract refs**: stack-rules-contract.md (full contract for documentation accuracy)
- **Dependencies**: Requires Tasks 1-2 (command changes must be finalized before documenting)
- **Acceptance criteria**:
  - `README.md` features section mentions Stack Rules Engine with brief description
  - `GSD-T-README.md` documents stack rules behavior under relevant command entries
  - `templates/CLAUDE-global.md` includes Stack Rules Engine section explaining detection, injection, and enforcement
  - `commands/gsd-t-help.md` updated if any command descriptions need revision
  - Template count in CLAUDE.md project structure updated (9 → "9 document templates + stack rules")

## Execution Estimate
- Total tasks: 4
- Independent tasks (no blockers): 0 (all blocked by stack-templates)
- Blocked tasks (waiting on other domains): 4 (all blocked by stack-templates Wave 1)
- Estimated checkpoints: 1 (Wave 1 → Wave 2 boundary)
