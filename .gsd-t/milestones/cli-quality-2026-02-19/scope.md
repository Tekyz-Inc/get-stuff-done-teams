# Domain: cli-quality

## Responsibility
Bring all CLI and script code to project quality standards: function size limits, code deduplication, error isolation, performance optimization, and developer tooling.

## Owned Files/Directories
- bin/gsd-t.js — CLI installer (all 13 over-30-line functions)
- scripts/gsd-t-heartbeat.js — heartbeat hook (buildEvent + cleanup)
- .gitattributes — new file (line ending enforcement)
- .editorconfig — new file (editor consistency)

## NOT Owned (do not modify)
- commands/*.md — command files
- templates/*.md — template files
- scripts/npm-update-check.js — already hardened in M5
- test/*.test.js — except adding tests for new extracted functions
