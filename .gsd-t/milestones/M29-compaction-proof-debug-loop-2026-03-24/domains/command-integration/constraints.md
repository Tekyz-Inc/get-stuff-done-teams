# Constraints: command-integration

## Must Follow
- The stack detection block must be identical across all 5 command files (copy-paste, not adapted per command)
- Detection reads actual project files (package.json, requirements.txt, go.mod, Cargo.toml) — not CLAUDE.md
- Universal templates (`_` prefix) are ALWAYS injected, regardless of detection results
- Stack-specific templates injected ONLY when the matching stack is detected
- The injection framing must include: "These are MANDATORY standards. Violations fail the task."
- QA subagent prompt must include: "Validate compliance with stack rules. Stack rule violations = task failure."
- Stack rules are injected into the prompt — never written to disk per project
- The detection block must be resilient: if templates/stacks/ directory doesn't exist or is empty, skip silently
- Follow existing command file patterns: step-numbered, markdown blocks, Bash for file operations

## Must Not
- Modify template content in `templates/stacks/`
- Add new slash commands
- Change `bin/gsd-t.js`
- Add npm dependencies
- Modify the wave phase sequence

## Must Read Before Using
- `commands/gsd-t-execute.md` — understand the current subagent prompt structure (Step 3 Solo Mode)
- `commands/gsd-t-quick.md` — understand the Step 0 subagent spawn pattern
- `bin/rule-engine.js` — INSPECT only — understand the pattern of how Active Rule Injection works (similar mechanism)

## Dependencies
- Depends on: stack-templates (template files must exist for injection to work)
- Depended on by: none (this is the final integration layer)
