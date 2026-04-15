# Token Optimization Backlog

This file tracks retrospective model-tier calibration recommendations produced by `bin/token-optimizer.js` at `complete-milestone`. Recommendations are **never auto-applied** — the user decides which to promote via `/user:gsd-t-optimization-apply {ID}` or dismiss via `/user:gsd-t-optimization-reject {ID} [--reason "..."]`.

Format: each recommendation is an H2 block with `[{ID}] {summary}` header and a frozen set of `**Key**: value` metadata lines:
- **Type**: detection rule that fired (`demote` / `escalate` / `runway-tune` / `investigate`)
- **Detected**: ISO timestamp + source milestone
- **Evidence**: raw data supporting the recommendation
- **Projected savings**: expected token reduction or correctness improvement
- **Proposed change**: concrete file + modification to apply
- **Risk**: qualitative assessment with escalation fallbacks
- **Status**: `pending` / `promoted` / `rejected`
- **Rejection cooldown**: milestones remaining before the same signal can re-surface (only meaningful when `Status: rejected`)
- **Fingerprint**: opaque dedup key — prevents re-surfacing the same recommendation during cooldown

Contract: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (read-only data source)
