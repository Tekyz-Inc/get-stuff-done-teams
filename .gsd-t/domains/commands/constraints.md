# Constraints: commands

## Must Follow
- Pure markdown, no frontmatter (existing command convention)
- All commands accept $ARGUMENTS at the end
- Step-numbered workflow (Step 1, Step 2, etc.)
- Include Document Ripple and Test Verification steps in any command that modifies files
- Backlog entry format per file-format contract
- Auto-categorization must validate against settings values from backlog-settings.md
- Position-based priority: position in document = priority, no stored numbers

## Must Not
- Modify files outside owned scope
- Modify existing command files
- Create template files (owned by templates domain)
- Change any existing GSD-T workflow behavior

## Dependencies
- Depends on: **templates** domain for backlog.md and backlog-settings.md file format specification
- Depended on by: **integration** domain for command names, purposes, and argument patterns
