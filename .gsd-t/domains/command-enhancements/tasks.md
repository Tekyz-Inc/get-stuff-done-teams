# Tasks: command-enhancements

## Summary
Add consumer surface enumeration to gsd-t-partition, duplicate operation detection to
gsd-t-plan, and new-consumer reuse analysis to gsd-t-impact. All changes are additive.

## Tasks

### Task 1: Add Consumer Surface Enumeration to gsd-t-partition.md
- **Files**: commands/gsd-t-partition.md
- **Contract refs**: shared-services-contract.md (template to be created by template-addition domain)
- **Dependencies**: NONE
- **Acceptance criteria**:
  - New Step 1.6 inserted between Step 1 and Step 2
  - Step prompts for all consumer surfaces (web, mobile, CLI, external API, admin, background)
  - Step identifies operations needed by each surface
  - Overlap detection: operations shared by 2+ surfaces flagged
  - Auto-suggestion: if overlap found, suggest SharedCore domain before Step 2 runs
  - SharedCore domain auto-added to domain list when confirmed
  - Reference to shared-services-contract.md template included

### Task 2: Add Cross-Domain Duplicate Detection to gsd-t-plan.md
- **Files**: commands/gsd-t-plan.md
- **Contract refs**: n/a (internal plan validation)
- **Dependencies**: NONE (parallel-safe with Task 1)
- **Acceptance criteria**:
  - After all domain task lists are created in Step 2, a duplicate scan is performed
  - Scan looks for same operation/function name appearing in 2+ domain task lists
  - Duplicates flagged with recommendation: route through SharedCore or extract to common module
  - If SharedCore domain exists: duplicates assigned to it instead

### Task 3: Add New-Consumer Reuse Analysis to gsd-t-impact.md
- **Files**: commands/gsd-t-impact.md
- **Contract refs**: n/a (impact report enrichment)
- **Dependencies**: NONE (parallel-safe with Tasks 1 and 2)
- **Acceptance criteria**:
  - New sub-section added in Step 3: "New Consumer Analysis"
  - Triggers when the change description adds a new client surface
  - Lists backend operations the new consumer needs
  - Compares against existing operations (grep/search)
  - Classifies each: REUSE (call existing) | EXTEND (add variant) | DUPLICATE (new endpoint doing same thing)
  - DUPLICATE classifications added as 🔴 breaking change items (must be resolved by routing through shared layer)

## Execution Estimate
- Total tasks: 3
- Independent tasks (no blockers): 3
- Blocked tasks: 0
- Estimated checkpoints: 0
