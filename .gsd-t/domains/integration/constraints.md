# Constraints: integration

## Must Follow
- Preserve all existing content in modified files — merge, don't overwrite
- Follow existing patterns in each file (table format in help, heading structure in README)
- Init must create backlog files from templates and trigger category derivation from CLAUDE.md
- Status must show backlog summary only if .gsd-t/backlog.md exists
- Help must list all 7 new commands with consistent formatting

## Must Not
- Modify new backlog command files (owned by commands domain)
- Modify new template files (owned by templates domain)
- Change existing command behavior — only ADD backlog integration sections
- Break any existing GSD-T workflow

## Dependencies
- Depends on: **templates** domain for template file paths and format
- Depends on: **commands** domain for command names, purposes, and argument patterns
- Depended on by: nothing (integration is the final domain)
