# M48 Viewer Rendering Fixes — Red Team Adversarial QA

**Date**: 2026-05-06
**Target**: `scripts/gsd-t-transcript.html`, `scripts/gsd-t-dashboard-server.js`
**Scope**: M48 fixes for the 4 post-M47 viewer rendering bugs (header/title, frame timestamps, JSON dump rendering, top/bottom pane separation).
**Test suite baseline**: 2079 tests, 2077 pass, 2 pre-existing failures (`buildEventStreamEntry`, `writer_shim_safe_empty_agent_id_auto_mints_id`) — both unrelated to M48 and present before the M48 commits.

(Replaces the earlier M45 Wave 1 red-team report; that audit's findings shipped to `.gsd-t/qa-issues.md` already.)

---

## BUG-1 — `$&` (and other `$`-substitution patterns) in project basename corrupt the title

**Severity**: MEDIUM (data corruption, not security)

**Reproduction**:

1. Place a GSD-T project at any path whose basename contains a `$&` substring (POSIX-legal). Example: `/Users/x/projects/name$&literal`.
2. Start the dashboard server pointing at that project: `srv.startServer(0, eventsDir, dashHtmlPath, '/Users/x/projects/name$&literal', transcriptHtmlPath)`.
3. GET `/transcripts` with `Accept: text/html`.

**Expected**: `<title>name$&amp;literal</title>` (HTML-escaped `&`, but `$&` preserved as-is — `$` is not HTML-special).

**Actual**: `<title>name__PROJECT_NAME__amp;literal</title>`. The placeholder leaks into the output verbatim, and the meaningful part of the basename (`literal`) appears bare.

**Root cause**: `handleTranscriptsList` (line ~277-279) and `handleTranscriptPage` (line ~296-298) call `String.prototype.replace(/__PROJECT_NAME__/g, _escapeHtml(projectName))`. When the replacement string contains `$&`, JS interprets it as "the matched text" — i.e. `__PROJECT_NAME__` itself — and re-injects the placeholder. Other special patterns are similarly affected: `$$` → literal `$`, `$'` → text after match, `` $` `` → text before match, `$1`-`$9` → numeric backreferences (no-op for this regex but consumes 2 chars).

`_escapeHtml` does not escape `$` (correctly — `$` has no HTML meaning). The bug is the unsafe use of a string replacement instead of a function replacement.

**Proof**:

```bash
node -e "
const s = 'X__PROJECT_NAME__Y';
console.log(s.replace(/__PROJECT_NAME__/g, 'name\$&literal'));
"
# Output: Xname__PROJECT_NAME__literalY
```

Full HTTP-level reproduction test at `/tmp/redteam-bug3-repro.js` (failing as expected). Output confirms `<title>name__PROJECT_NAME__amp;literal</title>` rendered into the response body.

**Fix**: use a function-form replacement so the second arg is treated as a literal:

```js
const html = data.toString("utf8")
  .replace(/__SPAWN_ID__/g, () => "")        // or `() => spawnId` in handleTranscriptPage
  .replace(/__PROJECT_NAME__/g, () => _escapeHtml(projectName));
```

Alternatively, escape `$` in the replacement string: `_escapeHtml(projectName).replace(/\$/g, '$$$$')`.

**Security impact**: NONE. `_escapeHtml` runs first, so any HTML special chars are already neutralised. The `$&` corruption only damages cosmetics — the title becomes wrong, not unsafe. No XSS path through this regression.

**Also note**: `__SPAWN_ID__` substitution has the same underlying flaw, but `isValidSpawnId` rejects any spawn id containing `$`, so it's not exploitable today. Defence-in-depth: fix both substitutions together.

---

## BUG-2 — Legacy `renderTree()` click handler does not guard against in-session entries

**Severity**: LOW (cosmetic state pollution; not a user-visible regression of Bug 4's main symptom)

**Reproduction**:

1. Have ≥2 in-session conversation NDJSONs in `.gsd-t/transcripts/`. The most-recent one becomes `mainEntry` and goes into the Main Session rail (top of left rail). All OTHERS fall through to the `live` bucket (status='active' or status absent).
2. The `live` bucket is rendered via `renderTree(buildTree(live))` (line 1055), which uses the legacy click handler at line 872-875.
3. Click one of the older in-session entries in the Live Spawns section.

**Expected**: Click is a no-op (consistent with the `renderRailEntry` guard that explicitly bails on in-session entries).

**Actual**: `location.hash = node.spawnId` runs unconditionally, mutating the URL bar to `#in-session-XXX`.

The `hashchange` handler at line 1291 catches this and bails before `connect(id)` runs, so the bottom pane is not pinned with in-session content. Users will not see two panes with identical content. **However** the URL hash now contains an in-session id, the rail entry's `.active` styling jumps to it briefly until the next poll, and a reload via `/transcript/in-session-XXX` (which corresponds to that hash if the URL is shared) goes through `handleTranscriptPage` and lands `data-spawn-id="in-session-XXX"` on `<body>` — the SS_KEY_SELECTED scrub at line 1308-1311 catches that case, so the bottom pane is not pinned, but `hdr-spawn-id` cosmetically shows the in-session id and the active highlight is visually wrong.

**Proof**: Source inspection. Compare line 872-875 (legacy handler, unguarded) with line 1000-1010 (new handler, guarded with `if (isInSession) return`).

**Fix**: copy the guard from `renderRailEntry`:

```js
el.addEventListener('click', () => {
  if (typeof node.spawnId === 'string' && node.spawnId.indexOf('in-session-') === 0) return;
  if (node.spawnId === currentId) return;
  location.hash = node.spawnId;
});
```

---

## BUG-3 (test quality, not behaviour) — M48 tests are largely structural, not functional

**Severity**: LOW (process / test-debt, not a runtime bug)

The M48 test file `test/m48-viewer-rendering-fixes.test.js` heavily uses `assert.match(html, /pattern/)` against the raw HTML source. This passes on any implementation that contains the literal source strings, regardless of behaviour.

Examples of structural-only assertions that a buggy impl could slip past:

- Bug 2 — `assert.match(html, /new Date\(frame\.ts\)/)` — only checks that string is present. An implementation that wrote `const d = new Date(frame.ts); /* but always returned new Date() */ ...` would still pass.
- Bug 3 — checks for `function renderUserTurn(` / `window.__gsdtRenderUserTurn = renderUserTurn` definitions, but never actually invokes them and asserts on DOM output.
- Bug 4 — `assert.match(html, /if\s*\(\s*isInSession\s*\)\s*return/)` — checks the source contains those tokens, but doesn't drive the click handler and assert that nothing happened.

This violates the project's E2E Test Quality Standard (`CLAUDE.md` § E2E Test Quality Standard, MANDATORY): "If a test would pass on an empty HTML page with the correct element IDs and no JavaScript, it is not a functional test."

**Recommendation**: add at least one functional test per bug that actually executes the relevant code (via `vm`, `jsdom`, or by extracting the function source and `eval`-ing it as I did for `frameTs` in this audit) and asserts on observable outputs.

The Bug 1 tests (which DO drive a real HTTP server and inspect the response body) are the right pattern. The other 14 tests should aspire to that bar.

---

## Attack categories — outcome summary

| # | Attack | Result |
|---|---|---|
| 1 | Contract Violations (`conversation-capture-contract.md` v1.0.0 frame schema) | Pass — frame types `user_turn`, `assistant_turn`, `session_start`, `tool_use` all dispatched correctly; new helpers respect `truncated` flag. |
| 2 | Boundary Inputs — `_escapeHtml` with null/undefined/object/numbers | Pass — String coercion + escape covers all observed inputs. Regex-special `$` patterns in basename, however, found BUG-1 above. |
| 3 | Boundary Inputs — `frameTs` with non-string ts, null frame, far-future/past, ISO-with-TZ, Date instance | Pass — all return a valid Date or fall through to fallback/now. Theoretical edge case: if a caller hands `frameTs` a Date that is `Invalid Date` as `fallback`, it returns it unchanged and a downstream `.toISOString()` would throw. **Not reachable** through any production code path: every site computes `arrivedAt = new Date()` before calling. |
| 4 | Boundary Inputs — render helpers with content=null/number/object/large/XSS payload | Pass — `textContent` rendering is XSS-safe; `typeof === 'string'` guard renders `''` for non-strings (silent, but per-contract the hook always emits strings). |
| 5 | State Transitions — click in-session, click real, click in-session again, reload mid-cycle | Pass — `renderRailEntry` guard, `initialBottomId` scrub, `hashchange` early-return all hold. SS_KEY_SELECTED is only written by `connect(id)`, which is only callable from non-in-session paths. **Caveat** — legacy `renderTree` handler has BUG-2 above (cosmetic only). |
| 6 | Error Paths — missing transcripts dir, missing project dir, projectDir = '/' | Pass — `path.basename(path.resolve('/'))` returns `''`, title becomes empty (theoretical, no one runs from root). `path.resolve('.')` returns cwd basename — works. |
| 7 | Missing Flows — `tool_result`, `result` frame types from in-session hook | Pass — `result` is handled at line 775; `tool_result` flows through the existing `assistant`/`user` content-array path. The conversation-capture contract v1.0.0 only emits the 4 types we render. |
| 8 | Regression — full suite | 2079 tests, 2077 pass, 2 pre-existing failures (unchanged from baseline). No new failures introduced by M48. |
| 9 | E2E Functional Gaps | Found BUG-3 above (test quality is structural-only on 14 of the 19 M48 tests). |
| 10 | Cross-platform — Windows-style paths, Unicode, trailing-slash projectDir | Pass — `path.basename(path.resolve(...))` normalises trailing slashes and case, `_escapeHtml` is byte-safe for UTF-8 (the substitutions operate on a buffer-decoded UTF-8 string). Unicode emoji in basenames render correctly. |
| 11 | Bug 1 variant — other hardcoded "GSD-T" strings? | `gsd-t-dashboard.html` line 5 and 72 still hardcode "GSD-T Agent Dashboard". This is the *dashboard* page (graph view at `/`), not the transcript page covered by M48 Bug 1. **Out of scope** — Bug 1 explicitly named the transcript viewer ("open viewer for /Users/.../Move-Zoom-Recordings-to-GDrive — header should read..."). Reporting as a follow-on opportunity, not a bug. |
| 12 | Bug 2 variant — other places that capture a single timestamp and fan out? | Pass — `appendFrame`, `connect`, `connectMain` all derive a fresh `arrivedAt = new Date()` per SSE message. Search for `new Date()` calls that fan across multiple frames returned no matches. |
| 13 | Bug 3 variant — other frame types in `events/*.jsonl` that fall through to renderRaw? | Pass — `events/*.jsonl` is consumed by `gsd-t-dashboard.html` (a different page), not `gsd-t-transcript.html`. The transcript SSE channel only carries the per-spawn NDJSON. |
| 14 | Bug 4 variant — other paths that could pin in-session-* into bottom pane? | Found BUG-2 above (URL hash pollution via legacy renderTree click handler) — does NOT pin bottom pane content (hashchange guard catches it), but mutates URL bar. |

---

## Verdict

**BUGS FOUND**: 2 reproducible (1 MEDIUM, 1 LOW) + 1 process/test-quality issue.

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 1 (BUG-1: `$&` in basename leaks placeholder) |
| LOW | 2 (BUG-2: legacy renderTree URL hash pollution; BUG-3: structural-only tests) |

**Coverage gaps**: tests do not exercise actual rendering of `renderUserTurn` / `renderAssistantTurn` / `renderSessionStart` / `renderToolUseLine` against synthetic frames; tests do not drive a click on a rail entry and assert nothing happened.

**Shallow tests rewritten**: 0 (deferred — recommendation only).

**Contracts verified**: `conversation-capture-contract.md` v1.0.0 frame schema satisfied by the new render helpers; substitution-correctness in `gsd-t-dashboard-server.js` is violated by BUG-1.

**Verdict**: `FAIL` — 1 MEDIUM-severity reproducible bug requires a fix (BUG-1, the regex-special `$` substitution flaw). BUG-2 is cosmetic but worth fixing in the same pass since the guard is one line. BUG-3 is a recommendation, not a blocker.

The M48 fixes are *substantively correct* for the 4 stated bugs and pass all stated test cases. The findings here are adjacent regressions that the same review pass should have caught, and a test-quality gap that should be closed before the next viewer change.

---

## Re-Verification (post-fix)

**Date**: 2026-05-06
**Scope**: BUG-1 + BUG-2 fix delta only — not a re-run of the categorical sweep.

### BUG-1 — function-form replacement at both substitution sites

Verified at:
- `scripts/gsd-t-dashboard-server.js:282-283` (`handleTranscriptsList`):
  ```js
  .replace(/__SPAWN_ID__/g, () => "")
  .replace(/__PROJECT_NAME__/g, () => escapedName);
  ```
- `scripts/gsd-t-dashboard-server.js:304-305` (`handleTranscriptPage`):
  ```js
  .replace(/__SPAWN_ID__/g, () => spawnId)
  .replace(/__PROJECT_NAME__/g, () => escapedName);
  ```

Both call sites switched from string-form to function-form. The function-form replacement treats the returned string as literal — no `$&`/`$1`/`$$`/`` $` ``/`$'` interpretation. Defence-in-depth fix to `__SPAWN_ID__` (BUG-1's "also note") is in place even though `isValidSpawnId` already rejects `$`.

