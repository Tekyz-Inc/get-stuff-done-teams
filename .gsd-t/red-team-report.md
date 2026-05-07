# M51 RED TEAM FINDINGS — Adversarial Test-Quality Audit of Viewer Specs

**Date**: 2026-05-06
**Target**: 5 viewer Playwright specs in `e2e/viewer/` (M50 D2 deliverables)
**Methodology**: For each spec, write a deliberately-broken patch to the production
viewer code that introduces a real user-observable bug, then run the strengthened
spec against the broken impl. A spec that fails to catch the broken impl is itself
broken; tighten until every adversary patch is rejected.

---

## VERDICT: GRUDGING PASS — 5/5 adversaries caught by strengthened specs

Every adversary patch was caught by at least one strengthened assertion. No
production bug was discovered behind the adversary patches; this audit was about
the **test suite's** rigor, not the viewer's correctness. Pre-strengthening, all
5 broken impls would have slipped through the M50 specs (now superseded).

| # | Spec | Adversary patch | Caught by | User-observable bug |
|---|------|-----------------|-----------|---------------------|
| 1 | `title.spec.ts` | Hardcode `gsd-t-fixture` instead of substituting `path.basename(projectDir)` | `M48 Bug 1: literal $& in basename survives function-form replacement` | Wrong project name in `<title>` for any project not named `gsd-t-fixture`; `$&` defence broken |
| 2 | `timestamps.spec.ts` | Cache the FIRST `frame.ts` value and reuse it for all 3 frames (so `frame.ts` is technically referenced) | `3 distinct ts → 3 distinct rendered timestamps (exact equality)` + `M51 strengthen: missing frame.ts falls back to arrivedAt` | All rendered rows show the same HH:MM:SS — useless for spotting stuck/stale streams |
| 3 | `chat-bubbles.spec.ts` | Strip type-specific CSS classes (`.user.user-turn`, `.body`, `.prefix`); keep only generic `.frame` + raw text | `user_turn renders as .frame.user.user-turn with .body content` + `truncated user_turn shows .truncated-tag span` | Frames render as unstyled raw text; truncation marker disappears |
| 4 | `dual-pane.spec.ts` | Remove the `in-session-` guard from `hashchange` (keep it on rail click + initial-load only) | `M51 strengthen: hashchange to in-session id does NOT change bottom-pane content` | Bottom pane gets pinned to in-session stream when user navigates via hash bookmark |
| 5 | `lazy-dashboard.spec.ts` | Print BOTH banners regardless of dashboard state (so any substring assertion passes) | All 3 lazy-dashboard tests caught it (exact-shape regex on `▶ Live transcript:` / `▶ Transcript file:`) | User sees a fake live URL pointing at port 7433 even when no dashboard is running |

## What changed in the specs

**Before (M50)**: 9 tests across 5 files. Substring-only assertions. Loose tolerances.
- `title.spec.ts:68` asserted `html).not.toMatch(/\$&/)` — passes on a totally empty page.
- `timestamps.spec.ts:70` asserted `distinct.size >= 2` — half-collapsed regressions slip past.
- `chat-bubbles.spec.ts:48` asserted `streamText.includes('hello')` — a `<div>hello</div>` with NO classes passes.
- `dual-pane.spec.ts:51` filtered ALL EventSource URLs and rejected any containing the in-session id — the TOP pane's URL legitimately contains it (TEST-M50-001 false positive).
- `lazy-dashboard.spec.ts:43` used `banner.toContain('Transcript file:')` — passes when both banners print.

**After (M51)**: 19 tests across 5 files. Outcome-based assertions:
- Exact `<title>` equality, literal `$&` survival positive test, header `.title` DOM
  text equality.
- `distinct.size === 3`, each timestamp must equal the wall-clock derived from
  `frame.ts`, missing-ts fallback test added.
- CSS class membership: `.frame.user.user-turn`, `.frame.assistant-turn`,
  `.frame.session-start`, `.frame.tool-call-line`, plus `.body` / `.prefix` /
  `.badge` / `.truncated-tag` structural assertions.
