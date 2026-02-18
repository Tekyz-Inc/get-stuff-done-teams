# Constraints: doc-alignment

## Must Follow
- All file format changes must match their contract exactly
- Backlog entries must use the format defined in `.gsd-t/contracts/backlog-file-formats.md`
- Progress.md must use the format defined in `.gsd-t/contracts/progress-file-format.md`
- GSD-T-README backlog section must match the format used in README.md and gsd-t-help.md
- Command counts must be 42 total (38 GSD-T workflow + 4 utility) everywhere

## Must Not
- Change any contract files — we are aligning implementation TO contracts
- Modify any code (bin/gsd-t.js, scripts/*.js)
- Change any command files (commands/*.md)
- Alter the content/meaning of backlog entries — only reformat
