# Domain: doc-ripple-agent

## Responsibility
Core doc-ripple agent: blast radius analysis, threshold logic, manifest generation, parallel update dispatch. This domain creates the new command file and its contract.

## Owned Files/Directories
- commands/gsd-t-doc-ripple.md — the doc-ripple agent command file (NEW)
- .gsd-t/contracts/doc-ripple-contract.md — trigger conditions, manifest format, update protocol (NEW)

## NOT Owned (do not modify)
- commands/gsd-t-execute.md — owned by command-integration domain
- commands/gsd-t-integrate.md — owned by command-integration domain
- commands/gsd-t-quick.md — owned by command-integration domain
- commands/gsd-t-debug.md — owned by command-integration domain
- commands/gsd-t-wave.md — owned by command-integration domain
- .gsd-t/contracts/pre-commit-gate.md — read-only reference
- .gsd-t/contracts/fresh-dispatch-contract.md — read-only reference
