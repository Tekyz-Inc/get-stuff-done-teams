# M52 Red Team Snapshot

> Extracted from `.gsd-t/red-team-report.md` § "M52 JOURNEY-EDITION RED TEAM" at time of complete-milestone (2026-05-06 18:29 PDT).

---

# M52 JOURNEY-EDITION RED TEAM — Adversarial Validation of 12 Journey Specs

**Date**: 2026-05-06
**Target**: All 12 specs in `e2e/journeys/` + the `pre-commit-journey-coverage` hook end-to-end.

**Methodology**: Snapshot good `scripts/gsd-t-transcript.html`. Apply each broken
patch in turn, run only the targeted spec(s), restore. A patch that the spec
DOESN'T catch is a SHALLOW SPEC and a verdict-level FAIL until the spec is
tightened.

## VERDICT: GRUDGING PASS — 5/5 patches caught + hook end-to-end exercised cleanly

### Patch 1: splitter:mousedown drag handler stripped
- **Spec**: `e2e/journeys/splitter-drag.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:362-370` — replaced full `onMove` body with a single comment line `RED-TEAM PATCH 1: setPct call removed — drag should be a no-op`.
- **Expected**: spec FAILS — splitter-drag's `waitForFunction` for `--main-pane-pct` change should time out.
- **Actual**: caught — TimeoutError on the wait-for-pct-change assertion.
- **Verdict**: caught ✓

### Patch 2: SS_KEY_SPLITTER write redirected to wrong key
- **Specs**: `e2e/journeys/splitter-drag.spec.ts`, `e2e/journeys/splitter-keyboard.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:359` — `_ssSet(SS_KEY_SPLITTER, ...)` → `_ssSet('XXX-broken-key', ...)`.
- **Expected**: both splitter specs FAIL — they assert `gsd-t.viewer.splitterPct` is set after the interaction.
- **Actual**: caught — both specs FAIL on the sessionStorage assertion.
- **Verdict**: caught ✓

### Patch 3: right-rail toggle handler stubbed to early-return
- **Spec**: `e2e/journeys/right-rail-toggle.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:397-403` — entire click handler body replaced with `return;`.
- **Expected**: spec FAILS — `waitForFunction` for `data-collapsed` change should time out.
- **Actual**: caught — TimeoutError on the wait-for-attribute-change assertion.
- **Verdict**: caught ✓

### Patch 4: M52 narrow-guard reverted to broken M48 wide-guard
- **Spec**: `e2e/journeys/click-completed-conversation.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:1011` — narrowed guard → wide guard `if (isInSession) return;`.
- **Expected**: spec FAILS — clicking a Completed in-session entry no longer loads it into the bottom pane.
- **Actual**: caught — TimeoutError waiting for `COMPLETED_TAG` to appear in `#spawn-stream`.
- **Verdict**: caught ✓ (catches the M52 root-cause regression itself)

### Patch 5: auto-follow change handler localStorage write removed
- **Spec**: `e2e/journeys/auto-follow-toggle.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:899-901` — `localStorage.setItem(AUTOFOLLOW_KEY, ...)` removed.
- **Expected**: spec FAILS — `gsdt.autoFollow` localStorage assertion fires with `null`.
- **Actual**: caught — `expect(['0', '1']).toContain(after.stored)` fails because `after.stored` is `null`.
- **Verdict**: caught ✓

## Hook end-to-end exercise

### Block transition
- **Setup**: appended a synthetic `fakeBtn:click` listener to `scripts/gsd-t-transcript.html:1617`; `git add scripts/gsd-t-transcript.html`.
- **Action**: ran `bash .git/hooks/pre-commit` directly.
- **Result**: exit code 1 with structured GAP report (`GAP: scripts/gsd-t-transcript.html:1617  fakeBtn:click  (addEventListener)  no spec covers this`).
- **Verdict**: hook correctly BLOCKED. ✓

### Unblock transition
- **Setup**: appended a covering entry to `.gsd-t/journey-manifest.json`; `git add .gsd-t/journey-manifest.json`.
- **Action**: re-ran `bash .git/hooks/pre-commit`.
- **Result**: exit code 0, no stderr.
- **Verdict**: hook correctly UNBLOCKED. ✓
