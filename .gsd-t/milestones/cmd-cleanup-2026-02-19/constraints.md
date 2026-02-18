# Constraints: cmd-cleanup

## Must Follow
- All command files remain pure markdown (no frontmatter)
- Step numbering uses integers only (no fractional steps like 4.7)
- Autonomy Behavior sections follow the existing pattern (Level 3 / Level 1-2 blocks)
- Document Ripple sections follow the existing pattern (Always update / Check if affected)
- QA blocking language is consistent across all 10 spawning commands
- Wave integrity check reads progress.md status field

## Must Not
- Modify command file names (would require 4-file reference update)
- Change observable CLI behavior (output format, exit codes)
- Add external dependencies
- Modify bin/gsd-t.js or scripts/*.js
- Change template files
- Break the wave phase sequence

## Dependencies
- No cross-domain dependencies (single domain milestone)