- Pane attribution via MutationObserver on each pane element (top frames in
  `#main-stream`, bottom frames in `#stream`); positive assertions of intended
  behavior (top pane DOES connect to in-session, bottom DOES connect to its own
  spawn). Hashchange-doesn't-change-bottom test added.
- Exact regex on `▶ Live transcript: http://…` and `▶ Transcript file: …\n  (to view live: …)` shapes; dead-pid branch covered.

## Quality bar

A test passes the M51 bar iff **a deliberately-broken implementation that
satisfies the literal assertions while breaking user-observable behavior cannot
be constructed**. Every assertion now answers the question "did the user-visible
behavior actually happen?" — not "does some element exist?"

## Reproduction

The 5 adversary patches are documented inline above. To reproduce: apply each
patch to the named source file, run `npx playwright test e2e/viewer/{spec}.spec.ts`,
verify exit code is non-zero. Revert. Repeat for the next adversary. All 5
adversaries were exercised in the M51 D3 phase; live runs preserved in
`test-results/` until the next CI clean.

---

# Red Team Report — M50 D1 Task 1: `bin/ui-detection.cjs`

**Date**: 2026-05-06
**Target**: `bin/ui-detection.cjs` + `test/m50-d1-ui-detection.test.js`
**Contract**: `.gsd-t/contracts/playwright-bootstrap-contract.md` §4 (v1.0.0)
**Methodology**: Source review + targeted Node.js adversarial probes (50+ scenarios)

---

## VERDICT: FAIL — 7 bugs found

Severity breakdown: **0 CRITICAL · 2 HIGH · 3 MEDIUM · 2 LOW**

The code never throws (key safety invariant ✅), the depth bound is correctly enforced (BFS terminates safely on symlink loops ✅), and the `hasUI`/`detectUIFlavor` symmetry holds for every probed input ✅. But the implementation diverges from the contract on dot-directory handling, mishandles directory-vs-file ambiguity for sentinel files, and leaves three real-world UI ecosystems silently undetected.

---

## BUGS

### BUG-1 — `pubspec.yaml` and `tailwind.config.{js,ts}` as DIRECTORIES yield false positives
**Severity**: HIGH

- **Reproduction**: Create a project with a directory (not file) named `pubspec.yaml` and nothing else. Call `hasUI(dir)`.
- **Expected**: `false` — Flutter requires `pubspec.yaml` to be a YAML file, not a directory. A directory with that name is meaningless.
- **Actual**: `hasUI` returns `true`, `detectUIFlavor` returns `"flutter"`. Same bug for `tailwind.config.js` as a directory → `"css-only"` flavor.
- **Root cause**: `_hasFlutter`/`_hasTailwindConfig` use `fs.existsSync()`, which returns `true` for directories too.
- **Proof** (from `/tmp/redteam-probe.cjs` run):
  ```
  ["pubspec-as-directory", "OK", '{"hasUI":true,"flavor":"flutter"}']
  ["tailwind-as-directory", "OK", '{"hasUI":true,"flavor":"css-only"}']
  ```
- **Fix**: Use `fs.statSync(p, {throwIfNoEntry: false})?.isFile()` instead of `existsSync`.

### BUG-2 — Dot-directory exclusion exceeds contract; silently drops `.storybook`, `.config`, `.husky`, etc.
**Severity**: HIGH (contract violation)

- **Reproduction**: Project with `.storybook/main.tsx` and no other UI signals.
  ```
  ["dot-storybook-excluded-impl-but-not-contract", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected per contract §4**: The exclusion list is exhaustive — `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `coverage/`, `.gsd-t/`. A `.tsx` inside `.storybook/` should match.
