# GSD-T Methodology

## Evolution from GSD to GSD-T

GSD (Get Stuff Done) was a structured methodology for Claude Code that organized work into Milestones → Phases → Waves with living documentation. It worked well for solo sessions but had limitations:

- **No parallelism**: Single agent, sequential execution
- **Context loss**: Long sessions would lose track of decisions
- **No explicit interfaces**: Components interacted through implicit assumptions
- **Documentation drift**: Docs fell out of sync with code

GSD-T addresses all of these by adding:

1. **Contracts** — Explicit interfaces between domains that serve as the single source of truth
2. **Domain isolation** — Each domain owns specific files with no overlap
3. **Checkpoints** — Cross-domain dependencies are explicit gates
4. **Agent Teams support** — Parallel execution when beneficial
5. **Pre-Commit Gate** — Mandatory documentation checklist on every commit
6. **Document Ripple** — Changes cascade to all affected docs automatically

## Core Concepts

### Contracts

A contract is a documented interface between two or more domains. It specifies:
- Data shapes (request/response types, database schemas)
- Endpoint signatures (HTTP methods, paths, auth requirements)
- Component interfaces (props, events, callbacks)
- Error handling (error shapes, status codes)

Contracts are stored in `.gsd-t/contracts/` and are the single source of truth. If code and contract disagree, one must be fixed.

### Domains

A domain is an independent area of responsibility within a milestone. Each domain:
- Has a clear responsibility (auth, data-layer, ui, etc.)
- Owns specific files — no overlap with other domains
- Can be worked on independently once contracts are defined
- Has well-defined inputs and outputs at its boundaries

### Checkpoints

Checkpoints are explicit gates in the dependency graph. When a checkpoint is reached:
1. Execution of blocked tasks stops
2. The lead verifies the implemented code matches the contract
3. If compliant, downstream tasks are unblocked
4. If not, the deviation is fixed before proceeding

### Pre-Commit Gate

A mandatory checklist that runs before every commit:
- Did I change an API? → Update api-contract.md
- Did I change the schema? → Update schema-contract.md
- Did I add files? → Update scope.md
- Did I implement a requirement? → Update requirements.md
- etc.

This prevents the most common problem: code shipping without documentation updates.

## When to Use Each Entry Point

| Situation | Command | What happens |
|-----------|---------|-------------|
| New idea, nothing built | `gsd-t-project` | Vision → milestone roadmap → ready to partition |
| Existing codebase, adding major feature | `gsd-t-feature` | Impact analysis → feature milestones → partition |
| Existing codebase, need to understand/clean up | `gsd-t-scan` | 5-dimension analysis → techdebt.md → promotable |
| Already have milestones defined | `gsd-t-milestone` | Define one milestone → partition → execute |
| Just need to do something quick | `gsd-t-quick` | Fast task with contract respect |

## Solo vs Team Decision

Teams burn tokens fast. Use them strategically:

**Use teams when:**
- 3+ truly independent domains
- Complex design decisions with multiple valid approaches
- Large verification across many dimensions
- Debugging cross-domain issues where multiple hypotheses need parallel testing

**Stay solo when:**
- < 8 total tasks
- Domains are tightly coupled
- Planning (always — need full cross-domain context)
- Integration (always — need to see all seams)
- The task is straightforward
