# Constraints: command-enhancements

## Must Follow
- All changes are additive — insert new steps, never replace or reorder existing ones
- Step numbering in partition must shift cleanly (new Step 1.6 inserted between 1 and 2)
- New content must match the existing writing style and formatting of each command file
- No external dependencies introduced

## Must Not
- Remove or rename any existing steps
- Change step numbers of existing steps (use fractional numbering like 1.6 for insertions)
- Modify files outside owned scope
- Add new commands (only enhance existing ones)

## Dependencies
- Depends on: template-addition for shared-services-contract.md (referenced in partition step)
- Depended on by: template-addition (template format informed by what partition step generates)
