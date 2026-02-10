# Constraints: templates

## Must Follow
- Use `{Project Name}`, `{Date}` as replacement tokens (existing template convention)
- Templates must be human-readable and git-diffable
- Backlog entry format: `## {N}. {title}` followed by metadata line and description
- Position numbers are implicit from document order — no stored priority fields
- Settings file uses markdown list format for types, apps, categories

## Must Not
- Modify existing template files
- Create command files (owned by commands domain)
- Add any external dependencies

## Dependencies
- Depends on: nothing (templates are the foundation)
- Depended on by: **commands** domain for file format specification
- Depended on by: **integration** domain for init bootstrapping
