# Red Team Report — M45 Wave 1 (D1 + D2)

**Date**: 2026-04-22
**Scope**: Commits `9e5d955` (D1 viewer-route-fix) and `e1e1fd2` (D2 in-session-conversation-capture) on `main`.
**Baseline test suite**: 1932/1934 pass (2 pre-existing unrelated fails: `buildEventStreamEntry` and `writer_shim_safe_empty_agent_id_auto_mints_id`).

## BUGS FOUND: 1 (MEDIUM)

### BUG-1 — session_id path-separator lexical-collapse bypasses `in-session-` prefix contract
**Severity**: MEDIUM
**File**: `scripts/hooks/gsd-t-conversation-capture.js:112` (`_appendFrame`)

**Reproduction**:
```
$ mkdir -p /tmp/bug1/proj/.gsd-t && echo "# p" > /tmp/bug1/proj/.gsd-t/progress.md
$ echo '{"hook_event_name":"UserPromptSubmit","session_id":"a/../b","prompt":"x"}' \
    | GSD_T_PROJECT_DIR=/tmp/bug1/proj node scripts/hooks/gsd-t-conversation-capture.js
$ ls /tmp/bug1/proj/.gsd-t/transcripts/
b.ndjson     # <-- file does NOT start with 'in-session-'
```

**Root cause**: `path.join(transcriptsDir, 'in-session-' + sessionId + '.ndjson')` lexically normalizes
`..` sequences inside the session_id. When `sessionId = "a/../b"`, Node's path.join collapses
`in-session-a/../b.ndjson` down to just `b.ndjson` under `transcripts/`. The subsequent
path-traversal guard (`resolvedOut.startsWith(resolvedDir)`) still passes because `b.ndjson`
stays inside `transcripts/`. Exit=0, write succeeds, but the `in-session-` filename-prefix
invariant (the discriminator contract with the viewer AND the compact-detector) is broken.

**Expected**: Either (a) reject malformed `session_id` with path separators / `..` and fall
through to the `pid-{hash}` fallback, or (b) sanitize by replacing `/` and collapsing `..`
before concatenation, or (c) strengthen the guard to also assert
`path.basename(resolvedOut).startsWith('in-session-')`.

