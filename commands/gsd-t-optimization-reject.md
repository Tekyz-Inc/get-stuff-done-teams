# GSD-T: Optimization Reject — Dismiss a Recommendation

Reject (dismiss) a pending recommendation from `.gsd-t/optimization-backlog.md` with an optional reason. Sets a 5-milestone cooldown so the same signal doesn't re-surface immediately.

Takes `$ARGUMENTS` as `{ID} [--reason "text"]`.

## Usage

```
/user:gsd-t-optimization-reject M35-OPT-001
/user:gsd-t-optimization-reject M35-OPT-001 --reason "test-sync needs opus — mechanical reruns mask real failures"
```

## Step 0: Parse $ARGUMENTS

- Extract the recommendation ID (first positional argument).
- Extract the `--reason` text if present (quoted string after `--reason`).
- If ID is empty, print usage and exit.

```
Usage: /user:gsd-t-optimization-reject {ID} [--reason "text"]
Example: /user:gsd-t-optimization-reject M35-OPT-001 --reason "still needs opus"

Run `/user:gsd-t-backlog-list --file optimization-backlog.md` to see pending recommendations.
```

## Step 1: Load the recommendation

```bash
node -e "
const opt = require('./bin/token-optimizer.js');
const content = opt.readBacklog('.');
const entries = opt.parseBacklog(content);
const id = process.argv[1];
const entry = entries.find(e => e.id === id);
if (!entry) {
  console.error('Recommendation not found: ' + id);
  process.exit(1);
}
console.log(JSON.stringify(entry, null, 2));
" {ID}
```

## Step 2: Idempotency check

- If `Status: rejected` → print "Already rejected. Cooldown: {N} milestones remaining." and exit cleanly.
- If `Status: promoted` → print "This recommendation was already promoted; cannot reject now." and exit.
- If `Status: pending` → proceed.

## Step 3: Mark the entry as rejected with cooldown

The reason text defaults to "no reason given" when `--reason` is absent.

```bash
REASON="${REASON:-no reason given}"
node -e "
const opt = require('./bin/token-optimizer.js');
let content = opt.readBacklog('.');
content = opt.setRecommendationStatus(content, process.argv[1], {
  status: 'rejected',
  rejection_cooldown: 5
});
opt.writeBacklog('.', content);
console.log('Marked ' + process.argv[1] + ' as rejected (cooldown: 5 milestones). Reason: ' + process.argv[2]);
" {ID} "$REASON"
```

Note: the reason text is captured in the observability log (Step 4) and the Decision Log (Step 5); it is not embedded directly in the backlog entry so that parseBacklog stays simple.

## Step 4: Observability logging

Append to `.gsd-t/token-log.md`:

```bash
DT=$(date +"%Y-%m-%d %H:%M")
printf "| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n" \
  "$DT" "$DT" "gsd-t-optimization-reject" "Step 3" "manual" "0s" "rejected {ID}: $REASON" "" "" "" \
  >> .gsd-t/token-log.md
```

## Step 5: Pre-Commit Gate

Add a Decision Log entry to `.gsd-t/progress.md`:
```
- YYYY-MM-DD HH:MM: Rejected optimization recommendation {ID} — {reason}
```

## Cooldown Behavior

After rejection, `bin/token-optimizer.js` will skip any fingerprint-matching recommendation for 5 subsequent `complete-milestone` invocations. The cooldown counter is stored in the entry's `Rejection cooldown` field and decrements at each `complete-milestone` run (decrement logic lives in `bin/token-optimizer.js` — Wave 5 docs task DAT-T? covers the decrement step if missing).

## Contract References

- `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0 (source of truth for the optimization-backlog flow)
