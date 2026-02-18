# Integration Points

## Current State
No active cross-domain dependencies. The project is between milestones or running single-domain milestones.

## Usage
This file is populated by `gsd-t-plan` when a milestone has multiple domains with cross-domain dependencies. It defines:
- Dependency graph (which domains block which)
- Execution order for solo mode
- Checkpoints where the lead verifies contract compliance before unblocking downstream tasks

## History
- **Milestone 3** (Count Fix + QA Contract Alignment): Single domain, no integration points needed.
- **Milestones 4-8**: All single-domain milestones — no integration points.

When a multi-domain milestone is created, this file will be updated with the specific dependency graph for that milestone.