**Actual**: File created as `transcripts/b.ndjson` — bypasses both the viewer left-rail
`startsWith('in-session-')` check (won't get the 💬 badge) AND the compact-detector's
`name.indexOf('in-session-') === 0` classification (detector will treat it as a SPAWN NDJSON
and potentially target it preferentially over real in-session files).

**Proof**: Attack reproduced above. With `session_id = "a/../../../ouch"` the guard DOES
correctly block (resolved path escapes transcripts/), so the escape surface is bounded. But
the `a/../b`-style sibling-write-inside-transcripts case is live.

**Impact**: No file-system-escape CVE. The damage is **contract drift**: a malformed/adversarial
Claude Code payload containing path separators in `session_id` silently corrupts the viewer
classification and the compact-detector's target-selection heuristic. The contract explicitly
justifies the `pid-{hash}` fallback as "defense so a malformed payload does not crash the hook
or produce `in-session-.ndjson`" — this bug is the same class (malformed payload) with the same
remedy missing.

**Fix sketch**: Add a one-line sanitizer at the top of `_appendFrame` (or better, at the top
of `_resolveSessionId`):
```js
if (/[\/\\\0]|\.\./.test(sessionId)) {
  sessionId = 'pid-' + crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12);
}
```

## COVERAGE GAPS

1. **No test for session_id sanitization.** The existing "session-id fallback" test only
   covers the missing-field case; no test exercises session_id values containing `/`, `\`,
   `..`, or null bytes.

2. **No end-to-end viewer render test.** `test/m45-d2-transcript-left-rail-in-session.test.js`
   is static-source-code inspection (regex over the HTML file). Nothing actually mounts the
   viewer, feeds it a spawn-index row, and asserts the rendered DOM displays the
   `💬 conversation` label. If a future refactor moved the label-rendering logic but left
   the literal `💬 conversation` string in a comment, this test would still pass.

3. **No contention test for concurrent hooks writing to the same in-session file.** I
   verified concurrently (20 parallel hooks, same session) that `appendFileSync` stays atomic
   on macOS for small writes, but there's no regression test locking this in.

## SHALLOW TESTS (flagged, not rewritten in this pass — D2 is dev-tooling, not user-facing)

- `test/m45-d2-transcript-left-rail-in-session.test.js` (all 5 subtests) — **static source
  regex**. Doesn't actually render the viewer. Replace with a jsdom or Playwright test that
  feeds `{spawnId: 'in-session-foo'}` to `renderTree()` and asserts on the rendered DOM
  (`.label-in-session` element present, text === '💬 conversation').

- `test/transcripts-html-page.test.js` — checks `id="tree"` and `<main id="stream">` are
  present, doesn't verify the viewer actually functions end-to-end with the empty spawn-id.
  This is acceptable as a route-level smoke test though; the unit-level viewer behavior is
  covered elsewhere.

## CONTRACTS VERIFIED: 3/3

1. `conversation-capture-contract.md` v1.0.0 — frames match impl; `message_id`, `truncated`,
   cap-bytes, fallback-session-id, project-dir resolution all verified against code. One
   contract-drift bug (BUG-1 above) around session_id validation.
2. `compaction-events-contract.md` v1.1.0 — `compact_marker` frame shape (`type`, `ts`,
   `source`, `session_id`, `prior_session_id` + optional `trigger`/`preTokens`/`postTokens`)
   matches impl at `scripts/gsd-t-compact-detector.js:231-258`. D2 did not change the shape.
3. `stream-json-sink-contract.md` v1.2.0 — hook is a writer-side consumer; no new entry point
   required, contract not violated.

## ATTACK VECTORS TRIED

- **Path-traversal via session_id** (`../escape`) — guard correctly rejects (exits 0, no write).
- **Lexical path-collapse via session_id** (`a/../b`) — **BUG-1 reproduced**. File lands as
  `transcripts/b.ndjson` (no `in-session-` prefix).
- **Absolute path in session_id** (`/absolute/path`) — ENOENT, no write, exit 0.
- **Null byte in session_id** — Node.js path layer rejects, stderr log, exit 0.
- **Missing `session_id`** — pid-fallback kicks in, file written correctly.
- **Missing `hook_event_name`** — no-op, exit 0, no file.
- **Non-JSON stdin** — no-op, exit 0, no file.
- **Oversize stdin (2 MiB)** — MAX_STDIN guard kills stream, no-op, exit 0.
- **Concurrent writes** (20 parallel UserPromptSubmit, same session_id) — 20/20 lines land,
  all JSON-parseable. `appendFileSync` atomicity holds for small frames.
- **Trailing non-JSON in in-session NDJSON** + compact-detector fallback write — append
  works regardless; detector never parses existing content (correct).
- **`GSD_T_CAPTURE_TOOL_USES=true`** (not `=1`) — strict match, correctly no-op.
- **Missing transcript HTML file** (D1) — returns 404, not 500. Graceful.
- **`Accept: application/json,text/html;q=0.5`** — naïve substring match returns HTML despite
  client preferring JSON. LOW — not a bug in practice; real clients use single-value Accept.
  Flagged as contract-accuracy note, not a bug.
- **Path-traversal in URL query** (`/transcripts?id=../../../etc/passwd`) — query stripped by
  `req.url.split("?")[0]`, no impact.
- **Compact-detector 30s boundary**: at 29.5s spawn wins (correct, `<` comparator).
- **Compact-detector: spawn stale + in-session stale** — in-session wins regardless of its
  own freshness. Consistent with documented "last resort: newest in-session".
- **Compact-detector: no .gsd-t/ at all** — early bail, no crash, no files.
- **Full test suite** — 1932/1934 pass. Both failures pre-date this wave (see baseline).
- **M45 Wave 1 tests** — 27/27 pass.

## VERDICT

`FAIL` (1 bug — MEDIUM)

BUG-1 is a contract-drift defect: an adversarial or malformed `session_id` payload bypasses
the `in-session-` filename-prefix invariant, breaking both the viewer's label discriminator
and the compact-detector's spawn-vs-conversation classification. The remedy is a one-line
sanitizer in `_resolveSessionId` (or a guard in `_appendFrame`). Fix cycle 1 recommended
before GRUDGING PASS.

No CRITICAL or HIGH issues. No new test regressions. D1 is solid.
