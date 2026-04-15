# GSD-T: Optimization Apply — Promote a Recommendation

Apply (promote) a pending recommendation from `.gsd-t/optimization-backlog.md`. Takes `$ARGUMENTS` as the recommendation ID (e.g., `M35-OPT-001`).

Recommendations are produced by `bin/token-optimizer.cjs` at `complete-milestone` and are **never auto-applied**. This command is the user's deliberate promotion step.

## Usage

```
/user:gsd-t-optimization-apply M35-OPT-001
```

## Step 0: Parse $ARGUMENTS

Extract the recommendation ID from `$ARGUMENTS`. If empty, print:
```
Usage: /user:gsd-t-optimization-apply {ID}
Example: /user:gsd-t-optimization-apply M35-OPT-001

Run `/user:gsd-t-backlog-list --file optimization-backlog.md` to see pending recommendations.
```
Then exit.

## Step 1: Load the recommendation

```bash
node -e "
const opt = require('./bin/token-optimizer.cjs');
const content = opt.readBacklog('.');
const entries = opt.parseBacklog(content);
const id = process.argv[1];
const entry = entries.find(e => e.id === id);
if (!entry) {
  console.error('Recommendation not found: ' + id);
  console.error('Run /user:gsd-t-backlog-list --file optimization-backlog.md');
  process.exit(1);
}
console.log(JSON.stringify(entry, null, 2));
" {ID}
```

## Step 2: Idempotency check

- If `Status: promoted` → print "Already promoted. No action taken." and exit cleanly.
- If `Status: rejected` → print "This recommendation was rejected. Use `/user:gsd-t-optimization-reject --reason` to update, or wait out the cooldown." and exit.
- If `Status: pending` → proceed to Step 3.

## Step 3: Present the recommendation + promotion options

Print the recommendation's metadata (Type, Evidence, Proposed change, Risk, Projected savings) and offer two promotion paths:

1. **Quick task** (recommended for small changes): `/user:gsd-t-quick "{proposed_change}"`
2. **Full backlog entry** (recommended for larger work): `/user:gsd-t-backlog-promote` so it flows through the normal milestone pipeline.

At Autonomy Level 3: automatically choose option 1 (quick task) unless the recommendation Type is `investigate` (which warrants a full backlog entry since the scope is not yet defined).

## Step 4: Mark the entry as promoted

```bash
node -e "
const opt = require('./bin/token-optimizer.cjs');
let content = opt.readBacklog('.');
content = opt.setRecommendationStatus(content, process.argv[1], {
  status: 'promoted'
});
opt.writeBacklog('.', content);
console.log('Marked ' + process.argv[1] + ' as promoted.');
" {ID}
```

## Step 5: Observability logging

Append a line to `.gsd-t/token-log.md` documenting the promotion (this command does not spawn a subagent, so no model column — use `manual`):

```bash
DT=$(date +"%Y-%m-%d %H:%M")
printf "| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n" \
  "$DT" "$DT" "gsd-t-optimization-apply" "Step 4" "manual" "0s" "promoted {ID}" "" "" "" \
  >> .gsd-t/token-log.md
```

## Step 6: Pre-Commit Gate

This command modifies `.gsd-t/optimization-backlog.md`. Add a Decision Log entry to `.gsd-t/progress.md`:
```
- YYYY-MM-DD HH:MM: Promoted optimization recommendation {ID} — {summary}
```

## Contract References

- `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (source of truth for the optimization-backlog flow)