- **Actual**: Impl line `if (name.startsWith(".") && name !== ".") continue;` skips ALL dot-named directories indiscriminately. `.storybook/` (Storybook config — common in React/Vue UI projects), `.config/`, `.husky/`, `.devcontainer/` — all silently invisible.
- **Why this matters in practice**: A project that uses Storybook for UI components only and houses them under `.storybook/` would be flagged as no-UI, skipping Playwright bootstrap.
- **Fix**: Drop the dot-prefix shortcut and rely solely on the explicit `IGNORED_DIRS` set defined by the contract. Or: amend the contract to explicitly say "all dot-prefixed dirs are excluded".

### BUG-3 — `tailwind.config.mjs` not detected
**Severity**: MEDIUM

- **Reproduction**:
  ```
  ["tailwind-mjs-not-detected", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected**: Modern Tailwind v3+ projects using ESM commonly use `tailwind.config.mjs`. The contract is technically silent on `.mjs`, but the spirit of "Tailwind config exists" is missed.
- **Actual**: Only `.js` and `.ts` are checked.
- **Fix**: Add `tailwind.config.mjs` and `tailwind.config.cjs` to the lookup set, OR amend the contract to lock the supported extensions.
- **Contract impact**: Either fix code or update contract §4 list — they currently agree on `.js`/`.ts` only, but real-world miss is real.

### BUG-4 — Astro projects undetected
**Severity**: MEDIUM (false negative for popular UI framework)

- **Reproduction**: Project with `src/Page.astro` and a server-only `package.json`.
  ```
  ["astro-not-detected", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected**: Astro is a major UI meta-framework. Either the `astro` package or `.astro` files should trigger `hasUI=true`.
- **Actual**: Neither checked.
- **Contract impact**: §4 enumeration is incomplete vs. current ecosystem. Either add `astro` to `FRAMEWORK_DEPS` and `.astro` to `UI_FILE_EXTS`, or document the gap as accepted.

### BUG-5 — Nuxt projects undetected (despite `.nuxt/` being in IGNORED_DIRS)
**Severity**: MEDIUM (internal inconsistency — contract knows about Nuxt build dir but not Nuxt deps)

- **Reproduction**: `package.json` with `dependencies: { nuxt: "^3" }` only.
  ```
  ["nuxt-not-in-list", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected**: Nuxt is the Vue meta-framework analog of Next. The contract excludes `.nuxt/` build output, so it's clearly aware Nuxt exists, but doesn't include it in framework detection.
- **Actual**: Falls through to file walk; if no `.vue` files are at depth ≤3, project is misclassified as no-UI.
- **Fix**: Add `nuxt` (and `@nuxt/kit`) to `FRAMEWORK_DEPS` mapping to flavor `"vue"` (or introduce a `"nuxt"` flavor).

### BUG-6 — Test-suite gap: no test asserts symlink safety, perm-denied, or directory-as-sentinel-file
**Severity**: LOW (test gap, not impl bug — but flags a regression risk)

- **Reproduction**: `test/m50-d1-ui-detection.test.js` covers 12 scenarios; none cover (a) symlink loops, (b) `EACCES` subdirectories, (c) sentinel files that are directories. The probe-script confirms BUG-1 lives unguarded.
- **Expected**: Per contract §9 ("every export, every package-manager path, idempotent re-run, and each error path"), error-path coverage should include filesystem error cases.
- **Actual**: Filesystem error handling is implicit — caught by the `catch` in `_findUIFileWithinDepth` but never asserted as a behavior.
- **Fix**: Add three regression tests: symlink loop terminates, `chmod 000` subdir does not propagate to a throw, directory named `pubspec.yaml` does not yield `flutter` (will fail until BUG-1 fixed — confirming the bug).

### BUG-7 — `peerDependencies` ignored
**Severity**: LOW (judgment call; contract §4 explicitly limits to dependencies/devDependencies)

- **Reproduction**:
  ```
  ["peer-only", "OK", '{"hasUI":false,"flavor":null}']
  ```
- **Expected per contract**: Correctly ignored — contract §4 enumerates `dependencies` and `devDependencies` only.
- **Actual**: Matches contract.
- **Why this is here**: Component-library packages routinely declare `react` only in `peerDependencies` (so consumers provide it). Such a library-author repo is genuinely not a UI app — the contract decision is defensible. Flagging as LOW only because real-world surface that LOOKS like a UI lib but won't auto-bootstrap Playwright. **No code change recommended** — leave as-is, but call out the deliberate design choice in a comment so future maintainers don't "fix" it.

---

## Attack Categories Exhausted

| Category | Result |
|----------|--------|
| Path traversal / null bytes / non-string types | Robust — never throws, returns `false`/`null` for null, undefined, number, array, object, boolean, Symbol, function |
| Filesystem edges: symlink loops, perm-denied, EMFILE | Symlink loops bounded (Dirent.isDirectory()=false for symlinks → not traversed); perm-denied subdir caught; depth bound enforced |
| Type confusion in package.json: deps as array/string/null/number; whole pkg as array/null/number; `react: false/null/0/""` | All handled safely via `Object.assign({}, ...)` and JS truthiness — `react: false` returns `hasUI:false` (correct) |
| Performance: 5000-file directory at depth 1 | 6ms — acceptable. Short-circuit on first `.css` match works |
| Detection accuracy: false positives | **2 found** (BUG-1: pubspec/tailwind as directory) |
| Detection accuracy: false negatives | **3 found** (BUG-2: dot-dirs incl. `.storybook`; BUG-3: `tailwind.config.mjs`; BUG-4: `.astro` files; BUG-5: Nuxt deps) |
| Spec gaps vs contract: depth count semantics | Verified — root=depth 0, files at depth 3 detected, files at depth 4 not. Test fixture `a/b/c/d/component.tsx` correctly expected `false`. Contract wording "within depth 3" is consistent with impl |
| Spec gaps: ignored-dir enumeration vs impl | **Mismatch found** (BUG-2: impl skips all dot-prefixed, contract enumerates 8 explicit dirs) |
| `detectUIFlavor` ↔ `hasUI` symmetry: `null` ⇔ `hasUI=false` | Verified across ALL probes — symmetric. No input breaks the contract |
| Mixed-case extension `.TSX` | Detected (lowercased in impl) |
| Empty `package.json` (zero bytes) | Falls through to file walk safely |
| Empty `pubspec.yaml` (zero bytes) | Detected as flutter — correct per contract |
| Files without extensions / dotfiles named `.css` | Not detected (`path.extname` returns "" for dotfiles) — correct per contract |

## Coverage Gaps

- `peerDependencies` handling not asserted in tests (contract-defensive, BUG-7)
- Symlink behavior not tested (BUG-6)
- Permission-denied subdir not tested (BUG-6)
- Sentinel-as-directory not tested (BUG-6 → BUG-1 fix needs test)

## Shallow Tests Rewritten
0 — all 12 existing tests are functional (verify state changes, not just element existence).

## Contracts Verified
1/1 — `playwright-bootstrap-contract.md` §4 was the only relevant section. 2 deviations found (BUG-1 false positive on directory sentinels, BUG-2 dot-dir over-exclusion).

---

## Recommended Fix Priorities

1. **HIGH** — BUG-1: Switch `_hasFlutter`/`_hasTailwindConfig` to use `statSync().isFile()`. Tiny, safe, contract-aligned.
2. **HIGH** — BUG-2: Either remove the `name.startsWith(".")` shortcut (rely only on `IGNORED_DIRS`), or amend contract §4 to explicitly say "all dot-prefixed directories are also excluded". Pick one — currently contract and impl disagree.
3. **MEDIUM** — BUG-3, BUG-4, BUG-5: Add `tailwind.config.mjs`/`.cjs`, `astro` package + `.astro` extension, and `nuxt` package. Coordinate with contract update.
4. **LOW** — BUG-6: Add 3 regression tests covering symlink loop, perm-denied, sentinel-as-directory.

---

**Probe scripts retained at**: `/tmp/redteam-probe.cjs`, `/tmp/redteam-probe2.cjs`

---

# M52 RED TEAM FINDINGS — Adversarial Validation of click-completed.spec.ts

**Date**: 2026-05-06
**Target**: New journey spec `e2e/viewer/click-completed.spec.ts` (4 tests) + the
narrowed M48 Bug 4 guards in `scripts/gsd-t-transcript.html` (click handler line ~1011,
hashchange line ~1303, legacy renderTree click line ~880, fetchMainSession line ~1284,
initial-bottom-id seed line ~1310).

**Methodology**: Snapshot the good `gsd-t-transcript.html`, apply each adversary patch
in turn, run only the new journey spec, restore. A spec that doesn't catch the patch
is itself broken; tighten until every adversary fails.

## VERDICT: GRUDGING PASS — 3/3 adversaries caught

| # | Adversary patch                                                                                           | Result               | Caught by                                            |
|---|-----------------------------------------------------------------------------------------------------------|----------------------|------------------------------------------------------|
| a | Both checks reverted to `if (isInSession) return;` (the original pre-M52 bug)                             | 2 tests FAIL ✓        | "clicking each completed entry" + "sessionStorage persists across reload" |
| b | `connect(id)` short-circuits when `id.indexOf('in-session-') === 0`                                       | 2 tests FAIL ✓        | same 2 — bottom pane never receives the marker        |
| c | Click handler routes in-session entries to TOP pane via `connectMain(...)` (clobbers main session)        | 2 tests FAIL ✓        | bottom-pane-receives-marker positive assertion fires before the new top-pane-stays-on-main negative assertion |

**Note on (c)**: The new strengthened click-completed test asserts BOTH the positive
(bottom pane gets the conversation tag) AND the negative (top pane is not clobbered
with completed-conversation tags). The positive assertion fires first because the
broken impl never writes to the bottom pane at all — but the negative assertion is
in the same test body and would fire on any impl that writes the click target into
the top pane after passing the positive check.

## Files modified for M52
- `scripts/gsd-t-transcript.html` — narrowed 4 guards from `isInSession` (any) to
  `isInSession && spawnId === in-session-{__mainSessionId}` (live main only).
  Added `window.__mainSessionId` exposure inside `connectMain`. Removed the
  unconditional in-session-* scrub from initial-bottom-id seeding. Added
  fetchMainSession callback to clear seeded selection that collides with live
  main session id.
- `e2e/viewer/click-completed.spec.ts` (new) — 4-test journey covering rail
  rendering, completed-entry click → bottom pane content, main-entry click → no
  bottom-pane mutation + top-pane unchanged, sessionStorage persistence across
  reload.
- `test/m48-viewer-rendering-fixes.test.js` — flipped 5 source-pinned assertions
  from "asserts pre-M52 unconditional bail" to "asserts M52 narrowed live-main check".
  Added 1 new test for the fetchMainSession seed-collision callback.

**Final state**: E2E 23/23 + 1 placeholder skip; unit 2167/2167 (added 1 net test).

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
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:362-370` — replaced full
  `onMove` body (getBoundingClientRect → setPct call) with a single comment
  line `RED-TEAM PATCH 1: setPct call removed — drag should be a no-op`.
- **Expected**: spec FAILS — splitter-drag's `waitForFunction` for `--main-pane-pct`
  change should time out.
- **Actual**: caught — TimeoutError on the wait-for-pct-change assertion.
- **Verdict**: caught ✓

### Patch 2: SS_KEY_SPLITTER write redirected to wrong key
- **Specs**: `e2e/journeys/splitter-drag.spec.ts`, `e2e/journeys/splitter-keyboard.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:359` — `_ssSet(SS_KEY_SPLITTER, ...)`
  → `_ssSet('XXX-broken-key', ...)`.
- **Expected**: both splitter specs FAIL — they assert
  `gsd-t.viewer.splitterPct` is set after the interaction.
- **Actual**: caught — both specs FAIL on `expect(stored).not.toBeNull()` (drag) and
  `expect(parseFloat(finalStored)).toBeCloseTo(80, 0)` (keyboard).
- **Verdict**: caught ✓ (sessionstorage-persistence still passes — it sets the
  key directly, doesn't depend on the splitter handler — by design, that's a
  different journey)

### Patch 3: right-rail toggle handler stubbed to early-return
- **Spec**: `e2e/journeys/right-rail-toggle.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:397-403` — entire click
  handler body (data-collapsed flip + body attribute flip + sessionStorage write)
  replaced with `return;`.
- **Expected**: spec FAILS — `waitForFunction` for `data-collapsed` change
  should time out.
- **Actual**: caught — TimeoutError on the wait-for-attribute-change assertion.
- **Verdict**: caught ✓

### Patch 4: M52 narrow-guard reverted to broken M48 wide-guard
- **Spec**: `e2e/journeys/click-completed-conversation.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:1011` — narrowed guard
  `if (isInSession && node.spawnId === ('in-session-' + window.__mainSessionId)) return;`
  → wide guard `if (isInSession) return;`.
- **Expected**: spec FAILS — clicking a Completed in-session entry no longer
  loads it into the bottom pane.
- **Actual**: caught — TimeoutError waiting for `COMPLETED_TAG` to appear in
  `#spawn-stream`.
- **Verdict**: caught ✓ (this was the M52 root-cause regression itself —
  the spec catches the regression that the milestone exists to prevent)

### Patch 5: auto-follow change handler localStorage write removed
- **Spec**: `e2e/journeys/auto-follow-toggle.spec.ts`
- **Broken-line(s)**: `scripts/gsd-t-transcript.html:899-901` — change handler
  body `localStorage.setItem(AUTOFOLLOW_KEY, ...)` removed.
- **Expected**: spec FAILS — `gsdt.autoFollow` localStorage assertion fires
  with `null`.
- **Actual**: caught — `expect(['0', '1']).toContain(after.stored)` fails
  because `after.stored` is `null`.
- **Verdict**: caught ✓

## Hook end-to-end exercise

### Block transition
- **Setup**: appended a synthetic `fakeBtn:click` listener to
  `scripts/gsd-t-transcript.html:1617` (after the existing stopBtn handler);
  `git add scripts/gsd-t-transcript.html`.
- **Action**: ran `bash .git/hooks/pre-commit` directly.
- **Result**: exit code 1, stderr:
  ```
  [journey-coverage] BLOCKED: uncovered viewer listener in staged files.
  GAP: scripts/gsd-t-transcript.html:1617  fakeBtn:click  (addEventListener)  no spec covers this
  
    Add a journey spec under e2e/journeys/ and update .gsd-t/journey-manifest.json.
  ```
- **Verdict**: hook correctly BLOCKED the commit with a structured GAP report. ✓

### Unblock transition
- **Setup**: appended a covering entry to `.gsd-t/journey-manifest.json`
  (added `{file, selector: "fakeBtn:click", kind: "addEventListener"}` to the
  hashchange spec's covers[] array); `git add .gsd-t/journey-manifest.json`.
- **Action**: re-ran `bash .git/hooks/pre-commit`.
- **Result**: exit code 0, no stderr.
- **Verdict**: hook correctly UNBLOCKED the commit once the manifest covered
  the listener. ✓

## Files modified during this run
- `scripts/gsd-t-transcript.html` — patched and reverted 5 times across the
  adversarial run, then snapshotted-back to the v3.22.11 production state.
  Final `git diff` against pre-Wave-4 state: empty.
- `.gsd-t/journey-manifest.json` — temporarily extended for hook end-to-end
  exercise, then reverted to its 12-entry post-Wave-3 form.
- `templates/prompts/red-team-subagent.md` — additive: appended new
  "Test Pass-Through — Journey Edition (M52)" subsection (no deletions, no
  reorders to existing categories).
- `.gsd-t/red-team-report.md` — append-only: this section.

## Final state
- 12/12 journey specs pass (full E2E 35/35 + 1 skip preserved)
- `gsd-t check-coverage`: `OK: 20 listeners, 12 specs` (zero gaps)
- Hook gate is LIVE and proven to block uncovered listeners
- Production viewer code unchanged (zero net diff after this run)