**Edge cases probed (all pass)**:
- Empty replacement (`() => ""`): `X__SPAWN_ID__Y` → `XY` ✓
- Multiple occurrences with `$&` in replacement: each match replaced literally, no re-injection ✓
- Adjacent placeholders (`__SPAWN_ID____PROJECT_NAME__`): both substituted independently ✓
- Function called exactly once per match (3 matches → 3 calls) ✓
- All `$`-special patterns (`$1`, `$&`, `$$`, `` $` ``, `$'`) preserved verbatim in output ✓

**Regression risk check**: the no-arg-substitute case (`() => ""` for the transcripts-list page) returns the same empty string as the previous `""` form. No behavioural drift.

### BUG-2 — guard at legacy renderTree click handler

Verified at `scripts/gsd-t-transcript.html:880`:
```js
el.addEventListener('click', () => {
  ...
  if (isInSession(node)) return;
  if (node.spawnId === currentId) return;
  location.hash = node.spawnId;
});
```

`isInSession` is defined in the same scope at line 836-838 (anchored prefix check via `indexOf(...) === 0`, type-guarded against non-string spawnIds). Guard order is correct: in-session bail → same-id bail → set hash.

**Regression risk check on legitimate (non-in-session) click flows**:
- `node.spawnId = 'spawn-123abc'`: `isInSession` → false, falls through to same-id check, sets hash ✓
- `node.spawnId = undefined/null/''`: `isInSession` → false (typeof guard); same-id check still proceeds ✓
- `node.spawnId = 'foo-in-session-bar'` (substring, not prefix): `isInSession` → false (indexOf===0 check), correctly NOT bailed ✓

No legitimate flow broken by the guard.

### Test deltas

- `test/m48-viewer-rendering-fixes.test.js`: 23/23 pass (was 19; +4 regression tests added).
- Full suite: **2083 tests, 2081 pass, 2 pre-existing failures unchanged** (`buildEventStreamEntry`, `writer_shim_safe_empty_agent_id_auto_mints_id` — unrelated to M48, present in baseline).
- No new regressions introduced.

### New bugs introduced by the fix

None found. The function-form replacement is strictly safer than string-form (literal-only semantics), and the renderTree guard mirrors the existing `renderRailEntry` guard at line ~1000 (proven correct). Both fixes are minimal, surgical, and adjacent to the original problem sites only.

### Verdict (post-fix)

**`GRUDGING PASS`** — both fixes are clean. Adversarial probes against the function-form replacement (empty, multi-match, adjacent placeholders, `$`-pattern preservation, call-count) and the renderTree guard (undefined/null/empty/substring spawnIds, legitimate spawn ids) all yielded the expected behaviour. No new bugs introduced. Pre-existing test failures unchanged. BUG-3 (test-quality recommendation) was acknowledged but not in scope for this fix delta — still a follow-up.
