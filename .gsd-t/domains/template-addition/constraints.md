# Constraints: template-addition

## Must Follow
- Template must use {placeholder} token format matching all other GSD-T templates
- Must include: consumer surfaces table, shared operations table, SharedCore domain reference
- Keep under 80 lines — concise, scannable

## Must Not
- Create new commands
- Modify existing templates
- Modify files outside owned scope

## Dependencies
- Depends on: command-enhancements (partition step defines what fields the template needs)
