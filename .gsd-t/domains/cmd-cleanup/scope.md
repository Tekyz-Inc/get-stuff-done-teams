# Domain: cmd-cleanup

## Responsibility
Bring all command files to consistent structure and conventions: fractional step renumbering, missing sections added, QA agent hardened, wave state integrity.

## Owned Files/Directories
- commands/gsd-t-discuss.md — add Autonomy Behavior section
- commands/gsd-t-impact.md — add Autonomy Behavior section
- commands/gsd-t-qa.md — add file-path boundaries, Document Ripple, multi-framework guidance
- commands/gsd-t-wave.md — add integrity check, structured discuss-skip heuristic
- commands/gsd-t-plan.md — add QA blocking language
- commands/gsd-t-test-sync.md — add QA blocking language
- commands/gsd-t-*.md — all command files with fractional steps (renumbering)
- commands/gsd-t-*.md — all 10 QA-spawning commands (consistent blocking language)

## NOT Owned (do not modify)
- bin/gsd-t.js — CLI installer (completed in M6)
- scripts/*.js — scripts (completed in M5-M6)
- templates/*.md — template files
- test/*.test.js — except adding tests for new patterns
