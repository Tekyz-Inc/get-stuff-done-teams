# Domain: command-integration

## Responsibility
Wire the doc-ripple agent into the 5 GSD-T commands that produce code changes. Each command gets a doc-ripple spawn block that fires before reporting completion. Also updates reference docs (README, GSD-T-README, gsd-t-help, CLAUDE-global template) to document the new command.

## Owned Files/Directories
- commands/gsd-t-execute.md — add doc-ripple spawn after Step 6 completion
- commands/gsd-t-integrate.md — add doc-ripple spawn after Step 7 test verification
- commands/gsd-t-quick.md — add doc-ripple spawn after Step 5 test & verify
- commands/gsd-t-debug.md — add doc-ripple spawn after Step 5 test verification
- commands/gsd-t-wave.md — add doc-ripple spawn into phase orchestration
- commands/gsd-t-help.md — add doc-ripple to command list
- docs/GSD-T-README.md — add doc-ripple to command reference
- README.md — add doc-ripple to commands table
- templates/CLAUDE-global.md — add doc-ripple to commands table

## NOT Owned (do not modify)
- commands/gsd-t-doc-ripple.md — owned by doc-ripple-agent domain
- .gsd-t/contracts/doc-ripple-contract.md — owned by doc-ripple-agent domain
- bin/gsd-t.js — command count update (if needed, handled at commit gate)
