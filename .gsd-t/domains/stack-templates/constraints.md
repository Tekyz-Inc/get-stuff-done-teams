# Constraints: stack-templates

## Must Follow
- Each template file must start with `# {Language/Framework} Standards` and include "These rules are MANDATORY. Violations fail the task."
- Use the same structure as `_security.md` — numbered sections, code blocks with GOOD/BAD examples, checklist at the end
- Keep each file under 200 lines — focus on actionable rules, not tutorials
- Include only patterns that can be objectively verified by a QA agent (no subjective "best practices")
- `react.md` content should be derived from Gayathri's best practices document (already analyzed in this session)

## Must Not
- Modify files outside `templates/stacks/`
- Add framework-specific tooling or dependencies
- Include setup/installation instructions (that's project-specific)
- Duplicate content already in `_security.md` (reference it instead)

## Must Read Before Using
- `templates/stacks/_security.md` — understand the format and tone to maintain consistency

## Dependencies
- Depends on: none (standalone content creation)
- Depended on by: command-integration (reads these files to inject into prompts)
